package com.pocketgguf.engine

/**
 * JNI wrapper over native C++ llama.cpp / GGML execution library (libpocketgguf.so).
 * Includes native hooks for:
 *  1. KV Q4_0 Cache Quantization (GGML_TYPE_Q4_0)
 *  2. Single-Slot KV Prefix Cache Pinning (n_keep)
 *  3. GBNF JSON Schema Grammar Compilation & Sampling Mask
 *  4. Big.LITTLE CPU Core Affinity Pinning (sched_setaffinity) & Thermal Governor
 *  5. Pre-flight GGUF Binary Header Verification & Detailed Load Error Diagnosis
 */
object LlamaBridge {
    init {
        System.loadLibrary("pocketgguf")
    }

    /**
     * Loads and verifies a .gguf model from either a POSIX /proc/self/fd/<fd> descriptor
     * or a direct filesystem path.
     *
     * Return codes:
     *   0  = Success (GGUF magic, version, and tensor table verified)
     *  -1  = Empty path or null file descriptor
     *  -2  = Cannot read file descriptor or file path (SAF permission expired or file moved)
     *  -3  = File is empty or truncated (< 64 bytes)
     *  -4  = Invalid GGUF magic header (not 0x47475546 'GGUF')
     *  -5  = Unsupported GGUF format specification version (expected v1, v2, or v3)
     *  -6  = Corrupted GGUF header (0 tensors reported in header)
     */
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

    /**
     * Returns a human-readable diagnostic summary of the last nativeLoadModel call,
     * including exact failure cause and proposed solution if rc != 0.
     */
    external fun nativeGetLastLoadDiagnosis(): String

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
