import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  HardDrive,
  Sliders,
  Lock,
  Cpu,
} from 'lucide-react';
import {
  INITIAL_GGUF_MODELS,
  DEFAULT_ENGINE_CONFIG,
  calculateMemoryBreakdown,
  estimateThroughput,
  type GgufModelSpec,
  type EngineRuntimeConfig,
  type ActiveConnectionLease,
  type ApiAuditEntry,
  type TelemetrySample,
  type QuantizationType,
} from './utils/ggufEngineLogic';
import { ServerDaemonPanel } from './components/ServerDaemonPanel';
import { ModelVaultPanel } from './components/ModelVaultPanel';
import { ContextRuntimePanel } from './components/ContextRuntimePanel';
import { ApiBridgeMutexPanel } from './components/ApiBridgeMutexPanel';
import { ArchitectureIdeasPanel } from './components/ArchitectureIdeasPanel';

type ActiveSection = 'daemon' | 'models' | 'context' | 'bridge' | 'blueprint';

export default function App() {
  const [activeSection, setActiveSection] = useState<ActiveSection>('daemon');
  const [serverRunning, setServerRunning] = useState<boolean>(true);
  const [models, setModels] = useState<GgufModelSpec[]>(INITIAL_GGUF_MODELS);
  const [runtimeConfig, setRuntimeConfig] = useState<EngineRuntimeConfig>(DEFAULT_ENGINE_CONFIG);
  const [activeLease, setActiveLease] = useState<ActiveConnectionLease | null>(null);
  const [socTempC, setSocTempC] = useState<number>(37.4);
  const [batteryLevelPercent, setBatteryLevelPercent] = useState<number>(86);
  const [stats, setStats] = useState({
    totalRequestsServed: 18,
    totalRejectedMutex: 3,
    totalTokensGenerated: 14820,
  });
  const [auditLogs, setAuditLogs] = useState<ApiAuditEntry[]>([]);
  const [telemetryHistory, setTelemetryHistory] = useState<TelemetrySample[]>([]);
  const [lastProbeResponse, setLastProbeResponse] = useState<{
    status: number;
    clientLabel: string;
    payload: string;
  } | null>(null);

  const activeModel =
    models.find((m) => m.id === runtimeConfig.activeModelId) || models[0];
  const memory = calculateMemoryBreakdown(activeModel, runtimeConfig);
  const throughput = estimateThroughput(
    activeModel,
    runtimeConfig,
    socTempC,
    runtimeConfig.thermalThrottleLimitC
  );

  const fetchEngineState = useCallback(async () => {
    try {
      const res = await fetch('/api/engine/state');
      if (!res.ok) return;
      const data = await res.json();
      setServerRunning(data.serverRunning);
      setModels(data.models);
      setRuntimeConfig(data.runtimeConfig);
      setActiveLease(data.activeLease);
      setSocTempC(data.socTempC);
      setBatteryLevelPercent(data.batteryLevelPercent);
      setStats(data.stats);
      setAuditLogs(data.auditLogs);
      setTelemetryHistory(data.telemetryHistory);
    } catch {
      // Fallback gracefully if polling overlaps restart
    }
  }, []);

  useEffect(() => {
    fetchEngineState();
    const interval = setInterval(fetchEngineState, 1500);
    return () => clearInterval(interval);
  }, [fetchEngineState]);

  const handleUpdateConfig = async (updates: Partial<EngineRuntimeConfig>) => {
    // Optimistic local state update
    setRuntimeConfig((prev) => ({ ...prev, ...updates }));
    try {
      const res = await fetch('/api/engine/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        await fetchEngineState();
      }
    } catch {
      // ignore
    }
  };

  const handleToggleServer = async () => {
    const nextState = !serverRunning;
    setServerRunning(nextState);
    try {
      await fetch('/api/engine/toggle-server', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ running: nextState }),
      });
      await fetchEngineState();
    } catch {
      // ignore
    }
  };

  const handleReleaseMutex = async () => {
    setActiveLease(null);
    try {
      await fetch('/api/engine/release-mutex', { method: 'POST' });
      await fetchEngineState();
    } catch {
      // ignore
    }
  };

  const handleImportModel = async (newModel: {
    name: string;
    filename: string;
    architecture: string;
    parametersBillions: number;
    quantization: QuantizationType;
    fileSizeMb: number;
    maxNativeContext: number;
  }) => {
    try {
      const res = await fetch('/api/engine/models/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newModel),
      });
      if (res.ok) {
        await fetchEngineState();
      }
    } catch {
      // ignore
    }
  };

  const handleClearLogs = async () => {
    setAuditLogs([]);
    try {
      await fetch('/api/engine/clear-logs', { method: 'POST' });
    } catch {
      // ignore
    }
  };

  const handleFireApiProbe = async (options: {
    endpoint: '/v1/chat/completions' | '/v1/models' | '/v1/embeddings';
    clientLabel: string;
    holdMs?: number;
    asyncHold?: boolean;
  }) => {
    try {
      const isGet = options.endpoint === '/v1/models';
      const res = await fetch(options.endpoint, {
        method: isGet ? 'GET' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${runtimeConfig.bearerToken}`,
          'X-Client-Agent': options.clientLabel,
          'X-Client-IP': runtimeConfig.bindAddress === '127.0.0.1' ? '127.0.0.1' : '192.168.1.42',
        },
        body: isGet
          ? undefined
          : JSON.stringify({
              model: activeModel.id,
              messages: [
                {
                  role: 'user',
                  content: 'Execute local GGUF inference completion via single-connection bridge.',
                },
              ],
              hold_mutex_ms: options.holdMs ?? 4500,
              async_hold: options.asyncHold ?? true,
            }),
      });

      const data = await res.json();
      setLastProbeResponse({
        status: res.status,
        clientLabel: options.clientLabel,
        payload: JSON.stringify(data, null, 2),
      });
      await fetchEngineState();
    } catch (err) {
      setLastProbeResponse({
        status: 500,
        clientLabel: options.clientLabel,
        payload: String(err),
      });
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-20 md:pb-12">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200 px-6 py-3.5 flex items-center justify-between gap-8">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#daemon"
          onClick={(e) => {
            e.preventDefault();
            setActiveSection('daemon');
          }}
          className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
        >
          PocketGGUF
        </a>

        {/* Zone 2: 5 concise single-line text navigation links */}
        <nav
          aria-label="Primary Navigation"
          className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600"
        >
          <a
            href="#daemon"
            onClick={(e) => {
              e.preventDefault();
              setActiveSection('daemon');
            }}
            className={`transition-colors whitespace-nowrap shrink-0 py-1 ${
              activeSection === 'daemon'
                ? 'text-slate-900 font-semibold underline underline-offset-8 decoration-2'
                : 'hover:text-slate-900'
            }`}
          >
            Telemetry
          </a>
          <a
            href="#models"
            onClick={(e) => {
              e.preventDefault();
              setActiveSection('models');
            }}
            className={`transition-colors whitespace-nowrap shrink-0 py-1 ${
              activeSection === 'models'
                ? 'text-slate-900 font-semibold underline underline-offset-8 decoration-2'
                : 'hover:text-slate-900'
            }`}
          >
            Models
          </a>
          <a
            href="#context"
            onClick={(e) => {
              e.preventDefault();
              setActiveSection('context');
            }}
            className={`transition-colors whitespace-nowrap shrink-0 py-1 ${
              activeSection === 'context'
                ? 'text-slate-900 font-semibold underline underline-offset-8 decoration-2'
                : 'hover:text-slate-900'
            }`}
          >
            Context
          </a>
          <a
            href="#bridge"
            onClick={(e) => {
              e.preventDefault();
              setActiveSection('bridge');
            }}
            className={`transition-colors whitespace-nowrap shrink-0 py-1 ${
              activeSection === 'bridge'
                ? 'text-slate-900 font-semibold underline underline-offset-8 decoration-2'
                : 'hover:text-slate-900'
            }`}
          >
            API Bridge
          </a>
          <a
            href="#blueprint"
            onClick={(e) => {
              e.preventDefault();
              setActiveSection('blueprint');
            }}
            className={`transition-colors whitespace-nowrap shrink-0 py-1 ${
              activeSection === 'blueprint'
                ? 'text-slate-900 font-semibold underline underline-offset-8 decoration-2'
                : 'hover:text-slate-900'
            }`}
          >
            Architecture
          </a>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={handleToggleServer}
            className={`min-h-[40px] px-4 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              serverRunning
                ? 'bg-slate-900 text-white hover:bg-slate-800'
                : 'bg-emerald-600 text-white hover:bg-emerald-700'
            }`}
          >
            {serverRunning ? `Listening :${runtimeConfig.port}` : 'Start Server'}
          </button>
        </div>
      </header>

      {/* Main Content Workspace */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-6">
        {activeSection === 'daemon' && (
          <ServerDaemonPanel
            serverRunning={serverRunning}
            activeModel={activeModel}
            runtimeConfig={runtimeConfig}
            memory={memory}
            throughput={throughput}
            activeLease={activeLease}
            socTempC={socTempC}
            batteryLevelPercent={batteryLevelPercent}
            stats={stats}
            telemetryHistory={telemetryHistory}
            onToggleServer={handleToggleServer}
            onReleaseMutex={handleReleaseMutex}
            onTriggerTestConnection={(clientAgent, holdMs) => {
              handleFireApiProbe({
                endpoint: '/v1/chat/completions',
                clientLabel: clientAgent,
                holdMs,
                asyncHold: true,
              });
            }}
          />
        )}

        {activeSection === 'models' && (
          <ModelVaultPanel
            models={models}
            activeModelId={runtimeConfig.activeModelId}
            runtimeConfig={runtimeConfig}
            onSelectModel={(modelId) => handleUpdateConfig({ activeModelId: modelId })}
            onImportModel={handleImportModel}
          />
        )}

        {activeSection === 'context' && (
          <ContextRuntimePanel
            activeModel={activeModel}
            runtimeConfig={runtimeConfig}
            memory={memory}
            throughput={throughput}
            onUpdateConfig={handleUpdateConfig}
          />
        )}

        {activeSection === 'bridge' && (
          <ApiBridgeMutexPanel
            serverRunning={serverRunning}
            activeModel={activeModel}
            runtimeConfig={runtimeConfig}
            activeLease={activeLease}
            auditLogs={auditLogs}
            lastProbeResponse={lastProbeResponse}
            onUpdateConfig={handleUpdateConfig}
            onReleaseMutex={handleReleaseMutex}
            onClearLogs={handleClearLogs}
            onFireApiProbe={handleFireApiProbe}
          />
        )}

        {activeSection === 'blueprint' && (
          <ArchitectureIdeasPanel
            runtimeConfig={runtimeConfig}
            onUpdateConfig={handleUpdateConfig}
          />
        )}
      </main>

      {/* Mobile Bottom Navigation Bar (Android Touch Ergonomics, <= 15% viewport height) */}
      <nav
        aria-label="Mobile Bottom Navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 grid grid-cols-5 items-center h-14 px-1"
      >
        <button
          type="button"
          onClick={() => setActiveSection('daemon')}
          className={`min-h-[44px] flex flex-col items-center justify-center cursor-pointer ${
            activeSection === 'daemon' ? 'text-slate-900 font-semibold' : 'text-slate-500'
          }`}
        >
          <Activity className="w-4 h-4" />
          <span className="text-[10px] mt-0.5">Telemetry</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('models')}
          className={`min-h-[44px] flex flex-col items-center justify-center cursor-pointer ${
            activeSection === 'models' ? 'text-slate-900 font-semibold' : 'text-slate-500'
          }`}
        >
          <HardDrive className="w-4 h-4" />
          <span className="text-[10px] mt-0.5">Models</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('context')}
          className={`min-h-[44px] flex flex-col items-center justify-center cursor-pointer ${
            activeSection === 'context' ? 'text-slate-900 font-semibold' : 'text-slate-500'
          }`}
        >
          <Sliders className="w-4 h-4" />
          <span className="text-[10px] mt-0.5">Context</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('bridge')}
          className={`min-h-[44px] flex flex-col items-center justify-center cursor-pointer ${
            activeSection === 'bridge' ? 'text-slate-900 font-semibold' : 'text-slate-500'
          }`}
        >
          <Lock className="w-4 h-4" />
          <span className="text-[10px] mt-0.5">API Bridge</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('blueprint')}
          className={`min-h-[44px] flex flex-col items-center justify-center cursor-pointer ${
            activeSection === 'blueprint' ? 'text-slate-900 font-semibold' : 'text-slate-500'
          }`}
        >
          <Cpu className="w-4 h-4" />
          <span className="text-[10px] mt-0.5">Ideas</span>
        </button>
      </nav>
    </div>
  );
}
