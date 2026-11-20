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
  kvCacheQuant: KvCacheQuantType;
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
  thermalThrottleLimitC: number;
  backend: ExecutionBackend;
}

export interface MemoryBreakdown {
  weightsMb: number;
  kvCacheMb: number;
  computeBufferMb: number;
  totalAllocatedMb: number;
  deviceRamTotalMb: number;
  osReservedMb: number;
  availableForEngineMb: number;
  utilizationPercent: number;
  oomRisk: 'NOMINAL' | 'ELEVATED' | 'CRITICAL_OOM';
}

export interface TelemetrySample {
  timestamp: number;
  promptEvalTps: number;
  tokenGenTps: number;
  ramUsedMb: number;
  socTempC: number;
  batteryDrainWatts: number;
  cpuLoadPercent: number;
}

export interface ActiveConnectionLease {
  leaseId: string;
  clientIp: string;
  userAgent: string;
  endpoint: string;
  acquiredAt: number;
  promptTokens: number;
  generatedTokens: number;
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

export const DEFAULT_ENGINE_CONFIG: EngineRuntimeConfig = {
  activeModelId: 'llama-3.2-3b-q4_k_m',
  contextLength: 4096,
  batchSize: 512,
  cpuThreads: 6,
  gpuLayers: 28,
  kvCacheQuant: 'FP16',
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
  thermalThrottleLimitC: 43,
  backend: 'Vulkan 1.3 (Adreno / Mali)',
};

/**
 * Bytes per element in KV cache based on quantization format
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
 * Calculates exact GGUF memory footprint (Weights + KV Cache + Compute Buffers)
 * KV Cache bytes = 2 (K & V) * numLayers * numKvHeads * headDim * contextLength * bytesPerElement
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

  // Compute buffer scales with batch size and hidden dimension
  const computeBufferMb = Math.round(
    85 + (config.batchSize / 512) * (model.hiddenSize / 2048) * 64
  );

  // If mmap is enabled, resident weights in physical RAM are slightly lower initially (~92%), else 100%
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
 * Calculates realistic token throughput based on context length, threads, thermal state, and backend
 */
export function estimateThroughput(
  model: GgufModelSpec,
  config: Pick<EngineRuntimeConfig, 'contextLength' | 'cpuThreads' | 'backend' | 'flashAttention'>,
  socTempC: number,
  thermalLimitC: number
): { promptEvalTps: number; tokenGenTps: number; thermalThrottled: boolean } {
  const threadFactor = Math.min(1.25, 0.55 + config.cpuThreads * 0.11);
  const backendMultiplier =
    config.backend === 'Qualcomm QNN (Hexagon NPU)'
      ? 1.22
      : config.backend === 'Vulkan 1.3 (Adreno / Mali)'
        ? 1.08
        : 0.78;

  // Longer context slightly degrades attention speed unless flash attention is enabled
  const contextPenalty = config.flashAttention
    ? Math.max(0.78, 1 - (config.contextLength / 32768) * 0.18)
    : Math.max(0.55, 1 - (config.contextLength / 32768) * 0.42);

  const thermalThrottled = socTempC >= thermalLimitC;
  const thermalFactor = thermalThrottled
    ? Math.max(0.48, 1 - (socTempC - thermalLimitC + 1) * 0.09)
    : 1.0;

  const promptEvalTps =
    Math.round(
      model.basePromptEvalTps *
        threadFactor *
        backendMultiplier *
        contextPenalty *
        thermalFactor *
        10
    ) / 10;

  const tokenGenTps =
    Math.round(
      model.baseTokenGenTps *
        threadFactor *
        backendMultiplier *
        contextPenalty *
        thermalFactor *
        10
    ) / 10;

  return {
    promptEvalTps,
    tokenGenTps,
    thermalThrottled,
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
    now: number;
  }
):
  | { allowed: true; lease: ActiveConnectionLease }
  | { allowed: false; httpStatus: 429; errorCode: 'single_connection_mutex_locked'; message: string; activeLease: ActiveConnectionLease } {
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
      status: 'EVALUATING_PROMPT',
    },
  };
}
