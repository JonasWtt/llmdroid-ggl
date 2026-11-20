import React, { useState } from 'react';
import {
  Lock,
  Unlock,
  KeyRound,
  Copy,
  Check,
  Terminal,
  Trash2,
  ShieldAlert,
  Send,
} from 'lucide-react';
import type {
  GgufModelSpec,
  EngineRuntimeConfig,
  ActiveConnectionLease,
  ApiAuditEntry,
  NetworkBindMode,
} from '../utils/ggufEngineLogic';

interface ApiBridgeMutexPanelProps {
  serverRunning: boolean;
  activeModel: GgufModelSpec;
  runtimeConfig: EngineRuntimeConfig;
  activeLease: ActiveConnectionLease | null;
  auditLogs: ApiAuditEntry[];
  lastProbeResponse: {
    status: number;
    clientLabel: string;
    payload: string;
  } | null;
  onUpdateConfig: (updates: Partial<EngineRuntimeConfig>) => void;
  onReleaseMutex: () => void;
  onClearLogs: () => void;
  onFireApiProbe: (options: {
    endpoint: '/v1/chat/completions' | '/v1/models' | '/v1/embeddings';
    clientLabel: string;
    holdMs?: number;
    asyncHold?: boolean;
  }) => Promise<void>;
}

export const ApiBridgeMutexPanel: React.FC<ApiBridgeMutexPanelProps> = ({
  serverRunning,
  activeModel,
  runtimeConfig,
  activeLease,
  auditLogs,
  lastProbeResponse,
  onUpdateConfig,
  onReleaseMutex,
  onClearLogs,
  onFireApiProbe,
}) => {
  const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null);
  const [selectedClientFormat, setSelectedClientFormat] = useState<'curl' | 'continue' | 'python'>('curl');

  const endpointUrl = `http://${runtimeConfig.bindAddress}:${runtimeConfig.port}/v1`;

  const getSnippet = () => {
    if (selectedClientFormat === 'curl') {
      return `curl ${endpointUrl}/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${runtimeConfig.bearerToken}" \\
  -d '{
    "model": "${activeModel.id}",
    "messages": [{"role": "user", "content": "Analyze kernel memory page table."}],
    "temperature": 0.2
  }'`;
    }
    if (selectedClientFormat === 'continue') {
      return `{
  "models": [
    {
      "title": "Android Local GGUF (${activeModel.name})",
      "provider": "openai",
      "model": "${activeModel.id}",
      "apiBase": "${endpointUrl}",
      "apiKey": "${runtimeConfig.bearerToken}",
      "contextLength": ${runtimeConfig.contextLength}
    }
  ]
}`;
    }
    return `from openai import OpenAI

client = OpenAI(
    base_url="${endpointUrl}",
    api_key="${runtimeConfig.bearerToken}",
    max_retries=0  # Single-connection server rejects parallel calls with HTTP 429
)

res = client.chat.completions.create(
    model="${activeModel.id}",
    messages=[{"role": "user", "content": "Summarize local code diff."}]
)`;
  };

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedSnippet(label);
    setTimeout(() => setCopiedSnippet(null), 1800);
  };

  return (
    <div className="space-y-6">
      {/* Top 2-Column Split: Single-Connection Mutex Verifier + Network & Security Bind */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left 7 Cols: Interactive Single-Connection Mutex Tester */}
        <section
          aria-label="Interactive Single-Connection Mutex Verifier"
          className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between"
        >
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-100">
              <div>
                <p className="text-xs text-slate-500">
                  Real Backend Endpoint · <code className="font-mono">POST /v1/chat/completions</code>
                </p>
                <h2 className="text-lg font-bold text-slate-900 mt-0.5">
                  Single-Connection Concurrency Verifier
                </h2>
              </div>

              <span
                data-testid="bridge-mutex-badge"
                className={`text-xs font-mono font-bold ${
                  activeLease ? 'text-amber-700' : 'text-emerald-700'
                }`}
              >
                {activeLease
                  ? `LOCKED BY ${activeLease.leaseId.toUpperCase()}`
                  : 'MUTEX UNLOCKED (1 SLOT FREE)'}
              </span>
            </div>

            <p className="text-xs text-slate-600 mt-3 leading-relaxed">
              This app intentionally omits a built-in chat UI and enforces a strict single-connection mutex.
              Use the live API prober below to verify how external OpenAI clients acquire the exclusive inference lease and how parallel connections are rejected with <code className="font-mono">HTTP 429</code>.
            </p>

            {/* Interactive Trigger Buttons */}
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                type="button"
                disabled={!serverRunning}
                onClick={() =>
                  onFireApiProbe({
                    endpoint: '/v1/chat/completions',
                    clientLabel: 'Continue.dev/1.0 (Client A)',
                    holdMs: 6000,
                    asyncHold: true,
                  })
                }
                className="min-h-[44px] px-3.5 py-2.5 bg-slate-900 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2 hover:bg-slate-800 disabled:opacity-40 transition-colors cursor-pointer"
              >
                <Lock className="w-3.5 h-3.5" />
                1. Lock Slot (6s Stream A)
              </button>

              <button
                type="button"
                disabled={!serverRunning}
                onClick={() =>
                  onFireApiProbe({
                    endpoint: '/v1/chat/completions',
                    clientLabel: 'Cursor-IDE/0.45 (Client B)',
                    holdMs: 1000,
                    asyncHold: true,
                  })
                }
                className="min-h-[44px] px-3.5 py-2.5 bg-amber-50 text-amber-950 border border-amber-300 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 hover:bg-amber-100 disabled:opacity-40 transition-colors cursor-pointer"
              >
                <ShieldAlert className="w-3.5 h-3.5 text-amber-700" />
                2. Test Concurrent Call B
              </button>

              <button
                type="button"
                disabled={!serverRunning}
                onClick={() =>
                  onFireApiProbe({
                    endpoint: '/v1/models',
                    clientLabel: 'Obsidian-RAG/2.1',
                  })
                }
                className="min-h-[44px] px-3.5 py-2.5 bg-slate-100 text-slate-800 border border-slate-200 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 hover:bg-slate-200 disabled:opacity-40 transition-colors cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                Query GET /v1/models
              </button>
            </div>

            {/* Active Lease Status or Last HTTP Response Inspector */}
            {activeLease && (
              <div className="mt-4 p-3.5 bg-amber-50 border border-amber-200 rounded-lg flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="font-mono text-amber-950">
                  <span className="font-bold">ACTIVE LEASE:</span> {activeLease.leaseId} · {activeLease.userAgent} · {activeLease.generatedTokens} tok streamed
                </div>
                <button
                  type="button"
                  onClick={onReleaseMutex}
                  className="px-3 py-1 bg-white border border-amber-300 rounded text-amber-900 font-semibold hover:bg-amber-100 transition-colors cursor-pointer"
                >
                  Release Slot Now
                </button>
              </div>
            )}

            {lastProbeResponse && (
              <div
                data-testid="last-probe-response"
                className="mt-4 bg-slate-900 text-slate-100 rounded-lg p-3.5 font-mono text-xs overflow-x-auto"
              >
                <div className="flex items-center justify-between text-slate-400 pb-2 mb-2 border-b border-slate-800">
                  <span>Caller: {lastProbeResponse.clientLabel}</span>
                  <span
                    className={
                      lastProbeResponse.status === 200
                        ? 'text-emerald-400 font-bold'
                        : 'text-amber-400 font-bold'
                    }
                  >
                    HTTP {lastProbeResponse.status}
                  </span>
                </div>
                <pre className="text-[11px] leading-relaxed whitespace-pre-wrap">
                  {lastProbeResponse.payload}
                </pre>
              </div>
            )}
          </div>
        </section>

        {/* Right 5 Cols: Network Binding, Bearer Auth & Client Snippet */}
        <section
          aria-label="Network Binding and External Client Snippets"
          className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-5"
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-slate-500" />
              <h3 className="text-base font-bold text-slate-900">
                Interface Bind &amp; Client Config
              </h3>
            </div>
            <span className="text-xs font-mono text-slate-500">
              Port {runtimeConfig.port}
            </span>
          </div>

          {/* Interface Bind Selector */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-800 block">
              Socket Bind Scope
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(['127.0.0.1', '0.0.0.0'] as NetworkBindMode[]).map((bind) => (
                <button
                  key={bind}
                  type="button"
                  onClick={() => onUpdateConfig({ bindAddress: bind })}
                  className={`min-h-[42px] p-2.5 rounded-lg border text-left transition-colors cursor-pointer ${
                    runtimeConfig.bindAddress === bind
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-slate-50 text-slate-800 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <div className="text-xs font-mono font-bold">{bind}</div>
                  <div
                    className={`text-[11px] ${
                      runtimeConfig.bindAddress === bind
                        ? 'text-slate-300'
                        : 'text-slate-500'
                    }`}
                  >
                    {bind === '127.0.0.1'
                      ? 'On-Device Loopback Only'
                      : 'Local Wi-Fi LAN Bridge'}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Bearer Token Input */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="bearer-token-input" className="text-xs font-semibold text-slate-800">
                Local Bearer API Key
              </label>
              <button
                type="button"
                onClick={() => handleCopy(runtimeConfig.bearerToken, 'token')}
                className="text-xs text-slate-600 hover:text-slate-900 flex items-center gap-1 cursor-pointer"
              >
                {copiedSnippet === 'token' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    Copy Key
                  </>
                )}
              </button>
            </div>
            <input
              id="bearer-token-input"
              type="text"
              value={runtimeConfig.bearerToken}
              onChange={(e) => onUpdateConfig({ bearerToken: e.target.value })}
              className="w-full min-h-[38px] px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-900"
            />
          </div>

          {/* Client Snippet Generator */}
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                {(['curl', 'continue', 'python'] as const).map((fmt) => (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => setSelectedClientFormat(fmt)}
                    className={`px-2.5 py-1 rounded text-xs font-mono font-medium cursor-pointer ${
                      selectedClientFormat === fmt
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {fmt === 'curl' ? 'cURL' : fmt === 'continue' ? 'Continue.dev' : 'Python SDK'}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => handleCopy(getSnippet(), 'snippet')}
                className="text-xs text-slate-600 hover:text-slate-900 flex items-center gap-1 cursor-pointer"
              >
                {copiedSnippet === 'snippet' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    Copy
                  </>
                )}
              </button>
            </div>

            <pre className="p-3 bg-slate-900 text-slate-100 rounded-lg text-[11px] font-mono whitespace-pre-wrap break-words leading-relaxed">
              {getSnippet()}
            </pre>
          </div>
        </section>
      </div>

      {/* Bottom Full-Width Table: OpenAI API Request Audit Log */}
      <section
        aria-label="OpenAI API Request Audit Log"
        className="bg-white border border-slate-200 rounded-xl p-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-slate-500" />
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Ingress OpenAI Request &amp; Mutex Audit Log
              </h3>
              <p className="text-xs text-slate-500">
                Tracks every local connection attempt, prompt/completion token counts, and HTTP 429 single-connection rejections.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClearLogs}
            className="min-h-[38px] px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg flex items-center gap-1.5 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear Audit Log
          </button>
        </div>

        {auditLogs.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-500">
            No API requests logged in current session. Click &ldquo;1. Lock Slot (6s Stream A)&rdquo; above to test the OpenAI endpoint.
          </div>
        ) : (
          <div className="overflow-x-auto mt-3">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2.5 font-medium">Req ID</th>
                  <th className="py-2.5 font-medium">Endpoint</th>
                  <th className="py-2.5 font-medium">Client Application</th>
                  <th className="py-2.5 font-medium">HTTP Status</th>
                  <th className="py-2.5 font-medium text-right">Tokens (P / C)</th>
                  <th className="py-2.5 font-medium text-right">Throughput</th>
                  <th className="py-2.5 font-medium text-right">Latency</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                {auditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50">
                    <td className="py-2.5 text-slate-700 font-semibold">{log.id}</td>
                    <td className="py-2.5 text-slate-900">
                      {log.method} {log.endpoint}
                    </td>
                    <td className="py-2.5 text-slate-600 font-sans">
                      <span className="font-mono text-slate-800">{log.clientIp}</span> · {log.userAgent}
                    </td>
                    <td className="py-2.5">
                      <span
                        className={`font-semibold ${
                          log.httpStatus === 200
                            ? 'text-emerald-700'
                            : log.httpStatus === 429
                              ? 'text-amber-700'
                              : 'text-red-700'
                        }`}
                      >
                        {log.httpStatus}
                      </span>{' '}
                      <span className="font-sans text-slate-500">
                        — {log.statusReason}
                      </span>
                    </td>
                    <td className="py-2.5 text-right text-slate-700">
                      {log.promptTokens} / {log.completionTokens}
                    </td>
                    <td className="py-2.5 text-right text-slate-700">
                      {log.tokensPerSec > 0 ? `${log.tokensPerSec.toFixed(1)} t/s` : '—'}
                    </td>
                    <td className="py-2.5 text-right text-slate-600">
                      {log.latencyMs.toLocaleString()} ms
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
