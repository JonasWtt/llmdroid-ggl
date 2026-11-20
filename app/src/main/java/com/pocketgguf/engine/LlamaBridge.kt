package com.pocketgguf.engine

/**
 * JNI wrapper over native C++ llama.cpp / GGML execution library (libpocketgguf.so).
 */
object LlamaBridge {
    init {
        System.loadLibrary("pocketgguf")
    }

    /**
     * Loads a local GGUF model via POSIX file descriptor (SAF) or file path.
     *
     * @param modelPathOrFd Path to the .gguf file on device storage
     * @param contextLength Context window size (n_ctx: 512..32768)
     * @param batchSize Prompt evaluation batch size (n_batch)
     * @param threads Number of CPU threads bound to Performance cores
     * @param kvCacheQuant KV cache quantization ("FP16", "Q8_0", "Q4_0")
     * @param useMmap Whether to zero-copy map weights via mmap()
     * @return 0 on success, negative error code on failure
     */
    external fun nativeLoadModel(
        modelPathOrFd: String,
        contextLength: Int,
        batchSize: Int,
        threads: Int,
        kvCacheQuant: String,
        useMmap: Boolean
    ): Int

    /**
     * Runs synchronous single-slot completion against the loaded GGUF context.
     * Called exclusively while EngineStateRepository.singleConnectionMutex is locked.
     */
    external fun nativeCompleteChat(
        promptJson: String,
        contextLength: Int,
        threads: Int
    ): String

    /**
     * Releases native KV cache and unmaps GGUF tensor pages.
     */
    external fun nativeUnloadModel()

    /**
     * Reads current SoC thermal zone temperature in Celsius (/sys/class/thermal/thermal_zone0/temp).
     */
    external fun nativeReadSocTempCelsius(): Double
}
