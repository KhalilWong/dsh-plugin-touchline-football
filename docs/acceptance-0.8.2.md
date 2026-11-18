# 0.8.2 访问控制与市场分发

2026-11-18 查明 DSH Market 的完整 plugins.json 已包含 Touchline 与 GitHub Release tarball。原生发现页 index.json 只收录具有 npm 版本和发布时间的条目，不能用它判断 DSH Market 是否收录。此前“目录尚未同步”的判断据此修正。

所有七条精确 HTTP 路由新增 connection.admit(req) 检查，仅允许 owner；拒绝未经认证、非 owner、服务缺失或异常，不读取回放也不请求上游。只接受 GET，health 不再返回本机回放路径。32 项测试及类型检查通过。真实 DSH 安装并启用 0.8.2 后，回放列表正常显示。

市场维护者在 0.8.0 条目附加的访问检查提示是有依据的；新发行后申请将条目更新到修复版本，是否移除提示由维护者审核。原始响应、截图和凭据不上传。
