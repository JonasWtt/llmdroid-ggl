package com.pocketgguf.engine

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.util.concurrent.atomic.AtomicBoolean

data class GgufModelInfo(
    val id: String,
    val name: String,
    val filename: String,
    val uriString: String,
    val sizeMb: Int,
    val quantization: String,
    val layers: Int = 28,
    val kvHeads: Int = 8,
    val headDim: Int = 128,
    val maxContext: Int = 32768
)

data class ApiAuditRecord(
    val id: String,
    val timestampMs: Long,
    val method: String,
    val endpoint: String,
    val clientIp: String,
    val httpStatus: Int,
    val reason: String,
    val promptTokens: Int,
    val completionTokens: Int,
    val tokPerSec: Double
)

data class EngineTelemetryState(
    val serverRunning: Boolean = false,
    val bindAddress: String = "127.0.0.1",
    val port: Int = 8080,
    val bearerToken: String = "sk-local-gguf-android",
    val activeModel: GgufModelInfo = DEFAULT_MODELS.first(),
    val availableModels: List<GgufModelInfo> = DEFAULT_MODELS,
    val contextLength: Int = 4096,
    val batchSize: Int = 512,
    val cpuThreads: Int = 6,
    val kvCacheQuant: String = "FP16",
    val mmapEnabled: Boolean = true,
    val wakeLockEnabled: Boolean = true,
    val activeLeaseId: String? = null,
    val activeLeaseClient: String? = null,
    val promptEvalTps: Double = 0.0,
    val tokenGenTps: Double = 0.0,
    val totalRequestsServed: Int = 0,
    val totalMutexRejected: Int = 0,
    val socTempC: Double = 36.8,
    val auditLogs: List<ApiAuditRecord> = emptyList()
) {
    val kvCacheMb: Int
        get() {
            val bytesPerElement = when (kvCacheQuant) {
                "Q8_0" -> 1.0625
                "Q4_0" -> 0.5625
                else -> 2.0
            }
            val bytes = 2.0 * activeModel.layers * activeModel.kvHeads * activeModel.headDim * contextLength * bytesPerElement
            return (bytes / (1024.0 * 1024.0)).toInt()
        }

    val totalAllocatedMb: Int
        get() {
            val weights = if (mmapEnabled) (activeModel.sizeMb * 0.94).toInt() else activeModel.sizeMb
            val scratch = 96 + (batchSize / 4)
            return weights + kvCacheMb + scratch
        }
}

val DEFAULT_MODELS = listOf(
    GgufModelInfo(
        id = "llama-3.2-3b-q4_k_m",
        name = "Llama 3.2 3B Instruct",
        filename = "Llama-3.2-3B-Instruct-Q4_K_M.gguf",
        uriString = "/storage/emulated/0/Documents/GGUF/Llama-3.2-3B-Instruct-Q4_K_M.gguf",
        sizeMb = 2020,
        quantization = "Q4_K_M"
    ),
    GgufModelInfo(
        id = "qwen-2.5-coder-7b-q4_k_m",
        name = "Qwen 2.5 Coder 7B Instruct",
        filename = "qwen2.5-coder-7b-instruct-q4_k_m.gguf",
        uriString = "/storage/emulated/0/Documents/GGUF/qwen2.5-coder-7b-instruct-q4_k_m.gguf",
        sizeMb = 4680,
        quantization = "Q4_K_M",
        kvHeads = 4
    ),
    GgufModelInfo(
        id = "deepseek-r1-distill-qwen-1.5b-q5_k_m",
        name = "DeepSeek R1 Distill 1.5B",
        filename = "DeepSeek-R1-Distill-Qwen-1.5B-Q5_K_M.gguf",
        uriString = "/storage/emulated/0/Documents/GGUF/DeepSeek-R1-Distill-Qwen-1.5B-Q5_K_M.gguf",
        sizeMb = 1310,
        quantization = "Q5_K_M",
        kvHeads = 2
    )
)

/**
 * Thread-safe singleton state holder shared between MainActivity (Compose UI)
 * and GgufServerService (Background Single-Connection OpenAI HTTP Daemon).
 */
object EngineStateRepository {
    // Non-blocking atomic mutex enforcing max_connections = 1 across the OpenAI HTTP server
    val singleConnectionMutex = AtomicBoolean(false)

    private val _state = MutableStateFlow(EngineTelemetryState())
    val state: StateFlow<EngineTelemetryState> = _state.asStateFlow()

    fun update(transform: (EngineTelemetryState) -> EngineTelemetryState) {
        _state.value = transform(_state.value)
    }

    fun appendAuditLog(record: ApiAuditRecord) {
        _state.value = _state.value.copy(
            auditLogs = (listOf(record) + _state.value.auditLogs).take(30)
        )
    }
}
