import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INITIAL_GGUF_MODELS,
  DEFAULT_ENGINE_CONFIG,
  calculateMemoryBreakdown,
  estimateThroughput,
  evaluateMutexAcquisition,
  evaluatePrefixCacheHit,
  compileJsonSchemaToGbnf,
  evaluateThermalGovernor,
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
