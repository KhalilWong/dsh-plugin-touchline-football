# Touchline Football

**在 DeepSeek Harness（DSH）中查看足球比分、比赛事件和 2D 球场，支持本地追踪回放。**

[下载 1.0.0](https://github.com/KhalilWong/dsh-plugin-touchline-football/releases/tag/v1.0.0) · [配置说明](plugin/README.md) · [反馈问题](https://github.com/KhalilWong/dsh-plugin-touchline-football/issues) · [更新记录](CHANGELOG.md)

> 直播球场根据阵型和事件推演，不是真实连续球员追踪。公开数据可能延迟或缺失，5 秒轮询目标不代表比赛现场到界面的总延迟。

## 能做什么

- **比赛小窗**：可拖动、可切换尺寸，配合会话输入区的比分胶囊。
- **比分与事件**：选择直播场次，查看比分和关键事件；默认使用 ESPN 公开接口，无需付费数据源。
- **本地回放**：支持播放/暂停、整场追踪、换人、进度跳转与帧间插值。没有直播时也能进入回放。
- **快捷隐藏**：按 `Ctrl+Shift+X` 同时隐藏或恢复小窗和胶囊。

## 安装

1.0.0 基于已完成验收的候选版：在 **Windows / DSH 0.2.3-alpha.2** 验证全新安装、从 0.8.3 升级、真实直播及整场回放。其他宿主版本未建立完整兼容矩阵。详见[验收记录](docs/acceptance-1.0.0-rc.1.md)。

1. 从 [Release](https://github.com/KhalilWong/dsh-plugin-touchline-football/releases/tag/v1.0.0) 下载 **`dsh-plugin-touchline-1.0.0.tgz`**。请选择这个安装包，GitHub 自动生成的 Source code 归档用于开发。
2. 在 DSH 打开“插件 → 添加插件 → 安装第三方插件”，输入下载文件的**绝对路径**并安装。
3. 启用插件，返回会话页面，在输入区的比分胶囊中选择直播或回放。若界面未更新，刷新 Web GUI；更新宿主代码后可能需要重载插件或重启 DSH。

普通用户无需克隆仓库或执行构建命令。可用 Release 中的 `SHA256SUMS-1.0.0.txt` 校验下载文件。

也可在 DSH「插件 → 发现」搜索 Touchline Football，核对作者 `KhalilWong` 和版本 `1.0.0` 后安装。市场更新取决于索引同步；若仍显示旧版本，可使用上面的 GitHub Release 安装。内部包名为 `dsh-plugin-touchline`，已有配置可沿用。[npm 1.0.0](https://www.npmjs.com/package/dsh-plugin-touchline/v/1.0.0) · [收录申请](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/16580)

## 没有直播时如何体验

“暂无直播”表示当前数据源没有返回正在进行的比赛，不会自动生成虚构直播。真实赛事回放需要本地数据文件。

1.0.0 内置 30 秒合成演示。点击胶囊的「播放合成演示」即可播放、暂停和拖动，无需配置目录或下载赛事文件。

需要真实追踪回放时，可按[数据源说明](docs/data-sources.md)获取 Metrica 官方开放样本；整场转换命令为：

```sh
npm run data:fetch -- --game 1 --full --fps 10
```

详细配置见[插件说明](plugin/README.md)。

## 数据与已知限制

- 直播比分和事件来自 ESPN 公开接口，可能延迟、缺失或发生结构变化；连续球员位置由引擎推演。
- 5 秒是正常轮询目标，不代表真实直播端到端延迟。断流时保留最后位置，界面显示同步状态。
- 真实 DSH 的安装升级、访问检查、挂载清理和回放已验收。候选版的真实直播观测分别记录来源事件时间、插件收包和界面更新，见[1.0.0-rc.1 验收记录](docs/acceptance-1.0.0-rc.1.md)。没有现场视频的同步时基，不能据此保证端到端低延迟。
- 回放精度取决于导入数据。官方 Metrica 第 1 场整场回放及六次换人已本地验证，样本不随安装包分发。

证据：[宿主与清理验收](docs/acceptance-2026-11-11.md) · [整场回放验收](docs/acceptance-0.7.0.md) · [直播同步验收](docs/acceptance-0.8.2.md)。

## 开发

使用 Node.js 22（与 CI 一致），在仓库根目录运行：

```sh
npm ci
npm run plugin:pack   # 类型检查、单元测试、构建和打包
```

产物为 `dist/dsh-plugin-touchline-<version>.tgz`。开发验收也使用 `.tgz` 安装：本机宿主卸载 `link:` 插件时曾清空源码链接目标，见[记录](docs/acceptance-2026-11-10.md)。

```sh
npm run check:plugin  # 本机 Edge 中的模拟宿主回归
npm run check:live    # 直播同步与运动约束回归
npm run check:replay  # 官方样本回放回归，需先获取数据
npm run release:prepare # 生成安装包、源码归档、清单与校验文件
```

独立网页仅用于开发调试，使用方式见[开发指南](docs/development.md)。正式交付物为 DSH 插件。

| 目录 | 用途 |
| --- | --- |
| `plugin/` | 插件宿主接口、客户端、小窗与胶囊 |
| `plugin/host/sources/` | 数据源及归一化 |
| `src/lib/engine.ts`、`src/replay/` | 共用球场引擎与回放 |
| `src/App.tsx`、`src/components/`、`server/` | 本地调试页面与服务 |
| `tests/`、`scripts/` | 测试、打包及数据转换 |

## 贡献与许可

欢迎通过 [Issues](https://github.com/KhalilWong/dsh-plugin-touchline-football/issues) 反馈问题，提交前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。报告问题时请移除账号、聊天内容、本机路径及其他私人信息。

代码采用 [MIT](LICENSE) 许可。第三方赛事数据适用其自身条款，不在 MIT 授权范围内。发布包不含赛事数据、下载样本或队徽文件。发布流程见[发布指南](docs/releasing.md)。

HTTP 路由使用宿主认证并限制为 owner；旧宿主通过 `connection.admit()` 检查。缺少可验证身份时拒绝访问。公开包校验、访问控制和市场同步进度见 [1.0.0 发布验收](docs/acceptance-1.0.0.md)。
