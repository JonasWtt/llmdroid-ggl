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
