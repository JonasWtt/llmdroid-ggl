import React from 'react';
import {
  Sliders,
  Cpu,
  AlertTriangle,
  CheckCircle2,
  RotateCcw,
  Layers,
  Code2,
  Flame,
} from 'lucide-react';
import type {
  GgufModelSpec,
  EngineRuntimeConfig,
  MemoryBreakdown,
  KvCacheQuantType,
  ExecutionBackend,
} from '../utils/ggufEngineLogic';
import {
  DEFAULT_ENGINE_CONFIG,
  evaluatePrefixCacheHit,
  compileJsonSchemaToGbnf,
  evaluateThermalGovernor,
} from '../utils/ggufEngineLogic';

interface ContextRuntimePanelProps {
  activeModel: GgufModelSpec;
  runtimeConfig: EngineRuntimeConfig;
  memory: MemoryBreakdown;
  throughput: {
    promptEvalTps: number;
    tokenGenTps: number;
    thermalThrottled: boolean;
  };
  socTempC?: number;
  onUpdateConfig: (updates: Partial<EngineRuntimeConfig>) => void;
}

const CONTEXT_PRESETS = [512, 1024, 2048, 4096, 8192, 16384, 32768];
const BATCH_PRESETS = [128, 256, 512, 1024];

export const ContextRuntimePanel: React.FC<ContextRuntimePanelProps> = ({
  activeModel,
  runtimeConfig,
  memory,
  throughput,
  socTempC = 37.4,
  onUpdateConfig,
}) => {
  const prefixStats = evaluatePrefixCacheHit(
    'You are an offline Android local GGUF coding assistant.',
    'You are an offline Android local GGUF coding assistant. Analyze memory allocation.',
    runtimeConfig.pinnedSystemTokens,
    throughput.promptEvalTps,
    runtimeConfig.prefixCachePinningEnabled
  );

  const gbnfGrammar = compileJsonSchemaToGbnf(
    runtimeConfig.activeGbnfSchemaName,
    runtimeConfig.gbnfJsonGrammarEnabled
  );

  const thermalGov = evaluateThermalGovernor(
    socTempC,
    runtimeConfig.thermalThrottleLimitC,
    runtimeConfig.cpuThreads,
    runtimeConfig.adaptiveThermalGovernorEnabled,
    runtimeConfig.bigLittleCorePinning
  );

  return (
    <div className="space-y-6">
      {/* Top Summary Banner: Live Impact of Proposals 1-4 */}
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <p className="text-xs text-slate-500">
              Active Model: <span className="font-semibold text-slate-800">{activeModel.name}</span> ({activeModel.filename})
            </p>
            <h2 className="text-xl font-bold text-slate-900 mt-0.5">
              Context Window, Q4_0 KV Cache &amp; Hardware Execution Tuning
            </h2>
          </div>

          <button
            type="button"
            onClick={() =>
              onUpdateConfig({
                contextLength: DEFAULT_ENGINE_CONFIG.contextLength,
                batchSize: DEFAULT_ENGINE_CONFIG.batchSize,
                kvCacheQuant: DEFAULT_ENGINE_CONFIG.kvCacheQuant,
                prefixCachePinningEnabled: DEFAULT_ENGINE_CONFIG.prefixCachePinningEnabled,
                pinnedSystemTokens: DEFAULT_ENGINE_CONFIG.pinnedSystemTokens,
                gbnfJsonGrammarEnabled: DEFAULT_ENGINE_CONFIG.gbnfJsonGrammarEnabled,
                adaptiveThermalGovernorEnabled: DEFAULT_ENGINE_CONFIG.adaptiveThermalGovernorEnabled,
                bigLittleCorePinning: DEFAULT_ENGINE_CONFIG.bigLittleCorePinning,
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

        {/* Live Calculated Memory & Speed Impact Strip for Proposals 1-4 */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-4 gap-4 font-mono tabular-nums">
          <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200/80">
            <span className="text-xs font-sans text-slate-500 block">1. KV Cache ({runtimeConfig.kvCacheQuant})</span>
            <span
              data-testid="config-kv-cache-mb"
              className="text-lg font-bold text-emerald-700 mt-0.5 block"
            >
              {memory.kvCacheMb.toLocaleString()} MB
            </span>
            <span className="text-[11px] text-slate-500 block">
              Saved {memory.kvSavedMb} MB ({memory.kvSavedPercent}%) vs FP16
            </span>
          </div>

          <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200/80">
            <span className="text-xs font-sans text-slate-500 block">2. Prefix Cache Pinning (n_keep)</span>
            <span className="text-lg font-bold text-slate-900 mt-0.5 block">
              {prefixStats.pinnedTtftMs} ms TTFT
            </span>
            <span className="text-[11px] text-emerald-700 block">
              {runtimeConfig.prefixCachePinningEnabled
                ? `Reuses ${prefixStats.reusedTokensCount} tok (-${prefixStats.ttftSavedMs} ms)`
                : 'Prefix Pinning Disabled'}
            </span>
          </div>

          <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200/80">
            <span className="text-xs font-sans text-slate-500 block">3. GBNF JSON Schema Mask</span>
            <span className="text-lg font-bold text-slate-900 mt-0.5 block">
              {gbnfGrammar.enabled ? `${gbnfGrammar.activeRuleCount} Rules Active` : 'Free Text'}
            </span>
            <span className="text-[11px] text-slate-500 block">
              {gbnfGrammar.enabled ? '100% Syntactic JSON Guaranteed' : 'Unconstrained Logits'}
            </span>
          </div>

          <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200/80">
            <span className="text-xs font-sans text-slate-500 block">4. Big.LITTLE &amp; Thermal Gov</span>
            <span className="text-sm font-bold text-slate-900 mt-1 block">
              {thermalGov.effectiveActiveThreads}/{thermalGov.configuredThreads} Threads · {thermalGov.coreAffinityMask.split(' ')[0]}
            </span>
            <span className="text-[11px] text-emerald-700 block mt-0.5">
              {memory.oomRisk === 'NOMINAL' ? `SAFE RAM (${memory.utilizationPercent}%)` : memory.oomRisk}
            </span>
          </div>
        </div>
      </div>

      {/* Main 2-Column Parameter Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left 6 Cols: Proposal 1 (KV Q4_0 Cache) + Proposal 2 (Single-Slot Prefix Cache Pinning) */}
        <section
          aria-label="Context Length and KV Cache Configuration"
          className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-6"
        >
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Sliders className="w-4 h-4 text-slate-500" />
            <h3 className="text-base font-bold text-slate-900">
              1. KV Q4_0 Quantization Cache &amp; Context Window
            </h3>
          </div>

          {/* Context Length Slider + Step Buttons */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label htmlFor="context-length-slider" className="text-xs font-semibold text-slate-800">
                Context Length (<code className="font-mono">n_ctx</code>)
              </label>
              <span
                data-testid="config-context-display"
                className="text-xs font-mono font-bold text-slate-900 tabular-nums"
              >
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
          </div>

          {/* Proposal 1: KV Cache Quantization Selector (Q4_0 first) */}
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-800 block">
                KV Cache Tensor Quantization (<code className="font-mono">ggml_type_k / ggml_type_v</code>)
              </label>
              <span className="text-xs font-mono text-emerald-700 font-semibold">
                FP16 Baseline: {memory.fp16BaselineKvMb} MB → Now: {memory.kvCacheMb} MB
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(['Q4_0', 'Q8_0', 'FP16'] as KvCacheQuantType[]).map((kvType) => (
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
                    {kvType === 'Q4_0'
                      ? '4-bit (~72% RAM Saved)'
                      : kvType === 'Q8_0'
                        ? '8-bit (~47% RAM Saved)'
                        : '16-bit Uncompressed'}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Proposal 2: Single-Slot KV Prefix Cache Pinning (n_keep) */}
          <div className="space-y-3 pt-4 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-slate-500" />
                <h4 className="text-sm font-bold text-slate-900">
                  2. Single-Slot KV Prefix Cache Pinning (<code className="font-mono">n_keep</code>)
                </h4>
              </div>
              <input
                type="checkbox"
                aria-label="Enable Single-Slot KV Prefix Cache Pinning"
                checked={runtimeConfig.prefixCachePinningEnabled}
                onChange={(e) =>
                  onUpdateConfig({ prefixCachePinningEnabled: e.target.checked })
                }
                className="h-4 w-4 accent-slate-900 cursor-pointer"
              />
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              Retains the previous request&apos;s system prompt and shared token prefix in the single-slot KV cache so external agents don&apos;t re-evaluate identical prompt headers.
            </p>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="pinned-tokens-slider" className="text-xs font-medium text-slate-700">
                  Pinned System Prompt Prefix (<code className="font-mono">n_keep</code>)
                </label>
                <span className="text-xs font-mono font-bold text-slate-900">
                  {runtimeConfig.pinnedSystemTokens} tokens ({prefixStats.cacheHitRatioPercent}% Hit)
                </span>
              </div>
              <input
                id="pinned-tokens-slider"
                type="range"
                min={256}
                max={4096}
                step={256}
                disabled={!runtimeConfig.prefixCachePinningEnabled}
                value={runtimeConfig.pinnedSystemTokens}
                onChange={(e) =>
                  onUpdateConfig({ pinnedSystemTokens: Number(e.target.value) })
                }
                className="w-full accent-slate-900 cursor-pointer"
              />
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
          </div>
        </section>

        {/* Right 6 Cols: Proposal 3 (GBNF JSON Grammar) + Proposal 4 (Adaptive Thermal Governor & Big.LITTLE Pinning) */}
        <section
          aria-label="Hardware Acceleration and Memory Flags"
          className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-6"
        >
          {/* Proposal 3: GBNF Grammar & JSON Schema Enforcement */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Code2 className="w-4 h-4 text-slate-500" />
                <h3 className="text-base font-bold text-slate-900">
                  3. Zero-Overhead GBNF Grammar &amp; JSON Schema Mask
                </h3>
              </div>
              <input
                type="checkbox"
                aria-label="Enable GBNF JSON Schema Grammar Mask"
                checked={runtimeConfig.gbnfJsonGrammarEnabled}
                onChange={(e) =>
                  onUpdateConfig({ gbnfJsonGrammarEnabled: e.target.checked })
                }
                className="h-4 w-4 accent-slate-900 cursor-pointer"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'openai_function_tool_call', label: 'OpenAI Tool Call Schema' },
                { id: 'rag_citation_payload', label: 'RAG Structured Citation JSON' },
              ].map((schema) => (
                <button
                  key={schema.id}
                  type="button"
                  disabled={!runtimeConfig.gbnfJsonGrammarEnabled}
                  onClick={() => onUpdateConfig({ activeGbnfSchemaName: schema.id })}
                  className={`min-h-[38px] px-3 py-2 rounded-lg text-xs font-medium border text-left transition-colors cursor-pointer disabled:opacity-40 ${
                    runtimeConfig.activeGbnfSchemaName === schema.id
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-slate-50 text-slate-800 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {schema.label}
                </button>
              ))}
            </div>

            <pre className="p-3 bg-slate-900 text-slate-100 rounded-lg text-[11px] font-mono whitespace-pre-wrap break-words leading-relaxed">
              {gbnfGrammar.gbnfRuleString}
            </pre>
          </div>

          {/* Proposal 4: Adaptive Thermal Governor & Big.LITTLE Core Pinning */}
          <div className="space-y-3 pt-3 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Flame className="w-4 h-4 text-slate-500" />
                <h3 className="text-base font-bold text-slate-900">
                  4. Adaptive Thermal Governor &amp; Big.LITTLE Core Pinning
                </h3>
              </div>
              <span className="text-xs font-mono font-semibold text-emerald-700">
                Mask: {thermalGov.coreAffinityMask}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="p-3 rounded-lg bg-slate-50 border border-slate-200/80 flex items-start justify-between gap-2 cursor-pointer">
                <div>
                  <span className="text-xs font-semibold text-slate-900 block">
                    Pin Prime + Perf Cores (<code className="font-mono">0xFC</code>)
                  </span>
                  <span className="text-[11px] text-slate-500 block mt-0.5">
                    Excludes Cortex-A520 E-cores via <code className="font-mono">sched_setaffinity()</code>.
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={runtimeConfig.bigLittleCorePinning}
                  onChange={(e) =>
                    onUpdateConfig({ bigLittleCorePinning: e.target.checked })
                  }
                  className="mt-1 h-4 w-4 accent-slate-900 cursor-pointer"
                />
              </label>

              <label className="p-3 rounded-lg bg-slate-50 border border-slate-200/80 flex items-start justify-between gap-2 cursor-pointer">
                <div>
                  <span className="text-xs font-semibold text-slate-900 block">
                    Adaptive Thread Step-Down
                  </span>
                  <span className="text-[11px] text-slate-500 block mt-0.5">
                    Steps down threads near {runtimeConfig.thermalThrottleLimitC}°C to prevent OS thermal cliff.
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={runtimeConfig.adaptiveThermalGovernorEnabled}
                  onChange={(e) =>
                    onUpdateConfig({ adaptiveThermalGovernorEnabled: e.target.checked })
                  }
                  className="mt-1 h-4 w-4 accent-slate-900 cursor-pointer"
                />
              </label>
            </div>

            {/* CPU Threads & GPU Offload Layers */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="cpu-threads-slider" className="text-xs font-semibold text-slate-800">
                    CPU Threads (<code className="font-mono">n_threads</code>)
                  </label>
                  <span className="text-xs font-mono font-bold text-slate-900">
                    {thermalGov.effectiveActiveThreads} active / {runtimeConfig.cpuThreads} max
                  </span>
                </div>
                <input
                  id="cpu-threads-slider"
                  type="range"
                  min={2}
                  max={8}
                  value={runtimeConfig.cpuThreads}
                  onChange={(e) =>
                    onUpdateConfig({ cpuThreads: Number(e.target.value) })
                  }
                  className="w-full accent-slate-900 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
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
              </div>
            </div>

            {/* Execution Backend & mmap */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div>
                <label htmlFor="execution-backend-select" className="text-xs font-semibold text-slate-800 block mb-1">
                  Compute Backend Driver
                </label>
                <select
                  id="execution-backend-select"
                  value={runtimeConfig.backend}
                  onChange={(e) =>
                    onUpdateConfig({ backend: e.target.value as ExecutionBackend })
                  }
                  className="w-full min-h-[38px] px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-900"
                >
                  <option value="Vulkan 1.3 (Adreno / Mali)">
                    Vulkan 1.3 Compute Shader
                  </option>
                  <option value="CPU (ARM NEON / KleidiAI)">
                    ARMv9 CPU Only (NEON + KleidiAI)
                  </option>
                  <option value="Qualcomm QNN (Hexagon NPU)">
                    Qualcomm QNN Hexagon NPU
                  </option>
                </select>
              </div>

              <label className="flex items-center justify-between gap-2 p-3 rounded-lg bg-slate-50 border border-slate-200/80 cursor-pointer">
                <div>
                  <span className="text-xs font-semibold text-slate-900 block">
                    POSIX <code className="font-mono">mmap()</code> &amp; Flash Attn
                  </span>
                  <span className="text-[11px] text-slate-500 block">
                    Zero-copy weight page mapping
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={runtimeConfig.mmapEnabled}
                  onChange={(e) =>
                    onUpdateConfig({ mmapEnabled: e.target.checked })
                  }
                  className="h-4 w-4 accent-slate-900 cursor-pointer"
                />
              </label>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
