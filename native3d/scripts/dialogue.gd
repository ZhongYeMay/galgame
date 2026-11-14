extends Control
class_name SummerDialogue

signal dialogue_closed

const API_URL := "https://api.deepseek.com/chat/completions"
const MODEL := "deepseek-flash"

var npc: SummerNPC
var api_key := ""
var pending := false
var history_by_route: Dictionary = {}
var active_request: HTTPRequest
var active_route := ""
var active_prompt := ""

var overlay: ColorRect
var panel: PanelContainer
var name_label: Label
var response_label: RichTextLabel
var input: TextEdit
var status: Label
var api_entry: LineEdit
var send_button: Button
var proactive_button: Button
var key_panel: HBoxContainer
var enable_fish_voice := false

func _ready() -> void:
    set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
    mouse_filter = Control.MOUSE_FILTER_PASS
    visible = false
    _build_ui()

func _color(code: String) -> Color:
    return Color(code)

func _make_style() -> StyleBoxFlat:
    var box := StyleBoxFlat.new()
    box.bg_color = _color("#1c1c37f5")
    box.border_color = _color("#b6a5ea")
    box.set_border_width_all(1)
    box.set_corner_radius_all(4)
    box.content_margin_left = 23.0
    box.content_margin_right = 23.0
    box.content_margin_top = 22.0
    box.content_margin_bottom = 18.0
    box.shadow_color = _color("#090b22b6")
    box.shadow_size = 24
    return box

func _make_button(text: String) -> Button:
    var button := Button.new()
    button.text = text
    button.add_theme_font_size_override("font_size", 18)
    button.custom_minimum_size = Vector2(156, 47)
    return button

func _build_ui() -> void:
    overlay = ColorRect.new()
    overlay.color = _color("#1110258b")
    overlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
    overlay.mouse_filter = Control.MOUSE_FILTER_STOP
    add_child(overlay)

    panel = PanelContainer.new()
    panel.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_WIDE)
    panel.custom_minimum_size.y = 340
    panel.offset_left = 90
    panel.offset_right = -90
    panel.offset_top = -370
    panel.offset_bottom = -35
    panel.add_theme_stylebox_override("panel", _make_style())
    add_child(panel)

    var layout := VBoxContainer.new()
    layout.add_theme_constant_override("separation", 12)
    panel.add_child(layout)

    var heading := HBoxContainer.new()
    layout.add_child(heading)
    var title := Label.new()
    title.text = "夏の便り  /  LETTERS TO SUMMER"
    title.add_theme_color_override("font_color", _color("#d2bfea"))
    title.add_theme_font_size_override("font_size", 14)
    title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
    heading.add_child(title)
    var close_button := _make_button("BACK / 结束交谈")
    close_button.pressed.connect(close)
    heading.add_child(close_button)

    name_label = Label.new()
    name_label.add_theme_font_size_override("font_size", 28)
    name_label.add_theme_color_override("font_color", _color("#fff0ff"))
    layout.add_child(name_label)

    response_label = RichTextLabel.new()
    response_label.fit_content = false
    response_label.bbcode_enabled = false
    response_label.scroll_active = true
    response_label.custom_minimum_size.y = 62
    response_label.size_flags_vertical = Control.SIZE_EXPAND_FILL
    response_label.add_theme_font_size_override("normal_font_size", 19)
    layout.add_child(response_label)

    input = TextEdit.new()
    input.placeholder_text = "填写你的回答……每次由你自由输入，不是选择题"
    input.custom_minimum_size.y = 64
    input.add_theme_font_size_override("font_size", 17)
    input.wrap_mode = TextEdit.LINE_WRAPPING_BOUNDARY
    layout.add_child(input)

    var buttons := HBoxContainer.new()
    layout.add_child(buttons)
    send_button = _make_button("寄出回答")
    send_button.pressed.connect(func(): _request(false))
    buttons.add_child(send_button)
    proactive_button = _make_button("让她先说")
    proactive_button.pressed.connect(func(): _request(true))
    buttons.add_child(proactive_button)
    var key_button := _make_button("AI 连接")
    key_button.pressed.connect(func(): key_panel.visible = not key_panel.visible)
    buttons.add_child(key_button)

    status = Label.new()
    status.text = "在线对话需要你自己的 DeepSeek API Key。密钥只保留在当前进程内存中。"
    status.add_theme_color_override("font_color", _color("#d9cbe7"))
    status.add_theme_font_size_override("font_size", 13)
    status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
    layout.add_child(status)

    key_panel = HBoxContainer.new()
    key_panel.visible = false
    layout.add_child(key_panel)
    api_entry = LineEdit.new()
    api_entry.placeholder_text = "DeepSeek API Key（本次使用）"
    api_entry.secret = true
    api_entry.size_flags_horizontal = Control.SIZE_EXPAND_FILL
    key_panel.add_child(api_entry)
    var save_key := _make_button("本次使用")
    save_key.pressed.connect(_save_key)
    key_panel.add_child(save_key)
    var clear_key := _make_button("清除密钥")
    clear_key.pressed.connect(func():
        api_key = ""
        api_entry.clear()
        status.text = "已清除本次 API Key。"
    )
    key_panel.add_child(clear_key)

