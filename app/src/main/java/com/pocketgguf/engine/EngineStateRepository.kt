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
    val headerVerified: Boolean = true,
    val magicSignatureHex: String = "0x47475546",
    val detectedNonGgufFormat: String? = null,
    val isSplitShard: Boolean = false
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

data class ModelLoadStageStatus(
    val label: String,
    val status: String, // "PASS" | "WARN" | "FAIL"
    val detail: String
)

data class ModelHealthDiagnosis(
    val overallStatus: String, // "HEALTHY" | "WARNING" | "ERROR"
    val errorCode: String,
    val title: String,
    val preciseErrorMessage: String,
    val proposedSolution: String,
    val autoFixAction: String, // "NONE" | "PICK_GGUF_FILE" | "SCAN_GGUF_FOLDER" | "APPLY_LOW_RAM_SAFE_PROFILE" | "START_LOCAL_SERVER" | "SWITCH_FALLBACK_PORT" | "FORCE_RELEASE_MUTEX"
    val autoFixButtonLabel: String,
    val stages: List<ModelLoadStageStatus>
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
    val safDescriptorError: String? = null,
    val jniLoadRc: Int = 0,
    val jniLoadDiagnosis: String = "Ready",
    val portBindError: String? = null,
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

    val weightsMb: Int
        get() {
            if (!hasValidModelMounted) return 0
            return if (mmapEnabled) (activeModel.sizeMb * 0.94).toInt() else activeModel.sizeMb
        }

    val totalAllocatedMb: Int
        get() {
            if (!hasValidModelMounted) return 0
            val scratch = 96 + (batchSize / 4)
            return weightsMb + kvCacheMb + scratch
        }

    /**
     * Evaluates all 5 stages of model loading & runtime execution:
     *  1. Storage & SAF File Descriptor
     *  2. Binary GGUF Magic Header & Tensor Directory
     *  3. Phone Free RAM & KV Cache Memory Budget
     *  4. Native JNI / GGML Engine Loader
     *  5. Local OpenAI Loopback HTTP Socket
     *
     * Whenever anything goes wrong, returns a clear and precise error message plus a concrete proposed solution.
     */
    fun diagnoseModelHealth(): ModelHealthDiagnosis {
        if (!hasValidModelMounted) {
            return ModelHealthDiagnosis(
                overallStatus = "ERROR",
                errorCode = "ERR_NO_MODEL_MOUNTED",
                title = "No .GGUF Model File Mounted",
                preciseErrorMessage = "No local .gguf model file is currently selected or mounted in the engine.",
                proposedSolution = "Tap 'Select .GGUF File from Phone Storage' to pick a quantized .gguf model (e.g., Q4_K_M.gguf) from your Downloads or Documents folder.",
                autoFixAction = "PICK_GGUF_FILE",
                autoFixButtonLabel = "Select .GGUF File from Phone Storage",
                stages = listOf(
                    ModelLoadStageStatus("1. Storage & SAF Descriptor", "FAIL", "No .gguf file URI selected yet"),
                    ModelLoadStageStatus("2. Binary GGUF Magic Header", "FAIL", "Waiting for file selection"),
                    ModelLoadStageStatus("3. Phone RAM & KV Budget", "PASS", "$deviceAvailRamMb MB free / $deviceTotalRamMb MB total"),
                    ModelLoadStageStatus("4. Native JNI Tensor Loader", "FAIL", "Idle (no model mounted)"),
                    ModelLoadStageStatus("5. Local OpenAI HTTP Socket", "WARN", "Standby (auto-starts on model load)")
                )
            )
        }

        val isOomCritical = totalAllocatedMb > (deviceAvailRamMb * 1.15).toInt() && totalAllocatedMb > (deviceTotalRamMb * 0.72).toInt()
        val isRamElevated = !isOomCritical && totalAllocatedMb > deviceAvailRamMb

        val stageStorage = if (safDescriptorError != null) {
            ModelLoadStageStatus("1. Storage & SAF Descriptor", "FAIL", "SAF open failed: $safDescriptorError")
        } else {
            ModelLoadStageStatus("1. Storage & SAF Descriptor", "PASS", "Readable (${activeModel.sizeMb} MB · ${activeModel.filename})")
        }

        val stageHeader = when {
            !activeModel.headerVerified -> ModelLoadStageStatus(
                "2. Binary GGUF Magic Header",
                "FAIL",
                "Invalid magic ${activeModel.magicSignatureHex} (${activeModel.detectedNonGgufFormat ?: "Not a GGUF file"})"
            )
            activeModel.ggufVersion !in 1..3 -> ModelLoadStageStatus(
                "2. Binary GGUF Magic Header",
                "FAIL",
                "Unsupported GGUF format v${activeModel.ggufVersion} (expected v1..v3)"
            )
            activeModel.tensorCount <= 0L -> ModelLoadStageStatus(
                "2. Binary GGUF Magic Header",
                "FAIL",
                "Corrupted or truncated header (0 tensors)"
            )
            activeModel.isSplitShard -> ModelLoadStageStatus(
                "2. Binary GGUF Magic Header",
                "WARN",
                "Multi-part split shard (${activeModel.filename})"
            )
            else -> ModelLoadStageStatus(
                "2. Binary GGUF Magic Header",
                "PASS",
                "Verified GGUF v${activeModel.ggufVersion} (0x47475546 · ${activeModel.tensorCount} tensors)"
            )
        }

        val stageRam = when {
            isOomCritical -> ModelLoadStageStatus(
                "3. Phone RAM & KV Budget",
                "FAIL",
                "Requires $totalAllocatedMb MB (Weights $weightsMb + KV $kvCacheMb MB) vs $deviceAvailRamMb MB free RAM"
            )
            isRamElevated -> ModelLoadStageStatus(
                "3. Phone RAM & KV Budget",
                "WARN",
                "High RAM pressure: $totalAllocatedMb MB required vs $deviceAvailRamMb MB free ($deviceTotalRamMb MB total)"
            )
            else -> ModelLoadStageStatus(
                "3. Phone RAM & KV Budget",
                "PASS",
                "Fits within RAM: $totalAllocatedMb MB allocated ($deviceAvailRamMb MB free / $deviceTotalRamMb MB total)"
            )
        }

        val stageJni = if (jniLoadRc != 0) {
            ModelLoadStageStatus("4. Native JNI Tensor Loader", "FAIL", jniLoadDiagnosis)
        } else {
            ModelLoadStageStatus(
                "4. Native JNI Tensor Loader",
                "PASS",
                "Loaded '${activeModel.id}' (mmap=${if (mmapEnabled) "ON" else "OFF"}, KV=$kvCacheQuant, n_ctx=$contextLength)"
            )
        }

        val stageSocket = when {
            portBindError != null -> ModelLoadStageStatus(
                "5. Local OpenAI HTTP Socket",
                "FAIL",
                "Port :$port bind failed: $portBindError"
            )
            !serverRunning -> ModelLoadStageStatus(
                "5. Local OpenAI HTTP Socket",
                "WARN",
                "Standby on $bindAddress:$port (auto-starts on chat send)"
            )
            else -> ModelLoadStageStatus(
                "5. Local OpenAI HTTP Socket",
                "PASS",
                "Listening on http://$bindAddress:$port/v1/chat/completions"
            )
        }

        val stages = listOf(stageStorage, stageHeader, stageRam, stageJni, stageSocket)

        // 1. SAF File Descriptor Error
        if (safDescriptorError != null) {
            return ModelHealthDiagnosis(
                overallStatus = "ERROR",
                errorCode = "ERR_SAF_FILE_DESCRIPTOR_DENIED",
                title = "Cannot Read .GGUF File from Phone Storage",
                preciseErrorMessage = "Android Storage Access Framework could not open '${activeModel.filename}' ($safDescriptorError). The file may have been moved, deleted, or its URI permission expired.",
                proposedSolution = "Tap 'Re-select .GGUF File' below to pick the file again from your phone's Downloads or Documents folder and refresh Android's read permission.",
                autoFixAction = "PICK_GGUF_FILE",
                autoFixButtonLabel = "1-Tap Fix: Re-select .GGUF File from Phone",
                stages = stages
            )
        }

        // 2. Invalid GGUF Magic Header
        if (!activeModel.headerVerified) {
            return ModelHealthDiagnosis(
                overallStatus = "ERROR",
                errorCode = "ERR_INVALID_GGUF_MAGIC",
                title = "Invalid File Format: Not a Binary .GGUF Model",
                preciseErrorMessage = "File '${activeModel.filename}' failed binary GGUF magic header verification. Expected 'GGUF' (0x47475546), but found ${activeModel.magicSignatureHex} (${activeModel.detectedNonGgufFormat ?: "non-GGUF data"}).",
                proposedSolution = "Ensure you downloaded a direct quantized .gguf weight file (e.g. Q4_K_M.gguf) rather than a PyTorch .bin/.pt archive, Safetensors file, or an HTML login/redirect webpage.",
                autoFixAction = "PICK_GGUF_FILE",
                autoFixButtonLabel = "1-Tap Fix: Pick a Valid .GGUF Model File",
                stages = stages
            )
        }

        // 3. Unsupported GGUF Version
        if (activeModel.ggufVersion !in 1..3) {
            return ModelHealthDiagnosis(
                overallStatus = "ERROR",
                errorCode = "ERR_UNSUPPORTED_GGUF_VERSION",
                title = "Unsupported GGUF Format Version (v${activeModel.ggufVersion})",
                preciseErrorMessage = "Model '${activeModel.filename}' uses GGUF specification version v${activeModel.ggufVersion}. PocketGGUF supports GGUF v1, v2, and v3.",
                proposedSolution = "Download a standard GGUF v2 or v3 quantization of this model (such as Q4_K_M or IQ4_XS).",
                autoFixAction = "PICK_GGUF_FILE",
                autoFixButtonLabel = "Select Another .GGUF Model",
                stages = stages
            )
        }

        // 4. Native JNI Load Error
        if (jniLoadRc != 0) {
            return ModelHealthDiagnosis(
                overallStatus = "ERROR",
                errorCode = "ERR_JNI_NATIVE_LOAD_$jniLoadRc",
                title = "Native JNI Engine Failed to Load Model (Code $jniLoadRc)",
                preciseErrorMessage = jniLoadDiagnosis,
                proposedSolution = "Tap 'Re-select .GGUF File' to refresh the Android SAF file descriptor, or tap 'Apply Low-RAM Safe Profile' if the file is too large for current context settings.",
                autoFixAction = "PICK_GGUF_FILE",
                autoFixButtonLabel = "1-Tap Fix: Re-select .GGUF File & Reload",
                stages = stages
            )
        }

        // 5. Critical RAM / OOM Risk (e.g. 9B 5832 MB model + large context window)
        if (isOomCritical) {
            return ModelHealthDiagnosis(
                overallStatus = "ERROR",
                errorCode = "ERR_OOM_RAM_EXCEEDED",
                title = "High OOM Risk: Model + Context Exceeds Free Phone RAM",
                preciseErrorMessage = "Loading '${activeModel.name}' (${activeModel.sizeMb} MB) with n_ctx=$contextLength and KV=$kvCacheQuant requires $totalAllocatedMb MB ($weightsMb MB weights + $kvCacheMb MB KV cache), while your phone currently has $deviceAvailRamMb MB free RAM ($deviceTotalRamMb MB total). Android's Low-Memory Killer (lmkd) may terminate inference.",
                proposedSolution = "1) Tap 'Apply Low-RAM Safe Profile' below to set KV Cache=Q4_0, Context Length n_ctx=2048, and mmap=ON. 2) Close background apps, or use a smaller 3B–7B Q4_K_M model.",
                autoFixAction = "APPLY_LOW_RAM_SAFE_PROFILE",
                autoFixButtonLabel = "1-Tap Fix: Apply Low-RAM Safe Profile (n_ctx=2048, KV=Q4_0, mmap=ON)",
                stages = stages
            )
        }

        // 6. Port Bind Conflict
        if (portBindError != null) {
            return ModelHealthDiagnosis(
                overallStatus = "ERROR",
                errorCode = "ERR_PORT_BIND_CONFLICT",
                title = "Local Server Port :$port Is Already in Use",
                preciseErrorMessage = "Failed to bind local OpenAI server socket on $bindAddress:$port ($portBindError).",
                proposedSolution = "Tap the button below to switch to port :${port + 1} and restart the local server.",
                autoFixAction = "SWITCH_FALLBACK_PORT",
                autoFixButtonLabel = "1-Tap Fix: Switch to Port :${port + 1} & Restart Server",
                stages = stages
            )
        }

        // 7. Split Shard Warning
        if (activeModel.isSplitShard) {
            return ModelHealthDiagnosis(
                overallStatus = "WARNING",
                errorCode = "WARN_SPLIT_SHARD_GGUF",
                title = "Multi-Part Split .GGUF Shard Detected",
                preciseErrorMessage = "'${activeModel.filename}' is a split GGUF shard. Single-file SAF selection only grants access to one shard unless the parent folder is granted.",
                proposedSolution = "Tap 'Scan GGUF Folder' to grant folder-wide read access to all sibling shards, or merge shards with 'llama-gguf-split --merge'.",
                autoFixAction = "SCAN_GGUF_FOLDER",
                autoFixButtonLabel = "1-Tap Fix: Scan GGUF Folder for All Shards",
                stages = stages
            )
        }

        // 8. Server Paused Warning
        if (!serverRunning) {
            return ModelHealthDiagnosis(
                overallStatus = "WARNING",
                errorCode = "WARN_SERVER_STANDBY",
                title = "Model Verified & Mounted in Standby (Server Paused)",
                preciseErrorMessage = "Model '${activeModel.id}' passed all binary GGUF header and RAM checks, but the local HTTP server on :$port is currently stopped.",
                proposedSolution = "Tap 'Start Local Server' below, or send a message in the Chat tab (which auto-starts the server).",
                autoFixAction = "START_LOCAL_SERVER",
                autoFixButtonLabel = "1-Tap Fix: Start Local Server on :$port",
                stages = stages
            )
        }

        // 9. Single-Slot Mutex Busy Warning
        if (activeLeaseId != null) {
            return ModelHealthDiagnosis(
                overallStatus = "WARNING",
                errorCode = "WARN_MUTEX_LOCKED",
                title = "Single-Slot Mutex Locked by Active Request ($activeLeaseId)",
                preciseErrorMessage = "The server is currently generating tokens for '$activeLeaseClient'. Concurrent requests are rejected with HTTP 429.",
                proposedSolution = "Wait for the current reply to finish, or tap 'Force-Release Mutex Lock' if a client disconnected.",
                autoFixAction = "FORCE_RELEASE_MUTEX",
                autoFixButtonLabel = "1-Tap Fix: Force-Release Single-Slot Mutex",
                stages = stages
            )
        }

        // 10. Elevated RAM Pressure Warning (e.g. 9B 5832 MB model on 8-12GB phone)
        if (isRamElevated) {
            return ModelHealthDiagnosis(
                overallStatus = "WARNING",
                errorCode = "WARN_ELEVATED_RAM",
                title = "Elevated RAM Usage ($totalAllocatedMb MB vs $deviceAvailRamMb MB Free)",
                preciseErrorMessage = "'${activeModel.name}' (${activeModel.sizeMb} MB) exceeds current uncached free RAM ($deviceAvailRamMb MB free of $deviceTotalRamMb MB total) and relies on mmap page streaming.",
                proposedSolution = if (contextLength > 2048 || kvCacheQuant != "Q4_0") {
                    "For faster and more stable inference on this ${activeModel.sizeMb} MB model, tap below to clamp n_ctx=2048 and KV=Q4_0."
                } else {
                    "Close background apps to free up LPDDR5X RAM for faster mmap page-ins."
                },
                autoFixAction = if (contextLength > 2048 || kvCacheQuant != "Q4_0") "APPLY_LOW_RAM_SAFE_PROFILE" else "NONE",
                autoFixButtonLabel = "1-Tap Optimize: Clamp n_ctx=2048 & KV=Q4_0",
                stages = stages
            )
        }

        return ModelHealthDiagnosis(
            overallStatus = "HEALTHY",
            errorCode = "OK_READY",
            title = "Model Loaded & Verified: Serving '${activeModel.id}'",
            preciseErrorMessage = "All 5 pre-flight checks passed. Binary GGUF v${activeModel.ggufVersion} header verified (${activeModel.tensorCount} tensors), $totalAllocatedMb MB allocated, listening on http://$bindAddress:$port/v1.",
            proposedSolution = "Everything is healthy. Open the Chat tab or tap Self API Test to chat with ${activeModel.id}.",
            autoFixAction = "NONE",
            autoFixButtonLabel = "",
            stages = stages
        )
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
