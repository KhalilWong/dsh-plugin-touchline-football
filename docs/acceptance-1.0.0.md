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

## 原生桌面正式包复验

11 月 25 日，在真实 Windows DSH 0.2.3-alpha.2 桌面应用中完成以下操作：

- 原安装为 `1.0.0-rc.1`。宿主不允许用“添加插件”覆盖已有包，因此先备份本地配置，再从界面卸载旧包，通过“添加插件”输入 `dsh-plugin-touchline@1.0.0` 安装并启用。安装使用界面的默认 npm 镜像源；安装后的入口、客户端、ESPN 适配器及包清单均与正式包一致。
- 回放配置保持不变，原有三个本地回放条目可继续读取；源码文件未受卸载影响。
- 内置 30 秒合成演示可直接播放，时钟及画面正常推进；暂停后时钟保持，拖动进度后停在所选时间。
- Metrica 整场回放可加载并播放；跳至 47:30 后显示下半场，胶囊与小窗时间一致。通过 71:02 换人前跳点，观察到 AWY24 离场、AWY26 入场。六处换人正反向跳转的完整回归见候选版记录，本次桌面抽查其中一处。
- 播放时停用插件，小窗被移除；重新启用成功。宿主“立即重启”提示当前进程不能自动重启，随后通过应用菜单退出并重新启动 DSH；插件保持启用，合成演示再次播放成功。
- 本轮自动化投递 `Ctrl+Shift+X` 未观察到隐藏，暂不据此判断插件快捷键失效，也不记为本轮桌面通过；历史手动验证与浏览器回归另有记录。

本次原生桌面安装通过手动输入 npm 包完成，**不是从“发现”条目安装**。当前数据源未返回正在直播的比赛，因此本轮不新增自然直播通过记录；发布前真实直播与受控事件重放见候选版记录。本地配置备份、窗口截图与会话内容均不进入仓库。

上午检查时，npm 市场目录与 CDN 仍为 `2026.1124.26844`，条目提供 0.8.3。以下为索引更新后的独立验收，不用上午的手动安装替代市场安装。

## 官方市场条目安装验收

11 月 25 日 16:52–17:00，北京时间：

- [当日索引任务](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/actions/runs/45533328812) 已成功完成，npm 市场目录更新为 `2026.1125.27413`；官方 CDN 的 Touchline 条目提供 `1.0.0`。
- 在真实 DSH 的「插件 → 发现」中使用 Awesome DSH Plugin 插件精选索引搜索 `touchline`，结果显示作者 `KhalilWong`、版本 `1.0.0`。
- 为验证实际安装流程，先在宿主界面卸载上午手动安装的同版包，确认包目录已移除、项目源码仍在。再从发现页 Touchline 条目点击「安装」，确认框指定 `dsh-plugin-touchline@1.0.0`，安装成功后点击「立即启用」。本次没有使用“添加插件”或本地安装包。
- 安装后的入口、客户端、ESPN 适配器与包清单均匹配正式发布文件；本地配置覆盖文件与安装前备份逐字节一致。备份只留在忽略上传的本机目录。
- 返回会话后胶囊及小窗正常挂载。Melbourne V 对 The Cong-Viettel 的真实直播比分为 0–0，观察到时钟从 56′推进到 58′，球场及关键事件可读；位置数据不足时显示“等待下半场位置数据”，不冒充连续追踪。
- 从直播切换到内置 30 秒演示，播放推进至 0:09 后暂停，再跳转至 0:24；随后加载原有 Metrica 整场回放，时钟从 0:10 推进至 0:18。最后切回真实直播，58′、0–0、球场和关键事件恢复。该项是市场安装后的功能冒烟验收，不新增端到端延迟结论。

市场搜索、条目安装、启用和直播/回放往返验收通过；本轮未发现需要修改发布包的问题。安全提示仍显示在目录中：[复核 PR #18640](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/18640) 的 `check` 与 `Submission gate` 均已通过，但尚未合并，仍待维护者复核。
