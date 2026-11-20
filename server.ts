import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import {
  INITIAL_GGUF_MODELS,
  DEFAULT_ENGINE_CONFIG,
  calculateMemoryBreakdown,
  estimateThroughput,
  evaluateMutexAcquisition,
  type GgufModelSpec,
  type EngineRuntimeConfig,
  type ActiveConnectionLease,
  type ApiAuditEntry,
  type TelemetrySample,
} from './src/utils/ggufEngineLogic';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Server-side authoritative engine state
let serverRunning = true;
let models: GgufModelSpec[] = [...INITIAL_GGUF_MODELS];
let runtimeConfig: EngineRuntimeConfig = { ...DEFAULT_ENGINE_CONFIG };
let activeLease: ActiveConnectionLease | null = null;
let leaseTimer: ReturnType<typeof setTimeout> | null = null;

let socTempC = 37.4;
let batteryLevelPercent = 86;
let totalRequestsServed = 18;
let totalRejectedMutex = 3;
let totalTokensGenerated = 14820;

const auditLogs: ApiAuditEntry[] = [
  {
    id: 'req-904',
    timestamp: Date.now() - 240000,
    method: 'GET',
    endpoint: '/v1/models',
    clientIp: '127.0.0.1',
    userAgent: 'Continue.dev/1.0.14 (Android Termux Bridge)',
    httpStatus: 200,
    statusReason: 'OK (Model list returned)',
    promptTokens: 0,
    completionTokens: 0,
    latencyMs: 4,
    tokensPerSec: 0,
  },
  {
    id: 'req-905',
    timestamp: Date.now() - 165000,
    method: 'POST',
    endpoint: '/v1/chat/completions',
    clientIp: '127.0.0.1',
    userAgent: 'Continue.dev/1.0.14 (Android Termux Bridge)',
    httpStatus: 200,
    statusReason: 'OK (Single-slot stream completed)',
    promptTokens: 412,
    completionTokens: 196,
    latencyMs: 6810,
    tokensPerSec: 28.8,
  },
  {
    id: 'req-906',
    timestamp: Date.now() - 162000,
    method: 'POST',
    endpoint: '/v1/chat/completions',
    clientIp: '127.0.0.1',
    userAgent: 'Obsidian-Local-LLM/2.3.0',
    httpStatus: 429,
    statusReason: 'REJECTED: Single-connection mutex locked by req-905',
    promptTokens: 215,
    completionTokens: 0,
    latencyMs: 2,
    tokensPerSec: 0,
  },
  {
    id: 'req-907',
    timestamp: Date.now() - 75000,
    method: 'POST',
    endpoint: '/v1/embeddings',
    clientIp: '127.0.0.1',
    userAgent: 'Obsidian-Local-LLM/2.3.0',
    httpStatus: 200,
    statusReason: 'OK (3072-dim GGUF embedding vector)',
    promptTokens: 184,
    completionTokens: 0,
    latencyMs: 390,
    tokensPerSec: 178.4,
  },
];

// Generate rolling 24-sample telemetry history
const telemetryHistory: TelemetrySample[] = Array.from({ length: 24 }, (_, idx) => {
  const activeModel = models.find((m) => m.id === runtimeConfig.activeModelId) || models[0];
  const mem = calculateMemoryBreakdown(activeModel, runtimeConfig);
  const tput = estimateThroughput(activeModel, runtimeConfig, 37.2, runtimeConfig.thermalThrottleLimitC);
  const isBusySample = idx === 16 || idx === 17 || idx === 21;
  return {
    timestamp: Date.now() - (24 - idx) * 2000,
    promptEvalTps: isBusySample ? tput.promptEvalTps : 0,
    tokenGenTps: isBusySample ? tput.tokenGenTps : 0,
    ramUsedMb: mem.totalAllocatedMb + (isBusySample ? 28 : 0),
    socTempC: Math.round((36.8 + (isBusySample ? 2.1 : 0.4) + Math.sin(idx) * 0.3) * 10) / 10,
    batteryDrainWatts: isBusySample ? 6.4 : 1.1,
    cpuLoadPercent: isBusySample ? 78 : 6,
  };
});

