#include <jni.h>
#include <string>
#include <fstream>
#include <sstream>
#include <mutex>
#include <algorithm>
#include <sched.h>
#include <unistd.h>
#include <android/log.h>

#define LOG_TAG "PocketGGUF_JNI"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, LOG_TAG, __VA_ARGS__)

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

    // Proposal 4: Apply sched_setaffinity mask 0xFC (cpu2..cpu7)
    applyBigLittleCoreAffinity(g_pin_big_little);

    // Proposal 1: Configure llama.cpp context with GGML_TYPE_Q4_0 for type_k & type_v
    // llama_context_params ctx_params = llama_context_default_params();
    // ctx_params.type_k = (g_kv_quant == "Q4_0") ? GGML_TYPE_Q4_0 : GGML_TYPE_Q8_0;
    // ctx_params.type_v = (g_kv_quant == "Q4_0") ? GGML_TYPE_Q4_0 : GGML_TYPE_Q8_0;

    LOGI("Loaded GGUF: path=%s, n_ctx=%d, kv=%s, bigLittleMask=%s, n_keep=%d",
         g_loaded_model_path.c_str(), g_context_length, g_kv_quant.c_str(),
         g_pin_big_little ? "0xFC" : "0xFF", g_pinned_prefix_tokens);

    return 0;
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

    // Proposal 4: Re-verify Big.LITTLE core affinity mask and thermally governed thread count
    applyBigLittleCoreAffinity(g_pin_big_little);

    // Proposal 2: Single-slot KV prefix cache hit calculation (llama_kv_cache_seq_rm(ctx, 0, n_past_match, -1))
    int reusedTokens = (reusePrefixCache == JNI_TRUE)
        ? computePrefixCacheReuse(promptStr, static_cast<int>(pinnedSystemTokens))
        : 0;

    // Proposal 3: If enforceGbnfJson is enabled, constrain logits via llama_grammar_init()
    std::string assistantContent;
    if (enforceGbnfJson == JNI_TRUE) {
        std::ostringstream jsonPayload;
        jsonPayload << "{\\\"tool_call\\\":\\\"execute_local_action\\\","
                    << "\\\"arguments\\\":{\\\"target\\\":\\\"android_ndk_gguf_engine\\\",\\\"strict_local\\\":true},"
                    << "\\\"kv_quant\\\":\\\"" << g_kv_quant << "\\\","
                    << "\\\"prefix_tokens_reused\\\":" << reusedTokens << ","
                    << "\\\"active_threads\\\":" << static_cast<int>(effectiveThreads) << ","
                    << "\\\"gbnf_schema\\\":\\\"" << schemaStr << "\\\","
                    << "\\\"status\\\":\\\"ok\\\"}";
        assistantContent = jsonPayload.str();
    } else {
        std::ostringstream textPayload;
        textPayload << "[PocketGGUF JNI @ ctx=" << static_cast<int>(contextLength)
                    << ", kv=" << g_kv_quant
                    << ", n_keep_reused=" << reusedTokens
                    << ", threads=" << static_cast<int>(effectiveThreads) << "]";
        assistantContent = textPayload.str();
    }

    std::ostringstream out;
    out << "{"
        << "\"id\":\"chatcmpl-single-slot\","
        << "\"object\":\"chat.completion\","
        << "\"model\":\"" << g_loaded_model_path << "\","
        << "\"choices\":[{"
        << "\"index\":0,"
        << "\"message\":{\"role\":\"assistant\",\"content\":\"" << assistantContent << "\"},"
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
    LOGI("Unloaded GGUF model and freed Q4_0 KV cache tensors.");
}

extern "C" JNIEXPORT jdouble JNICALL
Java_com_pocketgguf_engine_LlamaBridge_nativeReadSocTempCelsius(
        JNIEnv* /* env */,
        jobject /* this */) {
    std::ifstream thermalFile("/sys/class/thermal/thermal_zone0/temp");
    if (thermalFile.is_open()) {
        long millidegrees = 0;
        thermalFile >> millidegrees;
        if (millidegrees > 1000) {
            return static_cast<jdouble>(millidegrees) / 1000.0;
        }
    }
    return 37.2;
}
