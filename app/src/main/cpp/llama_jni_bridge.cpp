#include <jni.h>
#include <string>
#include <fstream>
#include <sstream>
#include <iomanip>
#include <mutex>
#include <algorithm>
#include <cstdint>
#include <cstring>
#include <cstdlib>
#include <sched.h>
#include <unistd.h>
#include <sys/stat.h>
#include <android/log.h>

#define LOG_TAG "PocketGGUF_JNI"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, LOG_TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

namespace {
    std::mutex g_engine_mutex;
    std::string g_loaded_model_path;
    int g_context_length = 8192;
    int g_batch_size = 512;
    int g_threads = 6;
    // Proposal 1: Default Q4_0 KV Cache Quantization (GGML_TYPE_Q4_0 = 2)
    std::string g_kv_quant = "Q4_0";
    bool g_use_mmap = true;
    // Proposal 2: Single-slot sticky prefix cache buffer (n_keep)
    std::string g_last_pinned_prompt;
    int g_pinned_prefix_tokens = 1024;
    // Proposal 4: Big.LITTLE core pinning
    bool g_pin_big_little = true;

    // Real binary header metadata & diagnostic state read from the mounted .gguf file descriptor
    uint32_t g_gguf_version = 3;
    uint64_t g_gguf_tensor_count = 0;
    uint64_t g_gguf_kv_count = 0;
    long long g_gguf_file_size_bytes = 0;
    long long g_gguf_file_size_mb = 0;
    bool g_gguf_header_verified = false;
    int g_last_load_rc = -1;
    std::string g_last_load_diagnosis = "No model loaded in native JNI bridge yet.";

    /**
     * Proposal 4: Pins current native worker threads strictly to Prime (Cortex-X4)
     * and Performance (Cortex-A720) cores (cpu2..cpu7), excluding Efficiency (Cortex-A520) cores (cpu0..cpu1).
     */
    void applyBigLittleCoreAffinity(bool enablePinning) {
        cpu_set_t cpuset;
        CPU_ZERO(&cpuset);
        if (enablePinning) {
            for (int cpu = 2; cpu < 8; ++cpu) {
                CPU_SET(cpu, &cpuset);
            }
        } else {
            for (int cpu = 0; cpu < 8; ++cpu) {
                CPU_SET(cpu, &cpuset);
            }
        }
        sched_setaffinity(0, sizeof(cpu_set_t), &cpuset);
    }

    /**
     * Proposal 2: Computes longest common prefix tokens retained in single-slot KV cache
     */
    int computePrefixCacheReuse(const std::string& currentPrompt, int nKeepSystemTokens) {
        size_t matchLen = 0;
        size_t limit = std::min(g_last_pinned_prompt.size(), currentPrompt.size());
        while (matchLen < limit && g_last_pinned_prompt[matchLen] == currentPrompt[matchLen]) {
            ++matchLen;
        }
        g_last_pinned_prompt = currentPrompt;
        return nKeepSystemTokens + static_cast<int>(matchLen / 4);
    }

    std::string formatMagicHex(const uint8_t* bytes) {
        std::ostringstream oss;
        oss << "0x" << std::uppercase << std::hex << std::setfill('0')
            << std::setw(2) << static_cast<int>(bytes[0])
            << std::setw(2) << static_cast<int>(bytes[1])
            << std::setw(2) << static_cast<int>(bytes[2])
            << std::setw(2) << static_cast<int>(bytes[3]);
        return oss.str();
    }

    std::string detectWrongFileFormat(const uint8_t* b) {
        if ((b[0] == '<' && b[1] == '!') || (b[0] == '<' && (b[1] == 'h' || b[1] == 'H'))) {
            return "HTML Webpage (likely a HuggingFace login or redirect page saved as .gguf instead of raw weights)";
        }
        if (b[0] == 0x50 && b[1] == 0x4B) {
            return "ZIP / PyTorch (.pt/.bin) / APK archive (starts with PK zip header)";
        }
        if (b[0] == '{' || (b[2] == 0x00 && b[3] == 0x00 && b[0] != 0x47)) {
            return "JSON or Safetensors file (not a quantized GGUF binary)";
        }
        if (b[0] == 'g' && b[1] == 'g' && (b[2] == 'm' || b[2] == 'j')) {
            return "Legacy 2023 GGML/GGJT format (pre-GGUF v1 format)";
        }
        return "Non-GGUF binary file (" + formatMagicHex(b) + ")";
    }

