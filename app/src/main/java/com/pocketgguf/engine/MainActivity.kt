package com.pocketgguf.engine

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Slider
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Headless PocketGGUF Control Activity (Jetpack Compose).
 * Explicitly omits any chat interface — provides local GGUF file selection (SAF),
 * context window & KV cache quantization tuning, single-connection mutex telemetry,
 * and Foreground Service lifecycle management.
 */
class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        setContent {
            MaterialTheme {
                val telemetry by EngineStateRepository.state.collectAsState()

                val safPickerLauncher = rememberLauncherForActivityResult(
                    contract = ActivityResultContracts.OpenDocument()
                ) { uri: Uri? ->
                    if (uri != null) {
                        runCatching {
                            contentResolver.takePersistableUriPermission(
                                uri,
                                Intent.FLAG_GRANT_READ_URI_PERMISSION
                            )
                        }
                        val fileSegment = uri.lastPathSegment?.substringAfterLast("/") ?: "custom-model.gguf"
                        val customModel = GgufModelInfo(
                            id = fileSegment.lowercase().replace("[^a-z0-9]+".toRegex(), "-"),
                            name = fileSegment.removeSuffix(".gguf"),
                            filename = fileSegment,
                            uriString = uri.toString(),
                            sizeMb = 2450,
                            quantization = "Q4_K_M"
                        )
                        EngineStateRepository.update {
                            it.copy(
                                activeModel = customModel,
                                availableModels = listOf(customModel) + it.availableModels
                            )
                        }
                    }
                }

                Scaffold(
                    containerColor = Color(0xFFF8FAFC)
                ) { innerPadding ->
                    PocketGgufDashboard(
                        state = telemetry,
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(innerPadding),
                        onToggleServer = { shouldStart ->
                            val serviceIntent = Intent(this, GgufServerService::class.java).apply {
                                action = if (shouldStart) {
                                    GgufServerService.ACTION_START_SERVER
                                } else {
                                    GgufServerService.ACTION_STOP_SERVER
                                }
                            }
                            if (shouldStart) {
                                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                                    startForegroundService(serviceIntent)
                                } else {
                                    startService(serviceIntent)
                                }
                            } else {
                                startService(serviceIntent)
                            }
                        },
                        onPickSafGguf = {
                            safPickerLauncher.launch(arrayOf("*/*"))
                        }
                    )
                }
            }
        }
    }
}