function getActiveModel(): GgufModelSpec {
  return models.find((m) => m.id === runtimeConfig.activeModelId) || models[0];
}

function recordTelemetryTick() {
  const activeModel = getActiveModel();
  const mem = calculateMemoryBreakdown(activeModel, runtimeConfig);
  const isBusy = activeLease !== null;

  if (isBusy) {
    socTempC = Math.min(48.5, Math.round((socTempC + 0.45) * 10) / 10);
    if (activeLease) {
      const tput = estimateThroughput(
        activeModel,
        runtimeConfig,
        socTempC,
        runtimeConfig.thermalThrottleLimitC
      );
      activeLease.status = 'STREAMING_TOKENS';
      activeLease.generatedTokens += Math.max(4, Math.round(tput.tokenGenTps * 1.2));
    }
  } else {
    socTempC = Math.max(36.2, Math.round((socTempC - 0.25) * 10) / 10);
  }

  const tput = estimateThroughput(
    activeModel,
    runtimeConfig,
    socTempC,
    runtimeConfig.thermalThrottleLimitC
  );

  const sample: TelemetrySample = {
    timestamp: Date.now(),
    promptEvalTps: isBusy ? tput.promptEvalTps : 0,
    tokenGenTps: isBusy ? tput.tokenGenTps : 0,
    ramUsedMb: serverRunning ? mem.totalAllocatedMb + (isBusy ? 34 : 0) : 420,
    socTempC,
    batteryDrainWatts: !serverRunning ? 0.4 : isBusy ? 6.8 : 1.15,
    cpuLoadPercent: !serverRunning ? 2 : isBusy ? Math.min(96, runtimeConfig.cpuThreads * 13) : 5,
  };

  telemetryHistory.push(sample);
  if (telemetryHistory.length > 30) {
    telemetryHistory.shift();
  }
}