func open_for(target: SummerNPC) -> void:
    if target == null:
        return
    npc = target
    name_label.text = target.display_name
    response_label.text = "你遇见了%s。请输入你想说的话，或让她主动开口。" % target.display_name
    status.text = "自由输入模式 · AI 回复需要自行连接 DeepSeek。"
    input.clear()
    key_panel.visible = false
    visible = true
    input.grab_focus()

func _save_key() -> void:
    if api_entry.text.strip_edges().length() < 18:
        status.text = "请输入有效格式的 API Key。"
        return
    api_key = api_entry.text.strip_edges()
    api_entry.clear()
    key_panel.visible = false
    status.text = "DeepSeek Key 已配置，当前进程退出时自动失效。"

func _persona() -> String:
    return npc.get_ai_persona()

func _request(proactive: bool) -> void:
    if pending or npc == null:
        return
    if api_key.is_empty():
        status.text = "请先配置 DeepSeek API Key；没有密钥时不生成假对白。"
        key_panel.visible = true
        return
    var user_text := input.text.strip_edges().substr(0, 800)
    if not proactive and user_text.is_empty():
        status.text = "请先输入回答。"
        return
    var route := npc.route
    var messages: Array = [{"role":"system","content":_persona()}]
    for line in (history_by_route.get(route, []) as Array).slice(-12):
        messages.append(line)
    messages.append({
        "role":"user",
        "content":"请结合眼前的场景自然开始一个话题，不要提供选项。" if proactive else user_text
    })

    var request := HTTPRequest.new()
    request.timeout = 35.0
    request.use_threads = true
    add_child(request)
    active_request = request
    active_route = route
    active_prompt = "" if proactive else user_text
    var headers := PackedStringArray([
        "Authorization: Bearer " + api_key,
        "Content-Type: application/json",
        "Accept: application/json"
    ])
    var body := JSON.stringify({
        "model":MODEL,"stream":false,"temperature":0.8,"max_tokens":240,
        "messages":messages
    })
    # No credential logging and no disk persistence.
    request.request_completed.connect(_response)
    var error := request.request(API_URL, headers, HTTPClient.METHOD_POST, body)
    if error != OK:
        status.text = "无法启动网络请求。请检查网络或 Android INTERNET 权限。"
        request.queue_free()
        active_request = null
        return
    pending = true
    input.editable = false
    send_button.disabled = true
    proactive_button.disabled = true
    status.text = "正在生成对白……"
    request.request_completed.connect(_response)

func _response(result: int, code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
    if active_request != null:
        active_request.queue_free()
        active_request = null
    pending = false
    input.editable = true
    send_button.disabled = false
    proactive_button.disabled = false
    if result != HTTPRequest.RESULT_SUCCESS or code != 200:
        status.text = "AI 请求失败：%s / HTTP %s" % [str(result), str(code)]
        return
    var response = JSON.parse_string(body.get_string_from_utf8())
    if typeof(response) != TYPE_DICTIONARY:
        status.text = "AI 返回了无法解析的数据。"
        return
    var choices = response.get("choices", [])
    if not (choices is Array) or choices.is_empty():
        status.text = "AI 未返回有效对白。"
        return
    var answer = choices[0].get("message", {}).get("content", "")
    if not (answer is String) or answer.strip_edges().is_empty():
        status.text = "AI 返回了空白对白。"
        return
    answer = answer.strip_edges().substr(0, 1500)
    var transcript: Array = history_by_route.get(active_route, [])
    if not active_prompt.is_empty():
        transcript.append({"role":"user","content":active_prompt})
    transcript.append({"role":"assistant","content":answer})
    history_by_route[active_route] = transcript.slice(-12)
    response_label.text = answer
    input.clear()
    status.text = "可以继续自由输入。音频模块未接入本原生 3D 工程。"

func close() -> void:
    if active_request != null and pending:
        active_request.cancel_request()
        active_request.queue_free()
        active_request = null
        pending = false
        input.editable = true
        send_button.disabled = false
        proactive_button.disabled = false
    visible = false
    npc = null
    dialogue_closed.emit()

func _exit_tree() -> void:
    api_key = ""
    history_by_route.clear()
