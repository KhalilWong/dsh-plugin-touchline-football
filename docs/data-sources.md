# 数据源与合规

这个项目只做**界面与动画**，不自带、不分发任何赛事数据。所有数据由运行者本机向公开接口请求，缓存只存在内存里（进程退出即消失）。

## 默认数据源

| id | 上游 | 内容 | 坐标 | 许可 / 风险 |
| --- | --- | --- | --- | --- |
| `espn` | `site.api.espn.com`、`sports.core.api.espn.com` | 赛程、比分、事件、阵容、技术统计、逐次进攻坐标 | 有（事件级 `x,y`） | ESPN 的**公开但非官方**接口，没有公开授权，结构可能随时变。仅供个人使用，请勿高频抓取 |

默认源在宿主进程里请求，带上浏览器 UA、`referer`，并有 20 秒（赛程）/ 4 秒（单场）缓存与失败回退；插件不会把直播数据写盘，也不会把它打包进仓库。客户端正常单场轮询目标为 5 秒，失败时退避到最多 30 秒；源端延迟不由插件控制。

## 如果要换源

数据源是一个适配器接口（`plugin/host/sources/`）。一个源只需要提供：

```js
export const id = 'my-source';
export const capabilities = { coordinates: true };   // 有没有球/事件坐标
export async function getScoreboard(date) { /* → { date, count, liveCount, matches[] } */ }
export async function getMatch(matchId) { /* → 归一化 MatchResponse */ }
```

把文件放进 `plugin/host/sources/`，在 `sources/index.js` 的注册表里加一行，然后在插件行的配置里写 `source: 'my-source'` 即可。`sources/template.js` 是一份带注释的骨架。

**请只接入你有权使用的源。** 尤其是懂球帝、直播吧、SofaScore、FotMob 这类没有公开 API 的产品：抓它们的私有接口违反服务条款，接口随时会变，本项目不提供、也不接受这类实现。

## 没有坐标的源

`capabilities.coordinates === false` 的源（例如只有比分和事件的公开数据）仍然可以驱动**胶囊**的比分与关键事件，但球场画面没有位置可画。前端会据能力标记给出提示，而不是画一个空球场。

## 免费源清单（截至 2026-11）

| 源 | 免费额度 | 坐标 | 备注 |
| --- | --- | --- | --- |
| ESPN（本仓库默认） | 无 key，自行限流 | 有 | 非官方，最实用的一档 |
| [football-data.org](https://www.football-data.org/) | 免费层，需 key | 无 | 赛程/比分/事件稳定，适合做第二源 |
| OpenLigaDB | 免费，无 key | 无 | 德甲为主 |
| TheSportsDB | 免费层（非商业） | 无 | 覆盖面广，更新略慢 |
| [Metrica Sports 官方样本](https://github.com/metrica-sports/sample-data) | 开放样本，遵守上游条款 | **逐帧**（25 fps） | 转换器支持第 1、2 场 CSV，用于**回放** |
| [SkillCorner Open Data](https://skillcorner.github.io/opendata/) | 免费研究用 | **逐帧**（转播追踪） | 回放用，使用前确认其许可 |

## 追踪数据与直播

公开渠道**没有**免费的直播追踪流。想要"每秒每个球员的位置"，只有商业授权（Hudl XY Tracking、Opta Vision、Sportradar、Tracab）或自建计算机视觉。因此本项目的策略是：

- **直播**：事件级位置 + 限速平滑过渡、有限阵型调整；未知区间不继续外推，画面标注“事件推演”；
- **回放**：可接入逐帧追踪数据（Metrica / SkillCorner），引擎提供 `applyFrame()` 直接接受每帧位置。

不要把上述研究数据集提交进仓库；用脚本下载到本地 `data/`（已在 `.gitignore` 里）。

## 回放链路怎么用

```bash
# 1) 不用下载的合成演示
npm run replay:demo            # → data/replay/demo.json（自制数据，无版权问题）

# 2) 真实逐帧追踪（Metrica 样本）
npm run data:fetch -- --game 1 --minutes 15 --fps 10
# 完整比赛（也可加 --from 使用已有原始 CSV）
npm run data:fetch -- --game 1 --full --fps 10
#    下载失败（公司证书/代理）时，手动下载三个 CSV 后：
npm run data:fetch -- --from <CSV 目录> --game 1

# 3) 起服务看
npm run debug:build
npm run debug:serve            # http://127.0.0.1:8787/replay
```

转换后的文件格式见 `src/replay/format.ts`：每帧 22 名球员 + 球，按固定球员顺序扁平存储。v2 坐标以球场百分比表示（允许越界），缺失坐标为 `null`，不能转成零。按原始时间戳重采样；只插值同一半场内不超过 0.4 秒的缺口。播放时继续对有效的相邻采样帧插值，长缺口隐藏对象；球来自追踪 CSV，不用事件坐标补球路。

0.7.0 的 v3 格式保留全部追踪身份，帧宽为 `players.length * 2 + 2`。球员的 `activeFrom` / `activeUntil` 限制出场区间；只有唯一明确的出入场交接才记录 `tracking-inferred` 换人。短时缺失不作为换人。旧 v1/v2 文件仍按 22 人解析。

整场第 1 场为 5800.24 秒、58003 帧（10 fps），含双方各 3 次换人和上下半场。回放时间使用原始连续录像时长，半场转换不强行重置到 45:00，也不插入中场休息。查看[整场验收](acceptance-0.7.0.md)；前 15 分钟的历史验收见 [0.6.0 记录](acceptance-2026-11-12.md)。本地原始文件与转换回放会落盘到 `data/`，不进入插件包。

