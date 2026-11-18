# Touchline Football 0.8.2（预发布）

- 为全部七个 HTTP 路由补上 DSH `connection.admit()` 的 Host/Origin 与身份检查，仅允许 owner；服务缺失或出错时拒绝访问，不回退为公开接口。
- 限制路由为 GET；健康接口不再返回本机回放目录。
- 包含 0.8.1 的乌龙球比分修复，已完成真实直播与本地回放往返验收。

需要宿主提供 `connection.admit()`；旧宿主不满足时请升级，不要关闭访问检查。直播仍是事件推演，不是真实连续追踪；首次系列保留预发布状态。

安装附件：`dsh-plugin-touchline-0.8.2.tgz`。MIT；不包含赛事数据或个人配置。
