# 夏日未寄 / 夏の便り — 真 3D 重制（Windows + Android）

这是与已发布的 2D 网页游戏 **完全独立** 的 Godot 4.x 原生 3D 工程。项目不是 WebView，不是 2.5D 深度投影，也不会把人物立绘装在纸板上冒充 3D 人物。

## 目标

- 第三人称完整 3D 角色、骨骼、表情与动作，原创日式赛璐璐渲染；
- 固定范围镰仓海滨、电车道口、潮音放送室、月灯书店；
- Windows 10/11 x64 / Android ARM64；键鼠与触屏控制；
- 三位女主靠近交互、AI 自由输入、女主主动发言；
- 保留现有 2D 版 10 章、3 线、6 结局，并在后期建立完整 3D 剧情实现。
- 不发布粗糙占位资源或缺少美术资产的空壳作为“可玩成品”。

## 已提交的真实代码

- `project.godot`、`scenes/Main.tscn`：Godot 4 原生工程与入口；
- `scripts/player.gd`：第三人称胶囊碰撞、SpringArm3D 相机、移动/奔跑、有限边界；
- `scripts/world.gd`：3D 世界与灯光、三位 NPC、交互半径和场景加载；
- `scripts/dialogue.gd`：原生控件、自由输入、DeepSeek 在线非流式请求、上下文与主动对白；
- `scripts/mobile_controls.gd`：Android 触控输入；
- `scripts/asset_gate.gd`：要求正式 GLB 模型与验收文件，阻止粗糙占位构建。

**当前没有用户要求的完整高精度 3D 人物、场景模型。** 因此原生工程尚不能作为完整游戏运行；必须先引入通过美术检查的原创 GLB，且触屏、AI 网络、音频和导出还未实机验证。此前的 `voice-dualmode-v1.1.0-test` Win10 / Android 安装包仍是旧版 2D 双模式程序，并不是这个 3D 工程。

## 模型导入约定

```text
native3d/assets/world/kamakura_full.glb
native3d/assets/characters/player.glb
native3d/assets/characters/mio.glb
native3d/assets/characters/nagi.glb
native3d/assets/characters/shiori.glb
native3d/assets/reviews/*.json
```

模型必须是真正可从任意视角观察的网格，包括背面、顶部、底部、独立材质，NPC 需标准骨骼和多套动作。不可将 2D 角色图片置于 MeshInstance3D 的 PlaneMesh 上充当人物。

制作方式可以使用有许可的 AI 文生 3D / 图生 3D 生成流程，但需人工修模、重拓扑、UV、贴图与绑定。美术应该与 `site/assets/retro/` 已经存在的原版角色/场景保持一致。每份 review JSON 需要记录原创出处、许可、模型网格与骨骼信息、画面审核结论，且不得包含个人 API Key。

## 本地打开

用 Godot 4.x 打开 `native3d/project.godot`。导入完成后检查脚本，再将通过验收的 GLB 放入上述目录。

Windows / Android 导出预设位于 `export_presets.cfg`。Android 正式导出需要正确配置 Android SDK、JDK 17、导出模板及签名；GitHub Actions 只有美术验收通过后才应允许发放可玩安装包。官方文档：https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_android.html

## 质量红线

1. 角色 3D 轮廓和服装保持原版角色辨识度。
2. 地图几何必须真实，不允许照片投影/单面广告板/方块替代。
3. 不以“能导出”冒充“已通过真机测试”。
4. 不覆盖旧版 2D Release、存档和网页游戏。
5. 原生工程目前尚未继承 2D 版 Fish Audio/固定剧情完整语音；后续需要单独移植验证。

## 后续实装记录（2026-11-14）

- Android 虚拟摇杆改为以实际屏幕坐标为中心，移动触点跟踪，防止与「交谈」按钮冲突；开始交谈后暂停移动输入
- 角色使用真正的 `SpringArm3D` 相机、`CharacterBody3D` 物理移动；导入有骨骼的角色时可切换 `Idle / Walk / Run` 动画；NPC 支持 `Idle / Talk`
- 世界导入现在要求正式 GLB 中含 `COL_` 命名的地面及建筑物碰撞几何，运行时转换为物理碰撞，拒绝无碰撞的空场景
- 质量门槛同时检查模型拓扑/骨骼/动画/材质、GLB 格式、原出处/许可与人工审核记录；本地也验证审核标记
- `assets/ART_DIRECTION.md` 规定原版人物/场景的多角度高精度美术验收
- `shaders/cel_surface.gdshader` 提供真实模型表面使用的二次元赛璐璐材质，不直接替换或重画原版贴图
- `tools/stage_glb.py` 用于导入外部 AI 初稿/人工修模后的真实 GLB，默认写入 `approved=false`，不会伪造美术验收
- Android 改为传感器横屏；GitHub Actions 在模型审核成功后才允许 EXE / APK 导出

**重要：这仍是开发工程，不是一个已完成的《原神》式高清可玩游戏。** 当前仓库缺少已批准的真正高精度 3D 资产，故不提供新的 EXE/APK 下载，也未完成 Android 真机、Windows 实机、真实 GPU 帧率、Fish Audio 3D 版配音测试。Godot headless 工作流只验证工程能否加载/解析，不能作为成品验收依据。


## 免费本地 / GitHub Actions 模型推理（TripoSR CPU）

新路线直接运行开源的 **TripoSR**（Stability AI / VAST AI Research，MIT），不再调用受 GPU 限额限制的 Gradio 免费网页服务，也不需要 fal 付费额度。

- Actions 工作流：\`.github/workflows/triposr-cpu.yml\`，首次推送自动测试橘凪；以后可在 Actions → Run workflow 选择澪、凪、栞和分辨率
- 本地脚本：\`native3d/tools/triposr_cpu_infer.py\`
- 模型权重：官方 \`stabilityai/TripoSR\` 的 \`model.ckpt\`（约 1.68 GB），运行时下载并校验 SHA-256；不放入 Git 仓库
- 计算方式：CPU 运行开源权重、真实的三维网格重建和 CPU marching cubes，不使用伪造的 3D 占位图
- 输出：Actions Artifacts 下的 \`*_triposr_cpu.glb\`、\`*.review.json\`、\`triposr_input.png\`，只有成功运行并检查 GLB 后才会上传

**本地运行条件**：Python 3.11、Pillow、NumPy、CPU 版 PyTorch、Transformers、TripoSR 官方源代码，以及能够访问 Hugging Face 并下载约 1.68 GB 权重的网络。最低内存与运行时间取决于采样分辨率；小内存设备建议使用 96 或 128 的 marching cubes 分辨率。当前 ChatGPT 容器无外网权重下载能力，因此不能在该容器内完成真实推理。

**重要质量提醒**：TripoSR 是单视图三维重建，不保证动漫角色背面、发型、服装、骨骼和表情准确。它生成的是**未经人工验收的静态三维网格**，不等于正式的可动画角色模型。输出仅用于修模阶段；美术未通过人工审核前不允许纳入最终 Android/Windows 游戏安装包。

模型与代码出处：
- https://github.com/VAST-AI-Research/TripoSR
- https://huggingface.co/stabilityai/TripoSR
