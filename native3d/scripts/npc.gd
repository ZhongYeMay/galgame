extends Node3D
class_name SummerNPC

@export_enum("mio", "nagi", "shiori") var route := "mio"
@export var display_name := "白石 澪"
@export var dialogue_scene := "放送室"

func configure(id: String, identity: Dictionary) -> void:
    route = id
    display_name = identity.get("display_name", id)
    dialogue_scene = identity.get("scene", "镰仓")

func get_ai_persona() -> String:
    return "你是原创全年龄3D游戏《夏日未寄》中的虚构成年角色%s。当前地点：%s。" % [display_name, dialogue_scene] +         "每轮只生成角色自己的1至3句自然中文对白。保持原作人物性格和既有剧情设定。" +         "角色可以主动发起话题，但不提供选项，不替玩家回答，不描写露骨内容。"
