# 贡献指南

Touchline 的正式交付物是 DSH 插件，本地网页仅供开发调试。提交前请说明问题、复现步骤、预期行为及验证结果。不要在问题报告中附带账号凭据、完整宿主会话或私人回放数据。

## 本地开发

使用 Node.js 22 和 npm，先运行 `npm ci`。构建与检查：

```sh
npm run build
npm test
npm run check:plugin
npm run plugin:pack
```

浏览器回归使用本机 Edge；其他安装路径通过 `EDGE_PATH` 指定。调试页使用方式见 [开发指南](docs/development.md)。

涉及插件生命周期、路由或交互的改动，需要有对应回归测试；影响安装或挂载时还应在真实 DSH 中验收。分别记录模拟测试与实机结果，不能用合成数据冒充真实赛事。

## 代码与数据

- 核心渲染和回放格式复用 `src/lib/engine.ts`、`src/replay/format.ts`。
- 新数据源参考 `plugin/host/sources/template.js`，不要复制整套宿主逻辑。
- 安装测试使用 `.tgz`，不要将源码目录链接到 DSH 后执行卸载。
- 不提交 `data/`、`tmp/`、`dist/`、依赖目录、访问令牌或宿主配置。
- 贡献代码使用项目 MIT 许可；第三方代码或素材需保留其适用许可并说明来源。赛事数据许可与代码许可分开处理。

提交 PR 时说明最终行为、必要的实现理由、已执行检查及尚未完成的验收。变更记录集中写入 `CHANGELOG.md`。
