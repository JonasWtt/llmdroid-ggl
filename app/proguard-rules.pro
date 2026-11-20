# Keep JNI bridge methods from being stripped during R8 release shrinking
-keepclasseswithmembernames class * {
    native <methods>;
}
-keep class com.pocketgguf.engine.LlamaBridge { *; }
