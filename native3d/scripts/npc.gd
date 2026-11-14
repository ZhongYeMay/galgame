extends Node3D
class_name SummerNPC

@export_enum("mio", "nagi", "shiori") var route := "mio"
@export var display_name := "白石 澪"
@export var dialogue_scene := "放送室"

var visual: Node3D
var animator: AnimationPlayer

func configure(id: String, identity: Dictionary) -> void:
    route = id
    display_name = identity.get("display_name", id)
    dialogue_scene = identity.get("scene", "镰仓")

func set_visual(model: Node3D) -> void:
    visual = model
    add_child(model)
    animator = _find_animator(model)
    play_named("Idle")

func _find_animator(node: Node) -> AnimationPlayer:
    if node is AnimationPlayer:
        return node as AnimationPlayer
    for child in node.get_children():
        var found := _find_animator(child)
        if found != null:
            return found
    return null

func play_named(animation: String) -> void:
    if animator != null and animator.has_animation(animation):
        if animator.current_animation != animation:
            animator.play(animation, 0.22)

func begin_conversation() -> void:
    play_named("Talk")

func end_conversation() -> void:
    play_named("Idle")

func get_ai_persona() -> String:
    return (
        "你是原创全年龄3D游戏《夏日未寄》中的虚构成年角色%s。" % display_name
        + "现在位于%s。你有自己的生活，不模拟与现实用户的真实关系。" % dialogue_scene
        + "每轮只说角色自己的1至3句自然中文对白。"
        + "保持原版人物性格和既有剧情，不写露骨或操控性内容。"
        + "可以主动谈论风景、广播、摄影、书籍等日常话题；"
        + "不提供选项，不替玩家回答。"
    )
