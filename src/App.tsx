import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  HardDrive,
  Sliders,
  Lock,
  MessageSquare,
} from 'lucide-react';
import {
  INITIAL_GGUF_MODELS,
  DEFAULT_ENGINE_CONFIG,
  calculateMemoryBreakdown,
  estimateThroughput,
  inspectRawGgufHeaderBytes,
  diagnoseModelLoadAndRuntime,
  type GgufModelSpec,
  type EngineRuntimeConfig,
  type ActiveConnectionLease,
  type ApiAuditEntry,
  type TelemetrySample,
  type QuantizationType,
  type AutoFixActionType,
} from './utils/ggufEngineLogic';
import { ServerDaemonPanel } from './components/ServerDaemonPanel';
import { ModelVaultPanel } from './components/ModelVaultPanel';
import { ContextRuntimePanel } from './components/ContextRuntimePanel';
import { ApiBridgeMutexPanel } from './components/ApiBridgeMutexPanel';
import {
  LocalModelChatPanel,
  type ChatTurnMessage,
} from './components/LocalModelChatPanel';
import {
  ModelLoadDiagnosticBanner,
  type FaultSimulationPreset,
} from './components/ModelLoadDiagnosticBanner';

type ActiveSection = 'daemon' | 'models' | 'context' | 'bridge' | 'chat';

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

  const [selfApiTestLoading, setSelfApiTestLoading] = useState<boolean>(false);
  const [selfApiTestResult, setSelfApiTestResult] = useState<{
    status: number;
    modelId: string;
    answer: string;
    latencyMs: number;
  } | null>(null);

  const [chatMessages, setChatMessages] = useState<ChatTurnMessage[]>([]);
  const [chatSending, setChatSending] = useState<boolean>(false);
  const [activeFaultPreset, setActiveFaultPreset] =
    useState<FaultSimulationPreset>('NONE');

  const rawActiveModel =
    models.find((m) => m.id === runtimeConfig.activeModelId);
  const activeModel = rawActiveModel || models[0];

  const effectiveModelForDiag: GgufModelSpec | null = (() => {
    if (activeFaultPreset === 'INVALID_HTML_HEADER' && activeModel) {
      return {
        ...activeModel,
        filename: 'DeepSeek-V4-Pro-Qwen3.5-9B-UNCENSORED.gguf',
        headerVerified: false,
        magicSignatureHex: '0x3C 0x21 0x44 0x4F ("<!DO")',
        detectedNonGgufFormat:
          'HTML Web Page (likely a HuggingFace / browser login or redirect page saved as .gguf)',
      };
    }
    if (activeFaultPreset === 'OOM_RAM_EXCEEDED' && activeModel) {
      return {
        ...activeModel,
        name: 'DeepSeek-V4-Pro-Qwen3.5-9B-UNCENSORED-heretic-Q4_K_M',
        filename: 'DeepSeek-V4-Pro-Qwen3.5-9B-UNCENSORED-heretic-Q4_K_M.gguf',
        parametersBillions: 9.0,
        fileSizeMb: 5832,
        headerVerified: true,
        ggufVersion: 3,
        tensorCount: 339,
        kvMetaCount: 28,
      };
    }
    return rawActiveModel || null;
  })();

  const effectiveConfigForDiag: EngineRuntimeConfig =
    activeFaultPreset === 'OOM_RAM_EXCEEDED'
      ? {
          ...runtimeConfig,
          contextLength: 32768,
          kvCacheQuant: 'FP16',
          mmapEnabled: false,
        }
      : runtimeConfig;

  const memory = calculateMemoryBreakdown(
    effectiveModelForDiag || activeModel,
    effectiveConfigForDiag
  );

  const diagnosticReport = diagnoseModelLoadAndRuntime({
    model: effectiveModelForDiag,
    config: effectiveConfigForDiag,
    memory,
    serverRunning,
    activeLease,
    safDescriptorError:
      activeFaultPreset === 'SAF_PERMISSION_EXPIRED'
        ? 'SecurityException: Permission Denial: opening provider com.android.providers.downloads.documents from ProcessRecord requires that you obtain access using ACTION_OPEN_DOCUMENT'
        : null,
    portBindError:
      activeFaultPreset === 'PORT_CONFLICT'
        ? `java.net.BindException: Address already in use (127.0.0.1:${runtimeConfig.port})`
        : null,
  });

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
    replaceStubs?: boolean;
    storagePath?: string;
    ggufVersion?: number;
    tensorCount?: number;
    kvMetaCount?: number;
    headerVerified?: boolean;
    magicSignatureHex?: string;
    detectedNonGgufFormat?: string;
    isSplitShard?: boolean;
  }) => {
    try {
      setActiveFaultPreset('NONE');
      const res = await fetch('/api/engine/models/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newModel),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.model?.id) {
          navigator.clipboard?.writeText(data.model.id).catch(() => {});
        }
        await fetchEngineState();
      }
    } catch {
      // ignore
    }
  };

  const handleSelectLocalGgufFile = async (file: File, replaceStubs: boolean) => {
    let ggufHeaderTag = '';
    let headerInspection = {
      headerVerified: false,
      ggufVersion: 0,
      tensorCount: 0,
      kvMetaCount: 0,
      magicSignatureHex: 'UNREAD',
      detectedNonGgufFormat: undefined as string | undefined,
      isSplitShard: false,
    };

    try {
      const sliceBuffer = await file.slice(0, 24).arrayBuffer();
      const rawBytes = new Uint8Array(sliceBuffer);
      const inspected = inspectRawGgufHeaderBytes(
        rawBytes,
        file.name,
        file.size
      );
      headerInspection = {
        headerVerified: inspected.headerVerified,
        ggufVersion: inspected.ggufVersion,
        tensorCount: inspected.tensorCount,
        kvMetaCount: inspected.kvMetaCount,
        magicSignatureHex: inspected.magicSignatureHex,
        detectedNonGgufFormat: inspected.detectedNonGgufFormat,
        isSplitShard: inspected.isSplitShard,
      };
      if (inspected.headerVerified) {
        ggufHeaderTag = ` (GGUF v${inspected.ggufVersion})`;
      }
    } catch {
      // ignore header slice read error
    }

    const upperName = file.name.toUpperCase();
    const inferredQuant: QuantizationType = upperName.includes('IQ4_XS')
      ? 'IQ4_XS'
      : upperName.includes('Q5_K_M')
        ? 'Q5_K_M'
        : upperName.includes('Q8_0')
          ? 'Q8_0'
          : upperName.includes('F16') || upperName.includes('FP16')
            ? 'FP16'
            : 'Q4_K_M';

    const lowerName = file.name.toLowerCase();
    const inferredArch = lowerName.includes('qwen')
      ? 'qwen2'
      : lowerName.includes('gemma')
        ? 'gemma2'
        : lowerName.includes('phi')
          ? 'phi3'
          : 'llama';

    const sizeMb = Math.max(0, Math.round(file.size / (1024 * 1024)));
    const paramMatch = file.name.match(/(\d+(?:\.\d+)?)\s*[bB]/);
    const inferredParams = paramMatch
      ? parseFloat(paramMatch[1])
      : Math.max(0.5, +(Math.max(1, sizeMb) / 650).toFixed(1));

    const cleanDisplayName =
      file.name.replace(/\.gguf$/i, '').replace(/[-_]+/g, ' ') + ggufHeaderTag;

    await handleImportModel({
      name: cleanDisplayName,
      filename: file.name.endsWith('.gguf') ? file.name : `${file.name}.gguf`,
      architecture: inferredArch,
      parametersBillions: inferredParams,
      quantization: inferredQuant,
      fileSizeMb: sizeMb,
      maxNativeContext: 32768,
      replaceStubs,
      storagePath: `/storage/emulated/0/Download/${file.name}`,
      ggufVersion: headerInspection.ggufVersion,
      tensorCount: headerInspection.tensorCount,
      kvMetaCount: headerInspection.kvMetaCount,
      headerVerified: headerInspection.headerVerified,
      magicSignatureHex: headerInspection.magicSignatureHex,
      detectedNonGgufFormat: headerInspection.detectedNonGgufFormat,
      isSplitShard: headerInspection.isSplitShard,
    });
  };

  const handleApplyAutoFix = async (action: AutoFixActionType) => {
    setActiveFaultPreset('NONE');
    if (action === 'APPLY_LOW_RAM_SAFE_PROFILE') {
      await handleUpdateConfig({
        contextLength: 2048,
        kvCacheQuant: 'Q4_0',
        mmapEnabled: true,
        batchSize: 256,
      });
    } else if (action === 'PICK_GGUF_FILE' || action === 'SCAN_GGUF_FOLDER') {
      setActiveSection('models');
    } else if (action === 'SWITCH_FALLBACK_PORT') {
      const nextPort = runtimeConfig.port === 8080 ? 8081 : 8080;
      await handleUpdateConfig({ port: nextPort });
      if (!serverRunning) {
        await handleToggleServer();
      }
    } else if (action === 'START_LOCAL_SERVER') {
      if (!serverRunning) {
        await handleToggleServer();
      }
    } else if (action === 'FORCE_RELEASE_MUTEX') {
      await handleReleaseMutex();
    }
  };

  const handleRemoveModel = async (modelId: string) => {
    try {
      const res = await fetch('/api/engine/models/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId }),
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

  const handleRunSelfApiTest = async () => {
    setSelfApiTestLoading(true);
    const t0 = Date.now();
    try {
      const res = await fetch('/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${runtimeConfig.bearerToken}`,
          'X-Client-Agent': 'PocketGGUF-Self-API-Test',
          'X-Client-IP': '127.0.0.1',
        },
        body: JSON.stringify({
          model: activeModel.id,
          messages: [
            {
              role: 'user',
              content:
                'Self-test diagnostic: confirm GGUF model readiness and active single-slot optimizations.',
            },
          ],
          async_hold: false,
          hold_mutex_ms: 120,
        }),
      });

      const latencyMs = Math.max(1, Date.now() - t0);
      const data = await res.json();
      const answerText =
        data?.choices?.[0]?.message?.content ||
        data?.error?.message ||
        JSON.stringify(data, null, 2);

      setSelfApiTestResult({
        status: res.status,
        modelId: activeModel.id,
        answer: answerText,
        latencyMs,
      });
      await fetchEngineState();
    } catch (err) {
      setSelfApiTestResult({
        status: 500,
        modelId: activeModel.id,
        answer: String(err),
        latencyMs: Math.max(1, Date.now() - t0),
      });
    } finally {
      setSelfApiTestLoading(false);
    }
  };

  const handleSendLocalChatMessage = async (promptText: string, forceJsonMode?: boolean) => {
    const userMsg: ChatTurnMessage = {
      id: `usr-${Date.now()}`,
      role: 'user',
      content: promptText,
      modelId: activeModel.id,
    };

    const nextHistory = [...chatMessages, userMsg];
    setChatMessages(nextHistory);
    setChatSending(true);
    const t0 = Date.now();

    try {
      if (!serverRunning) {
        setServerRunning(true);
        await fetch('/api/engine/toggle-server', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ running: true }),
        });
      }

      const apiMessages = nextHistory
        .filter((m) => !m.isError)
        .slice(-12)
        .map((m) => ({
          role: m.role,
          content: m.content,
        }));

      const res = await fetch('/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${runtimeConfig.bearerToken}`,
          'X-Client-Agent': 'PocketGGUF-Local-Chat-Tab',
          'X-Client-IP': '127.0.0.1',
        },
        body: JSON.stringify({
          model: activeModel.id,
          messages: apiMessages,
          async_hold: false,
          hold_mutex_ms: 140,
          response_format: forceJsonMode ? { type: 'json_object' } : undefined,
        }),
      });

      const latencyMs = Math.max(1, Date.now() - t0);
      const data = await res.json();

      if (res.ok) {
        const replyContent =
          data?.choices?.[0]?.message?.content || JSON.stringify(data, null, 2);
        const assistantMsg: ChatTurnMessage = {
          id: `ast-${Date.now()}`,
          role: 'assistant',
          content: replyContent,
          modelId: activeModel.id,
          latencyMs,
          reusedPrefixTokens: data?.usage?.prefix_cache_reused_tokens ?? runtimeConfig.pinnedSystemTokens,
          tokensPerSec: data?.usage?.tokens_per_sec ?? throughput.tokenGenTps,
          isError: false,
        };
        setChatMessages((prev) => [...prev, assistantMsg]);
      } else {
        const errText =
          data?.error?.message || `HTTP ${res.status}: Failed to reach local server.`;
        setChatMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: 'assistant',
            content: errText,
            modelId: activeModel.id,
            latencyMs,
            isError: true,
          },
        ]);
      }
      await fetchEngineState();
    } catch (err) {
      setChatMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: String(err),
          modelId: activeModel.id,
          latencyMs: Math.max(1, Date.now() - t0),
          isError: true,
        },
      ]);
    } finally {
      setChatSending(false);
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
            href="#chat"
            onClick={(e) => {
              e.preventDefault();
              setActiveSection('chat');
            }}
            className={`transition-colors whitespace-nowrap shrink-0 py-1 ${
              activeSection === 'chat'
                ? 'text-slate-900 font-semibold underline underline-offset-8 decoration-2'
                : 'hover:text-slate-900'
            }`}
          >
            Chat
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
        <ModelLoadDiagnosticBanner
          report={diagnosticReport}
          activeFaultPreset={activeFaultPreset}
          onApplyAutoFix={handleApplyAutoFix}
          onSelectFaultPreset={setActiveFaultPreset}
        />

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
            selfApiTestLoading={selfApiTestLoading}
            selfApiTestResult={selfApiTestResult}
            onToggleServer={handleToggleServer}
            onReleaseMutex={handleReleaseMutex}
            onRunSelfApiTest={handleRunSelfApiTest}
            onSelectLocalGgufFile={handleSelectLocalGgufFile}
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
            serverRunning={serverRunning}
            runtimeConfig={runtimeConfig}
            selfApiTestLoading={selfApiTestLoading}
            selfApiTestResult={selfApiTestResult}
            onSelectModel={(modelId) => {
              navigator.clipboard?.writeText(modelId).catch(() => {});
              handleUpdateConfig({ activeModelId: modelId });
            }}
            onRunSelfApiTest={handleRunSelfApiTest}
            onSelectLocalGgufFile={handleSelectLocalGgufFile}
            onRemoveModel={handleRemoveModel}
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

        {activeSection === 'chat' && (
          <LocalModelChatPanel
            serverRunning={serverRunning}
            activeModel={activeModel}
            runtimeConfig={runtimeConfig}
            messages={chatMessages}
            isSending={chatSending}
            onSendMessage={handleSendLocalChatMessage}
            onClearMessages={() => setChatMessages([])}
            onToggleServer={handleToggleServer}
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
          onClick={() => setActiveSection('chat')}
          className={`min-h-[44px] flex flex-col items-center justify-center cursor-pointer ${
            activeSection === 'chat' ? 'text-slate-900 font-semibold' : 'text-slate-500'
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          <span className="text-[10px] mt-0.5">Chat</span>
        </button>
      </nav>
    </div>
  );
}
