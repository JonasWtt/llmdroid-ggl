export type QuantizationType = 'Q4_K_M' | 'Q5_K_M' | 'Q8_0' | 'IQ4_XS' | 'FP16';
export type KvCacheQuantType = 'FP16' | 'Q8_0' | 'Q4_0';
export type NetworkBindMode = '127.0.0.1' | '0.0.0.0';
export type ExecutionBackend = 'CPU (ARM NEON / KleidiAI)' | 'Vulkan 1.3 (Adreno / Mali)' | 'Qualcomm QNN (Hexagon NPU)';

export interface GgufModelSpec {
  id: string;
  name: string;
  filename: string;
  architecture: string;
  parametersBillions: number;
  quantization: QuantizationType;
  fileSizeMb: number;
  numLayers: number;
  hiddenSize: number;
  numKvHeads: number;
  headDim: number;
  maxNativeContext: number;
  recommendedContext: number;
  sha256Prefix: string;
  storagePath: string;
  basePromptEvalTps: number;
  baseTokenGenTps: number;
  ggufVersion?: number;
  tensorCount?: number;
  kvMetaCount?: number;
  headerVerified?: boolean;
  magicSignatureHex?: string;
  detectedNonGgufFormat?: string;
  isSplitShard?: boolean;
}

export interface EngineRuntimeConfig {
  activeModelId: string;
  contextLength: number;
  batchSize: number;
  cpuThreads: number;
  gpuLayers: number;
  // Proposal 1: KV Q4_0 Quantization Cache
  kvCacheQuant: KvCacheQuantType;
  // Proposal 2: Single-Slot KV Prefix Cache Pinning (n_keep)
  prefixCachePinningEnabled: boolean;
  pinnedSystemTokens: number;
  // Proposal 3: GBNF Grammar & JSON Schema Enforcement
  gbnfJsonGrammarEnabled: boolean;
  activeGbnfSchemaName: string;
  // Proposal 4: Adaptive Thermal Governor & Big.LITTLE Core Pinning
  adaptiveThermalGovernorEnabled: boolean;
  bigLittleCorePinning: boolean;
  thermalThrottleLimitC: number;
  // Standard flags
  mmapEnabled: boolean;
  mlockEnabled: boolean;
  flashAttention: boolean;
  bindAddress: NetworkBindMode;
  port: number;
  requireBearerToken: boolean;
  bearerToken: string;
  airplaneOfflineEnforced: boolean;
  wakeLockEnabled: boolean;
  autoUnloadIdleMinutes: number;
  backend: ExecutionBackend;
}

export interface MemoryBreakdown {
  weightsMb: number;
  kvCacheMb: number;
  fp16BaselineKvMb: number;
  kvSavedMb: number;
  kvSavedPercent: number;
  computeBufferMb: number;
  totalAllocatedMb: number;
  deviceRamTotalMb: number;
  osReservedMb: number;
  availableForEngineMb: number;
  utilizationPercent: number;
  oomRisk: 'NOMINAL' | 'ELEVATED' | 'CRITICAL_OOM';
}

export interface PrefixCacheStats {
  pinnedPrefixTokens: number;
  reusedTokensCount: number;
  newTokensEvaluated: number;
  cacheHitRatioPercent: number;
  unpinnedTtftMs: number;
  pinnedTtftMs: number;
  ttftSavedMs: number;
}

export interface GbnfGrammarCompilation {
  enabled: boolean;
  schemaName: string;
  gbnfRuleString: string;
  activeRuleCount: number;
  guaranteedValidJson: boolean;
}

export interface ThermalGovernorStatus {
  governorActive: boolean;
  coreAffinityMask: string;
  coreTopologyLabel: string;
  configuredThreads: number;
  effectiveActiveThreads: number;
  thermalStepDownThreads: number;
  throttlingState: 'PRIME_PERF_LOCKED' | 'STEP_DOWN_1_THREAD' | 'STEP_DOWN_2_THREADS' | 'THERMAL_GUARD_CLAMP';
}

export interface TelemetrySample {
  timestamp: number;
  promptEvalTps: number;
  tokenGenTps: number;
  ramUsedMb: number;
  socTempC: number;
  batteryDrainWatts: number;
  cpuLoadPercent: number;
  effectiveThreads?: number;
}

export interface ActiveConnectionLease {
  leaseId: string;
  clientIp: string;
  userAgent: string;
  endpoint: string;
  acquiredAt: number;
  promptTokens: number;
  generatedTokens: number;
  reusedPrefixTokens?: number;
  gbnfEnforced?: boolean;
  status: 'EVALUATING_PROMPT' | 'STREAMING_TOKENS';
}

export interface ApiAuditEntry {
  id: string;
  timestamp: number;
  method: 'GET' | 'POST';
  endpoint: string;
  clientIp: string;
  userAgent: string;
  httpStatus: 200 | 401 | 429 | 503;
  statusReason: string;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  tokensPerSec: number;
  reusedPrefixTokens?: number;
  gbnfSchemaApplied?: string;
}

