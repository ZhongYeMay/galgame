# 夏日未寄 / MayOS 原生移植（开发版）

此目录包含 **C++17 + SDL2 原生程序**、AI 自由对白模式、经典固定剧情模式、音乐合成器、原版剧情导出器，以及 Linux 完整资源下载启动器。
游戏程序不是浏览器窗口或 WebView，使用 SDL2 原生绘图、SDL_ttf 文字绘制和 SDL_Audio 运行时合成 BGM。

## 默认玩法：AI 驱动的自由输入对话

默认启动 `mayos_summer_ai`：不是选择题，不会显示预设的剧情回答选项。启动时女主开场白由 DeepSeek 实时生成；玩家每回合自行输入回答，模型生成后续女主台词。按 F4 请求女主主动生成新话题，按 F1/F2/F3 切换澪、凪、栞。剧情位置、角色职业和故事背景来自原版 `story.js` 导出数据。AI 对话只保存在运行内存，不改动原版剧情或六结局。

只有配置 `DEEPSEEK_API_KEY` 并联网时才能出现 AI 台词；否则会明确显示未配置/网络错误，不使用假台词替代。API Key 不写入代码、包或日志。自动化测试不调用真实付费 API。

经典版 `mayos_summer_play` 仍可单独运行，以便保留原版固定分支及六结局，不是默认启动目标。其存档/已读跳过/动画功能仍处于开发阶段。

## 已实现的开发版功能

- 直接加载原版 `site/assets/retro/*.webp` 场景与人物图片。
- 使用 `tools/export_native_story.cjs` 从原版 `site/story.js` 导出全部故事数据；不改写剧情文本和分支。
- 原生 UTF-8 中文、日文对白，数字键选择分支，鼠标点击推进或选项；提供基础场景渐显、人物渐显及姿态动作。
- 由 SDL 音频回调按原版网页游戏的旋律与间隔合成背景音乐。
- F5 保存节点、历史对白、已读节点与已解锁结局到持久化 JSON；F9 读档；H 查看最近对白；A 自动推进，S 跳过已读下一句。
- Linux 启动器从固定 GitHub commit 下载**完整原版 site 目录**，用构建时的清单逐文件核对 SHA-256 与大小，完整匹配后才启动本地 C++ 程序。相同资源缓存并复查。
- GitHub Actions 定义了构建、剧情测试、下载安全测试与 SDL headless 单帧测试。**是否实际通过需查看对应 Actions 运行结果。**

## Linux 本地编译与试运行

需安装 CMake、C++17 编译器、Node.js、SDL2、SDL2_image（含 WebP）、SDL2_ttf、nlohmann-json、libcurl、线程库和一款中日韩字体。

```sh
node tools/export_native_story.cjs native/story.generated.json
cmake -S native -B build/native
cmake --build build/native --parallel 2
./build/native/mayos_summer_ai . native/story.generated.json /usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc
```

快捷键：

| 按键 | 操作 |
| --- | --- |
| 空格 / Enter | 推进对白，结局画面 Enter 回到开头 |
| 1–9 / 鼠标 | 选择剧情分支 |
| F5 / F9 | 保存 / 读取 |
| H | 历史对白 |
| A / S | 自动推进 / 已读快进 |
| M | 开关背景音乐（默认关闭） |
| T | 进入可选 DeepSeek AI 女主自由对话（见 AI_MODE.md） |
| AI 模式 Enter / Esc | 发送消息 / 返回原版剧情 |
| 上 / 下方向键 | 调整音乐音量 |
| Esc | 关闭历史面板或退出 |

以下快捷键属于经典版，AI 自由对白模式使用 F1–F3 选女主、F4 主动发言、Enter 发送玩家填写的文字、Esc 退出。\n\n存档位置优先为 `$XDG_DATA_HOME/mayos-summer/save.json`，其次是 `~/.local/share/mayos-summer/save.json`。

## GitHub Actions 产物的使用方式

在 `mayos-game-package` 分支的 Actions 工作流中，成功构建后下载 `mayos-native-linux-prototype` 压缩包。

```sh
mkdir -p mayos-native
tar xzf mayos-native-linux-prototype.tar.gz -C ./mayos-native
cd ./mayos-native
python3 launch_native.py --download-only
python3 launch_native.py
python3 install_shortcut.py
```

启动器脚本会从 `package-config.json` 固定的提交下载完整原版资源，将其保存到 `~/.cache/mayos-summer/<commit>/` 或 `$XDG_CACHE_HOME/mayos-summer/<commit>/`。再次启动时重新验证缓存。安装应用菜单快捷方式后，图标只是启动这个下载与原生运行过程，不会打开网页游戏。

## 尚未完成的部分

- AI 模式目前只实现自由对话，不具备原版六结局的动态 AI 剧情判定，经典版仍保留原剧情。\n- GUI 风格尚未完整复现原版网页（标题页、相册、手动存档的六个槽位、设置面板等）。
- 文字逐字动画、完整场景转场和复杂角色动作尚不完整；自动推进、已读跳过目前是基础实现。
- 尚无 MayKernel 专用 SDL/图形、音频、网络、字体、文件系统后端，也没有 MayKernel 启动验证。
- Linux 产物依赖目标系统的 SDL2 动态库与 CJK 字体；尚无全平台独立安装包。
- Linux 编译和无头运行以实际 CI 结果为准，不能把提交代码等同于测试通过。
- DeepSeek 实时调用需要运行时环境变量 DEEPSEEK_API_KEY；真实密钥从不写入仓库。AI 模式不改变原版主线。
- AI API 的真实联网验收尚未执行；离线自动测试只检查请求格式和人物设定。


本移植不更改原版 `site/` 内任何剧情或素材，原版浏览器游戏继续独立运行。
