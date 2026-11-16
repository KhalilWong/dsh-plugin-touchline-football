# 本地开发与调试

Touchline 的唯一正式交付物是 DSH 插件。本地页面用于隔离渲染、数据和宿主集成问题，不提供独立网页版产品支持。改动最终必须通过插件回归与真实 DSH 验收。

## 启动调试页

```sh
npm ci
npm run dev
```

Vite 位于 `http://127.0.0.1:5173`，本地数据代理位于 `http://127.0.0.1:8787`；Vite 将 `/api` 转发到代理。可单独使用 `npm run dev:api` 和 `npm run dev:web`。

固定比赛便于复现：`/?date=YYYYMMDD&match=<ESPN比赛ID>`。没有指定时使用默认赛程选择。

需要检查构建后的页面时：

```sh
npm run debug:build
npm run debug:serve
```

打开 `http://127.0.0.1:8787`。静态资源位于 `dist/debug/`；`dist/` 中的插件安装包不会由调试服务提供。`npm start` 保留为 `debug:serve` 的兼容入口，不表示网页生产部署流程。

## 回放诊断

```sh
npm run replay:demo
npm run replay:build
npm run debug:serve
```

打开 `http://127.0.0.1:8787/replay`。演示为 120 秒合成数据；插件和调试页可读取同一份 `data/replay/*.json`。插件需显式配置该目录的绝对路径。

导入外部数据的转换入口为 `scripts/fetch-open-data.mjs`，格式定义为 `src/replay/format.ts`。第三方数据的许可与准确性需单独确认，不随插件分发。

## 检查命令

- `npm run typecheck`：检查插件与调试代码的类型。
- `npm test`：检查请求竞态、切换模式和销毁后的响应处理。
- `npm run check:plugin`：离线检查真实插件 React 组件，模拟宿主插槽；使用本机 Edge，可用 `EDGE_PATH` 覆盖路径。
- `npm run check:visual`：调试页视觉检查；先运行 `debug:build` 和 `debug:serve`。可用 `CHECK_DATE`、`CHECK_MATCH`、`CHECK_BASE`、`EDGE_PATH` 设置环境，输出在忽略目录 `tmp/`。

调试页保留的工作表伪装、全屏面板、声音和快捷键只是既有调试界面；它们不是 DSH 插件的功能承诺。插件老板键隐藏小窗和胶囊，调试页同名快捷键则切换工作表，两者不要混淆。

## 维护原则

核心绘制使用 `src/lib/engine.ts`，数据归一化使用 `plugin/host/sources/`，避免复制实现。修复核心逻辑后检查插件；只有需要隔离问题时才扩展调试界面。插件安装与生命周期结论以真实宿主结果为准。
