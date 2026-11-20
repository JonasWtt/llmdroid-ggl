import React, { useRef } from 'react';
import {
  Cpu,
  HardDrive,
  Lock,
  Unlock,
  Play,
  Square,
  Flame,
  BatteryCharging,
  ShieldCheck,
  AlertTriangle,
  WifiOff,
  Radio,
  PauseCircle,
  Zap,
  FolderOpen,
} from 'lucide-react';
import type {
  GgufModelSpec,
  EngineRuntimeConfig,
  MemoryBreakdown,
  ActiveConnectionLease,
  TelemetrySample,
} from '../utils/ggufEngineLogic';

interface ServerDaemonPanelProps {
  serverRunning: boolean;
  activeModel: GgufModelSpec;
  runtimeConfig: EngineRuntimeConfig;
  memory: MemoryBreakdown;
  throughput: { promptEvalTps: number; tokenGenTps: number; thermalThrottled: boolean };
  activeLease: ActiveConnectionLease | null;
  socTempC: number;
  batteryLevelPercent: number;
  stats: {
    totalRequestsServed: number;
    totalRejectedMutex: number;
    totalTokensGenerated: number;
  };
  telemetryHistory: TelemetrySample[];
  selfApiTestLoading: boolean;
  selfApiTestResult: {
    status: number;
    modelId: string;
    answer: string;
    latencyMs: number;
  } | null;
  onToggleServer: () => void;
  onReleaseMutex: () => void;
  onRunSelfApiTest: () => Promise<void>;
  onSelectLocalGgufFile: (file: File, replaceStubs: boolean) => Promise<void>;
  onTriggerTestConnection: (clientAgent: string, holdMs: number) => void;
}

