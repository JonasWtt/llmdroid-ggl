#include <jni.h>
#include <string>
#include <vector>
#include <fstream>
#include <sstream>
#include <iomanip>
#include <mutex>
#include <algorithm>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <cstdlib>
#include <cerrno>
#include <sched.h>
#include <unistd.h>
#include <fcntl.h>
#include <sys/stat.h>
#include <android/log.h>

#include "llama.h"
#include "ggml.h"

#define LOG_TAG "PocketGGUF_JNI"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, LOG_TAG, __VA_ARGS__)
#define LOGW(...) __android_log_print(ANDROID_LOG_WARN, LOG_TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

/**
 * Linker wrapper (-Wl,--wrap=fopen) that intercepts fopen() calls inside libggml / libllama.
 * On Android 10-15, opening "/proc/self/fd/<N>" via standard fopen() can trigger an SELinux EACCES
 * path check on the target /storage/emulated/0/Download/... file from DownloadsProvider.
 * If direct fopen() fails, we duplicate the already-authorized file descriptor via dup(fd),
 * seek to offset 0, and wrap it in a standard FILE* via fdopen(dupFd, mode).
 */
extern "C" FILE* __real_fopen(const char* path, const char* mode);

extern "C" FILE* __wrap_fopen(const char* path, const char* mode) {
    if (path != nullptr && std::strncmp(path, "/proc/self/fd/", 14) == 0) {
        FILE* directFp = __real_fopen(path, mode);
        if (directFp != nullptr) {
            std::fseek(directFp, 0, SEEK_SET);
            return directFp;
        }
        int fd = std::atoi(path + 14);
        if (fd >= 0) {
            int dupFd = ::dup(fd);
            if (dupFd >= 0) {
                ::lseek(dupFd, 0, SEEK_SET);
                FILE* fp = ::fdopen(dupFd, mode);
                if (fp != nullptr) {
                    return fp;
                }
                ::close(dupFd);
            }
        }
    }
    return __real_fopen(path, mode);
}

namespace {
    std::mutex g_engine_mutex;
    bool g_backend_initialized = false;

    llama_model* g_model = nullptr;
    llama_context* g_ctx = nullptr;

    std::string g_loaded_model_path;
    dev_t g_loaded_st_dev = 0;
    ino_t g_loaded_st_ino = 0;
    int g_context_length = 8192;
    int g_effective_context_length = 8192;
    int g_batch_size = 512;
    int g_threads = 6;
    std::string g_kv_quant = "Q4_0";
    bool g_use_mmap = true;
    int g_pinned_prefix_tokens = 1024;
    bool g_pin_big_little = true;

    // Single-slot token prefix cache state
    std::vector<llama_token> g_cached_tokens;

    // Real binary header metadata & diagnostic state read from the mounted .gguf file descriptor
    uint32_t g_gguf_version = 3;
    uint64_t g_gguf_tensor_count = 0;
    uint64_t g_gguf_kv_count = 0;
    long long g_gguf_file_size_bytes = 0;
    long long g_gguf_file_size_mb = 0;
    bool g_gguf_header_verified = false;
    int g_last_load_rc = -1;
    std::string g_last_load_diagnosis = "No model loaded in native JNI bridge yet.";
    std::string g_model_arch_desc = "";

