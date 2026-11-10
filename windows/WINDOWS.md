# 夏日未寄 — Windows 10 x64 桌面版

这个项目以 **原版网站 main 分支的 `site/` 文件为唯一界面来源**。Windows 桌面程序使用 WinForms 作为启动宿主，通过微软 Edge WebView2 显示**同一份 index.html / style.css / game.js / story.js 和全部 12 张 WebP 素材**。没有重新绘制一个低保真“仿网页版”窗口，不对原有网站文件做任何修改。

**实现方式说明：这是 Windows 原生 EXE 托管 WebView2 的桌面版，页面本身仍用浏览器排版引擎渲染。它不是不依赖 WebView 的纯 C++ 自绘引擎。** 选择 WebView2 是为了保证原版 1600×900 布局、立绘、渐变、字体、动画和按钮交互忠实于网站。

## Windows 10 x64 运行要求

- Windows 10 64 位，建议至少 1920×1080 显示器；内部画布仍固定 1600×900，窗口按画面大小自动等比缩放。
- 已安装 **Microsoft Edge WebView2 Evergreen Runtime**。大多数 Win10 电脑有预装，如果启动时提示找不到运行时，请访问微软官方安装页：
  https://developer.microsoft.com/microsoft-edge/webview2/
- **不必单独安装 .NET 8**：GitHub Actions 使用 self-contained publish。
- 标题、菜单、CG、自动播放、回忆鉴赏、原版实时合成 BGM 的视觉和实现均来自现有网页。字体仍沿用 `style.css` 对 Google Noto Serif/Sans 的在线引用；离线环境会使用系统后备字体，届时字形可能不完全相同。

## 下载可执行程序

1. 打开 https://github.com/ZhongYeMay/galgame/actions/workflows/windows-x64.yml
2. 选择成功的 **Windows 10 x64 desktop release** 运行。
3. 在 Artifacts 下载 `MayosSummer-Win10-x64`，解压 ZIP。
4. 启动 `MayosSummer.exe`，**整个文件夹应保持完整**。不要单独把 EXE 拿走：`www/` 包含所有本地原版素材。

当前该发布包是否成功生成，要以 GitHub Actions 实际状态为准。未通过构建时不能认为已有可运行 exe。

## AI 玩法（Windows 桌面独有）

- 保留网页版完整标题页的所有视觉设计；点击「开始新的夏天」后进入 AI 自由对话。
- AI 由女主主动开场，每回合玩家直接在原版风格的半透明选项区域**自由填写回复**，没有固定答案选项。后续由 DeepSeek 即时生成新台词。
- F1、F2、F3 切换澪、凪、栞；F4 或「让她先说」让她主动提出新话题；F11 切换最大化/窗口模式；Alt+F4 退出游戏。
- LOG 回看及 SAVE/LOAD 六个槽位在 Windows AI 模式下记录文字。每位角色上下文分离，最多保留 12 条模型上下文；读取存档后显示文字记录，AI 上下文从当前角色重新开始。
- 图像、场景、人物、音乐等全部继续使用原版样式和素材，玩家回复框使用原版紫色半透明边框与排版。
- 原版三路线、六结局脚本和资源没有被删除；**当前 AI 模式不负责生成原版六结局判定**。因此它是完整原画的自由对话模式，不应误称已经将 AI 接入每个原版结局节点。

## DeepSeek 测试密钥（绝不随包发布）

首次进入 AI 模式，点击「API 设置」：会弹出 Windows 原生**密码遮罩输入框**。粘贴测试 Key 并确认即可。密钥只保存在当前进程内存中，不提供给 HTML/JavaScript，也不会保存到 GitHub、日志或 localStorage。

另一个选择是从本机终端预先设置环境变量 `DEEPSEEK_API_KEY`，由游戏程序在本地读取，网页脚本永远拿不到变量的值。

完成设置后点击游戏内的「测试连接」，Windows 宿主会调用 DeepSeek 的官方 Chat Completions 接口，验证授权、网络与模型是否可用。测试将产生少量 API token 开销。默认模型 `deepseek-flash`，关闭深度思考；每轮最多 200 生成 token，单请求超时 35 秒。

**此前在聊天中展示过的测试密钥不应再用于长期正式发布。** 测试完成请到 DeepSeek 控制台撤销并创建新 Key。代码、提交和构建工作流不会包含任何真实 API Key。测试脚本不做在线调用；不能把离线编译验证当作真实 API 验收。

## 本地编译（需要联网下载 NuGet 依赖）

```powershell
dotnet restore windows/MayosSummer.Win/MayosSummer.Win.csproj --runtime win-x64
dotnet publish windows/MayosSummer.Win/MayosSummer.Win.csproj -c Release -r win-x64 --self-contained true -p:PublishTrimmed=false -o dist/MayosSummer-Win10-x64
```

CI 对 `site/` 执行原始文件差异验证，检查十二张原图以及 WebView2 发布目录完整性。当前不具备在本地 Linux 容器运行 Windows 10 GUI 的能力；自动构建是否通过与 Windows 图形验收必须分别核实。

## 隐私

AI 回复只使用当前角色背景、玩家主动发送的文字以及近期上下文。AI 模式文字存档存放在 Windows WebView2 本地用户数据目录（本机）；请勿在对话中输入个人秘密。关闭程序后内存中的 API Key 消失，但在 DeepSeek 后台撤销 Key 仍需用户完成。