@Composable
fun PocketGgufDashboard(
    state: EngineTelemetryState,
    modifier: Modifier = Modifier,
    onToggleServer: (Boolean) -> Unit,
    onPickSafGguf: () -> Unit
) {
    LazyColumn(
        modifier = modifier.padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // 1. Daemon Header & Single-Connection Mutex Card
        item {
            Surface(
                shape = RoundedCornerShape(12.dp),
                color = Color.White,
                modifier = Modifier
                    .fillMaxWidth()
                    .border(1.dp, Color(0xFFE2E8F0), RoundedCornerShape(12.dp))
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        text = "Android Foreground Service · Headless OpenAI Bridge",
                        fontSize = 12.sp,
                        color = Color(0xFF64748B)
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = if (state.serverRunning) {
                            "Listening on http://${state.bindAddress}:${state.port}/v1"
                        } else {
                            "Local GGUF OpenAI Server Stopped"
                        },
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFF0F172A)
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = if (state.activeLeaseId != null) {
                            "MUTEX LOCKED (1/1): ${state.activeLeaseId} (${state.activeLeaseClient})"
                        } else {
                            "MUTEX UNLOCKED (0/1 Connections · Strict Single-Slot Mode)"
                        },
                        fontSize = 12.sp,
                        fontFamily = FontFamily.Monospace,
                        fontWeight = FontWeight.SemiBold,
                        color = if (state.activeLeaseId != null) Color(0xFFB45309) else Color(0xFF15803D)
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Button(
                            onClick = { onToggleServer(!state.serverRunning) },
                            colors = ButtonDefaults.buttonColors(
                                containerColor = if (state.serverRunning) Color(0xFFDC2626) else Color(0xFF0F172A)
                            ),
                            modifier = Modifier.weight(1f)
                        ) {
                            Text(if (state.serverRunning) "Stop OpenAI Server" else "Start OpenAI Server")
                        }
                        OutlinedButton(
                            onClick = onPickSafGguf,
                            modifier = Modifier.weight(1f)
                        ) {
                            Text("Mount .GGUF (SAF)")
                        }
                    }
                }
            }
        }

        // 2. System Performance Telemetry Row
        item {
            Row(
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                TelemetryCard(
                    label = "Token Speed",
                    value = "${state.tokenGenTps} t/s",
                    subtext = "PP: ${state.promptEvalTps} t/s",
                    modifier = Modifier.weight(1f)
                )
                TelemetryCard(
                    label = "Total RAM",
                    value = "${state.totalAllocatedMb} MB",
                    subtext = "KV: ${state.kvCacheMb} MB (${state.kvCacheQuant})",
                    modifier = Modifier.weight(1f)
                )
                TelemetryCard(
                    label = "SoC Thermal",
                    value = "${state.socTempC}°C",
                    subtext = "Served: ${state.totalRequestsServed} · 429: ${state.totalMutexRejected}",
                    modifier = Modifier.weight(1f)
                )
            }
        }

        // 3. Context Window & KV Cache Quantization Controls
        item {
            Surface(
                shape = RoundedCornerShape(12.dp),
                color = Color.White,
                modifier = Modifier
                    .fillMaxWidth()
                    .border(1.dp, Color(0xFFE2E8F0), RoundedCornerShape(12.dp))
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(
                        horizontalArrangement = Arrangement.SpaceBetween,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text(
                            text = "Context Length (n_ctx)",
                            fontWeight = FontWeight.SemiBold,
                            fontSize = 14.sp
                        )
                        Text(
                            text = "${state.contextLength} tokens",
                            fontFamily = FontFamily.Monospace,
                            fontWeight = FontWeight.Bold,
                            fontSize = 14.sp
                        )
                    }
                    Slider(
                        value = state.contextLength.toFloat(),
                        onValueChange = { v ->
                            val snapped = ((v.toInt() / 512) * 512).coerceAtLeast(512)
                            EngineStateRepository.update { it.copy(contextLength = snapped) }
                        },
                        valueRange = 512f..32768f
                    )

                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = "KV Cache Quantization (Saves RAM on Long Contexts)",
                        fontWeight = FontWeight.SemiBold,
                        fontSize = 13.sp
                    )
                    Spacer(modifier = Modifier.height(6.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        listOf("FP16", "Q8_0", "Q4_0").forEach { kv ->
                            val selected = state.kvCacheQuant == kv
                            OutlinedButton(
                                onClick = {
                                    EngineStateRepository.update { it.copy(kvCacheQuant = kv) }
                                },
                                colors = ButtonDefaults.outlinedButtonColors(
                                    containerColor = if (selected) Color(0xFF0F172A) else Color.Transparent,
                                    contentColor = if (selected) Color.White else Color(0xFF0F172A)
                                ),
                                modifier = Modifier.weight(1f)
                            ) {
                                Text(kv, fontFamily = FontFamily.Monospace, fontSize = 12.sp)
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(10.dp))
                    Row(
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text("POSIX mmap() Zero-Copy Weights", fontSize = 13.sp)
                        Switch(
                            checked = state.mmapEnabled,
                            onCheckedChange = { enabled ->
                                EngineStateRepository.update { it.copy(mmapEnabled = enabled) }
                            }
                        )
                    }
                }
            }
        }

        // 4. Local GGUF Model Selector
        item {
            Text(
                text = "Local GGUF Models (/storage/emulated/0/Documents/GGUF)",
                fontWeight = FontWeight.Bold,
                fontSize = 14.sp,
                color = Color(0xFF0F172A)
            )
        }

        items(state.availableModels) { model ->
            val isSelected = model.id == state.activeModel.id
            Surface(
                shape = RoundedCornerShape(10.dp),
                color = Color.White,
                modifier = Modifier
                    .fillMaxWidth()
                    .border(
                        width = if (isSelected) 2.dp else 1.dp,
                        color = if (isSelected) Color(0xFF0F172A) else Color(0xFFE2E8F0),
                        shape = RoundedCornerShape(10.dp)
                    )
                    .clickable {
                        EngineStateRepository.update { it.copy(activeModel = model) }
                    }
            ) {
                Row(
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.padding(14.dp)
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(model.name, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                        Text(
                            text = "${model.filename} · ${model.quantization} · ${model.sizeMb} MB",
                            fontSize = 11.sp,
                            fontFamily = FontFamily.Monospace,
                            color = Color(0xFF64748B)
                        )
                    }
                    Text(
                        text = if (isSelected) "MOUNTED" else "SELECT",
                        fontSize = 11.sp,
                        fontFamily = FontFamily.Monospace,
                        fontWeight = FontWeight.Bold,
                        color = if (isSelected) Color(0xFF15803D) else Color(0xFF475569)
                    )
                }
            }
        }
    }
}

@Composable
fun TelemetryCard(
    label: String,
    value: String,
    subtext: String,
    modifier: Modifier = Modifier
) {
    Surface(
        shape = RoundedCornerShape(10.dp),
        color = Color.White,
        modifier = modifier.border(1.dp, Color(0xFFE2E8F0), RoundedCornerShape(10.dp))
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Text(text = label, fontSize = 11.sp, color = Color(0xFF64748B))
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = value,
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold,
                fontFamily = FontFamily.Monospace,
                color = Color(0xFF0F172A)
            )
            Spacer(modifier = Modifier.height(2.dp))
            Text(
                text = subtext,
                fontSize = 10.sp,
                fontFamily = FontFamily.Monospace,
                color = Color(0xFF64748B)
            )
        }
    }
}
