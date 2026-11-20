import React, { useState, useRef } from 'react';
import {
  FolderOpen,
  Check,
  Plus,
  HardDrive,
  Search,
  FileCode2,
  ClipboardCheck,
  Copy,
  Zap,
  Radio,
  PauseCircle,
  Trash2,
  Upload,
} from 'lucide-react';
import type {
  GgufModelSpec,
  EngineRuntimeConfig,
  QuantizationType,
} from '../utils/ggufEngineLogic';
import {
  calculateMemoryBreakdown,
  INITIAL_GGUF_MODELS,
} from '../utils/ggufEngineLogic';

const DEMO_STUB_IDS = new Set(INITIAL_GGUF_MODELS.map((m) => m.id));

interface ModelVaultPanelProps {
  models: GgufModelSpec[];
  activeModelId: string;
  serverRunning: boolean;
  runtimeConfig: EngineRuntimeConfig;
  selfApiTestLoading: boolean;
  selfApiTestResult: {
    status: number;
    modelId: string;
    answer: string;
    latencyMs: number;
  } | null;
  onSelectModel: (modelId: string, copiedViaLongPress?: boolean) => void;
  onRunSelfApiTest: () => Promise<void>;
  onSelectLocalGgufFile: (file: File, replaceStubs: boolean) => Promise<void>;
  onRemoveModel: (modelId: string) => Promise<void>;
  onImportModel: (newModel: {
    name: string;
    filename: string;
    architecture: string;
    parametersBillions: number;
    quantization: QuantizationType;
    fileSizeMb: number;
    maxNativeContext: number;
    replaceStubs?: boolean;
  }) => Promise<void>;
}

