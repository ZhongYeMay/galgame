# 夏日未寄 / MayOS 原生移植（开发版）

此目录包含 **C++17 + SDL2 原生程序**、音乐合成器、原版剧情导出器，以及 Linux 完整资源下载启动器。
游戏程序不是浏览器窗口或 WebView，使用 SDL2 原生绘图、SDL_ttf 文字绘制和 SDL_Audio 运行时合成 BGM。

## 已实现的开发版功能

- 直接加载原版 `site/assets/retro/*.webp` 场景与人物图片。
- 使用 `tools/export_native_story.cjs` 从原版 `site/story.js` 导出全部故事数据；不改写剧情文本和分支。
- 原生 UTF-8 中文、日文对白，数字键选择分支，鼠标点击推进或选项。
- 由 SDL 音频回调按原版网页游戏的旋律与间隔合成背景音乐。
- F5 保存节点、历史对白、已读节点与已解锁结局到持久化 JSON；F9 读档；H 查看最近对白。
- Linux 启动器从固定 GitHub commit 下载**完整原版 site 目录**，用构建时的清单逐文件核对 SHA-256 与大小，完整匹配后才启动本地 C++ 程序。相同资源缓存并复查。
- GitHub Actions 定义了构建、剧情测试、下载安全测试与 SDL headless 单帧测试。**是否实际通过需查看对应 Actions 运行结果。**

## Linux 本地编译与试运行

需安装 CMake、C++17 编译器、Node.js、SDL2、SDL2_image（含 WebP）、SDL2_ttf、nlohmann-json 和一款中日韩字体。

```sh
node tools/export_native_story.cjs native/story.generated.json
cmake -S native -B build/native
cmake --build build/native --parallel 2
./build/native/mayos_summer_play . native/story.generated.json /usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc
```

快捷键：

| 按键 | 操作 |
| --- | --- |
| 空格 / Enter | 推进对白，结局画面 Enter 回到开头 |
| 1–9 / 鼠标 | 选择剧情分支 |
| F5 / F9 | 保存 / 读取 |
| H | 历史对白 |
| M | 开关背景音乐（默认关闭） |
| 上 / 下方向键 | 调整音乐音量 |
| Esc | 关闭历史面板或退出 |

存档位置优先为 `$XDG_DATA_HOME/mayos-summer/save.json`，其次是 `~/.local/share/mayos-summer/save.json`。

## GitHub Actions 产物的使用方式

在 `mayos-game-package` 分支的 Actions 工作流中，成功构建后下载 `mayos-native-linux-prototype` 压缩包。

```sh
tar xzf mayos-native-linux-prototype.tar.gz -C ./mayos-native
cd ./mayos-native
python3 launch_native.py --download-only
python3 launch_native.py
python3 install_shortcut.py
```

启动器脚本会从 `package-config.json` 固定的提交下载完整原版资源，将其保存到 `~/.cache/mayos-summer/<commit>/` 或 `$XDG_CACHE_HOME/mayos-summer/<commit>/`。再次启动时重新验证缓存。安装应用菜单快捷方式后，图标只是启动这个下载与原生运行过程，不会打开网页游戏。

## 尚未完成的部分

- GUI 风格尚未完整复现原版网页（标题页、相册、手动存档的六个槽位、设置面板等）。
- 文字逐字动画、场景转场、角色姿态动画、自动推进与已读跳过尚不完整。
- 尚无 MayKernel 专用 SDL/图形、音频、网络、字体、文件系统后端，也没有 MayKernel 启动验证。
- Linux 产物依赖目标系统的 SDL2 动态库与 CJK 字体；尚无全平台独立安装包。
- Linux 编译和无头运行以实际 CI 结果为准，不能把提交代码等同于测试通过。

本移植不更改原版 `site/` 内任何剧情或素材，原版浏览器游戏继续独立运行。