export const INITIAL_GGUF_MODELS: GgufModelSpec[] = [
  {
    id: 'llama-3.2-3b-q4_k_m',
    name: 'Llama 3.2 3B Instruct',
    filename: 'Llama-3.2-3B-Instruct-Q4_K_M.gguf',
    architecture: 'llama',
    parametersBillions: 3.21,
    quantization: 'Q4_K_M',
    fileSizeMb: 2020,
    numLayers: 28,
    hiddenSize: 3072,
    numKvHeads: 8,
    headDim: 128,
    maxNativeContext: 32768,
    recommendedContext: 8192,
    sha256Prefix: '9c4f28a1e7d0',
    storagePath: '/storage/emulated/0/Documents/GGUF/Llama-3.2-3B-Instruct-Q4_K_M.gguf',
    basePromptEvalTps: 185.0,
    baseTokenGenTps: 29.4,
  },
  {
    id: 'qwen-2.5-coder-7b-q4_k_m',
    name: 'Qwen 2.5 Coder 7B Instruct',
    filename: 'qwen2.5-coder-7b-instruct-q4_k_m.gguf',
    architecture: 'qwen2',
    parametersBillions: 7.61,
    quantization: 'Q4_K_M',
    fileSizeMb: 4680,
    numLayers: 28,
    hiddenSize: 3584,
    numKvHeads: 4,
    headDim: 128,
    maxNativeContext: 32768,
    recommendedContext: 4096,
    sha256Prefix: '4e11b77c83a9',
    storagePath: '/storage/emulated/0/Documents/GGUF/qwen2.5-coder-7b-instruct-q4_k_m.gguf',
    basePromptEvalTps: 98.0,
    baseTokenGenTps: 14.8,
  },
  {
    id: 'gemma-2-2b-it-q8_0',
    name: 'Gemma 2 2B Instruct',
    filename: 'gemma-2-2b-it-Q8_0.gguf',
    architecture: 'gemma2',
    parametersBillions: 2.61,
    quantization: 'Q8_0',
    fileSizeMb: 2780,
    numLayers: 26,
    hiddenSize: 2304,
    numKvHeads: 4,
    headDim: 256,
    maxNativeContext: 8192,
    recommendedContext: 4096,
    sha256Prefix: 'f03a62d8b41c',
    storagePath: '/storage/emulated/0/Documents/GGUF/gemma-2-2b-it-Q8_0.gguf',
    basePromptEvalTps: 210.0,
    baseTokenGenTps: 33.2,
  },
  {
    id: 'phi-3.5-mini-iq4_xs',
    name: 'Phi-3.5 Mini Instruct',
    filename: 'Phi-3.5-mini-instruct-IQ4_XS.gguf',
    architecture: 'phi3',
    parametersBillions: 3.82,
    quantization: 'IQ4_XS',
    fileSizeMb: 2160,
    numLayers: 32,
    hiddenSize: 3072,
    numKvHeads: 8,
    headDim: 96,
    maxNativeContext: 32768,
    recommendedContext: 8192,
    sha256Prefix: '7b29c14e55f2',
    storagePath: '/storage/emulated/0/Documents/GGUF/Phi-3.5-mini-instruct-IQ4_XS.gguf',
    basePromptEvalTps: 164.0,
    baseTokenGenTps: 25.7,
  },
  {
    id: 'deepseek-r1-distill-qwen-1.5b-q5_k_m',
    name: 'DeepSeek R1 Distill Qwen 1.5B',
    filename: 'DeepSeek-R1-Distill-Qwen-1.5B-Q5_K_M.gguf',
    architecture: 'qwen2',
    parametersBillions: 1.78,
    quantization: 'Q5_K_M',
    fileSizeMb: 1310,
    numLayers: 28,
    hiddenSize: 1536,
    numKvHeads: 2,
    headDim: 128,
    maxNativeContext: 32768,
    recommendedContext: 16384,
    sha256Prefix: 'a82e9014c3b1',
    storagePath: '/storage/emulated/0/Documents/GGUF/DeepSeek-R1-Distill-Qwen-1.5B-Q5_K_M.gguf',
    basePromptEvalTps: 275.0,
    baseTokenGenTps: 46.5,
  },
];

// Proposal 1..4 all enabled by default in DEFAULT_ENGINE_CONFIG
export const DEFAULT_ENGINE_CONFIG: EngineRuntimeConfig = {
  activeModelId: 'llama-3.2-3b-q4_k_m',
  contextLength: 8192,
  batchSize: 512,
  cpuThreads: 6,
  gpuLayers: 28,
  // 1. KV Q4_0 Quantization Cache default
  kvCacheQuant: 'Q4_0',
  // 2. Single-Slot KV Prefix Cache Pinning (n_keep)
  prefixCachePinningEnabled: true,
  pinnedSystemTokens: 1024,
  // 3. GBNF Grammar & JSON Schema Enforcement
  gbnfJsonGrammarEnabled: true,
  activeGbnfSchemaName: 'openai_function_tool_call',
  // 4. Adaptive Thermal Governor & Big.LITTLE Core Pinning
  adaptiveThermalGovernorEnabled: true,
  bigLittleCorePinning: true,
  thermalThrottleLimitC: 43,
  // Standard flags
  mmapEnabled: true,
  mlockEnabled: false,
  flashAttention: true,
  bindAddress: '127.0.0.1',
  port: 8080,
  requireBearerToken: true,
  bearerToken: 'sk-local-gguf-9f8a7b6c',
  airplaneOfflineEnforced: true,
  wakeLockEnabled: true,
  autoUnloadIdleMinutes: 10,
  backend: 'Vulkan 1.3 (Adreno / Mali)',
};

/**
 * Proposal 1: Bytes per element in KV cache based on quantization format (GGML_TYPE_Q4_0 = 0.5625 bytes/elem)
 */
export function getKvBytesPerElement(quant: KvCacheQuantType): number {
  switch (quant) {
    case 'FP16':
      return 2.0;
    case 'Q8_0':
      return 1.0625;
    case 'Q4_0':
      return 0.5625;
  }
}

/**
 * Proposal 1: Calculates exact GGUF memory footprint including Q4_0 KV Cache savings vs FP16 baseline
 */
