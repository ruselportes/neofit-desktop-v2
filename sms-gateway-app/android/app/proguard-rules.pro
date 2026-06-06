# React Native ProGuard Rules
-keep class com.facebook.hermes.unicode.** { *; }
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.jni.** { *; }
-keep class com.facebook.react.** { *; }
-keep class com.facebook.soloader.** { *; }
-keep class com.neofit.smsgateway.** { *; }
-keepclassmembers class * extends android.os.Build { public *; }

# Hermes console / JS engine
-keep class com.facebook.react.bridge.** { *; }
-keep class com.facebook.react.common.** { *; }
-keep class com.facebook.react.modules.core.** { *; }

# Keep console module
-dontwarn com.facebook.react.devsupport.**
-dontnote com.facebook.react.devsupport.**
