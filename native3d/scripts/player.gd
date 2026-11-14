extends CharacterBody3D
class_name SummerPlayer

signal interaction_requested

@export var walk_speed := 4.1
@export var run_speed := 6.8
@export var acceleration := 13.0
@export var jump_enabled := false
@export var look_sensitivity := 0.0022

var input_locked := false
var virtual_move := Vector2.ZERO
var virtual_look := Vector2.ZERO
var region := Rect2(-35, -35, 70, 70)

var _yaw := 0.0
var _pitch := -0.12
var _camera: Camera3D
var _boom: SpringArm3D

func _ready() -> void:
    name = "Player"
    collision_layer = 1
    collision_mask = 1
    var collider := CollisionShape3D.new()
    var capsule := CapsuleShape3D.new()
    capsule.radius = 0.36
    capsule.height = 1.72
    collider.shape = capsule
    collider.position.y = 0.86
    add_child(collider)

    _boom = SpringArm3D.new()
    _boom.name = "CameraBoom"
    _boom.position = Vector3(0.0, 1.55, 0.0)
    _boom.spring_length = 3.5
    _boom.margin = 0.18
    _boom.collision_mask = 1
    add_child(_boom)
    _camera = Camera3D.new()
    _camera.name = "Camera"
    _camera.fov = 58
    _camera.current = true
    _boom.add_child(_camera)
    _update_view()

func _unhandled_input(event: InputEvent) -> void:
    if input_locked:
        return
    if event is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
        rotate_camera(event.relative)
    if event.is_action_pressed("interact"):
        interaction_requested.emit()
    if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
        Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
    if event.is_action_pressed("pause_menu"):
        Input.mouse_mode = Input.MOUSE_MODE_VISIBLE

func rotate_camera(delta: Vector2) -> void:
    _yaw -= delta.x * look_sensitivity
    _pitch = clampf(_pitch - delta.y * look_sensitivity, -1.15, 0.65)
    _update_view()

func _update_view() -> void:
    _boom.rotation = Vector3(_pitch, _yaw, 0.0)

func _physics_process(delta: float) -> void:
    if input_locked:
        velocity.x = move_toward(velocity.x, 0.0, acceleration * delta)
        velocity.z = move_toward(velocity.z, 0.0, acceleration * delta)
    else:
        var move := Input.get_vector("move_left", "move_right", "move_forward", "move_back")
        if virtual_move.length() > move.length():
            move = virtual_move.limit_length()
        var forward := Vector3(-sin(_yaw), 0, -cos(_yaw))
        var right := Vector3(cos(_yaw), 0, -sin(_yaw))
        var direction := (right * move.x - forward * move.y).normalized()
        var speed := run_speed if Input.is_action_pressed("sprint") else walk_speed
        velocity.x = move_toward(velocity.x, direction.x * speed, acceleration * delta)
        velocity.z = move_toward(velocity.z, direction.z * speed, acceleration * delta)
    if not is_on_floor():
        velocity.y -= ProjectSettings.get_setting("physics/3d/default_gravity") * delta
    else:
        velocity.y = -0.2
    move_and_slide()
    # Fixed authored world boundaries; no procedural infinite world.
    global_position.x = clampf(global_position.x, region.position.x, region.end.x)
    global_position.z = clampf(global_position.z, region.position.y, region.end.y)
    if virtual_look.length() > 0.001:
        rotate_camera(virtual_look * delta * 55.0)

func get_nearby_npc(npcs: Array[Node3D], radius: float = 2.8) -> Node3D:
    var closest: Node3D = null
    var distance := radius
    for candidate in npcs:
        if not is_instance_valid(candidate):
            continue
        var d := global_position.distance_to(candidate.global_position)
        if d < distance:
            distance = d
            closest = candidate
    return closest
