extends Node3D

const AssetGate = preload("res://scripts/asset_gate.gd")
const PlayerScript = preload("res://scripts/player.gd")
const NPCScript = preload("res://scripts/npc.gd")
const DialogueScript = preload("res://scripts/dialogue.gd")
const MobileScript = preload("res://scripts/mobile_controls.gd")

const NPC_DATA := {
    "mio": {"display_name":"白石 澪", "scene":"潮音放送室", "location":Vector3(6, 0, 4)},
    "nagi": {"display_name":"橘 凪", "scene":"七里滨海岸", "location":Vector3(-10, 0, -7)},
    "shiori": {"display_name":"月島 栞", "scene":"月灯古书店", "location":Vector3(13, 0, 9)}
}

var player: SummerPlayer
var npcs: Array[Node3D] = []
var dialogue: SummerDialogue
var mobile_controls: SummerMobileControls
var _active_npc: SummerNPC
var _error_label: RichTextLabel
var _ready_for_play := false

func _ready() -> void:
    _init_environment()
    var missing := AssetGate.validate()
    if missing.size() > 0:
        _show_quality_gate(missing)
        push_warning("Production 3D assets have not passed quality gate: %s" % str(missing))
        return

    var world := AssetGate.instantiate_asset("world")
    if world == null:
        _show_quality_gate(PackedStringArray(["世界模型未能作为 Node3D 加载。"]))
        return
    add_child(world)
    var authored_colliders := _create_authored_collisions(world)
    if authored_colliders == 0:
        world.queue_free()
        _show_quality_gate(PackedStringArray([
            "正式场景 GLB 缺少 COL_ 碰撞网格。请为地面、道路与建筑提供真实碰撞。"
        ]))
        return

    player = PlayerScript.new()
    add_child(player)
    player.global_position = Vector3(0, 1.8, 0)
    var playable_avatar := AssetGate.instantiate_asset("player")
    if playable_avatar == null:
        _show_quality_gate(PackedStringArray(["玩家模型无法加载。"]))
        return
    player.set_avatar(playable_avatar)
    player.interaction_requested.connect(_interact)

    for id in ["mio", "nagi", "shiori"]:
        var npc := NPCScript.new()
        npc.configure(id, NPC_DATA[id])
        add_child(npc)
        npc.global_position = NPC_DATA[id]["location"]
        var model := AssetGate.instantiate_asset(id)
        if model == null:
            _show_quality_gate(PackedStringArray(["NPC 模型无法加载：" + id]))
            return
        npc.set_visual(model)
        npcs.append(npc)
    dialogue = DialogueScript.new()
    add_child(dialogue)
    dialogue.dialogue_closed.connect(_close_dialogue)
    mobile_controls = MobileScript.new()
    add_child(mobile_controls)
    mobile_controls.interact_pressed.connect(_interact)
    mobile_controls.move_changed.connect(func(v: Vector2): player.virtual_move = v)
    mobile_controls.look_changed.connect(func(v: Vector2): player.rotate_camera(v))
    _ready_for_play = true
    if not OS.has_feature("mobile"):
        Input.mouse_mode = Input.MOUSE_MODE_CAPTURED

# Only collision geometry authored inside the real 3D GLB is used.
# Optimized COL_ meshes are non-visible engineering data, not visible blocky art.
func _create_authored_collisions(root: Node) -> int:
    var count := 0
    if root is MeshInstance3D:
        var visual := root as MeshInstance3D
        if String(visual.name).begins_with("COL_") and visual.mesh != null:
            var collision := StaticBody3D.new()
            collision.name = "Collision_" + visual.name
            collision.collision_layer = 1
            collision.collision_mask = 1
            var shape := CollisionShape3D.new()
            shape.shape = visual.mesh.create_trimesh_shape()
            if shape.shape != null:
                visual.add_child(collision)
                collision.add_child(shape)
                visual.visible = false
                count += 1
            else:
                collision.queue_free()
    for child in root.get_children():
        if child is StaticBody3D:
            continue
        count += _create_authored_collisions(child)
    return count

func _init_environment() -> void:
    var environment := WorldEnvironment.new()
    environment.name = "SummerLighting"
    var resource := Environment.new()
    resource.background_mode = Environment.BG_SKY
    var sky := Sky.new()
    var atmosphere := ProceduralSkyMaterial.new()
    atmosphere.sky_top_color = Color("#57588f")
    atmosphere.sky_horizon_color = Color("#c5a6b9")
    atmosphere.ground_horizon_color = Color("#d4b0a4")
    sky.sky_material = atmosphere
    resource.sky = sky
    resource.tonemap_mode = Environment.TONE_MAPPER_FILMIC
    environment.environment = resource
    add_child(environment)
    var sun := DirectionalLight3D.new()
    sun.light_color = Color("#ffd7c1")
    sun.light_energy = 1.0
    sun.rotation_degrees = Vector3(-29, -54, 0)
    sun.shadow_enabled = true
    add_child(sun)

func _show_quality_gate(errors: PackedStringArray) -> void:
    # Never publish a misleading fake playable level when custom 3D models
    # do not exist. Developers see exactly which production assets are missing.
    var ui := CanvasLayer.new()
    add_child(ui)
    var background := ColorRect.new()
    background.color = Color("#151426")
    background.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
    ui.add_child(background)
    var label := RichTextLabel.new()
    label.bbcode_enabled = true
    label.fit_content = true
    label.scroll_active = true
    label.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
    label.add_theme_font_size_override("normal_font_size", 24)
    label.text = "[center][b]夏日未寄 · 真 3D 重制[/b]\n\n目前缺少通过验收的 3D 美术模型，未生成粗糙替代品。\n\n[/center]" + "\n".join(errors)
    background.add_child(label)
    _error_label = label

func _interact() -> void:
    if not _ready_for_play or dialogue.visible:
        return
    var nearby := player.get_nearby_npc(npcs)
    if nearby == null:
        return
    player.input_locked = true
    _active_npc = nearby as SummerNPC
    _active_npc.begin_conversation()
    if mobile_controls != null:
        mobile_controls.set_input_enabled(false)
    Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
    dialogue.open_for(_active_npc)

func _close_dialogue() -> void:
    player.input_locked = false
    if _active_npc != null:
        _active_npc.end_conversation()
        _active_npc = null
    if mobile_controls != null:
        mobile_controls.set_input_enabled(true)
    if not OS.has_feature("mobile"):
        Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