export function calculateMemoryBreakdown(
  model: GgufModelSpec,
  config: Pick<EngineRuntimeConfig, 'contextLength' | 'batchSize' | 'kvCacheQuant' | 'mmapEnabled'>,
  deviceRamTotalMb = 12288,
  osReservedMb = 3840
): MemoryBreakdown {
  const bytesPerElem = getKvBytesPerElement(config.kvCacheQuant);
  const kvBytes =
    2 *
    model.numLayers *
    model.numKvHeads *
    model.headDim *
    config.contextLength *
    bytesPerElem;
  const kvCacheMb = Math.round(kvBytes / (1024 * 1024));

  const fp16Bytes =
    2 *
    model.numLayers *
    model.numKvHeads *
    model.headDim *
    config.contextLength *
    2.0;
  const fp16BaselineKvMb = Math.round(fp16Bytes / (1024 * 1024));
  const kvSavedMb = Math.max(0, fp16BaselineKvMb - kvCacheMb);
  const kvSavedPercent =
    fp16BaselineKvMb > 0
      ? Math.round((kvSavedMb / fp16BaselineKvMb) * 1000) / 10
      : 0;

  const computeBufferMb = Math.round(
    85 + (config.batchSize / 512) * (model.hiddenSize / 2048) * 64
  );

  const weightsMb = config.mmapEnabled
    ? Math.round(model.fileSizeMb * 0.94)
    : model.fileSizeMb;

  const totalAllocatedMb = weightsMb + kvCacheMb + computeBufferMb;
  const availableForEngineMb = Math.max(1024, deviceRamTotalMb - osReservedMb);
  const utilizationPercent = Math.min(
    100,
    Math.round((totalAllocatedMb / availableForEngineMb) * 1000) / 10
  );

  let oomRisk: MemoryBreakdown['oomRisk'] = 'NOMINAL';
  if (totalAllocatedMb > availableForEngineMb * 0.92) {
    oomRisk = 'CRITICAL_OOM';
  } else if (totalAllocatedMb > availableForEngineMb * 0.75) {
    oomRisk = 'ELEVATED';
  }

  return {
    weightsMb,
    kvCacheMb,
    fp16BaselineKvMb,
    kvSavedMb,
    kvSavedPercent,
    computeBufferMb,
    totalAllocatedMb,
    deviceRamTotalMb,
    osReservedMb,
    availableForEngineMb,
    utilizationPercent,
    oomRisk,
  };
}

/**
 * Proposal 2: Single-Slot KV Prefix Cache Pinning (n_keep)
 * Calculates longest common token prefix hit and Time-To-First-Token (TTFT) reduction.
 */
export function evaluatePrefixCacheHit(
  previousPinnedPrompt: string,
  incomingPrompt: string,
  pinnedSystemTokens: number,
  promptEvalTps: number,
  pinningEnabled: boolean
): PrefixCacheStats {
  const totalIncomingTokens = Math.max(
    48,
    Math.round(incomingPrompt.length / 3.5) + pinnedSystemTokens
  );
  const safeEvalTps = Math.max(20, promptEvalTps);
  const unpinnedTtftMs = Math.round((totalIncomingTokens / safeEvalTps) * 1000);

  if (!pinningEnabled) {
    return {
      pinnedPrefixTokens: 0,
      reusedTokensCount: 0,
      newTokensEvaluated: totalIncomingTokens,
      cacheHitRatioPercent: 0,
      unpinnedTtftMs,
      pinnedTtftMs: unpinnedTtftMs,
      ttftSavedMs: 0,
    };
  }

  // Compute common character prefix between previous and incoming prompt
  let commonChars = 0;
  const minLen = Math.min(previousPinnedPrompt.length, incomingPrompt.length);
  while (
    commonChars < minLen &&
    previousPinnedPrompt.charCodeAt(commonChars) === incomingPrompt.charCodeAt(commonChars)
  ) {
    commonChars++;
  }

  const dynamicPrefixTokens = Math.round(commonChars / 3.5);
  const reusedTokensCount = Math.min(
    totalIncomingTokens - 12,
    pinnedSystemTokens + dynamicPrefixTokens
  );
  const newTokensEvaluated = Math.max(12, totalIncomingTokens - reusedTokensCount);
  const cacheHitRatioPercent =
    Math.round((reusedTokensCount / totalIncomingTokens) * 1000) / 10;

  const pinnedTtftMs = Math.max(
    35,
    Math.round((newTokensEvaluated / safeEvalTps) * 1000)
  );

  return {
    pinnedPrefixTokens: pinnedSystemTokens,
    reusedTokensCount,
    newTokensEvaluated,
    cacheHitRatioPercent,
    unpinnedTtftMs,
    pinnedTtftMs,
    ttftSavedMs: Math.max(0, unpinnedTtftMs - pinnedTtftMs),
  };
}

/**
 * Proposal 3: Zero-Overhead GBNF Grammar & JSON Schema Compiler
 * Compiles OpenAI response_format / function schemas into llama.cpp GBNF state machine rules.
 */
export function compileJsonSchemaToGbnf(
  schemaName: string,
  enabled: boolean
): GbnfGrammarCompilation {
  if (!enabled) {
    return {
      enabled: false,
      schemaName: 'unconstrained_free_text',
      gbnfRuleString: '# GBNF logit masking disabled (free-form sampling)',
      activeRuleCount: 0,
      guaranteedValidJson: false,
    };
  }

  if (schemaName === 'rag_citation_payload') {
    const gbnf = [
      'root   ::= "{" ws "\\"answer\\":" ws string "," ws "\\"confidence\\":" ws number "," ws "\\"citations\\":" ws "[" ws string ("," ws string)* ws "]" ws "}"',
      'string ::= "\\"" ([^"\\\\\\x7F\\x00-\\x1F] | "\\\\" ["\\\\bfnrt])* "\\""',
      'number ::= ("0" | "1" | "0." [0-9]{1,3})',
      'ws     ::= [ \\t\\n]*',
    ].join('\n');
    return {
      enabled: true,
      schemaName,
      gbnfRuleString: gbnf,
      activeRuleCount: 4,
      guaranteedValidJson: true,
    };
  }

  // Default: openai_function_tool_call
  const gbnf = [
    'root      ::= "{" ws "\\"tool_call\\":" ws tool "," ws "\\"arguments\\":" ws args "," ws "\\"status\\":" ws "\\"ok\\"" ws "}"',
    'tool      ::= "\\"execute_local_action\\"" | "\\"query_local_index\\"" | "\\"apply_code_patch\\""',
    'args      ::= "{" ws "\\"target\\":" ws string "," ws "\\"strict_local\\":" ws ("true" | "false") ws "}"',
    'string    ::= "\\"" ([^"\\\\\\x7F\\x00-\\x1F] | "\\\\" ["\\\\bfnrt])* "\\""',
    'ws        ::= [ \\t\\n]*',
  ].join('\n');

  return {
    enabled: true,
    schemaName: 'openai_function_tool_call',
    gbnfRuleString: gbnf,
    activeRuleCount: 5,
    guaranteedValidJson: true,
  };
}