    static void androidLlamaLogCallback(ggml_log_level level, const char* text, void* /* user_data */) {
        if (!text) return;
        if (level == GGML_LOG_LEVEL_ERROR) {
            __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, "%s", text);
        } else if (level == GGML_LOG_LEVEL_WARN) {
            __android_log_print(ANDROID_LOG_WARN, LOG_TAG, "%s", text);
        } else if (level == GGML_LOG_LEVEL_INFO) {
            __android_log_print(ANDROID_LOG_INFO, LOG_TAG, "%s", text);
        }
    }

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

    ggml_type mapKvQuantToGgmlType(const std::string& kvQuant) {
        if (kvQuant == "Q4_0") {
            return GGML_TYPE_Q4_0;
        }
        if (kvQuant == "Q8_0") {
            return GGML_TYPE_Q8_0;
        }
        return GGML_TYPE_F16;
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

    void freeLoadedLlamaResourcesLocked() {
        if (g_ctx != nullptr) {
            llama_free(g_ctx);
            g_ctx = nullptr;
        }
        if (g_model != nullptr) {
            llama_model_free(g_model);
            g_model = nullptr;
        }
        g_cached_tokens.clear();
        g_loaded_st_dev = 0;
        g_loaded_st_ino = 0;
        g_model_arch_desc.clear();
    }

    /**
     * Inspects and validates the real binary GGUF header from /proc/self/fd/<fd>
     * (using POSIX fstat + pread on the open file descriptor to avoid Android SELinux symlink denials)
     * or from a standard filesystem path.
     */
    int inspectAndVerifyBinaryGgufHeader(const std::string& pathOrFd, dev_t* outDev, ino_t* outIno) {
        g_gguf_header_verified = false;
        g_gguf_tensor_count = 0;
        g_gguf_kv_count = 0;
        g_gguf_file_size_bytes = 0;
        g_gguf_file_size_mb = 0;
        if (outDev) *outDev = 0;
        if (outIno) *outIno = 0;

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

        const std::string fdPrefix = "/proc/self/fd/";
        if (pathOrFd.compare(0, fdPrefix.size(), fdPrefix) == 0) {
            int fd = std::atoi(pathOrFd.c_str() + fdPrefix.size());
            if (fd >= 0) {
                struct stat st;
                if (fstat(fd, &st) == 0 && st.st_size > 0) {
                    g_gguf_file_size_bytes = static_cast<long long>(st.st_size);
                    g_gguf_file_size_mb = g_gguf_file_size_bytes / (1024LL * 1024LL);
                    if (outDev) *outDev = st.st_dev;
                    if (outIno) *outIno = st.st_ino;
                }
                bytesRead = pread(fd, headerBuf, sizeof(headerBuf), 0);
            }
        }

        if (bytesRead < 0) {
            struct stat st;
            if (stat(pathOrFd.c_str(), &st) == 0 && st.st_size > 0) {
                g_gguf_file_size_bytes = static_cast<long long>(st.st_size);
                g_gguf_file_size_mb = g_gguf_file_size_bytes / (1024LL * 1024LL);
                if (outDev) *outDev = st.st_dev;
                if (outIno) *outIno = st.st_ino;
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
        return 0;
    }

    struct ParsedChatMessage {
        std::string role;
        std::string content;
    };

    std::string extractJsonStringFieldFromPos(const std::string& json, const std::string& fieldName, size_t startPos, size_t endPos, size_t* outNextPos = nullptr) {
        std::string key = "\"" + fieldName + "\"";
        size_t pos = json.find(key, startPos);
        if (pos == std::string::npos || pos >= endPos) return "";
        size_t colon = json.find(':', pos + key.size());
        if (colon == std::string::npos || colon >= endPos) return "";
        size_t firstQuote = json.find('"', colon + 1);
        if (firstQuote == std::string::npos || firstQuote >= endPos) return "";

        std::string extracted;
        bool escaped = false;
        size_t i = firstQuote + 1;
        for (; i < json.size() && i < endPos; ++i) {
            char c = json[i];
            if (escaped) {
                if (c == 'n') extracted.push_back('\n');
                else if (c == 'r') extracted.push_back('\r');
                else if (c == 't') extracted.push_back('\t');
                else extracted.push_back(c);
                escaped = false;
            } else if (c == '\\') {
                escaped = true;
            } else if (c == '"') {
                ++i;
                break;
            } else {
                extracted.push_back(c);
            }
        }
        if (outNextPos) *outNextPos = i;
        return extracted;
    }

    std::string extractJsonStringField(const std::string& json, const std::string& fieldName, bool lastMatch) {
        std::string key = "\"" + fieldName + "\"";
        size_t pos = lastMatch ? json.rfind(key) : json.find(key);
        if (pos == std::string::npos) return "";
        return extractJsonStringFieldFromPos(json, fieldName, pos, json.size());
    }

    int extractJsonIntField(const std::string& json, const std::string& fieldName, int defaultVal) {
        std::string key = "\"" + fieldName + "\"";
        size_t pos = json.find(key);
        if (pos == std::string::npos) return defaultVal;
        size_t colon = json.find(':', pos + key.size());
        if (colon == std::string::npos) return defaultVal;
        size_t numStart = colon + 1;
        while (numStart < json.size() && (json[numStart] == ' ' || json[numStart] == '\t' || json[numStart] == '\n')) {
            ++numStart;
        }
        if (numStart >= json.size() || (!std::isdigit(static_cast<unsigned char>(json[numStart])) && json[numStart] != '-')) {
            return defaultVal;
        }
        return std::atoi(json.c_str() + numStart);
    }

    std::vector<ParsedChatMessage> parseMessagesArray(const std::string& json) {
        std::vector<ParsedChatMessage> msgs;
        size_t msgsKey = json.find("\"messages\"");
        if (msgsKey != std::string::npos) {
            size_t arrStart = json.find('[', msgsKey);
            if (arrStart != std::string::npos) {
                size_t cur = arrStart + 1;
                while (cur < json.size()) {
                    size_t objStart = json.find('{', cur);
                    size_t arrEnd = json.find(']', cur);
                    if (objStart == std::string::npos || (arrEnd != std::string::npos && objStart > arrEnd)) {
                        break;
                    }
                    // Find matching closing brace (respecting string quotes)
                    bool inStr = false;
                    bool esc = false;
                    int depth = 0;
                    size_t objEnd = std::string::npos;
                    for (size_t i = objStart; i < json.size(); ++i) {
                        char c = json[i];
                        if (inStr) {
                            if (esc) esc = false;
                            else if (c == '\\') esc = true;
                            else if (c == '"') inStr = false;
                        } else {
                            if (c == '"') inStr = true;
                            else if (c == '{') ++depth;
                            else if (c == '}') {
                                --depth;
                                if (depth == 0) {
                                    objEnd = i + 1;
                                    break;
                                }
                            }
                        }
                    }
                    if (objEnd == std::string::npos) break;

                    std::string role = extractJsonStringFieldFromPos(json, "role", objStart, objEnd);
                    std::string content = extractJsonStringFieldFromPos(json, "content", objStart, objEnd);
                    if (!role.empty() && !content.empty()) {
                        msgs.push_back({role, content});
                    }
                    cur = objEnd;
                }
            }
        }

        if (msgs.empty()) {
            std::string fallbackContent = extractJsonStringField(json, "content", true);
            if (fallbackContent.empty()) fallbackContent = "Hello!";
            msgs.push_back({"user", fallbackContent});
        }
        return msgs;
    }

    std::string buildFormattedChatPrompt(llama_model* model, const std::vector<ParsedChatMessage>& messages) {
        std::vector<llama_chat_message> rawMsgs;
        rawMsgs.reserve(messages.size());
        for (const auto& m : messages) {
            rawMsgs.push_back({m.role.c_str(), m.content.c_str()});
        }

        const char* tmpl = llama_model_chat_template(model, nullptr);
        std::string formatted;

        if (tmpl != nullptr && tmpl[0] != '\0') {
            int32_t requiredLen = llama_chat_apply_template(
                tmpl,
                rawMsgs.data(),
                rawMsgs.size(),
                true,
                nullptr,
                0
            );
            if (requiredLen > 0) {
                std::vector<char> buf(static_cast<size_t>(requiredLen) + 16, '\0');
                int32_t written = llama_chat_apply_template(
                    tmpl,
                    rawMsgs.data(),
                    rawMsgs.size(),
                    true,
                    buf.data(),
                    static_cast<int32_t>(buf.size())
                );
                if (written > 0) {
                    formatted.assign(buf.data(), static_cast<size_t>(written));
                }
            }
        }

        // Fallback to standard ChatML if template application was unsupported
        if (formatted.empty()) {
            std::ostringstream chatml;
            for (const auto& m : messages) {
                chatml << "<|im_start|>" << m.role << "\n"
                       << m.content << "<|im_end|>\n";
            }
            chatml << "<|im_start|>assistant\n";
            formatted = chatml.str();
        }

        // For Qwen3 models, prefill empty <think></think> block unless user explicitly asked for /think
        // so mobile CPU inference immediately generates the user-facing response without waiting for 300 thinking tokens.
        std::string lastUserText = messages.empty() ? "" : messages.back().content;
        bool wantsThink = (lastUserText.find("/think") != std::string::npos);
        bool isQwen3 = (g_model_arch_desc.find("qwen3") != std::string::npos ||
                        g_model_arch_desc.find("Qwen3") != std::string::npos ||
                        (tmpl != nullptr && std::strstr(tmpl, "<think>") != nullptr));
        if (isQwen3 && !wantsThink && formatted.find("<think>") == std::string::npos) {
            formatted += "<think>\n\n</think>\n\n";
        }

        return formatted;
    }

    std::string cleanGeneratedOutput(std::string text) {
        // Strip empty <think></think> blocks if present
        const std::string thinkOpen = "<think>";
        const std::string thinkClose = "</think>";
        size_t openPos = text.find(thinkOpen);
        size_t closePos = text.find(thinkClose);
        if (openPos != std::string::npos && closePos != std::string::npos && closePos > openPos) {
            std::string inside = text.substr(openPos + thinkOpen.size(), closePos - (openPos + thinkOpen.size()));
            bool allWhitespace = std::all_of(inside.begin(), inside.end(), [](unsigned char c) {
                return std::isspace(c);
            });
            if (allWhitespace) {
                text.erase(openPos, (closePos + thinkClose.size()) - openPos);
            }
        }

        // Trim leading whitespace/newlines
        size_t firstNonSpace = 0;
        while (firstNonSpace < text.size() && (text[firstNonSpace] == '\n' || text[firstNonSpace] == '\r' || text[firstNonSpace] == ' ')) {
            ++firstNonSpace;
        }
        if (firstNonSpace > 0) {
            text.erase(0, firstNonSpace);
        }

        // Trim trailing special stop markers
        const char* stopMarkers[] = {"<|im_end|>", "<|eot_id|>", "<|endoftext|>", "</s>"};
        for (const char* marker : stopMarkers) {
            size_t mPos = text.find(marker);
            if (mPos != std::string::npos) {
                text.erase(mPos);
            }
        }

        return text;
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

    std::string reqPath = pathChars ? pathChars : "";
    std::string reqKvQuant = kvChars ? kvChars : "Q4_0";
    int reqCtx = std::max(512, static_cast<int>(contextLength));
    int reqBatch = std::max(64, static_cast<int>(batchSize));
    int reqThreads = std::max(1, static_cast<int>(threads));
    bool reqMmap = (useMmap == JNI_TRUE);
    bool reqPinCores = (pinBigLittleCores == JNI_TRUE);
    int reqPinnedTokens = static_cast<int>(pinnedPrefixTokens);

    if (pathChars) env->ReleaseStringUTFChars(modelPathOrFd, pathChars);
    if (kvChars) env->ReleaseStringUTFChars(kvCacheQuant, kvChars);

    applyBigLittleCoreAffinity(reqPinCores);

    dev_t curDev = 0;
    ino_t curIno = 0;
    int headerRc = inspectAndVerifyBinaryGgufHeader(reqPath, &curDev, &curIno);
    if (headerRc != 0) {
        freeLoadedLlamaResourcesLocked();
        return static_cast<jint>(headerRc);
    }

    // Check if this exact model inode + context configuration is already loaded in llama.cpp
    bool sameUnderlyingFile = (g_model != nullptr && g_ctx != nullptr) &&
        ((curIno != 0 && curDev == g_loaded_st_dev && curIno == g_loaded_st_ino) ||
         (reqPath == g_loaded_model_path));

    if (sameUnderlyingFile &&
        reqCtx == g_context_length &&
        reqKvQuant == g_kv_quant &&
        reqMmap == g_use_mmap) {
        g_loaded_model_path = reqPath;
        g_threads = reqThreads;
        g_batch_size = reqBatch;
        g_pin_big_little = reqPinCores;
        g_pinned_prefix_tokens = reqPinnedTokens;
        llama_set_n_threads(g_ctx, g_threads, g_threads);
        g_last_load_rc = 0;
        LOGI("nativeLoadModel: reusing already-loaded llama.cpp model (%s)", g_model_arch_desc.c_str());
        return 0;
    }

    // Free any previously loaded model/context before loading the new one
    freeLoadedLlamaResourcesLocked();

    if (!g_backend_initialized) {
        llama_log_set(androidLlamaLogCallback, nullptr);
        llama_backend_init();
        g_backend_initialized = true;
    }

    g_loaded_model_path = reqPath;
    g_context_length = reqCtx;
    g_batch_size = reqBatch;
    g_threads = reqThreads;
    g_kv_quant = reqKvQuant;
    g_use_mmap = reqMmap;
    g_pin_big_little = reqPinCores;
    g_pinned_prefix_tokens = reqPinnedTokens;

    const int64_t tStartUs = ggml_time_us();

    llama_model_params mparams = llama_model_default_params();
    mparams.use_mmap = g_use_mmap;
    mparams.use_mlock = false;

    LOGI("Calling llama_model_load_from_file('%s', use_mmap=%d)...",
         g_loaded_model_path.c_str(),
         g_use_mmap ? 1 : 0);

    g_model = llama_model_load_from_file(g_loaded_model_path.c_str(), mparams);
    if (g_model == nullptr) {
        g_last_load_rc = -7;
        g_last_load_diagnosis =
            "ERROR [-7] llama_model_load_from_file failed while loading tensors from '" + g_loaded_model_path +
            "'. The .gguf file header was valid, but the tensor data blocks are truncated/incomplete or use an unsupported architecture. "
            "SOLUTION: Verify the full file finished downloading in your phone's Downloads folder, or try enabling mmap in Context settings.";
        LOGE("%s", g_last_load_diagnosis.c_str());
        return static_cast<jint>(g_last_load_rc);
    }

    // Build context with automatic fallback if phone RAM is too tight for large n_ctx
    std::vector<int> candidateCtxLengths = {g_context_length};
    if (g_context_length > 4096) candidateCtxLengths.push_back(4096);
    if (g_context_length > 2048) candidateCtxLengths.push_back(2048);

    ggml_type kvType = mapKvQuantToGgmlType(g_kv_quant);
    for (int candidateCtx : candidateCtxLengths) {
        llama_context_params cparams = llama_context_default_params();
        cparams.n_ctx = static_cast<uint32_t>(candidateCtx);
        uint32_t safeBatch = static_cast<uint32_t>(std::min(g_batch_size, candidateCtx));
        cparams.n_batch = safeBatch;
        cparams.n_ubatch = std::min(safeBatch, 512u);
        cparams.n_threads = g_threads;
        cparams.n_threads_batch = g_threads;
        cparams.type_k = kvType;
        cparams.type_v = kvType;

        g_ctx = llama_init_from_model(g_model, cparams);
        if (g_ctx != nullptr) {
            g_effective_context_length = candidateCtx;
            break;
        }
        LOGW("llama_init_from_model failed for n_ctx=%d; retrying with smaller context window...", candidateCtx);
    }

    if (g_ctx == nullptr) {
        llama_model_free(g_model);
        g_model = nullptr;
        g_last_load_rc = -8;
        g_last_load_diagnosis =
            "ERROR [-8] Out of free phone RAM while allocating llama_context KV cache for '" + g_loaded_model_path + "'. "
            "SOLUTION: Tap '1-Tap Fix: Apply Low-RAM Safe Profile (n_ctx=2048, KV=Q4_0, mmap=ON)' and close background apps.";
        LOGE("%s", g_last_load_diagnosis.c_str());
        return static_cast<jint>(g_last_load_rc);
    }

    g_loaded_st_dev = curDev;
    g_loaded_st_ino = curIno;
    g_last_load_rc = 0;

    char descBuf[128];
    std::memset(descBuf, 0, sizeof(descBuf));
    llama_model_desc(g_model, descBuf, sizeof(descBuf));
    g_model_arch_desc = descBuf;

    const double paramsBillions = static_cast<double>(llama_model_n_params(g_model)) / 1e9;
    const int64_t loadElapsedMs = (ggml_time_us() - tStartUs) / 1000;

    std::ostringstream okMsg;
    okMsg << "OK [0] Loaded in llama.cpp (" << g_model_arch_desc
          << " · " << std::fixed << std::setprecision(2) << paramsBillions << "B params) in "
          << loadElapsedMs << " ms · GGUF v" << g_gguf_version
          << " · " << g_gguf_tensor_count << " tensors";
    if (g_gguf_file_size_mb > 0) {
        okMsg << " · " << g_gguf_file_size_mb << " MB";
    }
    okMsg << " · mmap=" << (g_use_mmap ? "ON" : "OFF")
          << " · KV=" << g_kv_quant
          << " · n_ctx=" << g_effective_context_length;
    g_last_load_diagnosis = okMsg.str();

    LOGI("%s", g_last_load_diagnosis.c_str());
    return 0;
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
        jint /* contextLength */,
        jint effectiveThreads,
        jboolean reusePrefixCache,
        jint /* pinnedSystemTokens */,
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

    std::string requestedModelId = extractJsonStringField(promptStr, "model", false);
    if (requestedModelId.empty()) {
        requestedModelId = g_loaded_model_path;
    }

    if (g_last_load_rc != 0 || g_model == nullptr || g_ctx == nullptr) {
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

    int activeThreads = std::max(1, static_cast<int>(effectiveThreads));
    llama_set_n_threads(g_ctx, activeThreads, activeThreads);

    // 1. Parse OpenAI chat messages and apply the model's GGUF chat template
    std::vector<ParsedChatMessage> messages = parseMessagesArray(promptStr);
    std::string formattedPrompt = buildFormattedChatPrompt(g_model, messages);

    // 2. Tokenize the formatted prompt using the model's real vocabulary
    const llama_vocab* vocab = llama_model_get_vocab(g_model);
    int32_t estTokens = static_cast<int32_t>(formattedPrompt.size()) + 32;
    std::vector<llama_token> promptTokens(static_cast<size_t>(estTokens));
    int32_t nPromptTokens = llama_tokenize(
        vocab,
        formattedPrompt.c_str(),
        static_cast<int32_t>(formattedPrompt.size()),
        promptTokens.data(),
        static_cast<int32_t>(promptTokens.size()),
        true,
        true
    );
    if (nPromptTokens < 0) {
        promptTokens.resize(static_cast<size_t>(-nPromptTokens));
        nPromptTokens = llama_tokenize(
            vocab,
            formattedPrompt.c_str(),
            static_cast<int32_t>(formattedPrompt.size()),
            promptTokens.data(),
            static_cast<int32_t>(promptTokens.size()),
            true,
            true
        );
    }
    if (nPromptTokens <= 0) {
        std::string errJson = "{\"error\":{\"message\":\"llama_tokenize failed to tokenize prompt.\",\"type\":\"tokenize_error\"}}";
        return env->NewStringUTF(errJson.c_str());
    }
    promptTokens.resize(static_cast<size_t>(nPromptTokens));

    // Clamp prompt if it exceeds effective context length minus generation headroom
    const int32_t maxCtx = static_cast<int32_t>(llama_n_ctx(g_ctx));
    const int32_t requestedMaxTokens = std::clamp(extractJsonIntField(promptStr, "max_tokens", 256), 32, 512);
    if (nPromptTokens + requestedMaxTokens >= maxCtx) {
        int32_t keepPrompt = std::max(64, maxCtx - requestedMaxTokens - 16);
        if (nPromptTokens > keepPrompt) {
            promptTokens.erase(promptTokens.begin(), promptTokens.end() - keepPrompt);
            nPromptTokens = static_cast<int32_t>(promptTokens.size());
        }
    }

    // 3. Proposal 2: Single-slot KV prefix cache reuse
    int32_t nPast = 0;
    if (reusePrefixCache == JNI_TRUE && !g_cached_tokens.empty()) {
        size_t maxPrefix = std::min(g_cached_tokens.size(), promptTokens.size());
        // Always leave at least 1 token at the end of promptTokens to evaluate for fresh logits
        if (maxPrefix >= promptTokens.size() && maxPrefix > 0) {
            maxPrefix = promptTokens.size() - 1;
        }
        while (static_cast<size_t>(nPast) < maxPrefix &&
               g_cached_tokens[static_cast<size_t>(nPast)] == promptTokens[static_cast<size_t>(nPast)]) {
            ++nPast;
        }
        if (nPast > 0) {
            llama_kv_self_seq_rm(g_ctx, 0, nPast, -1);
            g_cached_tokens.resize(static_cast<size_t>(nPast));
        } else {
            llama_kv_self_clear(g_ctx);
            g_cached_tokens.clear();
        }
    } else {
        llama_kv_self_clear(g_ctx);
        g_cached_tokens.clear();
    }

    // 4. Evaluate prompt tokens from nPast..nPromptTokens in batches
    const int64_t tPpStartUs = ggml_time_us();
    const int32_t batchCap = std::max(32, std::min(g_batch_size, 512));
    llama_batch batch = llama_batch_init(batchCap, 0, 1);

    for (int32_t curIdx = nPast; curIdx < nPromptTokens; curIdx += batchCap) {
        int32_t chunkLen = std::min(batchCap, nPromptTokens - curIdx);
        batch.n_tokens = chunkLen;
        for (int32_t i = 0; i < chunkLen; ++i) {
            int32_t pos = curIdx + i;
            batch.token[i] = promptTokens[static_cast<size_t>(pos)];
            batch.pos[i] = pos;
            batch.n_seq_id[i] = 1;
            batch.seq_id[i][0] = 0;
            batch.logits[i] = (pos == nPromptTokens - 1) ? 1 : 0;
        }
        if (llama_decode(g_ctx, batch) != 0) {
            llama_batch_free(batch);
            llama_kv_self_clear(g_ctx);
            g_cached_tokens.clear();
            std::string errJson = "{\"error\":{\"message\":\"llama_decode failed during prompt evaluation (KV cache full or OOM). SOLUTION: Tap Clear in Chat or reduce Context Length in Context settings.\",\"type\":\"decode_error\"}}";
            return env->NewStringUTF(errJson.c_str());
        }
    }

    g_cached_tokens = promptTokens;
    const int64_t tPpEndUs = ggml_time_us();
    const double ppSec = std::max(0.001, static_cast<double>(tPpEndUs - tPpStartUs) / 1e6);
    const int32_t evaluatedPromptTokens = std::max(1, nPromptTokens - nPast);
    const double ppTps = static_cast<double>(evaluatedPromptTokens) / ppSec;

    // 5. Initialize sampler chain (with optional GBNF JSON grammar constraint)
    llama_sampler_chain_params sparams = llama_sampler_chain_default_params();
    llama_sampler* smpl = llama_sampler_chain_init(sparams);

    if (enforceGbnfJson == JNI_TRUE) {
        const char* jsonObjectGrammar =
            "root   ::= object\n"
            "value  ::= object | array | string | number | (\"true\" | \"false\" | \"null\") ws\n"
            "object ::= \"{\" ws ( string \":\" ws value (\",\" ws string \":\" ws value)* )? \"}\" ws\n"
            "array  ::= \"[\" ws ( value (\",\" ws value)* )? \"]\" ws\n"
            "string ::= \"\\\"\" ([^\"\\\\\\x7F\\x00-\\x1F] | \"\\\\\" ([\"\\\\/bfnrt] | \"u\" [0-9a-fA-F]{4}))* \"\\\"\" ws\n"
            "number ::= (\"-\"? ([0-9] | [1-9] [0-9]{0,15})) (\".\" [0-9]+)? ([eE] [-+]? [0-9] [1-9]{0,15})? ws\n"
            "ws     ::= | \" \" | \"\\n\" [ \\t]{0,20}\n";
        llama_sampler* grammarSampler = llama_sampler_init_grammar(vocab, jsonObjectGrammar, "root");
        if (grammarSampler != nullptr) {
            llama_sampler_chain_add(smpl, grammarSampler);
        }
    }

    llama_sampler_chain_add(smpl, llama_sampler_init_penalties(64, 1.10f, 0.0f, 0.0f));
    llama_sampler_chain_add(smpl, llama_sampler_init_top_k(40));
    llama_sampler_chain_add(smpl, llama_sampler_init_top_p(0.90f, 1));
    llama_sampler_chain_add(smpl, llama_sampler_init_temp(0.70f));
    llama_sampler_chain_add(smpl, llama_sampler_init_dist(static_cast<uint32_t>(ggml_time_us() & 0xFFFFFFFF)));

    for (llama_token tok : promptTokens) {
        llama_sampler_accept(smpl, tok);
    }

    // 6. Autoregressive token generation loop
    const int64_t tTgStartUs = ggml_time_us();
    std::string generatedText;
    int32_t nCurPos = nPromptTokens;
    int32_t completionTokens = 0;

    for (int32_t step = 0; step < requestedMaxTokens && nCurPos < maxCtx - 1; ++step) {
        llama_token newTokenId = llama_sampler_sample(smpl, g_ctx, -1);
        llama_sampler_accept(smpl, newTokenId);

        if (llama_vocab_is_eog(vocab, newTokenId)) {
            break;
        }

        char pieceBuf[256];
        int32_t pieceLen = llama_token_to_piece(vocab, newTokenId, pieceBuf, sizeof(pieceBuf), 0, false);
        if (pieceLen > 0) {
            generatedText.append(pieceBuf, static_cast<size_t>(std::min<int32_t>(pieceLen, sizeof(pieceBuf))));
        }

        ++completionTokens;
        g_cached_tokens.push_back(newTokenId);

        // Stop early if ChatML / Llama stop sequence appears in generated text
        if (generatedText.find("<|im_end|>") != std::string::npos ||
            generatedText.find("<|eot_id|>") != std::string::npos ||
            generatedText.find("<|endoftext|>") != std::string::npos) {
            break;
        }

        batch.n_tokens = 1;
        batch.token[0] = newTokenId;
        batch.pos[0] = nCurPos;
        batch.n_seq_id[0] = 1;
        batch.seq_id[0][0] = 0;
        batch.logits[0] = 1;

        if (llama_decode(g_ctx, batch) != 0) {
            LOGW("llama_decode stopped early at generation step=%d, pos=%d", step, nCurPos);
            break;
        }
        ++nCurPos;
    }

    llama_sampler_free(smpl);
    llama_batch_free(batch);

    const int64_t tTgEndUs = ggml_time_us();
    const double tgSec = std::max(0.001, static_cast<double>(tTgEndUs - tTgStartUs) / 1e6);
    const double tgTps = static_cast<double>( std::max(1, completionTokens) ) / tgSec;

    std::string finalAnswer = cleanGeneratedOutput(generatedText);
    if (finalAnswer.empty()) {
        finalAnswer = "(Model generated an empty response.)";
    }

    LOGI("nativeCompleteChat finished: prompt_tokens=%d (reused=%d, pp=%.1f t/s), completion_tokens=%d (tg=%.1f t/s)",
         nPromptTokens,
         nPast,
         ppTps,
         completionTokens,
         tgTps);

    std::string escapedContent = escapeJsonString(finalAnswer);

    std::ostringstream out;
    out << std::fixed << std::setprecision(1);
    out << "{"
        << "\"id\":\"chatcmpl-single-slot\","
        << "\"object\":\"chat.completion\","
        << "\"model\":\"" << escapeJsonString(requestedModelId) << "\","
        << "\"choices\":[{"
        << "\"index\":0,"
        << "\"message\":{\"role\":\"assistant\",\"content\":\"" << escapedContent << "\"},"
        << "\"finish_reason\":\"stop\""
        << "}],"
        << "\"usage\":{"
        << "\"prompt_tokens\":" << nPromptTokens << ","
        << "\"completion_tokens\":" << completionTokens << ","
        << "\"total_tokens\":" << (nPromptTokens + completionTokens) << ","
        << "\"prefix_cache_reused_tokens\":" << nPast << ","
        << "\"prompt_eval_tps\":" << ppTps << ","
        << "\"eval_tps\":" << tgTps
        << "}"
        << "}";

    return env->NewStringUTF(out.str().c_str());
}

extern "C" JNIEXPORT void JNICALL
Java_com_pocketgguf_engine_LlamaBridge_nativeUnloadModel(
        JNIEnv* /* env */,
        jobject /* this */) {
    std::lock_guard<std::mutex> lock(g_engine_mutex);
    freeLoadedLlamaResourcesLocked();
    g_loaded_model_path.clear();
    g_gguf_header_verified = false;
    g_last_load_rc = -1;
    g_last_load_diagnosis = "Model unloaded.";
    LOGI("Unloaded llama.cpp GGUF model and freed KV cache tensors.");
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
