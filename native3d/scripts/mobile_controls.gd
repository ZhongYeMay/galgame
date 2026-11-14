extends CanvasLayer
class_name SummerMobileControls

signal move_changed(value: Vector2)
signal look_changed(value: Vector2)
signal interact_pressed

var joystick_index := -1
var camera_index := -1
var origin := Vector2.ZERO
var move := Vector2.ZERO
var _panel: Control
var _stick: ColorRect
var _base: ColorRect

func _ready() -> void:
    if not OS.has_feature("mobile"):
        visible = false
        set_process_input(false)
        return
    _build_controls()

func _new_style(color: Color, outline: Color, radius: int) -> StyleBoxFlat:
    var box := StyleBoxFlat.new()
    box.bg_color = color
    box.border_color = outline
    box.set_border_width_all(2)
    box.set_corner_radius_all(radius)
    return box

func _build_controls() -> void:
    _panel = Control.new()
    _panel.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
    _panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
    add_child(_panel)

    _base = ColorRect.new()
    _base.color = Color(0, 0, 0, 0)
    _base.mouse_filter = Control.MOUSE_FILTER_IGNORE
    _base.position = Vector2(32, -190)
    _base.custom_minimum_size = Vector2(148, 148)
    _base.size = Vector2(148, 148)
    _base.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_LEFT)
    _base.add_theme_stylebox_override("panel",_new_style(Color("#302a537c"),Color("#b9a0df"),74))
    _panel.add_child(_base)

    _stick = ColorRect.new()
    _stick.color = Color("#d0b8ecaf")
    _stick.mouse_filter = Control.MOUSE_FILTER_IGNORE
    _stick.size = Vector2(55, 55)
    _stick.position = Vector2(74, 74) - _stick.size / 2.0
    _panel.add_child(_stick)

    var interact := Button.new()
    interact.text = "交谈"
    interact.custom_minimum_size = Vector2(125, 64)
    interact.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_RIGHT)
    interact.offset_left = -170
    interact.offset_right = -35
    interact.offset_top = -140
    interact.offset_bottom = -70
    _panel.add_child(interact)
    interact.pressed.connect(func(): interact_pressed.emit())

func _input(event: InputEvent) -> void:
    if event is InputEventScreenTouch:
        if event.pressed:
            if event.position.x < get_viewport().get_visible_rect().size.x * 0.43 and joystick_index == -1:
                joystick_index = event.index
                origin = event.position
                _update_stick(event.position)
            elif camera_index == -1:
                camera_index = event.index
        else:
            if event.index == joystick_index:
                joystick_index = -1
                move = Vector2.ZERO
                move_changed.emit(move)
            if event.index == camera_index:
                camera_index = -1
    elif event is InputEventScreenDrag:
        if event.index == joystick_index:
            _update_stick(event.position)
        elif event.index == camera_index:
            look_changed.emit(event.relative)

func _update_stick(point: Vector2) -> void:
    move = ((point-origin)/65.0).limit_length()
    move_changed.emit(move)
