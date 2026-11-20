import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INITIAL_GGUF_MODELS,
  DEFAULT_ENGINE_CONFIG,
  calculateMemoryBreakdown,
  estimateThroughput,
  evaluateMutexAcquisition,
} from './ggufEngineLogic';

test('calculateMemoryBreakdown scales KV cache linearly with context length and KV quantization', () => {
  const llama3b = INITIAL_GGUF_MODELS[0];

  const mem4kFp16 = calculateMemoryBreakdown(llama3b, {
    contextLength: 4096,
    batchSize: 512,
    kvCacheQuant: 'FP16',
    mmapEnabled: true,
  });

  const mem16kFp16 = calculateMemoryBreakdown(llama3b, {
    contextLength: 16384,
    batchSize: 512,
    kvCacheQuant: 'FP16',
    mmapEnabled: true,
  });

  const mem16kQ4 = calculateMemoryBreakdown(llama3b, {
    contextLength: 16384,
    batchSize: 512,
    kvCacheQuant: 'Q4_0',
    mmapEnabled: true,
  });

  assert.equal(mem16kFp16.kvCacheMb, mem4kFp16.kvCacheMb * 4);
  assert.ok(mem16kQ4.kvCacheMb < mem16kFp16.kvCacheMb / 3);
  assert.equal(mem4kFp16.oomRisk, 'NOMINAL');
});

test('calculateMemoryBreakdown flags CRITICAL_OOM when 7B model uses large context on constrained RAM', () => {
  const qwen7b = INITIAL_GGUF_MODELS[1];
  const breakdown = calculateMemoryBreakdown(
    qwen7b,
    {
      contextLength: 32768,
      batchSize: 1024,
      kvCacheQuant: 'FP16',
      mmapEnabled: false,
    },
    8192,
    3072
  );

  assert.equal(breakdown.oomRisk, 'CRITICAL_OOM');
  assert.ok(breakdown.totalAllocatedMb > breakdown.availableForEngineMb);
});

test('evaluateMutexAcquisition allows first connection and rejects concurrent request with HTTP 429', () => {
  const firstResult = evaluateMutexAcquisition(null, {
    leaseId: 'lease-101',
    clientIp: '127.0.0.1',
    userAgent: 'Continue.dev/1.0',
    endpoint: '/v1/chat/completions',
    promptTokens: 312,
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

test('estimateThroughput reduces speed when SoC temperature exceeds thermal throttle limit', () => {
  const model = INITIAL_GGUF_MODELS[0];
  const nominal = estimateThroughput(model, DEFAULT_ENGINE_CONFIG, 37.5, 43);
  const throttled = estimateThroughput(model, DEFAULT_ENGINE_CONFIG, 46.5, 43);

  assert.equal(nominal.thermalThrottled, false);
  assert.equal(throttled.thermalThrottled, true);
  assert.ok(throttled.tokenGenTps < nominal.tokenGenTps);
});
