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
