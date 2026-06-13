package expo.modules.smsmodule

import android.content.Context
import android.telephony.SmsManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class SmsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("SmsModule")

    AsyncFunction("sendSms") { phoneNumber: String, message: String ->
      try {
        val smsManager = appContext.reactContext?.getSystemService(Context.TELEPHONY_SERVICE) as? SmsManager
          ?: SmsManager.getDefault()
        smsManager.sendTextMessage(phoneNumber, null, message, null, null)
        true
      } catch (e: Exception) {
        throw e
      }
    }
  }
}
