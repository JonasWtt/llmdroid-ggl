import React from 'react';
import {
  Sliders,
  Cpu,
  HardDrive,
  AlertTriangle,
  CheckCircle2,
  RotateCcw,
} from 'lucide-react';
import type {
  GgufModelSpec,
  EngineRuntimeConfig,
  MemoryBreakdown,
  KvCacheQuantType,
  ExecutionBackend,
} from '../utils/ggufEngineLogic';
import { DEFAULT_ENGINE_CONFIG } from '../utils/ggufEngineLogic';

interface ContextRuntimePanelProps {
  activeModel: GgufModelSpec;
  runtimeConfig: EngineRuntimeConfig;
  memory: MemoryBreakdown;
  throughput: { promptEvalTps: number; tokenGenTps: number; thermalThrottled: boolean };
  onUpdateConfig: (updates: Partial<EngineRuntimeConfig>) => void;
}

const CONTEXT_PRESETS = [512, 1024, 2048, 4096, 8192, 16384, 32768];
const BATCH_PRESETS = [128, 256, 512, 1024];

export const ContextRuntimePanel: React.FC<ContextRuntimePanelProps> = ({
  activeModel,
  runtimeConfig,
  memory,
  throughput,
  onUpdateConfig,
}) => {
  return (
    <div className="space-y-6">
      {/* Top Summary Banner: Live Impact of Context & KV Quantization */}
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <p className="text-xs text-slate-500">
              Active Model: <span className="font-semibold text-slate-800">{activeModel.name}</span> ({activeModel.filename})
            </p>
            <h2 className="text-xl font-bold text-slate-900 mt-0.5">
              Context Window &amp; Hardware Execution Tuning
            </h2>
          </div>

          <button
            type="button"
            onClick={() =>
              onUpdateConfig({
                contextLength: DEFAULT_ENGINE_CONFIG.contextLength,
                batchSize: DEFAULT_ENGINE_CONFIG.batchSize,
                kvCacheQuant: DEFAULT_ENGINE_CONFIG.kvCacheQuant,
                cpuThreads: DEFAULT_ENGINE_CONFIG.cpuThreads,
                gpuLayers: DEFAULT_ENGINE_CONFIG.gpuLayers,
                mmapEnabled: DEFAULT_ENGINE_CONFIG.mmapEnabled,
                mlockEnabled: DEFAULT_ENGINE_CONFIG.mlockEnabled,
                flashAttention: DEFAULT_ENGINE_CONFIG.flashAttention,
              })
            }
            className="min-h-[40px] px-3.5 py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset to Recommended Defaults
          </button>
        </div>

        {/* Live Calculated Memory & Speed Impact Strip */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-4 gap-4 font-mono tabular-nums">
          <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200/80">
            <span className="text-xs font-sans text-slate-500 block">Context Window (n_ctx)</span>
            <span
              data-testid="config-context-display"
              className="text-lg font-bold text-slate-900 mt-0.5 block"
            >
              {runtimeConfig.contextLength.toLocaleString()} tokens
            </span>
          </div>

          <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200/80">
            <span className="text-xs font-sans text-slate-500 block">KV Cache Footprint</span>
            <span
              data-testid="config-kv-cache-mb"
              className="text-lg font-bold text-emerald-700 mt-0.5 block"
            >
              {memory.kvCacheMb.toLocaleString()} MB ({runtimeConfig.kvCacheQuant})
            </span>
          </div>

          <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200/80">
            <span className="text-xs font-sans text-slate-500 block">Total Engine RAM</span>
            <span className="text-lg font-bold text-slate-900 mt-0.5 block">
              {memory.totalAllocatedMb.toLocaleString()} / {memory.availableForEngineMb.toLocaleString()} MB
            </span>
          </div>

          <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200/80">
            <span className="text-xs font-sans text-slate-500 block">Android LMK OOM Guard</span>
            {memory.oomRisk === 'CRITICAL_OOM' ? (
              <span className="text-sm font-bold text-red-700 mt-1 flex items-center gap-1">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                CRITICAL OOM RISK
              </span>
            ) : memory.oomRisk === 'ELEVATED' ? (
              <span className="text-sm font-bold text-amber-700 mt-1 flex items-center gap-1">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                ELEVATED ({memory.utilizationPercent}%)
              </span>
            ) : (
              <span className="text-sm font-bold text-emerald-700 mt-1 flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                SAFE ({memory.utilizationPercent}%)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Main 2-Column Parameter Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left 6 Cols: Context Length & KV Cache Quantization */}
        <section
          aria-label="Context Length and KV Cache Configuration"
          className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-6"
        >
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Sliders className="w-4 h-4 text-slate-500" />
            <h3 className="text-base font-bold text-slate-900">
              Context Window &amp; KV Memory Compression
            </h3>
          </div>

          {/* Context Length Slider + Step Buttons */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label htmlFor="context-length-slider" className="text-xs font-semibold text-slate-800">
                Context Length (<code className="font-mono">n_ctx</code>)
              </label>
              <span className="text-xs font-mono font-bold text-slate-900 tabular-nums">
                {runtimeConfig.contextLength.toLocaleString()} / {activeModel.maxNativeContext.toLocaleString()} tokens
              </span>
            </div>

            <input
              id="context-length-slider"
              type="range"
              min={512}
              max={activeModel.maxNativeContext}
              step={512}
              value={runtimeConfig.contextLength}
              onChange={(e) =>
                onUpdateConfig({ contextLength: Number(e.target.value) })
              }
              className="w-full accent-slate-900 cursor-pointer"
            />

            {/* Preset Buttons */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              {CONTEXT_PRESETS.filter((p) => p <= activeModel.maxNativeContext).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => onUpdateConfig({ contextLength: preset })}
                  className={`min-h-[36px] px-2.5 py-1 rounded-md text-xs font-mono font-medium transition-colors cursor-pointer ${
                    runtimeConfig.contextLength === preset
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {preset >= 1024 ? `${preset / 1024}K` : preset}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Higher context windows allow external coding assistants and RAG tools to send larger prompts, but scale KV cache memory linearly.
            </p>
          </div>

          {/* KV Cache Quantization Selector */}
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <label className="text-xs font-semibold text-slate-800 block">
              KV Cache Tensor Quantization (<code className="font-mono">type_k / type_v</code>)
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['FP16', 'Q8_0', 'Q4_0'] as KvCacheQuantType[]).map((kvType) => (
                <button
                  key={kvType}
                  type="button"
                  onClick={() => onUpdateConfig({ kvCacheQuant: kvType })}
                  className={`min-h-[44px] p-2.5 rounded-lg border text-left transition-colors cursor-pointer ${
                    runtimeConfig.kvCacheQuant === kvType
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-slate-50 text-slate-800 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <div className="text-xs font-mono font-bold">{kvType}</div>
                  <div
                    className={`text-[11px] mt-0.5 ${
                      runtimeConfig.kvCacheQuant === kvType
                        ? 'text-slate-300'
                        : 'text-slate-500'
                    }`}
                  >
                    {kvType === 'FP16'
                      ? '16-bit Standard'
                      : kvType === 'Q8_0'
                        ? '~47% RAM Saved'
                        : '~72% RAM Saved'}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Prompt Evaluation Batch Size */}
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-800">
                Prompt Batch Size (<code className="font-mono">n_batch</code>)
              </label>
              <span className="text-xs font-mono text-slate-700">
                {runtimeConfig.batchSize} tokens/pass
              </span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {BATCH_PRESETS.map((bSize) => (
                <button
                  key={bSize}
                  type="button"
                  onClick={() => onUpdateConfig({ batchSize: bSize })}
                  className={`min-h-[38px] py-1.5 rounded-lg text-xs font-mono font-medium border transition-colors cursor-pointer ${
                    runtimeConfig.batchSize === bSize
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {bSize}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Right 6 Cols: Hardware Acceleration, Threads & Memory Flags */}
        <section
          aria-label="Hardware Acceleration and Memory Flags"
          className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-6"
        >
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Cpu className="w-4 h-4 text-slate-500" />
            <h3 className="text-base font-bold text-slate-900">
              SoC Hardware Backend &amp; POSIX Memory Flags
            </h3>
          </div>

          {/* Execution Backend Selector */}
          <div className="space-y-2">
            <label htmlFor="execution-backend-select" className="text-xs font-semibold text-slate-800 block">
              Compute Backend Driver
            </label>
            <select
              id="execution-backend-select"
              value={runtimeConfig.backend}
              onChange={(e) =>
                onUpdateConfig({ backend: e.target.value as ExecutionBackend })
              }
              className="w-full min-h-[42px] px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-900"
            >
              <option value="Vulkan 1.3 (Adreno / Mali)">
                Vulkan 1.3 Compute Shader (Adreno 750 / Immortalis-G720)
              </option>
              <option value="CPU (ARM NEON / KleidiAI)">
                ARMv9 CPU Only (NEON + KleidiAI i8mm DotProd)
              </option>
              <option value="Qualcomm QNN (Hexagon NPU)">
                Qualcomm QNN HTP Bridge (Hexagon NPU Delegate)
              </option>
            </select>
          </div>

          {/* CPU Threads & GPU Offload Layers */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="cpu-threads-slider" className="text-xs font-semibold text-slate-800">
                  CPU Threads (<code className="font-mono">n_threads</code>)
                </label>
                <span className="text-xs font-mono font-bold text-slate-900">
                  {runtimeConfig.cpuThreads} cores
                </span>
              </div>
              <input
                id="cpu-threads-slider"
                type="range"
                min={1}
                max={8}
                value={runtimeConfig.cpuThreads}
                onChange={(e) =>
                  onUpdateConfig({ cpuThreads: Number(e.target.value) })
                }
                className="w-full accent-slate-900 cursor-pointer"
              />
              <span className="text-[11px] text-slate-500 block mt-1">
                Bind to Prime + Performance cores (avoid E-core latency)
              </span>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="gpu-layers-slider" className="text-xs font-semibold text-slate-800">
                  GPU Layers (<code className="font-mono">n_gpu_layers</code>)
                </label>
                <span className="text-xs font-mono font-bold text-slate-900">
                  {runtimeConfig.gpuLayers} / {activeModel.numLayers}
                </span>
              </div>
              <input
                id="gpu-layers-slider"
                type="range"
                min={0}
                max={activeModel.numLayers}
                value={Math.min(runtimeConfig.gpuLayers, activeModel.numLayers)}
                onChange={(e) =>
                  onUpdateConfig({ gpuLayers: Number(e.target.value) })
                }
                className="w-full accent-slate-900 cursor-pointer"
              />
              <span className="text-[11px] text-slate-500 block mt-1">
                Est. Gen Throughput: ~{throughput.tokenGenTps.toFixed(1)} tok/s
              </span>
            </div>
          </div>

          {/* Low-Level Memory & Attention Toggles */}
          <div className="space-y-3 pt-2 border-t border-slate-100">
            <label className="flex items-start justify-between gap-4 p-3 rounded-lg bg-slate-50 border border-slate-200/80 cursor-pointer">
              <div>
                <span className="text-xs font-semibold text-slate-900 block">
                  POSIX <code className="font-mono">mmap()</code> Zero-Copy Weight Mapping
                </span>
                <span className="text-[11px] text-slate-500 block mt-0.5">
                  Maps GGUF tensor pages directly from Android flash storage without duplicating buffers.
                </span>
              </div>
              <input
                type="checkbox"
                checked={runtimeConfig.mmapEnabled}
                onChange={(e) =>
                  onUpdateConfig({ mmapEnabled: e.target.checked })
                }
                className="mt-1 h-4 w-4 accent-slate-900 cursor-pointer"
              />
            </label>

            <label className="flex items-start justify-between gap-4 p-3 rounded-lg bg-slate-50 border border-slate-200/80 cursor-pointer">
              <div>
                <span className="text-xs font-semibold text-slate-900 block">
                  Flash Attention Kernel (<code className="font-mono">flash_attn</code>)
                </span>
                <span className="text-[11px] text-slate-500 block mt-0.5">
                  Reduces quadratic self-attention scratch overhead on long 8K–32K context prompts.
                </span>
              </div>
              <input
                type="checkbox"
                checked={runtimeConfig.flashAttention}
                onChange={(e) =>
                  onUpdateConfig({ flashAttention: e.target.checked })
                }
                className="mt-1 h-4 w-4 accent-slate-900 cursor-pointer"
              />
            </label>

            <label className="flex items-start justify-between gap-4 p-3 rounded-lg bg-slate-50 border border-slate-200/80 cursor-pointer">
              <div>
                <span className="text-xs font-semibold text-slate-900 block">
                  Pin Pages in RAM (<code className="font-mono">mlock()</code>)
                </span>
                <span className="text-[11px] text-slate-500 block mt-0.5">
                  Prevents Android zRAM swap eviction during idle periods between API calls.
                </span>
              </div>
              <input
                type="checkbox"
                checked={runtimeConfig.mlockEnabled}
                onChange={(e) =>
                  onUpdateConfig({ mlockEnabled: e.target.checked })
                }
                className="mt-1 h-4 w-4 accent-slate-900 cursor-pointer"
              />
            </label>
          </div>
        </section>
      </div>
    </div>
  );
};