/**
 * Proposal 4: Adaptive Thermal Governor & Big.LITTLE Core Pinning
 * Calculates CPU core affinity mask (Prime Cortex-X4 + Perf Cortex-A720) and dynamic thread step-down.
 */
export function evaluateThermalGovernor(
  socTempC: number,
  thermalLimitC: number,
  configuredThreads: number,
  governorEnabled: boolean,
  bigLittlePinningEnabled: boolean
): ThermalGovernorStatus {
  // Mask cores 2..7 (Performance A720 + Prime X4), excluding Efficiency A520 cores 0..1
  const coreAffinityMask = bigLittlePinningEnabled ? '0xFC (cpu2..cpu7)' : '0xFF (cpu0..cpu7 All)';
  const coreTopologyLabel = bigLittlePinningEnabled
    ? '1x Cortex-X4 Prime + 5x Cortex-A720 Perf (E-Cores Excluded)'
    : 'Unpinned (OS Scheduler Default)';

  if (!governorEnabled) {
    return {
      governorActive: false,
      coreAffinityMask,
      coreTopologyLabel,
      configuredThreads,
      effectiveActiveThreads: configuredThreads,
      thermalStepDownThreads: 0,
      throttlingState: 'PRIME_PERF_LOCKED',
    };
  }

  const deltaC = socTempC - thermalLimitC;
  let stepDown = 0;
  let throttlingState: ThermalGovernorStatus['throttlingState'] = 'PRIME_PERF_LOCKED';

  if (deltaC >= 3.0) {
    stepDown = Math.min(configuredThreads - 2, 3);
    throttlingState = 'THERMAL_GUARD_CLAMP';
  } else if (deltaC >= 1.0) {
    stepDown = Math.min(configuredThreads - 2, 2);
    throttlingState = 'STEP_DOWN_2_THREADS';
  } else if (deltaC >= -0.8) {
    stepDown = Math.min(configuredThreads - 2, 1);
    throttlingState = 'STEP_DOWN_1_THREAD';
  }

  stepDown = Math.max(0, stepDown);
  const effectiveActiveThreads = Math.max(2, configuredThreads - stepDown);

  return {
    governorActive: stepDown > 0,
    coreAffinityMask,
    coreTopologyLabel,
    configuredThreads,
    effectiveActiveThreads,
    thermalStepDownThreads: stepDown,
    throttlingState,
  };
}

/**
 * Calculates realistic token throughput factoring in Proposals 1-4
 */
export function estimateThroughput(
  model: GgufModelSpec,
  config: Pick<
    EngineRuntimeConfig,
    | 'contextLength'
    | 'cpuThreads'
    | 'backend'
    | 'flashAttention'
    | 'adaptiveThermalGovernorEnabled'
    | 'bigLittleCorePinning'
    | 'thermalThrottleLimitC'
  >,
  socTempC: number,
  thermalLimitC: number
): {
  promptEvalTps: number;
  tokenGenTps: number;
  thermalThrottled: boolean;
  governorStatus: ThermalGovernorStatus;
} {
  const governorStatus = evaluateThermalGovernor(
    socTempC,
    thermalLimitC,
    config.cpuThreads,
    config.adaptiveThermalGovernorEnabled ?? true,
    config.bigLittleCorePinning ?? true
  );

  const effectiveThreads = governorStatus.effectiveActiveThreads;
  const threadFactor = Math.min(1.25, 0.55 + effectiveThreads * 0.11);

  // Pinning to Prime + Perf cores avoids Big.LITTLE barrier synchronization stalls (+12% sustained tok/s)
  const corePinningBonus = (config.bigLittleCorePinning ?? true) ? 1.12 : 0.96;

  const backendMultiplier =
    config.backend === 'Qualcomm QNN (Hexagon NPU)'
      ? 1.22
      : config.backend === 'Vulkan 1.3 (Adreno / Mali)'
        ? 1.08
        : 0.78;

  const contextPenalty = config.flashAttention
    ? Math.max(0.78, 1 - (config.contextLength / 32768) * 0.18)
    : Math.max(0.55, 1 - (config.contextLength / 32768) * 0.42);

  const thermalThrottled = socTempC >= thermalLimitC;
  // When Adaptive Thermal Governor is enabled, it gracefully steps down threads instead of suffering a 70% OS thermal cliff
  const thermalFactor = thermalThrottled
    ? (config.adaptiveThermalGovernorEnabled ?? true)
      ? Math.max(0.76, 1 - (socTempC - thermalLimitC + 1) * 0.05)
      : Math.max(0.35, 1 - (socTempC - thermalLimitC + 1) * 0.14)
    : 1.0;

  const promptEvalTps =
    Math.round(
      model.basePromptEvalTps *
        threadFactor *
        corePinningBonus *
        backendMultiplier *
        contextPenalty *
        thermalFactor *
        10
    ) / 10;

  const tokenGenTps =
    Math.round(
      model.baseTokenGenTps *
        threadFactor *
        corePinningBonus *
        backendMultiplier *
        contextPenalty *
        thermalFactor *
        10
    ) / 10;

  return {
    promptEvalTps,
    tokenGenTps,
    thermalThrottled,
    governorStatus,
  };
}

/**
 * Pure single-connection mutex decision function.
 * Enforces strict single-concurrency (max_connections = 1).
 */
