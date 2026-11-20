import React, { useState } from 'react';
import {
  MessageSquare,
  Send,
  Trash2,
  Copy,
  Check,
  Radio,
  PauseCircle,
  Download,
  Code2,
  Play,
} from 'lucide-react';
import type {
  GgufModelSpec,
  EngineRuntimeConfig,
} from '../utils/ggufEngineLogic';
import { ArchitectureIdeasPanel } from './ArchitectureIdeasPanel';

export interface ChatTurnMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  modelId: string;
  latencyMs?: number;
  reusedPrefixTokens?: number;
  tokensPerSec?: number;
  isError?: boolean;
}

interface LocalModelChatPanelProps {
  serverRunning: boolean;
  activeModel: GgufModelSpec;
  runtimeConfig: EngineRuntimeConfig;
  messages: ChatTurnMessage[];
  isSending: boolean;
  onSendMessage: (promptText: string, forceJsonMode?: boolean) => Promise<void>;
  onClearMessages: () => void;
  onToggleServer: () => void;
  onUpdateConfig: (updates: Partial<EngineRuntimeConfig>) => void;
}

const SAMPLE_PROMPTS = [
  'Hello! Confirm your loaded GGUF model header and active optimizations.',
  'Explain how Q4_0 KV cache quantization saves 72% KV memory on Android.',
  'Write a compact Kotlin function to verify single-slot mutex locking.',
];

