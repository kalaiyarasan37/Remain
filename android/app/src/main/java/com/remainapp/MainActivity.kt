package com.remainapp

import android.content.Intent
import android.os.Bundle
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import com.facebook.react.bridge.ReactContext
import com.facebook.react.modules.core.DeviceEventManagerModule

class MainActivity : ReactActivity() {

    override fun getMainComponentName(): String = "RemainApp"

    override fun createReactActivityDelegate(): ReactActivityDelegate =
        DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        handleWakeWordIntent(intent)
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        if (intent != null) {
            handleWakeWordIntent(intent)
        }
    }

   private fun handleWakeWordIntent(intent: Intent?) {
    val wakeWordTriggered = intent?.getBooleanExtra("WAKE_WORD_TRIGGERED", false) ?: false
    android.util.Log.d("MainActivity", "handleWakeWordIntent called, triggered: $wakeWordTriggered")
    if (wakeWordTriggered) {
        android.util.Log.d("MainActivity", "Sending wake word event to RN")
        android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
            sendWakeWordEvent()
        }, 800)
    }
}
    private fun sendWakeWordEvent() {
        try {
            val reactContext: ReactContext? = reactInstanceManager?.currentReactContext
            reactContext
                ?.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                ?.emit("WAKE_WORD_DETECTED", null)
        } catch (e: Exception) {
            android.util.Log.e("MainActivity", "Failed to send wake word event", e)
        }
    }
}
