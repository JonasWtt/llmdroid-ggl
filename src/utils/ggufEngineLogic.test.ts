import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INITIAL_GGUF_MODELS,
  DEFAULT_ENGINE_CONFIG,
  calculateMemoryBreakdown,
  evaluateMutexAcquisition,
  evaluatePrefixCacheHit,
  compileJsonSchemaToGbnf,
  evaluateThermalGovernor,
  inspectRawGgufHeaderBytes,
  diagnoseModelLoadAndRuntime,
} from './ggufEngineLogic';

test('Proposal 1: KV Q4_0 cache default saves >70% KV RAM vs FP16 baseline', () => {
  const llama3b = INITIAL_GGUF_MODELS[0];
  assert.equal(DEFAULT_ENGINE_CONFIG.kvCacheQuant, 'Q4_0');

  const mem16kQ4 = calculateMemoryBreakdown(llama3b, {
    contextLength: 16384,
    batchSize: 512,
    kvCacheQuant: 'Q4_0',
    mmapEnabled: true,
  });

  assert.ok(mem16kQ4.kvSavedMb > 1200);
  assert.ok(mem16kQ4.kvSavedPercent >= 71.5);
  assert.equal(mem16kQ4.oomRisk, 'NOMINAL');
});

test('Proposal 2: Single-slot KV prefix cache pinning (n_keep) reuses prefix tokens and cuts TTFT', () => {
  const prevPrompt = 'You are an expert Android NDK kernel assistant. Analyze memory mapping.';
  const nextPrompt = 'You are an expert Android NDK kernel assistant. Analyze page fault latency.';

  const hitStats = evaluatePrefixCacheHit(prevPrompt, nextPrompt, 1024, 185.0, true);
  const unpinnedStats = evaluatePrefixCacheHit(prevPrompt, nextPrompt, 1024, 185.0, false);

  assert.ok(hitStats.reusedTokensCount >= 1024);
  assert.ok(hitStats.cacheHitRatioPercent > 80);
  assert.ok(hitStats.pinnedTtftMs < unpinnedStats.pinnedTtftMs / 4);
  assert.ok(hitStats.ttftSavedMs > 4000);
});

test('Proposal 3: GBNF JSON grammar compiler outputs deterministic rules for structured tool calls', () => {
  const compiled = compileJsonSchemaToGbnf('openai_function_tool_call', true);
  assert.equal(compiled.enabled, true);
  assert.equal(compiled.guaranteedValidJson, true);
  assert.ok(compiled.gbnfRuleString.includes('root'));
  assert.ok(compiled.gbnfRuleString.includes('tool_call'));
  assert.equal(compiled.activeRuleCount, 5);
});

test('Proposal 4: Adaptive Thermal Governor & Big.LITTLE core pinning steps down threads smoothly under heat', () => {
  const nominalGov = evaluateThermalGovernor(37.2, 43, 6, true, true);
  assert.equal(nominalGov.governorActive, false);
  assert.equal(nominalGov.effectiveActiveThreads, 6);
  assert.equal(nominalGov.coreAffinityMask, '0xFC (cpu2..cpu7)');

  const hotGov = evaluateThermalGovernor(44.8, 43, 6, true, true);
  assert.equal(hotGov.governorActive, true);
  assert.equal(hotGov.effectiveActiveThreads, 4);
  assert.equal(hotGov.thermalStepDownThreads, 2);
  assert.equal(hotGov.throttlingState, 'STEP_DOWN_2_THREADS');
});

test('evaluateMutexAcquisition allows first connection and rejects concurrent request with HTTP 429', () => {
  const firstResult = evaluateMutexAcquisition(null, {
    leaseId: 'lease-101',
    clientIp: '127.0.0.1',
    userAgent: 'Continue.dev/1.0',
    endpoint: '/v1/chat/completions',
    promptTokens: 312,
    reusedPrefixTokens: 1024,
    gbnfEnforced: true,
    now: 1700000000000,
  });

  assert.equal(firstResult.allowed, true);
  if (!firstResult.allowed) {
    assert.fail('Expected first connection to acquire mutex');
  }

  const concurrentResult = evaluateMutexAcquisition(firstResult.lease, {
    leaseId: 'lease-102',
    clientIp: '192.168.1.44',
    userAgent: 'Cursor-IDE/0.45',
    endpoint: '/v1/chat/completions',
    promptTokens: 128,
    now: 1700000000250,
  });

  assert.equal(concurrentResult.allowed, false);
  if (concurrentResult.allowed) {
    assert.fail('Expected second concurrent connection to be rejected');
  }
  assert.equal(concurrentResult.httpStatus, 429);
  assert.equal(concurrentResult.errorCode, 'single_connection_mutex_locked');
});

