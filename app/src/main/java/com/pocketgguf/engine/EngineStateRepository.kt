package com.pocketgguf.engine

import android.util.Log
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
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
    val maxContext: Int = 32768,
    val ggufVersion: Int = 3,
    val tensorCount: Long = 291L,
    val kvMetaCount: Long = 24L,
    val headerVerified: Boolean = true
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
    val tokPerSec: Double,
    val reusedPrefixTokens: Int = 0,
    val gbnfApplied: Boolean = false
)

/**
 * Sentinel placeholder used ONLY when the user has not yet picked a .gguf file from phone storage.
 */
val UNMOUNTED_PLACEHOLDER_MODEL = GgufModelInfo(
    id = "no-gguf-selected",
    name = "No .GGUF Model Selected",
    filename = "Tap 'Select .GGUF File' to pick a model from your phone",
    uriString = "",
    sizeMb = 0,
    quantization = "NONE",
    layers = 28,
    kvHeads = 8,
    headDim = 128,
    maxContext = 32768,
    headerVerified = false
)

data class EngineTelemetryState(
    val serverRunning: Boolean = false,
    val bindAddress: String = "127.0.0.1",
    val port: Int = 8080,
    val bearerToken: String = "sk-local-gguf-android",
    val activeModel: GgufModelInfo = UNMOUNTED_PLACEHOLDER_MODEL,
    val availableModels: List<GgufModelInfo> = emptyList(),
    val contextLength: Int = 8192,
    val batchSize: Int = 512,
    val cpuThreads: Int = 6,
    // Proposal 1: KV Q4_0 Quantization Cache default (GGML_TYPE_Q4_0 = 0.5625 bytes/elem)
    val kvCacheQuant: String = "Q4_0",
    // Proposal 2: Single-Slot KV Prefix Cache Pinning (n_keep)
    val prefixCachePinningEnabled: Boolean = true,
    val pinnedSystemTokens: Int = 1024,
    val lastReusedPrefixTokens: Int = 1024,
    // Proposal 3: GBNF Grammar & JSON Schema Enforcement
    val gbnfJsonGrammarEnabled: Boolean = true,
    val activeGbnfSchemaName: String = "openai_function_tool_call",
    // Proposal 4: Adaptive Thermal Governor & Big.LITTLE Core Pinning
    val adaptiveThermalGovernorEnabled: Boolean = true,
    val bigLittleCorePinning: Boolean = true,
    val thermalThrottleLimitC: Double = 43.0,
    val mmapEnabled: Boolean = true,
    val wakeLockEnabled: Boolean = true,
    val activeLeaseId: String? = null,
    val activeLeaseClient: String? = null,
    val promptEvalTps: Double = 0.0,
    val tokenGenTps: Double = 0.0,
    val totalRequestsServed: Int = 0,
    val totalMutexRejected: Int = 0,
    val socTempC: Double = 0.0,
    val tempSensorSource: String = "Reading sensor...",
    val batteryPercent: Int = 100,
    val deviceTotalRamMb: Int = 8192,
    val deviceAvailRamMb: Int = 4096,
    val auditLogs: List<ApiAuditRecord> = emptyList(),
    val diagnosticLogs: List<String> = emptyList()
) {
    val hasValidModelMounted: Boolean
        get() = activeModel.uriString.isNotBlank() && activeModel.id != UNMOUNTED_PLACEHOLDER_MODEL.id

    val kvCacheMb: Int
        get() {
            if (!hasValidModelMounted) return 0
            val bytesPerElement = when (kvCacheQuant) {
                "Q4_0" -> 0.5625
                "Q8_0" -> 1.0625
                else -> 2.0
            }
            val bytes = 2.0 * activeModel.layers * activeModel.kvHeads * activeModel.headDim * contextLength * bytesPerElement
            return (bytes / (1024.0 * 1024.0)).toInt()
        }

    val fp16BaselineKvMb: Int
        get() {
            if (!hasValidModelMounted) return 0
            val bytes = 2.0 * activeModel.layers * activeModel.kvHeads * activeModel.headDim * contextLength * 2.0
            return (bytes / (1024.0 * 1024.0)).toInt()
        }

    val kvSavedMb: Int
        get() = (fp16BaselineKvMb - kvCacheMb).coerceAtLeast(0)

    val effectiveActiveThreads: Int
        get() {
            if (!adaptiveThermalGovernorEnabled || socTempC <= 0.0) return cpuThreads
            val delta = socTempC - thermalThrottleLimitC
            val stepDown = when {
                delta >= 3.0 -> 3
                delta >= 1.0 -> 2
                delta >= -0.8 -> 1
                else -> 0
            }
            return (cpuThreads - stepDown).coerceAtLeast(2)
        }

    val coreAffinityMaskHex: String
        get() = if (bigLittleCorePinning) "0xFC (cpu2..cpu7 Prime+Perf)" else "0xFF (All Cores)"

    val totalAllocatedMb: Int
        get() {
            if (!hasValidModelMounted) return 0
            val weights = if (mmapEnabled) (activeModel.sizeMb * 0.94).toInt() else activeModel.sizeMb
            val scratch = 96 + (batchSize / 4)
            return weights + kvCacheMb + scratch
        }
}

object EngineStateRepository {
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

    fun logDiagnostic(tag: String, message: String) {
        runCatching { Log.i("PocketGGUF", "[$tag] $message") }
        val timeStr = SimpleDateFormat("HH:mm:ss.SSS", Locale.US).format(Date())
        val line = "$timeStr [$tag] $message"
        _state.value = _state.value.copy(
            diagnosticLogs = (listOf(line) + _state.value.diagnosticLogs).take(120)
        )
    }

    fun clearDiagnosticLogs() {
        _state.value = _state.value.copy(diagnosticLogs = emptyList())
    }
}