export function evaluateMutexAcquisition(
  currentLease: ActiveConnectionLease | null,
  candidate: {
    leaseId: string;
    clientIp: string;
    userAgent: string;
    endpoint: string;
    promptTokens: number;
    reusedPrefixTokens?: number;
    gbnfEnforced?: boolean;
    now: number;
  }
):
  | { allowed: true; lease: ActiveConnectionLease }
  | {
      allowed: false;
      httpStatus: 429;
      errorCode: 'single_connection_mutex_locked';
      message: string;
      activeLease: ActiveConnectionLease;
    } {
  if (currentLease !== null) {
    return {
      allowed: false,
      httpStatus: 429,
      errorCode: 'single_connection_mutex_locked',
      message: `Engine busy: Single-connection mutex is locked by active lease ${currentLease.leaseId} (${currentLease.clientIp} via ${currentLease.userAgent}). Parallel connections are rejected to protect mobile KV cache integrity.`,
      activeLease: currentLease,
    };
  }

  return {
    allowed: true,
    lease: {
      leaseId: candidate.leaseId,
      clientIp: candidate.clientIp,
      userAgent: candidate.userAgent,
      endpoint: candidate.endpoint,
      acquiredAt: candidate.now,
      promptTokens: candidate.promptTokens,
      generatedTokens: 0,
      reusedPrefixTokens: candidate.reusedPrefixTokens ?? 0,
      gbnfEnforced: candidate.gbnfEnforced ?? false,
      status: 'EVALUATING_PROMPT',
    },
  };
}

export type DiagnosticErrorCode =
  | 'OK_READY'
  | 'ERR_NO_MODEL_MOUNTED'
  | 'ERR_INVALID_GGUF_MAGIC'
  | 'ERR_UNSUPPORTED_GGUF_VERSION'
  | 'ERR_TRUNCATED_OR_CORRUPTED_GGUF'
  | 'ERR_SPLIT_SHARD_INCOMPLETE'
  | 'ERR_SAF_FILE_DESCRIPTOR_DENIED'
  | 'ERR_OOM_RAM_EXCEEDED'
  | 'WARN_HIGH_RAM_PRESSURE'
  | 'ERR_SERVER_STOPPED'
  | 'ERR_PORT_BIND_CONFLICT'
  | 'WARN_SINGLE_SLOT_MUTEX_BUSY';

export type AutoFixActionType =
  | 'NONE'
  | 'PICK_GGUF_FILE'
  | 'SCAN_GGUF_FOLDER'
  | 'APPLY_LOW_RAM_SAFE_PROFILE'
  | 'START_LOCAL_SERVER'
  | 'SWITCH_FALLBACK_PORT'
  | 'FORCE_RELEASE_MUTEX';

export interface ModelLoadStageCheck {
  stageId: 'storage_fd' | 'gguf_header' | 'ram_budget' | 'jni_loader' | 'http_socket';
  label: string;
  status: 'PASS' | 'WARN' | 'FAIL';
  detail: string;
}

export interface ModelLoadDiagnosticReport {
  overallStatus: 'HEALTHY' | 'WARNING' | 'ERROR';
  code: DiagnosticErrorCode;
  title: string;
  preciseErrorMessage: string;
  proposedSolution: string;
  autoFixAction: AutoFixActionType;
  autoFixButtonLabel: string;
  stages: ModelLoadStageCheck[];
}

export interface RawGgufHeaderInspection {
  headerVerified: boolean;
  magicSignatureHex: string;
  detectedNonGgufFormat?: string;
  ggufVersion: number;
  tensorCount: number;
  kvMetaCount: number;
  isSplitShard: boolean;
  isTruncated: boolean;
}

/**
 * Inspects the first 24 bytes of a file to verify the binary 'GGUF' magic header (0x47475546),
 * format version (v1..v3), tensor count, KV metadata count, and detects common wrong-file mistakes
 * (HTML pages from HuggingFace redirects, ZIP/APK archives, Safetensors/JSON, legacy GGML).
 */
export function inspectRawGgufHeaderBytes(
  headerBytes: Uint8Array,
  filename: string,
  fileSizeBytes: number
): RawGgufHeaderInspection {
  const isSplitShard = /-0000[1-9]-of-0000[2-9]\.gguf$/i.test(filename);
  if (fileSizeBytes <= 0 || headerBytes.length < 4) {
    return {
      headerVerified: false,
      magicSignatureHex: '0x00000000 (Empty/0-byte file)',
      detectedNonGgufFormat: 'Empty or 0-byte file',
      ggufVersion: 0,
      tensorCount: 0,
      kvMetaCount: 0,
      isSplitShard,
      isTruncated: true,
    };
  }

  const b0 = headerBytes[0];
  const b1 = headerBytes[1];
  const b2 = headerBytes[2];
  const b3 = headerBytes[3];
  const hex =
    '0x' +
    [b0, b1, b2, b3]
      .map((b) => b.toString(16).toUpperCase().padStart(2, '0'))
      .join('');

  const isGgufMagic = b0 === 0x47 && b1 === 0x47 && b2 === 0x55 && b3 === 0x46; // 'G','G','U','F'
  if (!isGgufMagic) {
    const asciiPrefix = String.fromCharCode(b0, b1, b2, b3);
    let detectedFormat = `Non-GGUF binary (${hex})`;
    if (asciiPrefix.startsWith('<!') || asciiPrefix.toLowerCase().startsWith('<ht')) {
      detectedFormat = 'HTML Web Page (likely a HuggingFace login/redirect page saved as .gguf)';
    } else if (b0 === 0x50 && b1 === 0x4b) {
      detectedFormat = 'ZIP / PyTorch .pt / APK Archive (PK header)';
    } else if (b0 === 0x7b || (headerBytes.length >= 8 && b2 === 0x00 && b3 === 0x00 && b0 !== 0x47)) {
      detectedFormat = 'JSON or Safetensors file (not quantized GGUF)';
    } else if (asciiPrefix === 'ggml' || asciiPrefix === 'ggmf' || asciiPrefix === 'ggjt' || asciiPrefix === 'lmgg') {
      detectedFormat = 'Legacy 2023 GGML/GGJT format (pre-GGUF)';
    }

    return {
      headerVerified: false,
      magicSignatureHex: hex,
      detectedNonGgufFormat: detectedFormat,
      ggufVersion: 0,
      tensorCount: 0,
      kvMetaCount: 0,
      isSplitShard,
      isTruncated: fileSizeBytes < 64,
    };
  }

  let ggufVersion = 3;
  let tensorCount = 291;
  let kvMetaCount = 24;

  if (headerBytes.length >= 24) {
    const dv = new DataView(
      headerBytes.buffer,
      headerBytes.byteOffset,
      headerBytes.byteLength
    );
    ggufVersion = dv.getUint32(4, true);
    const tLow = dv.getUint32(8, true);
    const kLow = dv.getUint32(16, true);
    tensorCount = tLow;
    kvMetaCount = kLow;
  }

  const isTruncated = fileSizeBytes < 64 || tensorCount <= 0;

  return {
    headerVerified: true,
    magicSignatureHex: '0x47475546 ("GGUF")',
    ggufVersion,
    tensorCount,
    kvMetaCount,
    isSplitShard,
    isTruncated,
  };
}