test('inspectRawGgufHeaderBytes verifies valid GGUF v3 binary header and detects HTML or ZIP mistakes', () => {
  // 1. Construct a valid 24-byte GGUF v3 header (magic 'GGUF', version=3, tensors=291, kv=24)
  const buf = new ArrayBuffer(24);
  const view = new DataView(buf);
  view.setUint8(0, 0x47); // 'G'
  view.setUint8(1, 0x47); // 'G'
  view.setUint8(2, 0x55); // 'U'
  view.setUint8(3, 0x46); // 'F'
  view.setUint32(4, 3, true); // version 3
  view.setUint32(8, 291, true); // 291 tensors
  view.setUint32(16, 24, true); // 24 kv pairs

  const valid = inspectRawGgufHeaderBytes(new Uint8Array(buf), 'model-Q4_K_M.gguf', 2048 * 1024 * 1024);
  assert.equal(valid.headerVerified, true);
  assert.equal(valid.ggufVersion, 3);
  assert.equal(valid.tensorCount, 291);
  assert.equal(valid.kvMetaCount, 24);
  assert.equal(valid.isTruncated, false);

  // 2. HTML webpage saved as .gguf (starts with '<!DO')
  const htmlBytes = new TextEncoder().encode('<!DOCTYPE html><html>Login</html>');
  const htmlRes = inspectRawGgufHeaderBytes(htmlBytes, 'bad-download.gguf', htmlBytes.length);
  assert.equal(htmlRes.headerVerified, false);
  assert.ok(htmlRes.detectedNonGgufFormat?.includes('HTML Web Page'));

  // 3. Multi-part split shard detection
  const shardRes = inspectRawGgufHeaderBytes(
    new Uint8Array(buf),
    'DeepSeek-V4-00001-of-00003.gguf',
    2048 * 1024 * 1024
  );
  assert.equal(shardRes.isSplitShard, true);
});

test('diagnoseModelLoadAndRuntime provides clear error messages and actionable solutions for OOM, bad magic, and SAF errors', () => {
  const baseModel = INITIAL_GGUF_MODELS[1]; // Qwen 7B (4680 MB)

  // Case 1: Invalid GGUF Magic Header
  const badMagicModel = {
    ...baseModel,
    headerVerified: false,
    magicSignatureHex: '0x3C21444F',
    detectedNonGgufFormat: 'HTML Web Page (likely a HuggingFace login/redirect page saved as .gguf)',
  };
  const memNominal = calculateMemoryBreakdown(baseModel, DEFAULT_ENGINE_CONFIG);
  const badMagicReport = diagnoseModelLoadAndRuntime({
    model: badMagicModel,
    config: DEFAULT_ENGINE_CONFIG,
    memory: memNominal,
    serverRunning: true,
    activeLease: null,
  });
  assert.equal(badMagicReport.overallStatus, 'ERROR');
  assert.equal(badMagicReport.code, 'ERR_INVALID_GGUF_MAGIC');
  assert.ok(badMagicReport.preciseErrorMessage.includes('HTML Web Page'));
  assert.ok(badMagicReport.proposedSolution.includes('.gguf'));
  assert.equal(badMagicReport.autoFixAction, 'PICK_GGUF_FILE');

  // Case 2: Critical OOM RAM Exceeded (e.g. 9B 5832 MB model + 32k FP16 KV on 8 GB phone)
  const hugeModel = {
    ...baseModel,
    name: 'DeepSeek-V4-Pro-Qwen3.5-9B-Q4_K_M',
    fileSizeMb: 5832,
  };
  const highCtxConfig = {
    ...DEFAULT_ENGINE_CONFIG,
    contextLength: 32768,
    kvCacheQuant: 'FP16' as const,
  };
  const oomMemory = calculateMemoryBreakdown(hugeModel, highCtxConfig, 8192, 3840);
  assert.equal(oomMemory.oomRisk, 'CRITICAL_OOM');

  const oomReport = diagnoseModelLoadAndRuntime({
    model: hugeModel,
    config: highCtxConfig,
    memory: oomMemory,
    serverRunning: true,
    activeLease: null,
  });
  assert.equal(oomReport.overallStatus, 'ERROR');
  assert.equal(oomReport.code, 'ERR_OOM_RAM_EXCEEDED');
  assert.ok(oomReport.preciseErrorMessage.includes('exceeds safe engine memory'));
  assert.ok(oomReport.proposedSolution.includes('Q4_0'));
  assert.equal(oomReport.autoFixAction, 'APPLY_LOW_RAM_SAFE_PROFILE');

  // Case 3: Healthy Ready Model
  const healthyMem = calculateMemoryBreakdown(INITIAL_GGUF_MODELS[0], DEFAULT_ENGINE_CONFIG);
  const healthyReport = diagnoseModelLoadAndRuntime({
    model: INITIAL_GGUF_MODELS[0],
    config: DEFAULT_ENGINE_CONFIG,
    memory: healthyMem,
    serverRunning: true,
    activeLease: null,
  });
  assert.equal(healthyReport.overallStatus, 'HEALTHY');
  assert.equal(healthyReport.code, 'OK_READY');
  assert.equal(healthyReport.stages.every((s) => s.status === 'PASS'), true);
});
