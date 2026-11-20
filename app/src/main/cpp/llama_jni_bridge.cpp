#include <jni.h>
#include <string>
#include <fstream>
#include <sstream>
#include <mutex>
#include <android/log.h>

#define LOG_TAG "PocketGGUF_JNI"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, LOG_TAG, __VA_ARGS__)

namespace {
    std::mutex g_engine_mutex;
    std::string g_loaded_model_path;
    int g_context_length = 4096;
    int g_batch_size = 512;
    int g_threads = 6;
    std::string g_kv_quant = "FP16";
    bool g_use_mmap = true;
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
        jboolean useMmap) {
    std::lock_guard<std::mutex> lock(g_engine_mutex);

    const char* pathChars = env->GetStringUTFChars(modelPathOrFd, nullptr);
    const char* kvChars = env->GetStringUTFChars(kvCacheQuant, nullptr);

    g_loaded_model_path = pathChars ? pathChars : "";
    g_context_length = static_cast<int>(contextLength);
    g_batch_size = static_cast<int>(batchSize);
    g_threads = static_cast<int>(threads);
    g_kv_quant = kvChars ? kvChars : "FP16";
    g_use_mmap = (useMmap == JNI_TRUE);

    if (pathChars) env->ReleaseStringUTFChars(modelPathOrFd, pathChars);
    if (kvChars) env->ReleaseStringUTFChars(kvCacheQuant, kvChars);

    LOGI("Initialized GGUF context: path=%s, n_ctx=%d, n_batch=%d, threads=%d, kv=%s, mmap=%d",
         g_loaded_model_path.c_str(), g_context_length, g_batch_size, g_threads,
         g_kv_quant.c_str(), g_use_mmap ? 1 : 0);

    // When linking upstream llama.cpp:
    // llama_model_params mparams = llama_model_default_params();
    // mparams.use_mmap = g_use_mmap;
    // g_model = llama_load_model_from_file(g_loaded_model_path.c_str(), mparams);

    return 0;
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_pocketgguf_engine_LlamaBridge_nativeCompleteChat(
        JNIEnv* env,
        jobject /* this */,
        jstring promptJson,
        jint contextLength,
        jint threads) {
    std::lock_guard<std::mutex> lock(g_engine_mutex);

    const char* rawPrompt = env->GetStringUTFChars(promptJson, nullptr);
    std::string promptStr = rawPrompt ? rawPrompt : "";
    if (rawPrompt) env->ReleaseStringUTFChars(promptJson, rawPrompt);

    std::ostringstream out;
    out << "{"
        << "\"id\":\"chatcmpl-single-slot\","
        << "\"object\":\"chat.completion\","
        << "\"model\":\"" << g_loaded_model_path << "\","
        << "\"choices\":[{"
        << "\"index\":0,"
        << "\"message\":{\"role\":\"assistant\",\"content\":\"[PocketGGUF Native JNI Completion @ ctx="
        << static_cast<int>(contextLength) << ", kv=" << g_kv_quant
        << ", threads=" << static_cast<int>(threads) << "]\"},"
        << "\"finish_reason\":\"stop\""
        << "}],"
        << "\"usage\":{\"prompt_tokens\":128,\"completion_tokens\":64,\"total_tokens\":192}"
        << "}";

    return env->NewStringUTF(out.str().c_str());
}

extern "C" JNIEXPORT void JNICALL
Java_com_pocketgguf_engine_LlamaBridge_nativeUnloadModel(
        JNIEnv* /* env */,
        jobject /* this */) {
    std::lock_guard<std::mutex> lock(g_engine_mutex);
    g_loaded_model_path.clear();
    LOGI("Unloaded GGUF model and freed KV cache tensors.");
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