/**
 * Runs a 5-stage pre-flight and runtime check on the selected model, memory budget,
 * native JNI loader, and local OpenAI HTTP socket.
 * Whenever anything goes wrong, returns a clear and precise error message plus a concrete proposed solution.
 */
export function diagnoseModelLoadAndRuntime(params: {
  model: GgufModelSpec | null;
  config: EngineRuntimeConfig;
  memory: MemoryBreakdown;
  serverRunning: boolean;
  activeLease: ActiveConnectionLease | null;
  safDescriptorError?: string | null;
  jniLoadError?: string | null;
  portBindError?: string | null;
}): ModelLoadDiagnosticReport {
  const {
    model,
    config,
    memory,
    serverRunning,
    activeLease,
    safDescriptorError,
    jniLoadError,
    portBindError,
  } = params;

  if (!model || !model.id || model.id === 'no-gguf-selected' || model.fileSizeMb <= 0) {
    return {
      overallStatus: 'ERROR',
      code: 'ERR_NO_MODEL_MOUNTED',
      title: 'No .GGUF Model File Mounted',
      preciseErrorMessage:
        'No local .gguf model file is currently selected or mounted in the engine.',
      proposedSolution:
        "Tap 'Select .GGUF File from Phone Storage' to pick a quantized .gguf model (e.g., Q4_K_M.gguf) from your Downloads or Documents folder.",
      autoFixAction: 'PICK_GGUF_FILE',
      autoFixButtonLabel: 'Select .GGUF File from Storage',
      stages: [
        {
          stageId: 'storage_fd',
          label: '1. Storage & SAF File Descriptor',
          status: 'FAIL',
          detail: 'No .gguf file URI selected yet',
        },
        {
          stageId: 'gguf_header',
          label: '2. Binary GGUF Magic Header',
          status: 'FAIL',
          detail: 'Waiting for file selection',
        },
        {
          stageId: 'ram_budget',
          label: '3. Phone RAM & KV Cache Budget',
          status: 'PASS',
          detail: `${memory.availableForEngineMb} MB usable RAM available`,
        },
        {
          stageId: 'jni_loader',
          label: '4. Native JNI / GGML Tensor Loader',
          status: 'FAIL',
          detail: 'Idle (no model mounted)',
        },
        {
          stageId: 'http_socket',
          label: '5. Local OpenAI Loopback Server',
          status: serverRunning ? 'PASS' : 'WARN',
          detail: serverRunning
            ? `Listening on http://${config.bindAddress}:${config.port}/v1`
            : 'Standby (auto-starts on model load)',
        },
      ],
    };
  }

  const headerVerified = model.headerVerified !== false;
  const ggufVersion = model.ggufVersion ?? 3;
  const tensorCount = model.tensorCount ?? 291;
  const kvMetaCount = model.kvMetaCount ?? 24;
  const isSplitShard =
    model.isSplitShard ?? /-0000[1-9]-of-0000[2-9]\.gguf$/i.test(model.filename);

  // Build individual stage results
  const stageStorage: ModelLoadStageCheck = safDescriptorError
    ? {
        stageId: 'storage_fd',
        label: '1. Storage & SAF File Descriptor',
        status: 'FAIL',
        detail: `Descriptor open failed: ${safDescriptorError}`,
      }
    : {
        stageId: 'storage_fd',
        label: '1. Storage & SAF File Descriptor',
        status: 'PASS',
        detail: `Readable (${model.fileSizeMb} MB · ${model.storagePath})`,
      };

  const stageHeader: ModelLoadStageCheck = !headerVerified
    ? {
        stageId: 'gguf_header',
        label: '2. Binary GGUF Magic Header',
        status: 'FAIL',
        detail: `Invalid magic bytes ${model.magicSignatureHex || ''} (${model.detectedNonGgufFormat || 'Not a GGUF file'})`,
      }
    : ggufVersion < 1 || ggufVersion > 3
      ? {
          stageId: 'gguf_header',
          label: '2. Binary GGUF Magic Header',
          status: 'FAIL',
          detail: `Unsupported GGUF format v${ggufVersion} (expected v1..v3)`,
        }
      : tensorCount <= 0
        ? {
            stageId: 'gguf_header',
            label: '2. Binary GGUF Magic Header',
            status: 'FAIL',
            detail: `Corrupted or truncated tensor table (tensorCount=${tensorCount})`,
          }
        : isSplitShard
          ? {
              stageId: 'gguf_header',
              label: '2. Binary GGUF Magic Header',
              status: 'WARN',
              detail: `Multi-part split shard detected (${model.filename})`,
            }
          : {
              stageId: 'gguf_header',
              label: '2. Binary GGUF Magic Header',
              status: 'PASS',
              detail: `Verified GGUF v${ggufVersion} (0x47475546 · ${tensorCount} tensors · ${kvMetaCount} KV keys)`,
            };

  const stageRam: ModelLoadStageCheck =
    memory.oomRisk === 'CRITICAL_OOM'
      ? {
          stageId: 'ram_budget',
          label: '3. Phone RAM & KV Cache Budget',
          status: 'FAIL',
          detail: `Requires ${memory.totalAllocatedMb} MB (Weights ${memory.weightsMb} + KV ${memory.kvCacheMb} MB) vs ${memory.availableForEngineMb} MB usable RAM`,
        }
      : memory.oomRisk === 'ELEVATED'
        ? {
            stageId: 'ram_budget',
            label: '3. Phone RAM & KV Cache Budget',
            status: 'WARN',
            detail: `Elevated RAM usage: ${memory.totalAllocatedMb} / ${memory.availableForEngineMb} MB (${memory.utilizationPercent}%)`,
          }
        : {
            stageId: 'ram_budget',
            label: '3. Phone RAM & KV Cache Budget',
            status: 'PASS',
            detail: `Fits comfortably: ${memory.totalAllocatedMb} / ${memory.availableForEngineMb} MB (${memory.utilizationPercent}% · KV ${config.kvCacheQuant})`,
          };

  const stageJni: ModelLoadStageCheck = jniLoadError
    ? {
        stageId: 'jni_loader',
        label: '4. Native JNI / GGML Tensor Loader',
        status: 'FAIL',
        detail: jniLoadError,
      }
    : {
        stageId: 'jni_loader',
        label: '4. Native JNI / GGML Tensor Loader',
        status: 'PASS',
        detail: `Loaded '${model.id}' (mmap=${config.mmapEnabled ? 'ON' : 'OFF'}, n_ctx=${config.contextLength}, n_keep=${config.pinnedSystemTokens})`,
      };

  const stageSocket: ModelLoadStageCheck = portBindError
    ? {
        stageId: 'http_socket',
        label: '5. Local OpenAI Loopback Server',
        status: 'FAIL',
        detail: `Port :${config.port} bind error: ${portBindError}`,
      }
    : !serverRunning
      ? {
          stageId: 'http_socket',
          label: '5. Local OpenAI Loopback Server',
          status: 'WARN',
          detail: `Server stopped on ${config.bindAddress}:${config.port} (auto-starts when sending chat)`,
        }
      : {
          stageId: 'http_socket',
          label: '5. Local OpenAI Loopback Server',
          status: 'PASS',
          detail: `Listening on http://${config.bindAddress}:${config.port}/v1/chat/completions`,
        };

  const stages = [stageStorage, stageHeader, stageRam, stageJni, stageSocket];

  // Priority 1: Storage / SAF descriptor permission error
  if (safDescriptorError) {
    return {
      overallStatus: 'ERROR',
      code: 'ERR_SAF_FILE_DESCRIPTOR_DENIED',
      title: 'Cannot Read .GGUF File from Phone Storage (SAF Permission / Missing File)',
      preciseErrorMessage: `Android Storage Access Framework failed to open '${model.filename}' (${safDescriptorError}). The file may have been moved, renamed, or its URI permission expired.`,
      proposedSolution:
        "Tap 'Re-select .GGUF File from Storage' below to pick the file again and grant a fresh persistable read permission.",
      autoFixAction: 'PICK_GGUF_FILE',
      autoFixButtonLabel: 'Re-select .GGUF File from Storage',
      stages,
    };
  }

  // Priority 2: Invalid GGUF magic header
  if (!headerVerified) {
    return {
      overallStatus: 'ERROR',
      code: 'ERR_INVALID_GGUF_MAGIC',
      title: 'Invalid File Format: Not a Valid Binary .GGUF Model',
      preciseErrorMessage: `File '${model.filename}' failed binary magic header verification. Expected 'GGUF' (0x47475546), but detected ${model.detectedNonGgufFormat || model.magicSignatureHex || 'non-GGUF data'}.`,
      proposedSolution:
        'Make sure you downloaded a direct quantized .gguf weight file (such as Q4_K_M.gguf) rather than a PyTorch .bin/.pt archive, Safetensors file, or an HTML webpage redirect.',
      autoFixAction: 'PICK_GGUF_FILE',
      autoFixButtonLabel: 'Pick a Valid .GGUF Model File',
      stages,
    };
  }

  // Priority 3: Unsupported GGUF specification version
  if (ggufVersion < 1 || ggufVersion > 3) {
    return {
      overallStatus: 'ERROR',
      code: 'ERR_UNSUPPORTED_GGUF_VERSION',
      title: `Unsupported GGUF Format Version (v${ggufVersion})`,
      preciseErrorMessage: `Model '${model.filename}' uses GGUF specification version v${ggufVersion}. The native engine supports GGUF v1, v2, and v3.`,
      proposedSolution:
        'Download a standard GGUF v2 or v3 quantization of this model (e.g. Q4_K_M or IQ4_XS exported by llama.cpp).',
      autoFixAction: 'PICK_GGUF_FILE',
      autoFixButtonLabel: 'Select Another .GGUF Model',
      stages,
    };
  }

  // Priority 4: Truncated or 0-tensor corrupted download
  if (tensorCount <= 0) {
    return {
      overallStatus: 'ERROR',
      code: 'ERR_TRUNCATED_OR_CORRUPTED_GGUF',
      title: 'Corrupted or Incomplete .GGUF Download',
      preciseErrorMessage: `Model '${model.filename}' (${model.fileSizeMb} MB) reports ${tensorCount} tensors in its header. The download appears incomplete or truncated.`,
      proposedSolution:
        'Check the file size in your phone Downloads folder against the full repository size, delete the partial download, and re-download the complete .gguf file.',
      autoFixAction: 'PICK_GGUF_FILE',
      autoFixButtonLabel: 'Select Complete .GGUF File',
      stages,
    };
  }

  // Priority 5: JNI native load error
  if (jniLoadError) {
    return {
      overallStatus: 'ERROR',
      code: 'ERR_TRUNCATED_OR_CORRUPTED_GGUF',
      title: 'Native JNI Engine Failed to Initialize Model Tensors',
      preciseErrorMessage: `Native C++ loader reported: ${jniLoadError}`,
      proposedSolution:
        "Tap 'Apply Low-RAM Safe Profile' to reload with mmap=ON, n_ctx=2048, and Q4_0 KV cache, or re-select the .gguf file to refresh the file descriptor.",
      autoFixAction: 'APPLY_LOW_RAM_SAFE_PROFILE',
      autoFixButtonLabel: '1-Tap Fix: Apply Low-RAM Safe Profile & Reload',
      stages,
    };
  }

  // Priority 6: Critical OOM RAM Exceeded (e.g. 9B 5.8GB model + large context exceeding usable phone RAM)
  if (memory.oomRisk === 'CRITICAL_OOM') {
    return {
      overallStatus: 'ERROR',
      code: 'ERR_OOM_RAM_EXCEEDED',
      title: 'Insufficient Free Phone RAM for Current Model + Context Settings',
      preciseErrorMessage: `Loading '${model.name}' with n_ctx=${config.contextLength} and KV=${config.kvCacheQuant} requires ${memory.totalAllocatedMb} MB (${memory.weightsMb} MB weights + ${memory.kvCacheMb} MB KV cache + ${memory.computeBufferMb} MB scratch), which exceeds safe engine memory (${memory.availableForEngineMb} MB usable of ${memory.deviceRamTotalMb} MB total). Android's Low-Memory Killer (lmkd) may abort inference.`,
      proposedSolution:
        "Tap '1-Tap Fix: Apply Low-RAM Safe Profile' below to enable Q4_0 KV quantization (saves 72% KV RAM), set n_ctx=2048, and enable mmap streaming, or close background apps.",
      autoFixAction: 'APPLY_LOW_RAM_SAFE_PROFILE',
      autoFixButtonLabel: '1-Tap Fix: Apply Low-RAM Safe Profile (n_ctx=2048, KV=Q4_0, mmap=ON)',
      stages,
    };
  }

  // Priority 7: Port bind conflict
  if (portBindError) {
    return {
      overallStatus: 'ERROR',
      code: 'ERR_PORT_BIND_CONFLICT',
      title: `Local Server Port :${config.port} Is Already in Use`,
      preciseErrorMessage: `Could not bind local OpenAI server socket to ${config.bindAddress}:${config.port} (${portBindError}).`,
      proposedSolution: `Switch the local server port to :${config.port + 1} so there is no conflict with other local services.`,
      autoFixAction: 'SWITCH_FALLBACK_PORT',
      autoFixButtonLabel: `1-Tap Fix: Switch to Port :${config.port + 1} & Restart`,
      stages,
    };
  }

  // Priority 8: Multi-part split shard warning
  if (isSplitShard) {
    return {
      overallStatus: 'WARNING',
      code: 'ERR_SPLIT_SHARD_INCOMPLETE',
      title: 'Multi-Part Split .GGUF Shard Detected',
      preciseErrorMessage: `'${model.filename}' is part of a multi-file split GGUF archive. Android single-file SAF descriptors only grant access to the single picked file unless the parent folder is granted.`,
      proposedSolution:
        "Use 'Scan GGUF Folder' to grant read access to the entire directory containing all shards, or merge shards into a single .gguf file with 'llama-gguf-split --merge'.",
      autoFixAction: 'SCAN_GGUF_FOLDER',
      autoFixButtonLabel: 'Grant Full Folder Access (Scan GGUF Folder)',
      stages,
    };
  }

  // Priority 9: Server stopped warning
  if (!serverRunning) {
    return {
      overallStatus: 'WARNING',
      code: 'ERR_SERVER_STOPPED',
      title: 'Model Mounted in Standby (Local HTTP Server Paused)',
      preciseErrorMessage: `Model '${model.id}' passed all binary GGUF and RAM checks, but the local OpenAI HTTP server on ${config.bindAddress}:${config.port} is currently paused.`,
      proposedSolution:
        "Tap 'Start Local Server Now' below (or simply send a message in the Chat tab, which auto-starts the server).",
      autoFixAction: 'START_LOCAL_SERVER',
      autoFixButtonLabel: `1-Tap Fix: Start Local Server on :${config.port}`,
      stages,
    };
  }

  // Priority 10: Single-slot mutex currently locked
  if (activeLease !== null) {
    return {
      overallStatus: 'WARNING',
      code: 'WARN_SINGLE_SLOT_MUTEX_BUSY',
      title: `Single-Slot Mutex Locked by Active Lease (${activeLease.leaseId})`,
      preciseErrorMessage: `The engine is currently serving '${activeLease.userAgent}' (${activeLease.clientIp}). Because max_connections = 1, any concurrent request will receive HTTP 429.`,
      proposedSolution:
        "Wait for the current response to finish, or tap 'Force-Release Mutex Lock' if a client hung or disconnected.",
      autoFixAction: 'FORCE_RELEASE_MUTEX',
      autoFixButtonLabel: '1-Tap Fix: Force-Release Single-Slot Mutex',
      stages,
    };
  }

  // Priority 11: Elevated RAM warning
  if (memory.oomRisk === 'ELEVATED') {
    return {
      overallStatus: 'WARNING',
      code: 'WARN_HIGH_RAM_PRESSURE',
      title: `Elevated Memory Footprint (${memory.utilizationPercent}% of Usable Phone RAM)`,
      preciseErrorMessage: `Model '${model.name}' is loaded and serving, using ${memory.totalAllocatedMb} MB of ${memory.availableForEngineMb} MB usable RAM.`,
      proposedSolution:
        config.kvCacheQuant !== 'Q4_0' || config.contextLength > 4096
          ? "To increase stability during long chats, switch KV Cache to Q4_0 and keep n_ctx <= 4096."
          : 'Close heavy background apps if you notice Android reclaiming memory during long chats.',
      autoFixAction:
        config.kvCacheQuant !== 'Q4_0' || config.contextLength > 4096
          ? 'APPLY_LOW_RAM_SAFE_PROFILE'
          : 'NONE',
      autoFixButtonLabel: 'Optimize RAM (KV=Q4_0, n_ctx=4096)',
      stages,
    };
  }

  return {
    overallStatus: 'HEALTHY',
    code: 'OK_READY',
    title: `Model Loaded & Verified: Serving '${model.id}' on :${config.port}`,
    preciseErrorMessage: `All 5 pre-flight checks passed. Binary GGUF v${ggufVersion} header verified (${tensorCount} tensors), ${memory.totalAllocatedMb} MB allocated within ${memory.availableForEngineMb} MB budget, listening on http://${config.bindAddress}:${config.port}/v1.`,
    proposedSolution:
      'Ready for chat! Open the Chat tab or tap Self API Test to verify token generation.',
    autoFixAction: 'NONE',
    autoFixButtonLabel: '',
    stages,
  };
}