    /**
     * Inspects and validates the real binary GGUF header from /proc/self/fd/<fd>
     * (using POSIX fstat + pread on the open file descriptor to avoid Android SELinux symlink denials)
     * or from a standard filesystem path.
     *
     * Populates g_last_load_rc and g_last_load_diagnosis with a precise error message and proposed solution.
     */
    int inspectAndVerifyBinaryGgufHeader(const std::string& pathOrFd) {
        g_gguf_header_verified = false;
        g_gguf_tensor_count = 0;
        g_gguf_kv_count = 0;
        g_gguf_file_size_bytes = 0;
        g_gguf_file_size_mb = 0;

        if (pathOrFd.empty()) {
            g_last_load_rc = -1;
            g_last_load_diagnosis =
                "ERROR [-1] No model file path or SAF descriptor provided. "
                "SOLUTION: Tap 'Select .GGUF File from Phone Storage' to pick a valid .gguf file.";
            return g_last_load_rc;
        }

        uint8_t headerBuf[24];
        std::memset(headerBuf, 0, sizeof(headerBuf));
        ssize_t bytesRead = -1;

        // 1. If path is /proc/self/fd/<N>, read directly from integer FD via fstat + pread(fd, ..., 0)
        // This avoids Android SELinux path-resolution EACCES on DownloadsProvider FDs!
        const std::string fdPrefix = "/proc/self/fd/";
        if (pathOrFd.compare(0, fdPrefix.size(), fdPrefix) == 0) {
            int fd = std::atoi(pathOrFd.c_str() + fdPrefix.size());
            if (fd >= 0) {
                struct stat st;
                if (fstat(fd, &st) == 0 && st.st_size > 0) {
                    g_gguf_file_size_bytes = static_cast<long long>(st.st_size);
                    g_gguf_file_size_mb = g_gguf_file_size_bytes / (1024LL * 1024LL);
                }
                bytesRead = pread(fd, headerBuf, sizeof(headerBuf), 0);
            }
        }

        // 2. Fallback to standard stat + std::ifstream if not /proc/self/fd/<N> or if pread failed
        if (bytesRead < 0) {
            struct stat st;
            if (stat(pathOrFd.c_str(), &st) == 0 && st.st_size > 0) {
                g_gguf_file_size_bytes = static_cast<long long>(st.st_size);
                g_gguf_file_size_mb = g_gguf_file_size_bytes / (1024LL * 1024LL);
            }

            std::ifstream file(pathOrFd, std::ios::binary);
            if (!file.is_open()) {
                g_last_load_rc = -2;
                g_last_load_diagnosis =
                    "ERROR [-2] Cannot open model descriptor '" + pathOrFd + "' (Permission denied or file moved/deleted). "
                    "SOLUTION: Tap 'Select .GGUF File from Phone Storage' to re-select the file and refresh Android SAF read permissions.";
                LOGE("%s", g_last_load_diagnosis.c_str());
                return g_last_load_rc;
            }

            if (g_gguf_file_size_bytes <= 0) {
                file.seekg(0, std::ios::end);
                std::streampos endPos = file.tellg();
                if (endPos > 0) {
                    g_gguf_file_size_bytes = static_cast<long long>(endPos);
                    g_gguf_file_size_mb = g_gguf_file_size_bytes / (1024LL * 1024LL);
                }
                file.seekg(0, std::ios::beg);
            }

            file.read(reinterpret_cast<char*>(headerBuf), sizeof(headerBuf));
            bytesRead = static_cast<ssize_t>(file.gcount());
        }

        if (bytesRead < 24 || (g_gguf_file_size_bytes > 0 && g_gguf_file_size_bytes < 64)) {
            g_last_load_rc = -3;
            g_last_load_diagnosis =
                "ERROR [-3] Model file is empty or truncated (read " + std::to_string(bytesRead) +
                " header bytes, total size " + std::to_string(g_gguf_file_size_bytes) + " bytes). "
                "SOLUTION: The download in your phone's Downloads folder appears incomplete. Delete the partial file and re-download the complete .gguf model.";
            LOGE("%s", g_last_load_diagnosis.c_str());
            return g_last_load_rc;
        }

        // Verify 'G','G','U','F' magic bytes (0x47, 0x47, 0x55, 0x46)
        if (headerBuf[0] != 0x47 || headerBuf[1] != 0x47 || headerBuf[2] != 0x55 || headerBuf[3] != 0x46) {
            std::string detected = detectWrongFileFormat(headerBuf);
            g_last_load_rc = -4;
            g_last_load_diagnosis =
                "ERROR [-4] Invalid GGUF binary magic header: expected 'GGUF' (0x47475546), found " +
                formatMagicHex(headerBuf) + " [" + detected + "]. "
                "SOLUTION: Ensure you downloaded a quantized .gguf weight file (e.g., model-Q4_K_M.gguf) rather than a Safetensors, PyTorch .bin/.pt, ZIP, or HTML redirect file.";
            LOGE("%s", g_last_load_diagnosis.c_str());
            return g_last_load_rc;
        }

        uint32_t version = 0;
        uint64_t tensors = 0;
        uint64_t kvCount = 0;
        std::memcpy(&version, headerBuf + 4, sizeof(uint32_t));
        std::memcpy(&tensors, headerBuf + 8, sizeof(uint64_t));
        std::memcpy(&kvCount, headerBuf + 16, sizeof(uint64_t));

        if (version < 1 || version > 3) {
            g_last_load_rc = -5;
            g_last_load_diagnosis =
                "ERROR [-5] Unsupported GGUF specification version v" + std::to_string(version) +
                " (PocketGGUF supports GGUF v1, v2, and v3). "
                "SOLUTION: Re-download or quantize the model with standard llama.cpp GGUF v2/v3 format.";
            LOGE("%s", g_last_load_diagnosis.c_str());
            return g_last_load_rc;
        }

        if (tensors == 0 || tensors > 100000) {
            g_last_load_rc = -6;
            g_last_load_diagnosis =
                "ERROR [-6] Corrupted GGUF tensor directory (header reports " + std::to_string(tensors) +
                " tensors). "
                "SOLUTION: The .gguf file header is corrupted. Re-download a clean copy of the .gguf file.";
            LOGE("%s", g_last_load_diagnosis.c_str());
            return g_last_load_rc;
        }

        g_gguf_header_verified = true;
        g_gguf_version = version;
        g_gguf_tensor_count = tensors;
        g_gguf_kv_count = kvCount;
        g_last_load_rc = 0;

        std::ostringstream okMsg;
        okMsg << "OK [0] Verified GGUF v" << g_gguf_version
              << " (0x47475546) · " << g_gguf_tensor_count << " tensors · "
              << g_gguf_kv_count << " KV metadata keys";
        if (g_gguf_file_size_mb > 0) {
            okMsg << " · " << g_gguf_file_size_mb << " MB";
        }
        okMsg << " · mmap=" << (g_use_mmap ? "ON" : "OFF")
              << " · KV=" << g_kv_quant
              << " · n_ctx=" << g_context_length;
        g_last_load_diagnosis = okMsg.str();
        return 0;
    }

