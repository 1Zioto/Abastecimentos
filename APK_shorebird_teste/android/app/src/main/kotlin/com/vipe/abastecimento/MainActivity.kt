package com.vipe.abastecimento

import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.app.ActivityCompat
import androidx.core.content.FileProvider
import androidx.core.content.ContextCompat
import java.io.File
import java.nio.charset.Charset
import java.util.UUID
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    private val appUpdateChannelName = "com.vipe.abastecimento/app_update"
    private val printerChannelName = "com.vipe.abastecimento/thermal_printer"
    private val bluetoothPermissionRequest = 5808
    private var pendingBluetoothResult: MethodChannel.Result? = null
    private var pendingBluetoothAction: (() -> Unit)? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, appUpdateChannelName)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "installApk" -> {
                        val path = call.argument<String>("path")
                        if (path.isNullOrBlank()) {
                            result.error("APK_PATH_REQUIRED", "Arquivo APK não informado.", null)
                            return@setMethodCallHandler
                        }
                        installApk(path, result)
                    }
                    else -> result.notImplemented()
                }
            }

        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, printerChannelName)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "listPairedDevices" -> withBluetoothPermission(result) {
                        listPairedDevices(result)
                    }
                    "printText" -> withBluetoothPermission(result) {
                        val address = call.argument<String>("address")
                        val text = call.argument<String>("text") ?: ""
                        val cutPaper = call.argument<Boolean>("cutPaper") ?: false
                        if (address.isNullOrBlank()) {
                            result.error("PRINTER_REQUIRED", "Impressora Bluetooth não selecionada.", null)
                            return@withBluetoothPermission
                        }
                        printText(address, text, cutPaper, result)
                    }
                    else -> result.notImplemented()
                }
            }
    }

    private fun hasBluetoothPermission(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true
        return ContextCompat.checkSelfPermission(
            this,
            Manifest.permission.BLUETOOTH_CONNECT
        ) == PackageManager.PERMISSION_GRANTED
    }

    private fun withBluetoothPermission(result: MethodChannel.Result, action: () -> Unit) {
        if (hasBluetoothPermission()) {
            action()
            return
        }
        if (pendingBluetoothResult != null) {
            result.error("PERMISSION_IN_PROGRESS", "Aguarde a autorização Bluetooth em andamento.", null)
            return
        }
        pendingBluetoothResult = result
        pendingBluetoothAction = action
        ActivityCompat.requestPermissions(
            this,
            arrayOf(
                Manifest.permission.BLUETOOTH_CONNECT,
                Manifest.permission.BLUETOOTH_SCAN
            ),
            bluetoothPermissionRequest
        )
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode != bluetoothPermissionRequest) return

        val result = pendingBluetoothResult
        val action = pendingBluetoothAction
        pendingBluetoothResult = null
        pendingBluetoothAction = null

        if (grantResults.isNotEmpty() && grantResults.all { it == PackageManager.PERMISSION_GRANTED }) {
            action?.invoke()
        } else {
            result?.error(
                "BLUETOOTH_PERMISSION_DENIED",
                "Permita o acesso Bluetooth para usar a impressora térmica.",
                null
            )
        }
    }

    private fun bluetoothAdapter(): BluetoothAdapter? = BluetoothAdapter.getDefaultAdapter()

    private fun listPairedDevices(result: MethodChannel.Result) {
        try {
            val adapter = bluetoothAdapter()
            if (adapter == null) {
                result.error("BLUETOOTH_UNAVAILABLE", "Este aparelho não possui Bluetooth.", null)
                return
            }
            if (!adapter.isEnabled) {
                result.error("BLUETOOTH_DISABLED", "Ative o Bluetooth do aparelho.", null)
                return
            }
            val devices = adapter.bondedDevices
                .sortedWith(compareBy<BluetoothDevice> { it.name ?: "" }.thenBy { it.address })
                .map {
                    mapOf(
                        "name" to (it.name ?: "Dispositivo Bluetooth"),
                        "address" to it.address
                    )
                }
            result.success(devices)
        } catch (e: SecurityException) {
            result.error("BLUETOOTH_PERMISSION_DENIED", "Permissão Bluetooth negada.", null)
        } catch (e: Exception) {
            result.error("BLUETOOTH_LIST_FAILED", e.message, null)
        }
    }

    private fun printText(
        address: String,
        text: String,
        cutPaper: Boolean,
        result: MethodChannel.Result
    ) {
        Thread {
            try {
                val adapter = bluetoothAdapter()
                if (adapter == null) {
                    runOnUiThread {
                        result.error("BLUETOOTH_UNAVAILABLE", "Este aparelho não possui Bluetooth.", null)
                    }
                    return@Thread
                }
                if (!adapter.isEnabled) {
                    runOnUiThread {
                        result.error("BLUETOOTH_DISABLED", "Ative o Bluetooth do aparelho.", null)
                    }
                    return@Thread
                }

                adapter.cancelDiscovery()
                val device = adapter.getRemoteDevice(address)
                val uuid = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")
                val socket = device.createRfcommSocketToServiceRecord(uuid)
                socket.connect()
                socket.outputStream.use { output ->
                    output.write(byteArrayOf(0x1B, 0x40)) // ESC @
                    output.write(byteArrayOf(0x1B, 0x74, 0x02)) // CP850
                    output.write(text.toByteArray(Charset.forName("CP850")))
                    output.write(byteArrayOf(0x0A, 0x0A, 0x0A))
                    if (cutPaper) {
                        output.write(byteArrayOf(0x1D, 0x56, 0x42, 0x00))
                    }
                    output.flush()
                }
                socket.close()
                runOnUiThread { result.success(true) }
            } catch (e: SecurityException) {
                runOnUiThread {
                    result.error("BLUETOOTH_PERMISSION_DENIED", "Permissão Bluetooth negada.", null)
                }
            } catch (e: Exception) {
                runOnUiThread {
                    result.error("PRINT_FAILED", "Falha ao imprimir: ${e.message}", null)
                }
            }
        }.start()
    }

    private fun installApk(path: String, result: MethodChannel.Result) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
                !packageManager.canRequestPackageInstalls()
            ) {
                val settingsIntent = Intent(
                    Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:$packageName")
                )
                startActivity(settingsIntent)
                result.error(
                    "INSTALL_PERMISSION_REQUIRED",
                    "Libere a instalação de apps desconhecidos para concluir a atualização.",
                    null
                )
                return
            }

            val apkFile = File(path)
            if (!apkFile.exists()) {
                result.error("APK_NOT_FOUND", "Arquivo APK não encontrado.", null)
                return
            }

            val apkUri = FileProvider.getUriForFile(
                this,
                "$packageName.fileprovider",
                apkFile
            )
            val intent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(apkUri, "application/vnd.android.package-archive")
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            startActivity(intent)
            result.success(true)
        } catch (e: Exception) {
            result.error("INSTALL_APK_FAILED", e.message, null)
        }
    }
}