export const ModelVaultPanel: React.FC<ModelVaultPanelProps> = ({
  models,
  activeModelId,
  serverRunning,
  runtimeConfig,
  selfApiTestLoading,
  selfApiTestResult,
  onSelectModel,
  onRunSelfApiTest,
  onSelectLocalGgufFile,
  onRemoveModel,
  onImportModel,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [quantFilter, setQuantFilter] = useState<string>('ALL');
  const [showImportForm, setShowImportForm] = useState(false);
  const [replaceStubsOnPick, setReplaceStubsOnPick] = useState(true);
  const [copiedModelBanner, setCopiedModelBanner] = useState<string | null>(null);
  const [lastPickedFileSummary, setLastPickedFileSummary] = useState<string | null>(null);

  // Manual path form fields
  const [name, setName] = useState('');
  const [filename, setFilename] = useState('');
  const [architecture, setArchitecture] = useState('llama');
  const [parametersBillions, setParametersBillions] = useState('3.2');
  const [quantization, setQuantization] = useState<QuantizationType>('Q4_K_M');
  const [fileSizeMb, setFileSizeMb] = useState('2150');
  const [maxNativeContext, setMaxNativeContext] = useState('32768');
  const [formError, setFormError] = useState<string | null>(null);

  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const filePickerInputRef = useRef<HTMLInputElement | null>(null);

  const copyModelIdAndMount = (model: GgufModelSpec) => {
    navigator.clipboard?.writeText(model.id).catch(() => {});
    setCopiedModelBanner(model.id);
    onSelectModel(model.id, true);
  };

  const handlePointerDown = (model: GgufModelSpec) => {
    if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
    pressTimerRef.current = setTimeout(() => {
      copyModelIdAndMount(model);
    }, 450);
  };

  const handlePointerUpOrLeave = () => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  };

  const handleDeviceFilePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await onSelectLocalGgufFile(file, replaceStubsOnPick);
    const cleanId = file.name
      .replace(/\.gguf$/i, '')
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^-|-$/g, '');
    setCopiedModelBanner(cleanId);
    setLastPickedFileSummary(
      `Mounted local file "${file.name}" (${Math.max(1, Math.round(file.size / (1024 * 1024)))} MB) · Client Model ID "${cleanId}" copied to clipboard.`
    );
    e.target.value = '';
  };

  const filteredModels = models.filter((m) => {
    const matchesSearch =
      m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.architecture.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesQuant = quantFilter === 'ALL' || m.quantization === quantFilter;
    return matchesSearch && matchesQuant;
  });

  const activeModel = models.find((m) => m.id === activeModelId) || models[0];
  const hasDemoStubs = models.some((m) => DEMO_STUB_IDS.has(m.id));

  const handleSubmitImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !filename.trim()) {
      setFormError('Please provide both a display name and a local .gguf file name.');
      return;
    }
    setFormError(null);
    await onImportModel({
      name: name.trim(),
      filename: filename.trim(),
      architecture,
      parametersBillions: parseFloat(parametersBillions) || 3.0,
      quantization,
      fileSizeMb: parseInt(fileSizeMb, 10) || 2048,
      maxNativeContext: parseInt(maxNativeContext, 10) || 32768,
      replaceStubs: replaceStubsOnPick,
    });
    setName('');
    setFilename('');
    setShowImportForm(false);
  };

  return (
    <div className="space-y-6">
      {/* Hidden Native Device .GGUF File Input */}
      <input
        ref={filePickerInputRef}
        type="file"
        accept=".gguf,*/*"
        aria-label="Pick local GGUF file from device storage"
        className="hidden"
        onChange={handleDeviceFilePicked}
      />

      {/* Header, Real File Picker CTA, Active Serving State Banner & Self API Functionality Test */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <FolderOpen className="w-4 h-4 text-slate-400" />
              <span className="font-mono">Android SAF File Picker &amp; Device Storage</span>
              <span aria-hidden="true">·</span>
              <span>Long-Press Card to Mount &amp; Copy Client Model ID</span>
            </div>
            <h2 className="text-xl font-bold text-slate-900 mt-1">
              Select Your Local .GGUF Model File
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              Tap <strong>&ldquo;Select .GGUF File from Phone / Device&rdquo;</strong> to open your native system file picker and mount any <code className="font-mono">.gguf</code> file from your Downloads or Documents folder.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => filePickerInputRef.current?.click()}
              className="min-h-[44px] px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-semibold flex items-center gap-2 hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Upload className="w-4 h-4" />
              Select .GGUF File from Phone / Device
            </button>

            <button
              type="button"
              onClick={onRunSelfApiTest}
              disabled={selfApiTestLoading}
              className="min-h-[44px] px-4 py-2 bg-emerald-600 text-white rounded-lg text-xs font-semibold flex items-center gap-2 hover:bg-emerald-700 disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Zap className="w-4 h-4" />
              {selfApiTestLoading ? 'Requesting Model Answer...' : 'Self API Functionality Test'}
            </button>

            <button
              type="button"
              onClick={() => setShowImportForm((prev) => !prev)}
              className="min-h-[44px] px-3.5 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" />
              {showImportForm ? 'Close Path Form' : 'Enter Custom Path'}
            </button>
          </div>
        </div>

        {/* Option to replace sample preset stubs when picking a real file */}
        {hasDemoStubs && (
          <div className="p-3 bg-amber-50/90 border border-amber-200 rounded-lg flex flex-wrap items-center justify-between gap-3 text-xs text-amber-950">
            <label className="flex items-center gap-2 cursor-pointer font-medium">
              <input
                type="checkbox"
                checked={replaceStubsOnPick}
                onChange={(e) => setReplaceStubsOnPick(e.target.checked)}
                className="rounded border-amber-400"
              />
              <span>
                Note: The 3 pre-listed models below are sample reference profiles. Automatically remove them when I select my own <code className="font-mono">.gguf</code> file.
              </span>
            </label>
            <button
              type="button"
              onClick={() => filePickerInputRef.current?.click()}
              className="px-3 py-1.5 bg-amber-900 text-white rounded-md font-semibold hover:bg-amber-800 transition-colors cursor-pointer whitespace-nowrap"
            >
              Browse Device for My .GGUF
            </button>
          </div>
        )}

        {lastPickedFileSummary && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-900 font-mono">
            ✓ {lastPickedFileSummary}
          </div>
        )}

        {/* Live Serving Status Strip + Clipboard Feedback */}
        <div
          data-testid="active-serving-banner"
          className={`p-3.5 rounded-xl border flex flex-wrap items-center justify-between gap-3 text-xs ${
            serverRunning
              ? 'bg-emerald-50/80 border-emerald-200 text-emerald-950'
              : 'bg-amber-50/80 border-amber-200 text-amber-950'
          }`}
        >
          <div className="flex flex-wrap items-center gap-2">
            {serverRunning ? (
              <Radio className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <PauseCircle className="w-4 h-4 text-amber-600 shrink-0" />
            )}
            <span className="font-bold">
              {serverRunning
                ? `ACTIVELY SERVING ON PORT :${runtimeConfig.port}`
                : 'MOUNTED IN STANDBY (SERVER STOPPED — NOT SERVING)'}
            </span>
            <span aria-hidden="true">·</span>
            <span>Model: <strong>{activeModel.name}</strong></span>
            <span aria-hidden="true">·</span>
            <span className="font-mono">
              Client Model Name: <strong className="underline">{activeModel.id}</strong>
            </span>
          </div>

          <button
            type="button"
            onClick={() => copyModelIdAndMount(activeModel)}
            className="px-3 py-1.5 bg-white border border-slate-300 text-slate-900 rounded-lg text-xs font-mono font-semibold flex items-center gap-1.5 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <Copy className="w-3.5 h-3.5" />
            Copy &ldquo;{activeModel.id}&rdquo;
          </button>
        </div>

        {copiedModelBanner && (
          <div
            role="status"
            data-testid="clipboard-toast-banner"
            className="p-3 bg-slate-900 text-white rounded-lg text-xs font-mono flex items-center justify-between gap-2"
          >
            <div className="flex items-center gap-2">
              <ClipboardCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                Mounted model &amp; copied OpenAI client model name to clipboard:{' '}
                <strong className="text-emerald-300">&quot;{copiedModelBanner}&quot;</strong> (Paste this into Continue.dev, Cursor, or OpenAI client config)
              </span>
            </div>
            <button
              type="button"
              onClick={() => setCopiedModelBanner(null)}
              className="text-slate-400 hover:text-white text-xs cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Self API Functionality Test Output Box */}
        {selfApiTestResult && (
          <div
            data-testid="self-api-test-output"
            className="p-4 bg-slate-900 text-slate-100 rounded-xl text-xs font-mono space-y-1.5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 text-slate-400 pb-2 border-b border-slate-800">
              <span>
                Self API Functionality Test · POST http://{runtimeConfig.bindAddress}:{runtimeConfig.port}/v1/chat/completions
              </span>
              <span
                className={
                  selfApiTestResult.status === 200
                    ? 'text-emerald-400 font-bold'
                    : 'text-amber-400 font-bold'
                }
              >
                HTTP {selfApiTestResult.status} · {selfApiTestResult.latencyMs} ms · model=&quot;{selfApiTestResult.modelId}&quot;
              </span>
            </div>
            <div className="text-emerald-300 font-semibold pt-1">
              Model Answer:
            </div>
            <pre className="text-slate-100 whitespace-pre-wrap break-words leading-relaxed">
              {selfApiTestResult.answer}
            </pre>
          </div>
        )}
      </div>

      {/* Collapsible Manual Path / SAF URI Registration Form */}
      {showImportForm && (
        <form
          onSubmit={handleSubmitImport}
          aria-label="Mount Local GGUF File Form"
          className="bg-white border border-slate-200 rounded-xl p-6 space-y-4"
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-base font-bold text-slate-900">
              Register GGUF File by Path or Android SAF URI
            </h3>
            <span className="text-xs font-mono text-slate-500">
              mmap Zero-Copy Compatible
            </span>
          </div>

          {formError && (
            <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 font-medium">
              {formError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label htmlFor="gguf-model-name" className="block text-xs font-medium text-slate-700 mb-1">
                Model Label
              </label>
              <input
                id="gguf-model-name"
                type="text"
                placeholder="e.g. Mistral 7B Instruct v0.3"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full min-h-[40px] px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900"
              />
            </div>

            <div>
              <label htmlFor="gguf-file-name" className="block text-xs font-medium text-slate-700 mb-1">
                GGUF Filename
              </label>
              <input
                id="gguf-file-name"
                type="text"
                placeholder="e.g. mistral-7b-v0.3.Q4_K_M.gguf"
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
                className="w-full min-h-[40px] px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900"
              />
            </div>

            <div>
              <label htmlFor="gguf-quant" className="block text-xs font-medium text-slate-700 mb-1">
                Quantization Encoding
              </label>
              <select
                id="gguf-quant"
                value={quantization}
                onChange={(e) => setQuantization(e.target.value as QuantizationType)}
                className="w-full min-h-[40px] px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900"
              >
                <option value="Q4_K_M">Q4_K_M (4-bit Medium)</option>
                <option value="IQ4_XS">IQ4_XS (4-bit Importance Matrix)</option>
                <option value="Q5_K_M">Q5_K_M (5-bit Medium)</option>
                <option value="Q8_0">Q8_0 (8-bit Near-Lossless)</option>
                <option value="FP16">FP16 (16-bit Half Precision)</option>
              </select>
            </div>

            <div>
              <label htmlFor="gguf-size-mb" className="block text-xs font-medium text-slate-700 mb-1">
                File Size (MB)
              </label>
              <input
                id="gguf-size-mb"
                type="number"
                min={50}
                max={32000}
                value={fileSizeMb}
                onChange={(e) => setFileSizeMb(e.target.value)}
                className="w-full min-h-[40px] px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="gguf-arch" className="block text-xs font-medium text-slate-700 mb-1">
                GGUF Architecture Key
              </label>
              <select
                id="gguf-arch"
                value={architecture}
                onChange={(e) => setArchitecture(e.target.value)}
                className="w-full min-h-[40px] px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg"
              >
                <option value="llama">llama</option>
                <option value="qwen2">qwen2</option>
                <option value="gemma2">gemma2</option>
                <option value="phi3">phi3</option>
              </select>
            </div>

            <div>
              <label htmlFor="gguf-params" className="block text-xs font-medium text-slate-700 mb-1">
                Parameter Count (Billions)
              </label>
              <input
                id="gguf-params"
                type="number"
                step="0.1"
                min={0.5}
                max={32}
                value={parametersBillions}
                onChange={(e) => setParametersBillions(e.target.value)}
                className="w-full min-h-[40px] px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg"
              />
            </div>

            <div>
              <label htmlFor="gguf-max-ctx" className="block text-xs font-medium text-slate-700 mb-1">
                Max Native Context Window
              </label>
              <select
                id="gguf-max-ctx"
                value={maxNativeContext}
                onChange={(e) => setMaxNativeContext(e.target.value)}
                className="w-full min-h-[40px] px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg"
              >
                <option value="8192">8,192 tokens</option>
                <option value="16384">16,384 tokens</option>
                <option value="32768">32,768 tokens</option>
                <option value="65536">65,536 tokens</option>
              </select>
            </div>
          </div>

          <div className="pt-2 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setShowImportForm(false)}
              className="min-h-[40px] px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="min-h-[40px] px-5 py-2 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 transition-colors cursor-pointer"
            >
              Verify Header &amp; Mount GGUF
            </button>
          </div>
        </form>
      )}

      {/* Search and Quantization Filter Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            aria-label="Filter GGUF models by name or filename"
            placeholder="Filter by model name, client model ID, filename, or architecture..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full min-h-[42px] pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-slate-900"
          />
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
          {['ALL', 'Q4_K_M', 'IQ4_XS', 'Q5_K_M', 'Q8_0'].map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => setQuantFilter(q)}
              className={`min-h-[36px] px-3 py-1.5 text-xs font-mono font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                quantFilter === q
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {q === 'ALL' ? 'All Quants' : q}
            </button>
          ))}
        </div>
      </div>

      {/* Model List Cards with Long-Press Mount + Clipboard Copy, Serving Indicator & Remove Button */}
      <div className="space-y-3">
        {filteredModels.map((model) => {
          const isSelected = model.id === activeModelId;
          const isActivelyServing = isSelected && serverRunning;
          const isDemoStub = DEMO_STUB_IDS.has(model.id);
          const projectedMem = calculateMemoryBreakdown(model, runtimeConfig);

          return (
            <div
              key={model.id}
              onPointerDown={() => handlePointerDown(model)}
              onPointerUp={handlePointerUpOrLeave}
              onPointerLeave={handlePointerUpOrLeave}
              onContextMenu={(e) => {
                e.preventDefault();
                copyModelIdAndMount(model);
              }}
              className={`bg-white border rounded-xl p-5 transition-colors select-none ${
                isActivelyServing
                  ? 'border-emerald-600 ring-1 ring-emerald-600'
                  : isSelected
                    ? 'border-amber-500 ring-1 ring-amber-500'
                    : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-1">
                  {/* Explicit Serving Status Line */}
                  <div className="flex flex-wrap items-center gap-2 text-xs font-mono font-bold">
                    {isActivelyServing ? (
                      <span className="text-emerald-700 flex items-center gap-1.5">
                        <Radio className="w-3.5 h-3.5" />
                        SERVING LIVE ON HTTP :{runtimeConfig.port}/v1
                      </span>
                    ) : isSelected ? (
                      <span className="text-amber-700 flex items-center gap-1.5">
                        <PauseCircle className="w-3.5 h-3.5" />
                        MOUNTED IN STANDBY (SERVER STOPPED — NOT SERVING)
                      </span>
                    ) : (
                      <span className="text-slate-400 font-normal">
                        UNMOUNTED · Long-press card to mount &amp; copy client ID
                      </span>
                    )}
                    {isDemoStub ? (
                      <span className="text-[11px] font-mono font-normal text-amber-700">
                        · [SAMPLE REFERENCE PROFILE]
                      </span>
                    ) : (
                      <span className="text-[11px] font-mono font-semibold text-emerald-700">
                        · [USER LOCAL .GGUF FILE]
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-0.5">
                    <FileCode2 className="w-4 h-4 text-slate-500 shrink-0" />
                    <h3 className="text-base font-bold text-slate-900">
                      {model.name}
                    </h3>
                    <span className="text-xs font-mono text-slate-500">
                      · {model.parametersBillions.toFixed(2)}B params · {model.quantization} · {model.architecture}
                    </span>
                  </div>

                  <div className="text-xs font-mono text-slate-700 pt-0.5">
                    OpenAI Client Model Name:{' '}
                    <code className="font-bold text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded">
                      {model.id}
                    </code>
                  </div>

                  <p className="text-xs font-mono text-slate-500 break-all">
                    {model.storagePath}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => copyModelIdAndMount(model)}
                    aria-label={`Load ${model.name}`}
                    className={`min-h-[44px] px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      isActivelyServing
                        ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                        : isSelected
                          ? 'bg-amber-600 text-white hover:bg-amber-700'
                          : 'bg-slate-900 text-white hover:bg-slate-800'
                    }`}
                  >
                    {isActivelyServing ? (
                      <>
                        <Check className="w-4 h-4" />
                        Serving Live (Copy ID)
                      </>
                    ) : isSelected ? (
                      <>
                        <Copy className="w-4 h-4" />
                        Mounted Standby (Copy ID)
                      </>
                    ) : (
                      <>
                        <HardDrive className="w-4 h-4" />
                        Mount &amp; Copy Client ID
                      </>
                    )}
                  </button>

                  {models.length > 1 && (
                    <button
                      type="button"
                      onClick={() => onRemoveModel(model.id)}
                      aria-label={`Remove ${model.name}`}
                      title="Remove from model list"
                      className="min-h-[44px] px-3 py-2 rounded-lg text-xs font-medium text-red-600 border border-slate-200 hover:bg-red-50 hover:border-red-200 flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Remove
                    </button>
                  )}
                </div>
              </div>

              {/* Technical Specs Footer */}
              <div className="mt-4 pt-3 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs font-mono tabular-nums">
                <div>
                  <span className="text-slate-400 block font-sans">Artifact Size</span>
                  <span className="text-slate-800 font-semibold">
                    {model.fileSizeMb.toLocaleString()} MB
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block font-sans">Est. RAM @ {runtimeConfig.contextLength} ctx</span>
                  <span
                    className={`font-semibold ${
                      projectedMem.oomRisk === 'CRITICAL_OOM'
                        ? 'text-red-700'
                        : 'text-slate-800'
                    }`}
                  >
                    {projectedMem.totalAllocatedMb.toLocaleString()} MB ({projectedMem.oomRisk})
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block font-sans">Layers / KV Heads</span>
                  <span className="text-slate-800">
                    {model.numLayers}L / {model.numKvHeads}H
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block font-sans">Native Context</span>
                  <span className="text-slate-800">
                    {model.maxNativeContext.toLocaleString()} tok
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block font-sans">Expected Speed</span>
                  <span className="text-emerald-700 font-semibold">
                    ~{model.baseTokenGenTps} tok/s
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