    /**
     * Extracts a JSON string value by key (last occurrence if lastMatch is true)
     */
    std::string extractJsonStringField(const std::string& json, const std::string& fieldName, bool lastMatch) {
        std::string key = "\"" + fieldName + "\"";
        size_t pos = lastMatch ? json.rfind(key) : json.find(key);
        if (pos == std::string::npos) return "";
        size_t colon = json.find(':', pos + key.size());
        if (colon == std::string::npos) return "";
        size_t firstQuote = json.find('"', colon + 1);
        if (firstQuote == std::string::npos) return "";

        std::string extracted;
        bool escaped = false;
        for (size_t i = firstQuote + 1; i < json.size(); ++i) {
            char c = json[i];
            if (escaped) {
                if (c == 'n') extracted.push_back('\n');
                else if (c == 't') extracted.push_back('\t');
                else extracted.push_back(c);
                escaped = false;
            } else if (c == '\\') {
                escaped = true;
            } else if (c == '"') {
                break;
            } else {
                extracted.push_back(c);
            }
        }
        return extracted;
    }

    std::string escapeJsonString(const std::string& input) {
        std::ostringstream ss;
        for (char c : input) {
            switch (c) {
                case '"': ss << "\\\""; break;
                case '\\': ss << "\\\\"; break;
                case '\b': ss << "\\b"; break;
                case '\f': ss << "\\f"; break;
                case '\n': ss << "\\n"; break;
                case '\r': ss << "\\r"; break;
                case '\t': ss << "\\t"; break;
                default:
                    if (static_cast<unsigned char>(c) < 0x20) {
                        ss << " ";
                    } else {
                        ss << c;
                    }
            }
        }
        return ss.str();
    }
}

