extends CanvasLayer
class_name SummerMobileControls

signal move_changed(value: Vector2)
signal look_changed(value: Vector2)
signal interact_pressed

const PAD_RADIUS := 72.0
const MAX_STICK_DISTANCE := 48.0

var joystick_index := -1
var camera_index := -1
var move := Vector2.ZERO
var _input_enabled := true
var _panel: Control
var _base: Panel
var _stick: ColorRect
var _interact: Button

func _ready() -> void:
    if not OS.has_feature("mobile"):
        visible = false
        set_process_input(false)
        return
    _build_controls()

func _make_style() -> StyleBoxFlat:
    var box := StyleBoxFlat.new()
    box.bg_color = Color("#302a5380")
    box.border_color = Color("#b9a0dfb3")
    box.set_border_width_all(2)
    box.set_corner_radius_all(74)
    return box

func _build_controls() -> void:
    _panel = Control.new()
    _panel.name = "TouchUI"
    _panel.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
    _panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
    add_child(_panel)

    _base = Panel.new()
    _base.name = "Joystick"
    _base.mouse_filter = Control.MOUSE_FILTER_IGNORE
    _base.anchor_left = 0.0
    _base.anchor_right = 0.0
    _base.anchor_top = 1.0
    _base.anchor_bottom = 1.0
    _base.offset_left = 30.0
    _base.offset_right = 30.0 + PAD_RADIUS * 2.0
    _base.offset_top = -35.0 - PAD_RADIUS * 2.0
    _base.offset_bottom = -35.0
    _base.add_theme_stylebox_override("panel", _make_style())
    _panel.add_child(_base)

    _stick = ColorRect.new()
    _stick.name = "JoystickThumb"
    _stick.color = Color("#d0b8ece0")
    _stick.mouse_filter = Control.MOUSE_FILTER_IGNORE
    _stick.anchor_left = 0.5
    _stick.anchor_right = 0.5
    _stick.anchor_top = 0.5
    _stick.anchor_bottom = 0.5
    _stick.offset_left = -27.0
    _stick.offset_top = -27.0
    _stick.offset_right = 27.0
    _stick.offset_bottom = 27.0
    _base.add_child(_stick)

    _interact = Button.new()
    _interact.name = "Interact"
    _interact.text = "交谈"
    _interact.anchor_left = 1.0
    _interact.anchor_right = 1.0
    _interact.anchor_top = 1.0
    _interact.anchor_bottom = 1.0
    _interact.offset_left = -170.0
    _interact.offset_right = -35.0
    _interact.offset_top = -145.0
    _interact.offset_bottom = -70.0
    _interact.focus_mode = Control.FOCUS_NONE
    _panel.add_child(_interact)
    _interact.pressed.connect(func(): interact_pressed.emit())

func set_input_enabled(enabled: bool) -> void:
    _input_enabled = enabled
    visible = enabled and OS.has_feature("mobile")
    _reset_movement()
    camera_index = -1

func _reset_movement() -> void:
    joystick_index = -1
    move = Vector2.ZERO
    move_changed.emit(move)
    if _stick != null:
        _stick.position = (Vector2(PAD_RADIUS, PAD_RADIUS)
            - _stick.size * 0.5)

func _input(event: InputEvent) -> void:
    if not _input_enabled or not visible or _base == null:
        return
    if event is InputEventScreenTouch:
        if event.pressed:
            # Do not steal touches meant for the visible conversation button.
            if _interact.get_global_rect().has_point(event.position):
                return
            var centered := _base.get_global_rect().get_center()
            if joystick_index == -1 and event.position.distance_to(centered) <= PAD_RADIUS * 1.35:
                joystick_index = event.index
                _update_stick(event.position)
                get_viewport().set_input_as_handled()
            elif camera_index == -1:
                camera_index = event.index
        else:
            if event.index == joystick_index:
                _reset_movement()
            elif event.index == camera_index:
                camera_index = -1
    elif event is InputEventScreenDrag:
        if event.index == joystick_index:
            _update_stick(event.position)
            get_viewport().set_input_as_handled()
        elif event.index == camera_index:
            look_changed.emit(event.relative)
            get_viewport().set_input_as_handled()

func _update_stick(point: Vector2) -> void:
    var center := _base.get_global_rect().get_center()
    var offset := point - center
    move = (offset / MAX_STICK_DISTANCE).limit_length()
    _stick.position = (Vector2(PAD_RADIUS, PAD_RADIUS)
        - _stick.size * 0.5 + move * MAX_STICK_DISTANCE)
    move_changed.emit(move)