export const ServerDaemonPanel: React.FC<ServerDaemonPanelProps> = ({
  serverRunning,
  activeModel,
  runtimeConfig,
  memory,
  throughput,
  activeLease,
  socTempC,
  batteryLevelPercent,
  stats,
  telemetryHistory,
  selfApiTestLoading,
  selfApiTestResult,
  onToggleServer,
  onReleaseMutex,
  onRunSelfApiTest,
  onSelectLocalGgufFile,
  onTriggerTestConnection,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const weightsPct = Math.round((memory.weightsMb / memory.availableForEngineMb) * 100);
  const kvPct = Math.round((memory.kvCacheMb / memory.availableForEngineMb) * 100);
  const computePct = Math.round((memory.computeBufferMb / memory.availableForEngineMb) * 100);

  return (
    <div className="space-y-6">
      {/* Top Daemon Status & Single-Connection Mutex Banner */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left 7 Cols: Server Daemon & Endpoint Control */}
        <section
          aria-label="OpenAI API Daemon Control"
          className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between"
        >
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".gguf,*/*"
              aria-label="Select local GGUF file from device"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  onSelectLocalGgufFile(file, true);
                  e.target.value = '';
                }
              }}
            />

            <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div>
                <div className="flex items-center gap-2 text-xs font-mono font-bold">
                  {serverRunning ? (
                    <span className="text-emerald-700 flex items-center gap-1.5">
                      <Radio className="w-3.5 h-3.5" />
                      MODEL ACTIVELY SERVING LIVE
                    </span>
                  ) : (
                    <span className="text-amber-700 flex items-center gap-1.5">
                      <PauseCircle className="w-3.5 h-3.5" />
                      SERVER STOPPED (MODEL IN STANDBY)
                    </span>
                  )}
                </div>
                <h2 className="text-xl font-bold text-slate-900 mt-0.5">
                  {serverRunning
                    ? `Listening on http://${runtimeConfig.bindAddress}:${runtimeConfig.port}/v1`
                    : 'Local Inference Daemon Stopped'}
                </h2>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="min-h-[44px] px-3.5 py-2 rounded-lg text-xs font-semibold bg-white border border-slate-300 text-slate-900 hover:bg-slate-50 flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  Select .GGUF File
                </button>

                <button
                  type="button"
                  onClick={onRunSelfApiTest}
                  disabled={selfApiTestLoading}
                  className="min-h-[44px] px-3.5 py-2 rounded-lg text-xs font-semibold bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-40 flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Zap className="w-3.5 h-3.5" />
                  {selfApiTestLoading ? 'Testing API...' : 'Self API Functionality Test'}
                </button>

                <button
                  type="button"
                  onClick={onToggleServer}
                  className={`min-h-[44px] px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    serverRunning
                      ? 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100'
                      : 'bg-emerald-600 text-white hover:bg-emerald-700'
                  }`}
                >
                  {serverRunning ? (
                    <>
                      <Square className="w-3.5 h-3.5 fill-current" />
                      Stop API Server
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 fill-current" />
                      Start API Server
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Active Model & Runtime Metadata */}
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <span className="text-xs text-slate-500 block">
                  {serverRunning ? 'Serving GGUF Model' : 'Mounted Standby Model'}
                </span>
                <span className="text-sm font-semibold text-slate-900 block truncate mt-0.5">
                  {activeModel.name}
                </span>
                <span className="text-xs font-mono text-slate-600">
                  Client ID: <strong>{activeModel.id}</strong>
                </span>
              </div>

              <div>
                <span className="text-xs text-slate-500 block">Context &amp; KV Q4_0 Cache</span>
                <span className="text-sm font-semibold font-mono tabular-nums text-slate-900 block mt-0.5">
                  {runtimeConfig.contextLength.toLocaleString()} tokens
                </span>
                <span className="text-xs font-mono text-emerald-700 font-semibold">
                  KV {runtimeConfig.kvCacheQuant} (Saved {memory.kvSavedMb} MB)
                </span>
              </div>

              <div>
                <span className="text-xs text-slate-500 block">Execution &amp; Prefix Cache</span>
                <span className="text-sm font-semibold text-slate-900 block truncate mt-0.5">
                  {runtimeConfig.backend.split(' ')[0]} · Mask 0xFC
                </span>
                <span className="text-xs font-mono text-slate-500">
                  n_keep: {runtimeConfig.pinnedSystemTokens} tok · GBNF: {runtimeConfig.gbnfJsonGrammarEnabled ? 'ON' : 'OFF'}
                </span>
              </div>
            </div>

            {/* Self API Test Output Box if triggered */}
            {selfApiTestResult && (
              <div
                data-testid="daemon-self-test-result"
                className="mt-4 p-3.5 bg-slate-900 text-slate-100 rounded-lg font-mono text-xs space-y-1"
              >
                <div className="flex items-center justify-between text-slate-400 border-b border-slate-800 pb-1.5">
                  <span>Self API Test · model=&quot;{selfApiTestResult.modelId}&quot;</span>
                  <span
                    className={
                      selfApiTestResult.status === 200
                        ? 'text-emerald-400 font-bold'
                        : 'text-amber-400 font-bold'
                    }
                  >
                    HTTP {selfApiTestResult.status} ({selfApiTestResult.latencyMs} ms)
                  </span>
                </div>
                <div className="text-emerald-300 font-semibold pt-1">Model Answer:</div>
                <pre className="text-[11px] whitespace-pre-wrap break-words leading-relaxed">
                  {selfApiTestResult.answer}
                </pre>
              </div>
            )}
          </div>

          {/* Privacy & Offline Guarantees Row */}
          <div className="mt-6 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
            <div className="flex flex-wrap items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Zero-Egress Sandbox</span>
              <span aria-hidden="true">·</span>
              <WifiOff className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <span>
                {runtimeConfig.bindAddress === '127.0.0.1'
                  ? 'Loopback Only (127.0.0.1)'
                  : 'LAN Bridge Active (0.0.0.0)'}
              </span>
              <span aria-hidden="true">·</span>
              <span>No Chat UI Overhead</span>
            </div>
            <span className="font-mono text-slate-500">
              SHA256: {activeModel.sha256Prefix}
            </span>
          </div>
        </section>

        {/* Right 5 Cols: Strict Single-Connection Mutex Gate */}
        <section
          aria-label="Single-Connection Mutex Arbiter"
          className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between gap-2 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                {activeLease ? (
                  <Lock className="w-4 h-4 text-amber-600 shrink-0" />
                ) : (
                  <Unlock className="w-4 h-4 text-emerald-600 shrink-0" />
                )}
                <h3 className="text-base font-bold text-slate-900">
                  Single-Connection Mutex Gate
                </h3>
              </div>
              <span
                data-testid="mutex-status-label"
                className={`text-xs font-mono font-semibold ${
                  !serverRunning
                    ? 'text-slate-400'
                    : activeLease
                      ? 'text-amber-700'
                      : 'text-emerald-700'
                }`}
              >
                {!serverRunning
                  ? 'OFFLINE'
                  : activeLease
                    ? '1 / 1 SLOT LOCKED'
                    : '0 / 1 SLOT AVAILABLE'}
              </span>
            </div>

            {activeLease ? (
              <div className="mt-4 bg-amber-50/70 border border-amber-200 rounded-lg p-3.5 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-amber-900">
                    Active Lease: {activeLease.leaseId}
                  </span>
                  <span className="font-mono text-amber-800">
                    {activeLease.status}
                  </span>
                </div>
                <div className="text-xs text-amber-900 font-mono space-y-1">
                  <div>Client: {activeLease.clientIp} · {activeLease.userAgent}</div>
                  <div>
                    Prompt: {activeLease.promptTokens} tok · Generated: {activeLease.generatedTokens} tok
                  </div>
                </div>
                <div className="pt-1 flex items-center justify-between">
                  <span className="text-[11px] text-amber-800">
                    Concurrent requests immediately return HTTP 429
                  </span>
                  <button
                    type="button"
                    onClick={onReleaseMutex}
                    className="px-2.5 py-1 bg-white border border-amber-300 text-amber-900 rounded text-xs font-medium hover:bg-amber-100 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    Force Release Lease
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-4 space-y-2">
                <p className="text-xs text-slate-600 leading-relaxed">
                  Strict single-concurrency mode (<code className="font-mono">max_connections = 1</code>).
                  Only one external application can hold the KV cache and tensor compute pipeline at a time.
                </p>
                <div className="flex items-center gap-4 text-xs font-mono text-slate-600 pt-1">
                  <span>Served: {stats.totalRequestsServed}</span>
                  <span aria-hidden="true">·</span>
                  <span>Rejected (429): {stats.totalRejectedMutex}</span>
                  <span aria-hidden="true">·</span>
                  <span>Tokens: {stats.totalTokensGenerated.toLocaleString()}</span>
                </div>
              </div>
            )}
          </div>

          {/* Quick Concurrency Verification Trigger */}
          <div className="mt-5 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-500">
              Test Mutex Behavior:
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={!serverRunning}
                onClick={() => onTriggerTestConnection('Continue.dev/1.0 (Client A)', 5000)}
                className="min-h-[40px] px-3 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-medium hover:bg-slate-800 disabled:opacity-40 transition-colors cursor-pointer whitespace-nowrap"
              >
                Acquire 5s Stream (Client A)
              </button>
              <button
                type="button"
                disabled={!serverRunning}
                onClick={() => onTriggerTestConnection('Cursor-Agent/0.45 (Client B)', 2000)}
                className="min-h-[40px] px-3 py-1.5 bg-slate-100 text-slate-800 border border-slate-200 rounded-lg text-xs font-medium hover:bg-slate-200 disabled:opacity-40 transition-colors cursor-pointer whitespace-nowrap"
              >
                Attempt Parallel Call (Client B)
              </button>
            </div>
          </div>
        </section>
      </div>

      {/* 4-Column Hardware & Performance KPI Row */}
      <section aria-label="System Performance Metrics" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Prompt Eval & Generation Speed */}
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Token Generation Speed</span>
            <Cpu className="w-4 h-4 text-slate-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span
              data-testid="metric-token-gen-tps"
              className="text-2xl font-bold font-mono tabular-nums text-slate-900"
            >
              {serverRunning ? throughput.tokenGenTps.toFixed(1) : '0.0'}
            </span>
            <span className="text-xs font-mono text-slate-500">tok/s (TG)</span>
          </div>
          <div className="mt-2 text-xs text-slate-500 font-mono tabular-nums">
            Prompt Eval (PP): {serverRunning ? throughput.promptEvalTps.toFixed(1) : '0.0'} tok/s
          </div>
        </div>

        {/* Card 2: Physical Memory Footprint */}
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>GGUF Memory Allocation</span>
            <HardDrive className="w-4 h-4 text-slate-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span
              data-testid="metric-total-ram-mb"
              className="text-2xl font-bold font-mono tabular-nums text-slate-900"
            >
              {(memory.totalAllocatedMb / 1024).toFixed(2)} GB
            </span>
            <span className="text-xs font-mono text-slate-500">
              / {(memory.availableForEngineMb / 1024).toFixed(1)} GB ceiling
            </span>
          </div>
          <div className="mt-2 text-xs font-mono tabular-nums flex items-center gap-1.5">
            {memory.oomRisk === 'CRITICAL_OOM' ? (
              <span className="text-red-700 font-semibold flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                OOM Risk ({memory.utilizationPercent}%)
              </span>
            ) : (
              <span className="text-slate-500">
                KV Cache: {memory.kvCacheMb} MB ({memory.utilizationPercent}% used)
              </span>
            )}
          </div>
        </div>

        {/* Card 3: SoC Thermal Junction */}
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Android SoC Thermal Sensor</span>
            <Flame className="w-4 h-4 text-slate-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tabular-nums text-slate-900">
              {socTempC.toFixed(1)}°C
            </span>
            <span className="text-xs font-mono text-slate-500">
              Limit {runtimeConfig.thermalThrottleLimitC}°C
            </span>
          </div>
          <div className="mt-2 text-xs font-mono">
            {throughput.thermalThrottled ? (
              <span className="text-amber-700 font-semibold">
                Thermal Governor Active (Reduced Clocks)
              </span>
            ) : (
              <span className="text-emerald-700">
                Nominal Sustained Clock Envelope
              </span>
            )}
          </div>
        </div>

        {/* Card 4: Power & WakeLock */}
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Power & WakeLock Status</span>
            <BatteryCharging className="w-4 h-4 text-slate-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tabular-nums text-slate-900">
              {activeLease ? '6.8 W' : serverRunning ? '1.1 W' : '0.3 W'}
            </span>
            <span className="text-xs font-mono text-slate-500">
              Battery {batteryLevelPercent}%
            </span>
          </div>
          <div className="mt-2 text-xs text-slate-500 font-mono">
            {runtimeConfig.wakeLockEnabled
              ? 'PARTIAL_WAKE_LOCK Held'
              : 'Doze Standby Permitted'}
          </div>
        </div>
      </section>

      {/* Memory Allocation Bar & Real-Time Telemetry Table */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left 6 Cols: Unified Memory Breakdown */}
        <section
          aria-label="Unified Memory Breakdown"
          className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6"
        >
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                LPDDR5X Unified Memory Allocation
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Device Total: {(memory.deviceRamTotalMb / 1024).toFixed(0)} GB · Android OS Reserved: {(memory.osReservedMb / 1024).toFixed(1)} GB
              </p>
            </div>
            <span className="text-xs font-mono font-semibold text-slate-700">
              {memory.totalAllocatedMb.toLocaleString()} / {memory.availableForEngineMb.toLocaleString()} MB
            </span>
          </div>

          {/* Stacked Bar */}
          <div className="mt-4 h-4 w-full bg-slate-100 rounded-lg overflow-hidden flex border border-slate-200">
            <div
              style={{ width: `${Math.min(100, weightsPct)}%` }}
              className="bg-slate-800 h-full transition-all duration-200"
              title={`Model Weights: ${memory.weightsMb} MB`}
            />
            <div
              style={{ width: `${Math.min(100 - weightsPct, kvPct)}%` }}
              className="bg-emerald-600 h-full transition-all duration-200"
              title={`KV Context Cache: ${memory.kvCacheMb} MB`}
            />
            <div
              style={{ width: `${Math.min(100 - weightsPct - kvPct, computePct)}%` }}
              className="bg-amber-500 h-full transition-all duration-200"
              title={`Compute Scratch Buffer: ${memory.computeBufferMb} MB`}
            />
          </div>

          {/* Legend & Exact Figures */}
          <div className="mt-4 grid grid-cols-3 gap-4 pt-3 border-t border-slate-100 text-xs">
            <div>
              <div className="flex items-center gap-1.5 text-slate-600 font-medium">
                <span className="w-2.5 h-2.5 rounded-xs bg-slate-800 inline-block" />
                GGUF Weights {runtimeConfig.mmapEnabled ? '(mmap)' : '(resident)'}
              </div>
              <div className="font-mono font-semibold text-slate-900 mt-1 tabular-nums">
                {memory.weightsMb.toLocaleString()} MB ({weightsPct}%)
              </div>
            </div>

            <div>
              <div className="flex items-center gap-1.5 text-slate-600 font-medium">
                <span className="w-2.5 h-2.5 rounded-xs bg-emerald-600 inline-block" />
                KV Context ({runtimeConfig.kvCacheQuant})
              </div>
              <div className="font-mono font-semibold text-slate-900 mt-1 tabular-nums">
                {memory.kvCacheMb.toLocaleString()} MB ({kvPct}%)
              </div>
            </div>

            <div>
              <div className="flex items-center gap-1.5 text-slate-600 font-medium">
                <span className="w-2.5 h-2.5 rounded-xs bg-amber-500 inline-block" />
                Compute Scratch
              </div>
              <div className="font-mono font-semibold text-slate-900 mt-1 tabular-nums">
                {memory.computeBufferMb.toLocaleString()} MB ({computePct}%)
              </div>
            </div>
          </div>
        </section>

        {/* Right 6 Cols: Recent Hardware Telemetry Stream */}
        <section
          aria-label="Recent Hardware Telemetry Samples"
          className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6"
        >
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Real-Time Hardware Telemetry Stream
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Sampled every 2.0s from Android ThermalHAL &amp; /proc/meminfo
              </p>
            </div>
            <Radio className="w-4 h-4 text-slate-400" />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 font-medium">Time</th>
                  <th className="py-2 font-medium text-right">Prompt (PP)</th>
                  <th className="py-2 font-medium text-right">Eval (TG)</th>
                  <th className="py-2 font-medium text-right">RAM Used</th>
                  <th className="py-2 font-medium text-right">SoC Temp</th>
                  <th className="py-2 font-medium text-right">Power</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                {telemetryHistory.slice(-5).reverse().map((sample, i) => (
                  <tr key={`${sample.timestamp}-${i}`} className="hover:bg-slate-50">
                    <td className="py-2 text-slate-600">
                      {new Date(sample.timestamp).toLocaleTimeString([], {
                        hour12: false,
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </td>
                    <td className="py-2 text-right text-slate-900">
                      {sample.promptEvalTps.toFixed(1)} t/s
                    </td>
                    <td className="py-2 text-right font-semibold text-emerald-700">
                      {sample.tokenGenTps.toFixed(1)} t/s
                    </td>
                    <td className="py-2 text-right text-slate-700">
                      {sample.ramUsedMb.toLocaleString()} MB
                    </td>
                    <td className="py-2 text-right text-slate-700">
                      {sample.socTempC.toFixed(1)}°C
                    </td>
                    <td className="py-2 text-right text-slate-700">
                      {sample.batteryDrainWatts.toFixed(1)} W
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
};
