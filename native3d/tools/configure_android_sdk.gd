@tool
extends SceneTree

# Executed by the Godot *editor* in CI, never by the game.
# Godot 4.7 Android export uses global editor settings, not only env vars.
func _initialize() -> void:
    var sdk_path := OS.get_environment("ANDROID_SDK_ROOT")
    if sdk_path.is_empty():
        sdk_path = OS.get_environment("ANDROID_HOME")
    var java_path := OS.get_environment("JAVA_HOME")
    if sdk_path.is_empty() or java_path.is_empty():
        push_error("Android SDK and JAVA_HOME must both be configured")
        quit(1)
        return
    if not DirAccess.dir_exists_absolute(sdk_path):
        push_error("Android SDK directory missing: " + sdk_path)
        quit(1)
        return
    if not DirAccess.dir_exists_absolute(java_path):
        push_error("Java 17 directory missing: " + java_path)
        quit(1)
        return
    var settings := EditorInterface.get_editor_settings()
    settings.set_setting("export/android/android_sdk_path", sdk_path)
    settings.set_setting("export/android/java_sdk_path", java_path)
    settings.save()
    print("Configured Godot Android SDK/JDK for export")
    quit(0)
