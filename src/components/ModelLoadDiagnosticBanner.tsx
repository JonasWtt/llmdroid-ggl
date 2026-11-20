import React, { useState } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Wrench,
  ChevronDown,
  ChevronUp,
  Bug,
  RotateCcw,
} from 'lucide-react';
import type {
  ModelLoadDiagnosticReport,
  AutoFixActionType,
} from '../utils/ggufEngineLogic';

export type FaultSimulationPreset =
  | 'NONE'
  | 'INVALID_HTML_HEADER'
  | 'OOM_RAM_EXCEEDED'
  | 'SAF_PERMISSION_EXPIRED'
  | 'PORT_CONFLICT';

interface ModelLoadDiagnosticBannerProps {
  report: ModelLoadDiagnosticReport;
  activeFaultPreset: FaultSimulationPreset;
  onApplyAutoFix: (action: AutoFixActionType) => void;
  onSelectFaultPreset: (preset: FaultSimulationPreset) => void;
}

export const ModelLoadDiagnosticBanner: React.FC<ModelLoadDiagnosticBannerProps> = ({
  report,
  activeFaultPreset,
  onApplyAutoFix,
  onSelectFaultPreset,
}) => {
  const [showStages, setShowStages] = useState(false);
  const [showFaultSimulator, setShowFaultSimulator] = useState(false);

  const isError = report.overallStatus === 'ERROR';
  const isWarning = report.overallStatus === 'WARNING';

  const containerStyle = isError
    ? 'bg-red-50 border-red-300 text-red-950'
    : isWarning
      ? 'bg-amber-50 border-amber-300 text-amber-950'
      : 'bg-emerald-50/70 border-emerald-200 text-emerald-950';

  const badgeStyle = isError
    ? 'text-red-700'
    : isWarning
      ? 'text-amber-700'
      : 'text-emerald-700';

  const buttonStyle = isError
    ? 'bg-red-600 hover:bg-red-700 text-white'
    : isWarning
      ? 'bg-amber-600 hover:bg-amber-700 text-white'
      : 'bg-emerald-600 hover:bg-emerald-700 text-white';

  return (
    <section
      aria-label="Model Load Verification and Troubleshooting"
      data-testid="model-load-diagnostic-banner"
      className={`border rounded-xl p-4 sm:p-5 space-y-3 transition-colors ${containerStyle}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1 flex-1 min-w-[240px]">
          <div className={`flex flex-wrap items-center gap-2 text-xs font-mono font-bold ${badgeStyle}`}>
            {isError ? (
              <XCircle className="w-4 h-4 shrink-0" />
            ) : isWarning ? (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            )}
            <span>
              {isError
                ? `MODEL LOAD / RUNTIME ERROR [${report.code}]`
                : isWarning
                  ? `ENGINE DIAGNOSTIC NOTICE [${report.code}]`
                  : `5-STAGE MODEL LOAD VERIFIED [${report.code}]`}
            </span>
          </div>

          <h2 className="text-sm sm:text-base font-bold text-slate-900">
            {report.title}
          </h2>
          <p className="text-xs text-slate-700 leading-relaxed">
            {report.preciseErrorMessage}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowStages((prev) => !prev)}
            className="min-h-[36px] px-3 py-1.5 bg-white border border-slate-200 text-slate-800 rounded-lg text-xs font-semibold flex items-center gap-1.5 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            {showStages ? (
              <>
                <ChevronUp className="w-3.5 h-3.5" />
                Hide 5-Stage Check
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5" />
                View 5-Stage Check
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => setShowFaultSimulator((prev) => !prev)}
            className="min-h-[36px] px-3 py-1.5 bg-white border border-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <Bug className="w-3.5 h-3.5" />
            {showFaultSimulator ? 'Hide Error Tester' : 'Test Error Scenarios'}
          </button>
        </div>
      </div>

      {/* Proposed Solution & 1-Tap Auto-Fix Box (Always shown on Error or Warning, or when checklist is expanded) */}
      {(isError || isWarning || showStages) && (
        <div className="bg-white border border-slate-200/80 rounded-lg p-3.5 flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1 flex-1 min-w-[220px]">
            <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
              <Wrench className="w-3.5 h-3.5 text-slate-700" />
              <span>Proposed Solution</span>
            </div>
            <p className="text-xs font-medium text-slate-900 leading-relaxed">
              {report.proposedSolution}
            </p>
          </div>

          {report.autoFixAction !== 'NONE' && report.autoFixButtonLabel && (
            <button
              type="button"
              onClick={() => onApplyAutoFix(report.autoFixAction)}
              className={`min-h-[40px] px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer shrink-0 ${buttonStyle}`}
            >
              <Wrench className="w-3.5 h-3.5" />
              {report.autoFixButtonLabel}
            </button>
          )}
        </div>
      )}

      {/* 5-Stage Pre-Flight & Runtime Verification Checklist */}
      {(showStages || isError) && (
        <div className="bg-white border border-slate-200 rounded-lg p-3.5 space-y-2">
          <div className="text-[11px] font-mono font-bold text-slate-500 uppercase tracking-wider">
            5-Stage Model Load &amp; Runtime Verification Pipeline
          </div>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
            {report.stages.map((st) => {
              const stColor =
                st.status === 'PASS'
                  ? 'border-emerald-200 bg-emerald-50/50 text-emerald-900'
                  : st.status === 'WARN'
                    ? 'border-amber-200 bg-amber-50/50 text-amber-900'
                    : 'border-red-200 bg-red-50/60 text-red-900';
              return (
                <div
                  key={st.stageId}
                  className={`border rounded-lg p-2.5 space-y-1 ${stColor}`}
                >
                  <div className="flex items-center justify-between text-[11px] font-mono font-bold">
                    <span>{st.label}</span>
                    <span>[{st.status}]</span>
                  </div>
                  <p className="text-[11px] font-mono text-slate-700 leading-snug break-words">
                    {st.detail}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Interactive Error & Solution Verification Tester */}
      {showFaultSimulator && (
        <div className="bg-slate-900 text-slate-100 rounded-lg p-3.5 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-mono font-bold text-emerald-400">
              INTERACTIVE MODEL LOAD FAULT &amp; SOLUTION VERIFIER
            </div>
            {activeFaultPreset !== 'NONE' && (
              <button
                type="button"
                onClick={() => onSelectFaultPreset('NONE')}
                className="px-2.5 py-1 bg-emerald-500 text-slate-950 rounded text-xs font-mono font-bold flex items-center gap-1 hover:bg-emerald-400 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                Reset to Healthy State
              </button>
            )}
          </div>
          <p className="text-[11px] text-slate-300">
            Click any fault scenario below to verify the exact error diagnosis and proposed 1-tap solution that the app presents when a model load fails:
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onSelectFaultPreset('INVALID_HTML_HEADER')}
              className={`px-3 py-1.5 rounded text-xs font-mono cursor-pointer transition-colors ${
                activeFaultPreset === 'INVALID_HTML_HEADER'
                  ? 'bg-red-500 text-white font-bold'
                  : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
              }`}
            >
              1. Bad GGUF Magic (HTML Redirect File)
            </button>
            <button
              type="button"
              onClick={() => onSelectFaultPreset('OOM_RAM_EXCEEDED')}
              className={`px-3 py-1.5 rounded text-xs font-mono cursor-pointer transition-colors ${
                activeFaultPreset === 'OOM_RAM_EXCEEDED'
                  ? 'bg-red-500 text-white font-bold'
                  : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
              }`}
            >
              2. OOM RAM Exceeded (9B + 32k FP16 KV)
            </button>
            <button
              type="button"
              onClick={() => onSelectFaultPreset('SAF_PERMISSION_EXPIRED')}
              className={`px-3 py-1.5 rounded text-xs font-mono cursor-pointer transition-colors ${
                activeFaultPreset === 'SAF_PERMISSION_EXPIRED'
                  ? 'bg-red-500 text-white font-bold'
                  : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
              }`}
            >
              3. SAF File Descriptor Permission Denied
            </button>
            <button
              type="button"
              onClick={() => onSelectFaultPreset('PORT_CONFLICT')}
              className={`px-3 py-1.5 rounded text-xs font-mono cursor-pointer transition-colors ${
                activeFaultPreset === 'PORT_CONFLICT'
                  ? 'bg-red-500 text-white font-bold'
                  : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
              }`}
            >
              4. Port :8080 Bind Conflict
            </button>
          </div>
        </div>
      )}
    </section>
  );
};
