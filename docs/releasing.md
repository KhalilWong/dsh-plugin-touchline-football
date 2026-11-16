# Touchline Football 发布指南

候选版本为 **0.8.0**，首次公开发行标记预发布。目标仓库名为 `dsh-plugin-touchline-football`，内部包名保留 `dsh-plugin-touchline`。发布目标为 [KhalilWong/dsh-plugin-touchline-football](https://github.com/KhalilWong/dsh-plugin-touchline-football)；实际可用版本以 Releases 页面为准。市场尚未收录。

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
4. 创建 `v0.8.0` 标签及预发布，使用 [发布说明](release-0.8.0.md)，上传 `dsh-plugin-touchline-0.8.0.tgz`、`touchline-source-0.8.0.tar.gz`、`source-manifest-0.8.0.json`、`SHA256SUMS-0.8.0.txt`。
5. 从公开地址下载、核对 SHA256，在 DSH 安装下载的文件验证分发链路。

根包与插件包保留 `private: true`，只阻止误发 npm，不影响开源或 tarball 安装。不要直接安装仓库根目录；正式插件位于 `plugin/`。

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
tarball: https://github.com/KhalilWong/dsh-plugin-touchline-football/releases/download/v0.8.0/dsh-plugin-touchline-0.8.0.tgz
```

使用固定标签地址，避免预发布与 latest 解析不一致。无需发布 npm。隐私检查范围见 [发布隐私检查](release-privacy.md)。
