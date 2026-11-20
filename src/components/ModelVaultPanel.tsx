import React, { useState } from 'react';
import {
  FolderOpen,
  Check,
  Plus,
  HardDrive,
  Search,
  FileCode2,
} from 'lucide-react';
import type {
  GgufModelSpec,
  EngineRuntimeConfig,
  QuantizationType,
} from '../utils/ggufEngineLogic';
import { calculateMemoryBreakdown } from '../utils/ggufEngineLogic';

interface ModelVaultPanelProps {
  models: GgufModelSpec[];
  activeModelId: string;
  runtimeConfig: EngineRuntimeConfig;
  onSelectModel: (modelId: string) => void;
  onImportModel: (newModel: {
    name: string;
    filename: string;
    architecture: string;
    parametersBillions: number;
    quantization: QuantizationType;
    fileSizeMb: number;
    maxNativeContext: number;
  }) => Promise<void>;
}

export const ModelVaultPanel: React.FC<ModelVaultPanelProps> = ({
  models,
  activeModelId,
  runtimeConfig,
  onSelectModel,
  onImportModel,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [quantFilter, setQuantFilter] = useState<string>('ALL');
  const [showImportForm, setShowImportForm] = useState(false);

  // Import form fields
  const [name, setName] = useState('');
  const [filename, setFilename] = useState('');
  const [architecture, setArchitecture] = useState('llama');
  const [parametersBillions, setParametersBillions] = useState('3.2');
  const [quantization, setQuantization] = useState<QuantizationType>('Q4_K_M');
  const [fileSizeMb, setFileSizeMb] = useState('2150');
  const [maxNativeContext, setMaxNativeContext] = useState('32768');
  const [formError, setFormError] = useState<string | null>(null);

  const filteredModels = models.filter((m) => {
    const matchesSearch =
      m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.architecture.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesQuant = quantFilter === 'ALL' || m.quantization === quantFilter;
    return matchesSearch && matchesQuant;
  });

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
    });
    setName('');
    setFilename('');
    setShowImportForm(false);
  };

  return (
    <div className="space-y-6">
      {/* Header & SAF Storage Banner */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <FolderOpen className="w-4 h-4 text-slate-400" />
            <span className="font-mono">/storage/emulated/0/Documents/GGUF</span>
            <span aria-hidden="true">·</span>
            <span>Android Storage Access Framework (SAF)</span>
          </div>
          <h2 className="text-xl font-bold text-slate-900 mt-1">
            Local GGUF Model Repository
          </h2>
          <p className="text-xs text-slate-600 mt-0.5">
            Select which quantized GGUF weight file is mounted by the OpenAI API server. Zero cloud downloads or external telemetry.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowImportForm((prev) => !prev)}
          className="min-h-[44px] px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-semibold flex items-center gap-2 hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          {showImportForm ? 'Cancel File Mount' : 'Mount Local .GGUF File'}
        </button>
      </div>

      {/* Collapsible Mount Local GGUF Form */}
      {showImportForm && (
        <form
          onSubmit={handleSubmitImport}
          aria-label="Mount Local GGUF File Form"
          className="bg-white border border-slate-200 rounded-xl p-6 space-y-4"
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-base font-bold text-slate-900">
              Register GGUF File from Android SAF URI
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
                min={250}
                max={16000}
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
            placeholder="Filter by model name, filename, or architecture..."
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

      {/* Model List Table / Cards */}
      <div className="space-y-3">
        {filteredModels.map((model) => {
          const isSelected = model.id === activeModelId;
          const projectedMem = calculateMemoryBreakdown(model, runtimeConfig);

          return (
            <div
              key={model.id}
              className={`bg-white border rounded-xl p-5 transition-colors ${
                isSelected
                  ? 'border-slate-900 ring-1 ring-slate-900'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <FileCode2 className="w-4 h-4 text-slate-500 shrink-0" />
                    <h3 className="text-base font-bold text-slate-900">
                      {model.name}
                    </h3>
                    <span className="text-xs font-mono text-slate-500">
                      · {model.parametersBillions.toFixed(2)}B params · {model.quantization} · {model.architecture}
                    </span>
                  </div>

                  <p className="text-xs font-mono text-slate-500 break-all">
                    {model.storagePath}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => onSelectModel(model.id)}
                  disabled={isSelected}
                  aria-label={isSelected ? `Loaded ${model.name}` : `Load ${model.name}`}
                  className={`min-h-[44px] px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    isSelected
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 cursor-default'
                      : 'bg-slate-900 text-white hover:bg-slate-800'
                  }`}
                >
                  {isSelected ? (
                    <>
                      <Check className="w-4 h-4" />
                      Mounted in Engine
                    </>
                  ) : (
                    <>
                      <HardDrive className="w-4 h-4" />
                      Mount Model
                    </>
                  )}
                </button>
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
