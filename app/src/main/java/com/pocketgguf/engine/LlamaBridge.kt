package com.pocketgguf.engine

/**
 * JNI wrapper over native C++ llama.cpp / GGML execution library (libpocketgguf.so).
 * Includes native hooks for:
 *  1. KV Q4_0 Cache Quantization (GGML_TYPE_Q4_0)
 *  2. Single-Slot KV Prefix Cache Pinning (n_keep)
 *  3. GBNF JSON Schema Grammar Compilation & Sampling Mask
 *  4. Big.LITTLE CPU Core Affinity Pinning (sched_setaffinity) & Thermal Governor
 */
object LlamaBridge {
    init {
        System.loadLibrary("pocketgguf")
    }

    external fun nativeLoadModel(
        modelPathOrFd: String,
        contextLength: Int,
        batchSize: Int,
        threads: Int,
        kvCacheQuant: String,
        useMmap: Boolean,
        pinBigLittleCores: Boolean,
        pinnedPrefixTokens: Int
    ): Int

    external fun nativeCompleteChat(
        promptJson: String,
        contextLength: Int,
        effectiveThreads: Int,
        reusePrefixCache: Boolean,
        pinnedSystemTokens: Int,
        enforceGbnfJson: Boolean,
        gbnfSchemaName: String
    ): String

    external fun nativeUnloadModel()

    external fun nativeReadSocTempCelsius(): Double
}
