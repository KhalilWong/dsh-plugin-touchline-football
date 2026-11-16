# Touchline Football · 开源 DSH 足球悬浮插件

本项目以 DeepSeek Harness（DSH）插件为唯一正式交付物。仓库保留本地调试页面，供开发者验证渲染与数据，不提供独立网页版产品支持。

## 插件能力

- 可拖动、可切换尺寸的 2D 比赛小窗，会话输入区显示比分胶囊。
- 直播场次选择、比分和关键事件记录。
- 本地逐帧回放与播放/暂停；没有直播时也可从胶囊进入回放。
- `Ctrl+Shift+X` 隐藏/恢复小窗和胶囊；已由用户手动确认真实宿主中可正常切换。

直播球员位置根据阵型和事件推演，并非实时光学追踪。回放精度取决于导入文件；仓库提供的演示生成器产生合成数据。

## 构建与安装

公开项目名为 **Touchline Football**，仓库为 [KhalilWong/dsh-plugin-touchline-football](https://github.com/KhalilWong/dsh-plugin-touchline-football)。内部包名保留 `dsh-plugin-touchline`，兼容已有安装。普通用户可从 [GitHub Releases](https://github.com/KhalilWong/dsh-plugin-touchline-football/releases) 下载预构建 `.tgz` 安装包，无需构建源码；当前发布状态见[发布指南](docs/releasing.md)。

环境：Node.js 20+，以及支持所需插件接口的 DSH 宿主。

```sh
npm ci
npm run plugin:pack
```

安装包：`dist/dsh-plugin-touchline-<version>.tgz`。在 DSH“插件 → 添加插件 → 安装第三方插件”中输入安装包绝对路径并启用。

请使用 `.tgz` 安装，不要将源码目录以 `link:` 安装。本机宿主卸载链接插件时曾清空链接目标目录，详情见[实机验收记录](docs/acceptance-2026-11-10.md)。

配置、回放目录与宿主接口要求见[插件说明](plugin/README.md)。生成合成回放可执行 `npm run replay:demo`，然后将插件的 `replayDir` 指向本项目 `data/replay` 绝对路径。安装包不包含回放数据。

## 开发与验证

```sh
npm run build          # 类型检查并构建 DSH 插件
npm test               # 异步请求与生命周期回归
npm run check:plugin   # 使用本机 Edge 的离线组件回归
npm run check:replay   # 本地官方 Metrica 样本回放验收（需先 data:fetch）
npm run plugin:pack    # 检查、测试、构建并打包唯一正式交付物
```

`check:plugin` 使用模拟宿主，不能替代真实 DSH 验收。已在 Windows 的 DSH 0.2.2-rc.1 验证安装、挂载、回放和停用后重新启用。用户已手动确认老板键可隐藏并恢复；7 条路由的实机停用清理和恢复已通过。真实直播往返切换仍待补验，见[首次验收记录](docs/acceptance-2026-11-10.md)与[补充验收记录](docs/acceptance-2026-11-11.md)。

本地调试页的启动、回放与诊断方式见[开发调试指南](docs/development.md)。默认构建不再生成调试页；调试页单独输出到 `dist/debug/`，不会清空插件安装包。

0.6.0 已修复回放采样、缺失坐标和播放时钟，加入帧间插值；官方 Metrica 第 1 场前 15 分钟的接入与测试范围见[真实追踪回放验收](docs/acceptance-2026-11-12.md)。

0.7.0 支持整场追踪、替补球员、进度条与片段跳转。官方第 1 场完整 96:40 回放及六次换人的测试范围见[整场验收](docs/acceptance-0.7.0.md)。转换命令：`npm run data:fetch -- --game 1 --full --fps 10`。

0.8.0 改进直播同步、缺失坐标与事件推演运动约束；当前无正在进行赛事，实机使用明确标记的模拟事件流，具体边界见[直播同步验收](docs/acceptance-0.8.0.md)。离线回归可运行 `npm run check:live`。

## 代码结构与维护范围

| 目录 | 用途 |
| --- | --- |
| `plugin/` | 正式插件：宿主接口、客户端、小窗和胶囊 |
| `src/lib/engine.ts` | 插件和调试页共用的球场引擎 |
| `src/replay/` | 共用回放格式与本地回放调试入口 |
| `plugin/host/sources/` | 数据源与归一化；本地代理复用相同实现 |
| `src/App.tsx`、`src/components/`、`server/` | 本地调试工具，不作为独立产品发布 |
| `tests/`、`scripts/` | 回归检查、打包、演示数据和数据转换 |

新增用户功能优先落在 DSH 插件；渲染、数据和回放核心尽量共用。调试页只维护辅助诊断所需能力，不要求与插件界面逐项同步。不向插件包加入 Express 服务或网页产品外壳。

## 开源与数据边界

贡献方式见 [CONTRIBUTING.md](CONTRIBUTING.md)，版本变化见 [CHANGELOG.md](CHANGELOG.md)，发布流程和当前待办见[发布指南](docs/releasing.md)。`npm run release:prepare` 构建安装包、生成可构建的源码归档和 SHA256 校验文件；不会上传或发布。

代码采用 [MIT](LICENSE) 许可。第三方赛事数据不在该许可授权范围内；发布包不包含赛事数据、下载样本或队徽文件。本地数据目录已被忽略。

默认数据源为 ESPN 公开接口，可能有延迟、缺失或结构变化。比分和事件来自数据源，连续球员位置由引擎推演。逐帧回放文件格式见 `src/replay/format.ts`，引擎通过 `MatchEngine.applyFrame()` 接收坐标。
