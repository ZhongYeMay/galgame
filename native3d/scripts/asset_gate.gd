extends RefCounted
class_name SummerAssetGate

# Visual contract: only authored, production-quality 3D models shipped by the
# project owner may become gameplay scenes. No silhouette, low-poly stand-in,
# 2D sprite card, forced perspective photograph, or primitive replacement.
const REQUIRED: Dictionary = {
    "world": "res://assets/world/kamakura_full.glb",
    "player": "res://assets/characters/player.glb",
    "mio": "res://assets/characters/mio.glb",
    "nagi": "res://assets/characters/nagi.glb",
    "shiori": "res://assets/characters/shiori.glb"
}
const REQUIRED_META: Dictionary = {
    "world": "res://assets/reviews/kamakura_full.json",
    "player": "res://assets/reviews/player.json",
    "mio": "res://assets/reviews/mio.json",
    "nagi": "res://assets/reviews/nagi.json",
    "shiori": "res://assets/reviews/shiori.json"
}

static func validate() -> PackedStringArray:
    var errors := PackedStringArray()
    for id in REQUIRED.keys():
        var model_path: String = REQUIRED[id]
        if not ResourceLoader.exists(model_path):
            errors.append("缺少正式 3D 资产：%s" % model_path)
            continue
        var scene: PackedScene = load(model_path)
        if scene == null or not scene.can_instantiate():
            errors.append("无法导入 3D 场景：%s" % model_path)
        var info_path: String = REQUIRED_META[id]
        if not FileAccess.file_exists(info_path):
            errors.append("缺少人工验收记录：%s" % info_path)
            continue
        var review: Variant = JSON.parse_string(FileAccess.get_file_as_string(info_path))
        if not (review is Dictionary):
            errors.append("3D 模型验收记录格式错误：%s" % info_path)
            continue
        if review.get("approved", false) != true:
            errors.append("3D 模型尚未获得人工美术验收：%s" % info_path)
        if str(review.get("reviewed_by", "")).strip_edges().is_empty():
            errors.append("3D 模型验收缺少审核者标识：%s" % info_path)
    return errors

static func instantiate_asset(id: String) -> Node3D:
    var path: String = REQUIRED.get(id, "")
    if path.is_empty() or not ResourceLoader.exists(path):
        return null
    var packed := load(path) as PackedScene
    if packed == null:
        return null
    return packed.instantiate() as Node3D
