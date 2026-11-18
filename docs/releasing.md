# Touchline Football 发布指南

本次发布版本为 **0.8.3**，同时准备 GitHub 附件与 npm 分发；实际可用性分别查询 Releases 和 npm registry。内部包名保留 `dsh-plugin-touchline`。发布目标为 [KhalilWong/dsh-plugin-touchline-football](https://github.com/KhalilWong/dsh-plugin-touchline-football)。精选目录收录已合并，但原生「插件 → 发现」还需要 npm 发布及索引同步；两者必须分别验收。

## 本地准备

```sh
npm ci
npm run check:plugin
npm run check:live
npm run release:prepare
```

`release:prepare` 执行类型检查、单元测试、构建和打包，在 `dist/` 生成安装包、源码归档、文件清单和 SHA256 校验文件，不执行上传。源码白名单排除本机数据、会话、日志、截图、环境配置、依赖和生成的客户端文件。源码归档解压后运行 `npm ci` 和 `npm run plugin:pack` 可重建。

## GitHub 发布

1. 确认已登录账号，创建 `dsh-plugin-touchline-football` 公开仓库，添加 `dsh-plugin` topic。
2. 仅提交源码清单中的文件；使用 GitHub noreply 作者邮箱，避免公开本机 Git 配置的私人邮箱。
3. 补齐实际仓库地址后重新打包，等待远端 CI 通过。本地检查不代表远端 CI 已通过。
4. 创建 `v0.8.3` 标签及预发布，使用 [发布说明](release-0.8.3.md)，上传 `dsh-plugin-touchline-0.8.3.tgz`、`touchline-source-0.8.3.tar.gz`、`source-manifest-0.8.3.json`、`SHA256SUMS-0.8.3.txt`。
5. 从公开地址下载、核对 SHA256，在 DSH 安装下载的文件验证分发链路。

根开发包保留 `private: true`。插件包允许 npm 发布，只发布经过检查的 `dist/dsh-plugin-touchline-<version>.tgz`，不要发布或直接安装工作区根目录；正式插件位于 `plugin/`。

## DSH Market 收录

按[官方贡献指南](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/main/contributing.md)，向 `awesome-dsh-plugin/awesome-dsh-plugin` 提交单个 YAML 文件，而非向市场应用仓库提交。仓库须创建满 1 天，CI 通过后仍需维护者审核。合并并同步前不能称为已上架。

条目路径为 `data/plugins/KhalilWong__dsh-plugin-touchline-football--plugin.yml`，提交前必须替换账号占位符并验证 tarball 公开可下载：

```yaml
url: https://github.com/KhalilWong/dsh-plugin-touchline-football/tree/main/plugin
name: KhalilWong/dsh-plugin-touchline-football#plugin
category: fun
description:
  en: 'Floating football scores, event-based pitch visualization and local tracking replay for DSH.'
  zh: '为 DSH 提供足球比分小窗、事件推演球场和本地追踪回放。'
tarball: https://github.com/KhalilWong/dsh-plugin-touchline-football/releases/download/v0.8.3/dsh-plugin-touchline-0.8.3.tgz
```

使用固定标签地址，避免预发布与 latest 解析不一致。GitHub tarball 可供完整目录安装；原生「插件 → 发现」的 format-1 索引必须有 npm 包、latest 版本及发布时间。官方探测脚本读取条目指向的 `plugin/package.json`，并校验 npm 包的 repository 回指同一仓库。发布 npm 后必须等索引重新生成并在原生界面验证，不能仅凭 PR 合并宣称上架。隐私检查范围见 [发布隐私检查](release-privacy.md)。
