# 《夏日未寄》Windows 10 x64 完整版 · 双模式

这是原版网页视觉小说的 Windows 桌面封装（.NET 8 WinForms + Microsoft Edge WebView2），不是重画的粗糙桌面 UI。发布包中 www/ 的所有文件直接来自正式版 main 分支的 site/；原版 1600×900 设计、全部故事与 CG 不做删减。

## 模式选择（默认完全离线）

每次启动默认选择标题页底部「离线 · 完整剧情」：

- 不联网、不需要 DeepSeek API Key、不消耗 API 配额。
- 使用最新原版的十个章节片段、共同篇、关系积累分支、三位女主的路线以及六种原版结局。
- 保留原版六槽位存读档、自动续读、对白回看、自动播放、已读快进、结局鉴赏、设置、背景音乐、场景人物动画与文字渐显。
- 通过最新网页原有的游戏函数处理剧情，未重新实现删减版状态机。
- 离线存档使用原作 natsuday-v2- 命名空间；AI 记录存储在独立命名空间，不会覆盖离线进度。

仅当你主动点击「在线 · AI 自由对话」并开始新游戏时，才进入在线模式：

- 女主由 DeepSeek 主动生成开场与后续新话题，玩家自由填写答案。
- F1/F2/F3 选角色，F4 请求女主主动发言，Enter 发送。
- API 设置通过 Windows 原生密码输入框提供临时测试 Key，或者由本机 DEEPSEEK_API_KEY 环境变量读取。
- Key 不交给网页 JavaScript、存档或日志。
- 六个独立 AI 文字存档槽可用，但读档后模型上下文重新建立。
- AI 自由对话目前不负责原版六结局判定。想玩完整正式剧情，请使用离线模式。

两个模式在返回标题页后切换，不会修改正式版网页，也不在离线模式发送 API 请求。此前贴在聊天中的测试 Key 已曝光，建议在 DeepSeek 控制台撤销并更换。

## Windows 安装

访问 https://github.com/ZhongYeMay/galgame/actions/workflows/windows-x64.yml ，选择成功的 Windows x64 构建，从 Artifacts 下载 MayosSummer-Win10-x64 压缩包。解压后运行 MayosSummer.exe；请保留 www/ 和 desktop-ai.js 等文件，不要只复制 EXE。

需要 Windows 10 64 位和 Microsoft Edge WebView2 Runtime。多数 Edge 用户已装，但不保证；如缺少，从微软官方网站下载安装：https://developer.microsoft.com/microsoft-edge/webview2/ 。

采用 .NET 8 自包含打包，无需额外安装 .NET。原版网页字体使用 Google Noto，完全断网且系统没有 Noto 字体时会使用 Windows 字体回退；画面素材和布局仍保持原版。

## 测试说明

CI 先证明 Windows 分支的 site/ 与正式 main 完全一致，检查全部十二张 WebP 原始资源，然后通过真实 Microsoft Edge headless 浏览器验证十个章节、六个原版结局、离线存档、AI 模拟对话以及两种存档相互隔离，再编译 self-contained Win10 x64 EXE。

浏览器测试中 AI 返回的是模拟响应，不消耗真实 DeepSeek Token；真实 Windows 10 EXE 图形窗口及付费 API 仍须单独验证。只有 GitHub Actions 成功生成的 ZIP 才视为可交付构建，不把提交代码等同于通过测试。

Windows 版本独立维护在 windows-10-x64 分支，正式网页 main 分支不被修改。