export const LocalModelChatPanel: React.FC<LocalModelChatPanelProps> = ({
  serverRunning,
  activeModel,
  runtimeConfig,
  messages,
  isSending,
  onSendMessage,
  onClearMessages,
  onToggleServer,
  onUpdateConfig,
}) => {
  const [inputText, setInputText] = useState('');
  const [forceJsonMode, setForceJsonMode] = useState(false);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [showAndroidExporter, setShowAndroidExporter] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputText.trim();
    if (!trimmed || isSending) return;
    setInputText('');
    await onSendMessage(trimmed, forceJsonMode);
  };

  const handleCopyReply = (id: string, text: string) => {
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopiedMsgId(id);
    setTimeout(() => setCopiedMsgId(null), 1800);
  };

  return (
    <div className="space-y-6">
      {/* Top Connected Local Server Status Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs font-mono font-bold">
            {serverRunning ? (
              <span className="text-emerald-700 flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5" />
                CONNECTED TO LOCAL SERVER :{runtimeConfig.port}/v1/chat/completions
              </span>
            ) : (
              <span className="text-amber-700 flex items-center gap-1.5">
                <PauseCircle className="w-3.5 h-3.5" />
                LOCAL SERVER STOPPED (STANDBY)
              </span>
            )}
            <span className="text-slate-400 font-normal">·</span>
            <span className="text-slate-600 font-normal">
              KV {runtimeConfig.kvCacheQuant} · n_keep {runtimeConfig.pinnedSystemTokens} tok
            </span>
          </div>

          <h2 className="text-lg font-bold text-slate-900">
            Local Model Chat · {activeModel.name}
          </h2>
          <p className="text-xs font-mono text-slate-600">
            OpenAI Client Model ID: <strong className="text-slate-900">{activeModel.id}</strong> · Endpoint:{' '}
            <code className="bg-slate-100 px-1.5 py-0.5 rounded">
              POST http://{runtimeConfig.bindAddress}:{runtimeConfig.port}/v1/chat/completions
            </code>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!serverRunning && (
            <button
              type="button"
              onClick={onToggleServer}
              className="min-h-[40px] px-3.5 py-2 bg-emerald-600 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 hover:bg-emerald-700 transition-colors cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              Start Local Server
            </button>
          )}

          <label className="min-h-[40px] px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-xs font-mono flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={forceJsonMode}
              onChange={(e) => setForceJsonMode(e.target.checked)}
              className="rounded border-slate-300"
            />
            <span>GBNF JSON Mode</span>
          </label>

          {messages.length > 0 && (
            <button
              type="button"
              onClick={onClearMessages}
              className="min-h-[40px] px-3.5 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear Chat
            </button>
          )}

          <a
            href="/api/android-project/bundle.sh"
            download="download-pocketgguf-android.sh"
            className="min-h-[40px] px-3.5 py-2 bg-slate-900 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 hover:bg-slate-800 transition-colors whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            Download Android APK Source (.sh)
          </a>

          <button
            type="button"
            onClick={() => setShowAndroidExporter((prev) => !prev)}
            className="min-h-[40px] px-3 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <Code2 className="w-3.5 h-3.5" />
            {showAndroidExporter ? 'Hide Kotlin Code' : 'View Kotlin Code'}
          </button>
        </div>
      </div>

      {/* Chat Conversation Viewport */}
      <div className="bg-white border border-slate-200 rounded-xl flex flex-col min-h-[460px] max-h-[640px]">
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {messages.length === 0 ? (
            <div className="max-w-xl mx-auto my-8 p-6 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
              <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                <MessageSquare className="w-4 h-4 text-emerald-600" />
                <span>Direct Local Model Chat (/v1/chat/completions)</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Every message sent here executes an HTTP <code className="font-mono">POST /v1/chat/completions</code> request against the local single-slot GGUF server currently serving{' '}
                <strong className="text-slate-900">{activeModel.id}</strong>.
              </p>
              <div className="space-y-1.5 pt-2">
                <span className="text-[11px] font-mono text-slate-500 block">
                  Quick test prompts:
                </span>
                {SAMPLE_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    disabled={isSending}
                    onClick={() => onSendMessage(prompt, forceJsonMode)}
                    className="w-full text-left px-3.5 py-2.5 bg-white border border-slate-200 hover:border-slate-400 rounded-lg text-xs text-slate-800 font-medium transition-colors cursor-pointer block"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg) => {
              const isUser = msg.role === 'user';
              return (
                <div
                  key={msg.id}
                  data-testid={`chat-message-${msg.role}`}
                  className={`p-4 rounded-xl border ${
                    isUser
                      ? 'bg-slate-900 text-white border-slate-900 ml-auto max-w-2xl'
                      : msg.isError
                        ? 'bg-red-50 text-red-950 border-red-200 mr-auto max-w-3xl'
                        : 'bg-slate-50 text-slate-900 border-slate-200 mr-auto max-w-3xl'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-2 mb-2 border-b border-slate-200/20 text-[11px] font-mono">
                    <span
                      className={
                        isUser
                          ? 'text-slate-400 font-bold'
                          : msg.isError
                            ? 'text-red-700 font-bold'
                            : 'text-emerald-700 font-bold'
                      }
                    >
                      {isUser ? 'YOU' : `MODEL: ${msg.modelId}`}
                    </span>

                    {!isUser && (
                      <div className="flex items-center gap-3 text-slate-500">
                        {msg.latencyMs !== undefined && <span>{msg.latencyMs} ms</span>}
                        {msg.tokensPerSec !== undefined && msg.tokensPerSec > 0 && (
                          <span>{msg.tokensPerSec} tok/s</span>
                        )}
                        {msg.reusedPrefixTokens !== undefined && (
                          <span>n_keep: {msg.reusedPrefixTokens} tok</span>
                        )}
                        <button
                          type="button"
                          onClick={() => handleCopyReply(msg.id, msg.content)}
                          className="px-2 py-0.5 bg-white border border-slate-200 rounded text-slate-700 hover:bg-slate-100 flex items-center gap-1 cursor-pointer"
                        >
                          {copiedMsgId === msg.id ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-600" />
                              Copied
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              Copy Reply
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>

                  <pre className="font-sans text-xs sm:text-sm whitespace-pre-wrap break-words leading-relaxed">
                    {msg.content}
                  </pre>
                </div>
              );
            })
          )}
        </div>

        {/* Bottom Message Input Form */}
        <form
          onSubmit={handleSubmit}
          className="p-4 border-t border-slate-200 bg-slate-50/60 rounded-b-xl flex items-center gap-3"
        >
          <input
            type="text"
            aria-label="Message local GGUF model"
            placeholder={`Message ${activeModel.id} via local /v1/chat/completions...`}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            className="flex-1 min-h-[44px] px-4 py-2.5 bg-white border border-slate-300 rounded-lg text-xs sm:text-sm text-slate-900 focus:outline-none focus:border-slate-900"
          />
          <button
            type="submit"
            disabled={isSending || !inputText.trim()}
            className="min-h-[44px] px-5 py-2.5 bg-slate-900 text-white rounded-lg text-xs font-semibold flex items-center gap-2 hover:bg-slate-800 disabled:opacity-40 transition-colors cursor-pointer shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
            {isSending ? 'Generating...' : 'Send'}
          </button>
        </form>
      </div>

      {/* Collapsible Android Kotlin Source & Gradle Exporter */}
      {showAndroidExporter && (
        <ArchitectureIdeasPanel
          runtimeConfig={runtimeConfig}
          onUpdateConfig={onUpdateConfig}
        />
      )}
    </div>
  );
};