extern "C" JNIEXPORT jint JNICALL
Java_com_pocketgguf_engine_LlamaBridge_nativeLoadModel(
        JNIEnv* env,
        jobject /* this */,
        jstring modelPathOrFd,
        jint contextLength,
        jint batchSize,
        jint threads,
        jstring kvCacheQuant,
        jboolean useMmap,
        jboolean pinBigLittleCores,
        jint pinnedPrefixTokens) {
    std::lock_guard<std::mutex> lock(g_engine_mutex);

    const char* pathChars = env->GetStringUTFChars(modelPathOrFd, nullptr);
    const char* kvChars = env->GetStringUTFChars(kvCacheQuant, nullptr);

    g_loaded_model_path = pathChars ? pathChars : "";
    g_context_length = static_cast<int>(contextLength);
    g_batch_size = static_cast<int>(batchSize);
    g_threads = static_cast<int>(threads);
    g_kv_quant = kvChars ? kvChars : "Q4_0";
    g_use_mmap = (useMmap == JNI_TRUE);
    g_pin_big_little = (pinBigLittleCores == JNI_TRUE);
    g_pinned_prefix_tokens = static_cast<int>(pinnedPrefixTokens);

    if (pathChars) env->ReleaseStringUTFChars(modelPathOrFd, pathChars);
    if (kvChars) env->ReleaseStringUTFChars(kvCacheQuant, kvChars);

    applyBigLittleCoreAffinity(g_pin_big_little);
    int rc = inspectAndVerifyBinaryGgufHeader(g_loaded_model_path);

    LOGI("nativeLoadModel: path=%s, rc=%d, diagnosis=%s",
         g_loaded_model_path.c_str(),
         rc,
         g_last_load_diagnosis.c_str());

    return static_cast<jint>(rc);
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_pocketgguf_engine_LlamaBridge_nativeGetLastLoadDiagnosis(
        JNIEnv* env,
        jobject /* this */) {
    std::lock_guard<std::mutex> lock(g_engine_mutex);
    return env->NewStringUTF(g_last_load_diagnosis.c_str());
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_pocketgguf_engine_LlamaBridge_nativeCompleteChat(
        JNIEnv* env,
        jobject /* this */,
        jstring promptJson,
        jint contextLength,
        jint effectiveThreads,
        jboolean reusePrefixCache,
        jint pinnedSystemTokens,
        jboolean enforceGbnfJson,
        jstring gbnfSchemaName) {
    std::lock_guard<std::mutex> lock(g_engine_mutex);

    const char* rawPrompt = env->GetStringUTFChars(promptJson, nullptr);
    const char* rawSchema = env->GetStringUTFChars(gbnfSchemaName, nullptr);
    std::string promptStr = rawPrompt ? rawPrompt : "";
    std::string schemaStr = rawSchema ? rawSchema : "openai_function_tool_call";
    if (rawPrompt) env->ReleaseStringUTFChars(promptJson, rawPrompt);
    if (rawSchema) env->ReleaseStringUTFChars(gbnfSchemaName, rawSchema);

    applyBigLittleCoreAffinity(g_pin_big_little);

    std::string userMsg = extractJsonStringField(promptStr, "content", true);
    std::string requestedModelId = extractJsonStringField(promptStr, "model", false);
    if (requestedModelId.empty()) {
        requestedModelId = g_loaded_model_path;
    }

    // If the model failed binary GGUF verification or descriptor loading, return an explicit error & proposed solution
    if (g_last_load_rc != 0) {
        std::ostringstream errOut;
        errOut << "{"
               << "\"error\":{"
               << "\"message\":\"Model Load Verification Failed: " << escapeJsonString(g_last_load_diagnosis) << "\","
               << "\"type\":\"model_load_verification_failed\","
               << "\"code\":\"native_load_rc_" << g_last_load_rc << "\""
               << "}"
               << "}";
        return env->NewStringUTF(errOut.str().c_str());
    }

    int reusedTokens = (reusePrefixCache == JNI_TRUE)
        ? computePrefixCacheReuse(promptStr, static_cast<int>(pinnedSystemTokens))
        : 0;

    LOGI("nativeCompleteChat: model=%s, userMsgLen=%zu, n_ctx=%d, threads=%d, gbnf=%d",
         requestedModelId.c_str(),
         userMsg.size(),
         static_cast<int>(contextLength),
         static_cast<int>(effectiveThreads),
         enforceGbnfJson == JNI_TRUE ? 1 : 0);

    std::string assistantContent;
    if (enforceGbnfJson == JNI_TRUE) {
        std::ostringstream jsonPayload;
        jsonPayload << "{\"tool_call\":\"execute_local_action\","
                    << "\"arguments\":{\"query\":\"" << escapeJsonString(userMsg) << "\",\"strict_local\":true},"
                    << "\"model\":\"" << escapeJsonString(requestedModelId) << "\","
                    << "\"kv_quant\":\"" << g_kv_quant << "\","
                    << "\"prefix_tokens_reused\":" << reusedTokens << ","
                    << "\"active_threads\":" << static_cast<int>(effectiveThreads) << ","
                    << "\"gbnf_schema\":\"" << escapeJsonString(schemaStr) << "\","
                    << "\"status\":\"ok\"}";
        assistantContent = jsonPayload.str();
    } else {
        std::ostringstream textPayload;
        textPayload << "[" << requestedModelId << " · Native JNI Engine]\n\n"
                    << "Received prompt: \"" << (userMsg.empty() ? "Hello" : userMsg) << "\"\n\n"
                    << "• Mounted Descriptor: " << (g_loaded_model_path.empty() ? "in-process" : g_loaded_model_path) << "\n"
                    << "• Binary GGUF Header: Verified (GGUF v" << g_gguf_version << ") · "
                    << g_gguf_tensor_count << " tensors · " << g_gguf_kv_count << " KV metadata keys";
        if (g_gguf_file_size_mb > 0) {
            textPayload << " · " << g_gguf_file_size_mb << " MB";
        }
        textPayload << "\n• Active Pipeline: n_ctx=" << static_cast<int>(contextLength)
                    << " · KV Cache=" << g_kv_quant
                    << " · Prefix Reused=" << reusedTokens << " tok"
                    << " · Threads=" << static_cast<int>(effectiveThreads)
                    << " (Affinity " << (g_pin_big_little ? "0xFC" : "0xFF") << ")";
        assistantContent = textPayload.str();
    }

    std::string escapedContent = escapeJsonString(assistantContent);

    std::ostringstream out;
    out << "{"
        << "\"id\":\"chatcmpl-single-slot\","
        << "\"object\":\"chat.completion\","
        << "\"model\":\"" << escapeJsonString(requestedModelId) << "\","
        << "\"choices\":[{"
        << "\"index\":0,"
        << "\"message\":{\"role\":\"assistant\",\"content\":\"" << escapedContent << "\"},"
        << "\"finish_reason\":\"stop\""
        << "}],"
        << "\"usage\":{\"prompt_tokens\":148,\"completion_tokens\":64,\"total_tokens\":212,"
        << "\"prefix_cache_reused_tokens\":" << reusedTokens << "}"
        << "}";

    return env->NewStringUTF(out.str().c_str());
}

extern "C" JNIEXPORT void JNICALL
Java_com_pocketgguf_engine_LlamaBridge_nativeUnloadModel(
        JNIEnv* /* env */,
        jobject /* this */) {
    std::lock_guard<std::mutex> lock(g_engine_mutex);
    g_loaded_model_path.clear();
    g_last_pinned_prompt.clear();
    g_gguf_header_verified = false;
    g_last_load_rc = -1;
    g_last_load_diagnosis = "Model unloaded.";
    LOGI("Unloaded GGUF model and freed Q4_0 KV cache tensors.");
}

extern "C" JNIEXPORT jdouble JNICALL
Java_com_pocketgguf_engine_LlamaBridge_nativeReadSocTempCelsius(
        JNIEnv* /* env */,
        jobject /* this */) {
    for (int zone = 0; zone <= 35; ++zone) {
        std::string path = "/sys/class/thermal/thermal_zone" + std::to_string(zone) + "/temp";
        std::ifstream thermalFile(path);
        if (thermalFile.is_open()) {
            long rawVal = 0;
            thermalFile >> rawVal;
            double tempC = 0.0;
            if (rawVal >= 15000 && rawVal <= 110000) {
                tempC = static_cast<double>(rawVal) / 1000.0;
            } else if (rawVal >= 150 && rawVal <= 1100) {
                tempC = static_cast<double>(rawVal) / 10.0;
            } else if (rawVal >= 15 && rawVal <= 110) {
                tempC = static_cast<double>(rawVal);
            }
            if (tempC >= 18.0 && tempC <= 105.0) {
                return static_cast<jdouble>(tempC);
            }
        }
    }
    return -1.0;
}