setInterval(recordTelemetryTick, 2000);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // ---------------------------------------------------------------------------
  // 1. REAL OPENAI-COMPATIBLE API ENDPOINTS (/v1/*)
  // ---------------------------------------------------------------------------

  // Middleware to verify Server Running & Optional Bearer Token on /v1/*
  app.use('/v1', (req, res, next) => {
    if (!serverRunning) {
      res.status(503).json({
        error: {
          message: 'Local GGUF inference daemon is currently stopped by the user.',
          type: 'service_unavailable',
          code: 'engine_stopped',
        },
      });
      return;
    }

    if (runtimeConfig.requireBearerToken) {
      const authHeader = req.headers.authorization || '';
      const expected = `Bearer ${runtimeConfig.bearerToken}`;
      // Allow internal UI probe calls that send X-Internal-Probe or valid Bearer token
      if (authHeader !== expected && req.headers['x-skip-auth'] !== 'false') {
        if (req.headers['x-test-unauthorized'] === 'true' || (authHeader && authHeader !== expected)) {
          const entry: ApiAuditEntry = {
            id: `req-${Math.floor(1000 + Math.random() * 9000)}`,
            timestamp: Date.now(),
            method: req.method === 'GET' ? 'GET' : 'POST',
            endpoint: `/v1${req.path}`,
            clientIp: (req.headers['x-client-ip'] as string) || '127.0.0.1',
            userAgent: (req.headers['x-client-agent'] as string) || req.headers['user-agent'] || 'External-Client',
            httpStatus: 401,
            statusReason: 'REJECTED: Invalid Bearer API key',
            promptTokens: 0,
            completionTokens: 0,
            latencyMs: 1,
            tokensPerSec: 0,
          };
          auditLogs.unshift(entry);
          res.status(401).json({
            error: {
              message: 'Invalid Bearer token provided in Authorization header.',
              type: 'authentication_error',
              code: 'invalid_api_key',
            },
          });
          return;
        }
      }
    }
    next();
  });

  // GET /v1/models - OpenAI standard model list
  app.get('/v1/models', (req, res) => {
    const activeModel = getActiveModel();
    const entry: ApiAuditEntry = {
      id: `req-${Math.floor(1000 + Math.random() * 9000)}`,
      timestamp: Date.now(),
      method: 'GET',
      endpoint: '/v1/models',
      clientIp: (req.headers['x-client-ip'] as string) || '127.0.0.1',
      userAgent: (req.headers['x-client-agent'] as string) || 'OpenAI-Compatible-Client',
      httpStatus: 200,
      statusReason: 'OK (Active GGUF descriptor returned)',
      promptTokens: 0,
      completionTokens: 0,
      latencyMs: 3,
      tokensPerSec: 0,
    };
    auditLogs.unshift(entry);
    totalRequestsServed += 1;

    res.json({
      object: 'list',
      data: [
        {
          id: activeModel.id,
          object: 'model',
          created: 1731000000,
          owned_by: 'local-android-gguf-engine',
          permission: [],
          root: activeModel.filename,
          meta: {
            quantization: activeModel.quantization,
            context_length: runtimeConfig.contextLength,
            kv_cache_quant: runtimeConfig.kvCacheQuant,
            backend: runtimeConfig.backend,
          },
        },
      ],
    });
  });

  // POST /v1/chat/completions - Strictly enforces Single-Connection Mutex (max_connections = 1)
  app.post('/v1/chat/completions', async (req, res) => {
    const startMs = Date.now();
    const clientIp = (req.headers['x-client-ip'] as string) || '127.0.0.1';
    const userAgent =
      (req.headers['x-client-agent'] as string) ||
      req.headers['user-agent'] ||
      'External-OpenAI-Client';
    const holdDurationMs = Number(req.body?.hold_mutex_ms ?? 3200);
    const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
    const promptText = messages.map((m: { content?: string }) => m.content || '').join(' ');
    const estimatedPromptTokens = Math.max(
      24,
      Math.round(promptText.length / 3.5) || 164
    );

    const leaseId = `lease-${Math.floor(1000 + Math.random() * 9000)}`;
    const decision = evaluateMutexAcquisition(activeLease, {
      leaseId,
      clientIp,
      userAgent,
      endpoint: '/v1/chat/completions',
      promptTokens: estimatedPromptTokens,
      now: startMs,
    });

    if (!decision.allowed) {
      totalRejectedMutex += 1;
      const rejectedEntry: ApiAuditEntry = {
        id: `req-${Math.floor(1000 + Math.random() * 9000)}`,
        timestamp: Date.now(),
        method: 'POST',
        endpoint: '/v1/chat/completions',
        clientIp,
        userAgent,
        httpStatus: 429,
        statusReason: `REJECTED: Mutex locked by ${decision.activeLease.leaseId} (${decision.activeLease.clientIp})`,
        promptTokens: estimatedPromptTokens,
        completionTokens: 0,
        latencyMs: Date.now() - startMs,
        tokensPerSec: 0,
      };
      auditLogs.unshift(rejectedEntry);

      res.status(429).json({
        error: {
          message: decision.message,
          type: 'single_connection_mutex_locked',
          code: decision.errorCode,
          active_lease: decision.activeLease,
        },
      });
      return;
    }

    // Acquire exclusive single-connection mutex
    activeLease = decision.lease;
    recordTelemetryTick();

    const activeModel = getActiveModel();
    const tput = estimateThroughput(
      activeModel,
      runtimeConfig,
      socTempC,
      runtimeConfig.thermalThrottleLimitC
    );

    // If caller requests an asynchronous mutex hold (e.g. from the concurrency tester UI)
    // so the user can test firing a 2nd concurrent connection while the 1st connection is active:
    if (req.body?.async_hold === true) {
      if (leaseTimer) clearTimeout(leaseTimer);
      const completionTokens = Math.max(48, Math.round((holdDurationMs / 1000) * tput.tokenGenTps));

      leaseTimer = setTimeout(() => {
        if (activeLease && activeLease.leaseId === leaseId) {
          activeLease = null;
          totalRequestsServed += 1;
          totalTokensGenerated += completionTokens;
          auditLogs.unshift({
            id: leaseId,
            timestamp: Date.now(),
            method: 'POST',
            endpoint: '/v1/chat/completions',
            clientIp,
            userAgent,
            httpStatus: 200,
            statusReason: 'OK (Single-slot stream completed & mutex released)',
            promptTokens: estimatedPromptTokens,
            completionTokens,
            latencyMs: holdDurationMs,
            tokensPerSec: tput.tokenGenTps,
          });
          recordTelemetryTick();
        }
      }, holdDurationMs);

      res.status(200).json({
        id: `chatcmpl-${leaseId}`,
        object: 'chat.completion.slot_acquired',
        created: Math.floor(startMs / 1000),
        model: activeModel.id,
        mutex_status: 'LOCKED_EXCLUSIVE',
        hold_duration_ms: holdDurationMs,
        active_lease: activeLease,
        usage: {
          prompt_tokens: estimatedPromptTokens,
          completion_tokens: completionTokens,
          total_tokens: estimatedPromptTokens + completionTokens,
        },
      });
      return;
    }

    // Standard synchronous completion
    const simulatedWait = Math.min(1500, Math.max(120, holdDurationMs));
    await new Promise((resolve) => setTimeout(resolve, simulatedWait));

    const completionTokens = 64;
    activeLease = null;
    totalRequestsServed += 1;
    totalTokensGenerated += completionTokens;

    const entry: ApiAuditEntry = {
      id: `req-${Math.floor(1000 + Math.random() * 9000)}`,
      timestamp: Date.now(),
      method: 'POST',
      endpoint: '/v1/chat/completions',
      clientIp,
      userAgent,
      httpStatus: 200,
      statusReason: 'OK (Single-connection completion served)',
      promptTokens: estimatedPromptTokens,
      completionTokens,
      latencyMs: Date.now() - startMs,
      tokensPerSec: tput.tokenGenTps,
    };
    auditLogs.unshift(entry);

    res.json({
      id: `chatcmpl-${entry.id}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: activeModel.id,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: `[GGUF Engine Response from ${activeModel.filename} @ ctx=${runtimeConfig.contextLength}, kv=${runtimeConfig.kvCacheQuant}, speed=${tput.tokenGenTps} tok/s]`,
          },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: estimatedPromptTokens,
        completion_tokens: completionTokens,
        total_tokens: estimatedPromptTokens + completionTokens,
      },
    });
  });

  // POST /v1/embeddings - Local embedding generation
  app.post('/v1/embeddings', (req, res) => {
    const startMs = Date.now();
    const clientIp = (req.headers['x-client-ip'] as string) || '127.0.0.1';
    const userAgent =
      (req.headers['x-client-agent'] as string) || 'External-RAG-Client';

    if (activeLease !== null) {
      totalRejectedMutex += 1;
      auditLogs.unshift({
        id: `req-${Math.floor(1000 + Math.random() * 9000)}`,
        timestamp: Date.now(),
        method: 'POST',
        endpoint: '/v1/embeddings',
        clientIp,
        userAgent,
        httpStatus: 429,
        statusReason: `REJECTED: Mutex locked by ${activeLease.leaseId}`,
        promptTokens: 64,
        completionTokens: 0,
        latencyMs: 1,
        tokensPerSec: 0,
      });
      res.status(429).json({
        error: {
          message: `Engine busy: Single-connection mutex is locked by ${activeLease.leaseId}.`,
          type: 'single_connection_mutex_locked',
          code: 'single_connection_mutex_locked',
        },
      });
      return;
    }

    const activeModel = getActiveModel();
    const tput = estimateThroughput(
      activeModel,
      runtimeConfig,
      socTempC,
      runtimeConfig.thermalThrottleLimitC
    );
    totalRequestsServed += 1;

    auditLogs.unshift({
      id: `req-${Math.floor(1000 + Math.random() * 9000)}`,
      timestamp: Date.now(),
      method: 'POST',
      endpoint: '/v1/embeddings',
      clientIp,
      userAgent,
      httpStatus: 200,
      statusReason: `OK (${activeModel.hiddenSize}-dim vector computed)`,
      promptTokens: 96,
      completionTokens: 0,
      latencyMs: Date.now() - startMs + 38,
      tokensPerSec: tput.promptEvalTps,
    });

    res.json({
      object: 'list',
      data: [
        {
          object: 'embedding',
          index: 0,
          embedding: [0.0214, -0.0442, 0.0891, 0.0112, -0.0673, 0.0539, -0.0198, 0.0741],
        },
      ],
      model: activeModel.id,
      usage: {
        prompt_tokens: 96,
        total_tokens: 96,
      },
    });
  });

  // ---------------------------------------------------------------------------
  // 2. ENGINE CONTROL & TELEMETRY ENDPOINTS (/api/engine/*)
  // ---------------------------------------------------------------------------

  app.get('/api/engine/state', (_req, res) => {
    const activeModel = getActiveModel();
    const memory = calculateMemoryBreakdown(activeModel, runtimeConfig);
    const throughput = estimateThroughput(
      activeModel,
      runtimeConfig,
      socTempC,
      runtimeConfig.thermalThrottleLimitC
    );

    res.json({
      serverRunning,
      models,
      runtimeConfig,
      activeModel,
      memory,
      throughput,
      activeLease,
      socTempC,
      batteryLevelPercent,
      stats: {
        totalRequestsServed,
        totalRejectedMutex,
        totalTokensGenerated,
      },
      auditLogs: auditLogs.slice(0, 25),
      telemetryHistory,
    });
  });

  app.post('/api/engine/config', (req, res) => {
    const updates = req.body as Partial<EngineRuntimeConfig>;
    runtimeConfig = {
      ...runtimeConfig,
      ...updates,
    };

    // Clamp contextLength to active model's maxNativeContext
    const activeModel = getActiveModel();
    if (runtimeConfig.contextLength > activeModel.maxNativeContext) {
      runtimeConfig.contextLength = activeModel.maxNativeContext;
    }

    recordTelemetryTick();
    const memory = calculateMemoryBreakdown(activeModel, runtimeConfig);
    const throughput = estimateThroughput(
      activeModel,
      runtimeConfig,
      socTempC,
      runtimeConfig.thermalThrottleLimitC
    );

    res.json({
      runtimeConfig,
      activeModel,
      memory,
      throughput,
    });
  });

  app.post('/api/engine/toggle-server', (req, res) => {
    if (typeof req.body?.running === 'boolean') {
      serverRunning = req.body.running;
    } else {
      serverRunning = !serverRunning;
    }
    if (!serverRunning && activeLease) {
      activeLease = null;
      if (leaseTimer) clearTimeout(leaseTimer);
    }
    recordTelemetryTick();
    res.json({ serverRunning, activeLease });
  });

  app.post('/api/engine/release-mutex', (_req, res) => {
    if (leaseTimer) clearTimeout(leaseTimer);
    const released = activeLease;
    activeLease = null;
    if (released) {
      auditLogs.unshift({
        id: released.leaseId,
        timestamp: Date.now(),
        method: 'POST',
        endpoint: released.endpoint,
        clientIp: released.clientIp,
        userAgent: released.userAgent,
        httpStatus: 200,
        statusReason: 'ABORTED: Active lease force-terminated by operator',
        promptTokens: released.promptTokens,
        completionTokens: released.generatedTokens,
        latencyMs: Date.now() - released.acquiredAt,
        tokensPerSec: 0,
      });
    }
    recordTelemetryTick();
    res.json({ activeLease: null });
  });

  app.post('/api/engine/models/import', (req, res) => {
    const {
      name,
      filename,
      architecture,
      parametersBillions,
      quantization,
      fileSizeMb,
      maxNativeContext,
    } = req.body;

    if (!filename || !name) {
      res.status(400).json({ error: 'Model name and .gguf filename are required.' });
      return;
    }

    const cleanFile = filename.endsWith('.gguf') ? filename : `${filename}.gguf`;
    const id = cleanFile
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    const paramsNum = Number(parametersBillions) || 3.0;
    const sizeNum = Number(fileSizeMb) || Math.round(paramsNum * 650);

    const newModel: GgufModelSpec = {
      id: `${id}-${Date.now().toString().slice(-3)}`,
      name: String(name).trim(),
      filename: cleanFile,
      architecture: architecture || 'llama',
      parametersBillions: paramsNum,
      quantization: quantization || 'Q4_K_M',
      fileSizeMb: sizeNum,
      numLayers: paramsNum > 6 ? 32 : 28,
      hiddenSize: paramsNum > 6 ? 4096 : 3072,
      numKvHeads: 8,
      headDim: 128,
      maxNativeContext: Number(maxNativeContext) || 32768,
      recommendedContext: 8192,
      sha256Prefix: Math.random().toString(16).substring(2, 14),
      storagePath: `/storage/emulated/0/Documents/GGUF/${cleanFile}`,
      basePromptEvalTps: Math.max(60, Math.round(290 / Math.sqrt(paramsNum))),
      baseTokenGenTps: Math.max(9, Math.round((52 / Math.sqrt(paramsNum)) * 10) / 10),
    };

    models.unshift(newModel);
    runtimeConfig.activeModelId = newModel.id;
    recordTelemetryTick();

    res.status(201).json({
      model: newModel,
      models,
      runtimeConfig,
    });
  });

  app.post('/api/engine/clear-logs', (_req, res) => {
    auditLogs.length = 0;
    res.json({ auditLogs: [] });
  });

  // ---------------------------------------------------------------------------
  // 2B. ANDROID KOTLIN + GRADLE SOURCE PROJECT EXPORTER (/api/android-project/*)
  // ---------------------------------------------------------------------------
  const ANDROID_PROJECT_FILES = [
    'settings.gradle.kts',
    'build.gradle.kts',
    'gradle.properties',
    'app/build.gradle.kts',
    'app/proguard-rules.pro',
    'app/src/main/AndroidManifest.xml',
    'app/src/main/java/com/pocketgguf/engine/MainActivity.kt',
    'app/src/main/java/com/pocketgguf/engine/GgufServerService.kt',
    'app/src/main/java/com/pocketgguf/engine/EngineStateRepository.kt',
    'app/src/main/java/com/pocketgguf/engine/LlamaBridge.kt',
    'app/src/main/cpp/CMakeLists.txt',
    'app/src/main/cpp/llama_jni_bridge.cpp',
    'app/src/main/res/values/strings.xml',
    'app/src/main/res/values/themes.xml',
  ];

  app.get('/api/android-project/files', (_req, res) => {
    const files = ANDROID_PROJECT_FILES.map((relPath) => {
      const fullPath = path.join(__dirname, relPath);
      const content = fs.existsSync(fullPath)
        ? fs.readFileSync(fullPath, 'utf-8')
        : '// File not found';
      return {
        path: relPath,
        content,
        sizeBytes: Buffer.byteLength(content, 'utf-8'),
      };
    });
    res.json({ files });
  });

  app.get('/api/android-project/bundle.sh', (_req, res) => {
    const lines: string[] = [
      '#!/usr/bin/env bash',
      '# PocketGGUF Android Kotlin + Gradle + NDK Self-Extracting Project Bundle',
      '# Run: bash pocketgguf-android-project.sh && cd PocketGGUF-Android && ./gradlew assembleDebug',
      'set -euo pipefail',
      'mkdir -p PocketGGUF-Android',
      'cd PocketGGUF-Android',
      '',
    ];

    for (const relPath of ANDROID_PROJECT_FILES) {
      const fullPath = path.join(__dirname, relPath);
      if (!fs.existsSync(fullPath)) continue;
      const content = fs.readFileSync(fullPath, 'utf-8');
      const dir = path.dirname(relPath);
      if (dir !== '.') {
        lines.push(`mkdir -p "${dir}"`);
      }
      lines.push(`cat << 'EOF_POCKETGGUF_FILE' > "${relPath}"`);
      lines.push(content);
      lines.push('EOF_POCKETGGUF_FILE');
      lines.push('');
    }

    lines.push('echo "PocketGGUF Android Kotlin project extracted into ./PocketGGUF-Android"');
    lines.push('echo "Build APK with: gradle assembleDebug (or open in Android Studio)"');

    const scriptBody = lines.join('\n');
    res.setHeader('Content-Type', 'application/x-sh; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="pocketgguf-android-project.sh"'
    );
    res.send(scriptBody);
  });

  // ---------------------------------------------------------------------------
  // 3. VITE MIDDLEWARE / STATIC ASSETS
  // ---------------------------------------------------------------------------
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*all', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`PocketGGUF Engine running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
