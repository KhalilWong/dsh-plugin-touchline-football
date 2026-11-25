# 1.0.0 正式发布与分发验收

2026-11-24 至 25 日，北京时间。本记录区分公开发布、真实宿主功能和市场索引；候选版的直播观测与完整回归见 [RC 验收记录](acceptance-1.0.0-rc.1.md)。

## GitHub、npm 与构建

- 正式标签 `v1.0.0` 指向 `f293404f6a5747dc5524979af327e20378d00fd9`，GitHub Release 已公开，非草稿、非预发布。
- [发布分支 CI](https://github.com/KhalilWong/dsh-plugin-touchline-football/actions/runs/45395100371) 和 [main CI](https://github.com/KhalilWong/dsh-plugin-touchline-football/actions/runs/45395626697) 均通过。覆盖 Linux 类型检查、42 项测试、插件及调试网页构建，以及 Windows 插件、直播浏览器回归。
- npm `dsh-plugin-touchline` 的 `latest` 为 `1.0.0`。从 GitHub 和 npm 公开地址分别下载安装包，SHA-256 均为 `2faeae65e36e386e1a79d2afdbca4eccf9ec670b5c147cf6f14b9942b8201ba2`。
- 正式源码归档在独立空目录安装依赖、运行测试和重建，安装包哈希一致。发布时检查 87 个源码文件和 13 个安装文件；本记录属于发布后的文档，不回写或替换已经公开的附件。
- 提交使用 GitHub noreply 邮箱。凭据、配置、日志、截图与下载赛事数据不在发布内容中。

## 真实 DSH 正式包检查

使用 Windows / DSH 0.2.3-alpha.2 的独立 Web profile，通过 npm 官方源安装 `dsh-plugin-touchline@1.0.0`。

- 正常启动会话访问 health、sources、live、scoreboard、match、replays、replay 七条路由均为 200；回放目录保留三个条目，官方整场回放读取 58,003 帧，客户端挂载一次。
- 无凭据请求七条路由均为 401。
- 使用正常会话凭据但请求的 Origin 为外站时，七条路由均为 403；请求未读取比赛或回放内容。

## 市场状态与访问控制复核

- [版本更新 PR #18518](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/18518) 已于 11 月 24 日 23:04 合并，安装包链接指向 1.0.0。
- 实机「插件 → 发现」能搜索到 Touchline，但已观察的条目与详情仍只提供 0.8.3。11 月 25 日读取 npm 市场目录 `2026.1124.26844`，仍为 0.8.3；原生市场安装 1.0.0 尚未验收，不以 PR 合并代替。
- 维护者在合并时重新添加了“HTTP 路由没有 DSH 的访问检查”的提示。复核发现 1.0.0 在旧宿主中显式调用 `connection.admit(req)`，拒绝无身份、非 owner、异常或服务缺失。
- [DSH 0.2.2-rc.1 官方实现](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.1/packages/client/connection/src/rpc-host.ts#L123) 的 `requestRejection(req)` 本身就是调用 `admit(req)`，后者执行 Host/Origin 和凭据检查。[同版 WebServer](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.1/packages/host/webserver/src/index.ts#L541) 不传第三个 peer 参数，因此插件走显式检查分支。该项是旧版源码核对，不冒充重新运行旧版宿主。
- [复核 PR #18640](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/18640) 只申请移除错误说明，附上固定版本源码和正式包检查结果；五项宿主路由测试复跑通过。1.0.0 发布包未因该复核改动。

待完成：市场索引更新后的搜索、安装、启用及桌面功能验收；维护者复核安全说明。
