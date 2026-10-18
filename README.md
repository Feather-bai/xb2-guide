# 异度之刃2 完整攻略站

整合四份资料做成的《异度之刃2》（异度神剑 2 / Xenoblade Chronicles 2）攻略站，静态站点，移动端优先。

## 资料整合方式

| 来源 | 用途 |
| --- | --- |
| 《异度神剑 2 攻略特辑》上册（《掌机王Plus Vol.8》扫描件 34 页） | 战斗系统、异刃系统、初心者入门、第 1~4 章流程与数据表 |
| 《异度神剑 2 攻略特辑》下册（34 页） | DLC 补完计划（季票任务、挑战模式）、**《黄金之国伊拉》前传攻略**、第 4 章后流程与数据表 |
| 《异度之刃2 每章更多备注.doc》 | 玩家实战向的每章补充：开环顺序、刷装备路线、场景技能与支线取舍 |
| [乐园数据管理室 wiki](https://xenoblade2.cn/) | 任务、异刃、道具、敌人等结构化数据与数值 |

整理原则：

- **流程取最完善者**：同一段流程以信息最完整、步骤最清晰的版本作为正文，必要时合并多份材料的步骤。
- **差异转备注**：不同材料在打法、顺序、取舍上不一致的地方，统一以「差异备注」保留在对应位置，并汇总到「攻略差异对照」模块。
- **支线可点开**：流程中出现的支线任务名都可点击，点开弹出浮窗显示接取条件、流程与注意事项（右上角关闭按钮）。
- **专有名词外链**：异刃、道具、辅助核心、饰品、敌人等名称直接链接到 wiki 对应页面。

## 站点结构

```
site/
├── index.html            单页应用外壳
├── assets/
│   ├── style.css         移动端优先的响应式样式
│   ├── app.js            路由 / 渲染 / 浮窗 / 搜索
│   └── mag/              原刊 68 页 WebP 图片（懒加载）
└── data/                 站点数据（由 tools/ 下的脚本生成）
    ├── index.js          模块清单 + 可链接名词索引
    ├── chapters.js       10 章主线流程（步骤 + 备注 + 章节配图）
    ├── quests.js         166 条任务（条件 / 流程 / 报酬 / 攻略备注）
    ├── systems.js        系统与养成（战斗、异刃、佣兵团、打捞、状态）
    ├── codex.js          图鉴（异刃 119 / 辅助核心 / 饰品 / 地标 / 珍稀种）
    ├── extras.js         攻略差异对照 + 地图与收集
    └── mag.js            原刊 68 页索引与 OCR 文本
```

## 模块

1. **首页** — 快速入口
2. **主线流程** — 第一至最终章；每章流程上方带**互动地图**（可拖动缩放、按区域切换、筛选标记点），支线可点击浮窗
3. **任务库** — 166 条主线 / 普通 / 异刃 / DLC 任务，可按分类与关键词筛选
4. **系统与养成** — 新手入门、战斗系统详解、异刃系统、角色养成、佣兵团、TigerTiger 与花的定制、打捞与经济、状态效果、**DLC 补完计划**、**《黄金之国伊拉》前传攻略**
5. **图鉴** — 名称一键跳 wiki
6. **地图与收集** — 各区域地标、宝箱、打捞点、开环怪清单
7. **原刊对照** — 68 页原图 + OCR 文本
8. **攻略差异对照** — 各版本分歧集中对照
9. **资料来源与说明**

## 互动地图

每章「流程步骤」上方会插入一张对照地图，数据全部来自 wiki：

- **底图**：wiki 的 90 张地图原图（`JSON:Mapinfo/*` 提供 `Name / mapName / menuGroup / Width / Height / LowerX…UpperZ`），已下载到 `site/assets/maps/<id>.png` **本地托管**（合计约 12 MB），页面上按需加载，不再走 `images.xenoblade2.cn` 外链（`imgRemote` 保留原始外链以备核对）。
- **标记点**：wiki 的 5 个图层，按 `Areas` 归到各地图，可分别开关：
  | 图层 | 数量 | 取法 | 默认 |
  | --- | --- | --- | --- |
  | 宝箱 | 663 | SMW（坐标 + 内容 / 金币 / 场景技能） | 开 |
  | 采集点 | 1523 | SMW（坐标 + 类型）+ `[[采集物::+]]` 掉落表 | 开 |
  | 打捞点 | 61 | `JSON:Gmk/salvage` + `JSON:SalvagePoint/*`（名称） | 开 |
  | 任务接取点 | 126 | APK 的任务→NPC 映射 + wiki `Gmk/npc` 坐标 | 开 |
  | 地点 | 639 | wiki 采集点类型名（同坐标系，逐图聚合） | 关 |
  | 敌人 | 4971 | `JSON:Gmk/enemy` + `EnemyGmkMap`/`EnemyIdMap` | 关 |
  | NPC | 840 | `JSON:Gmk/npc` + APK 数据库（中文名） | 关 |

  > **异常标记清理**：敌人 / NPC 里找不到中文名称、只剩内部 id（如 `ma05a_a01_02`、`npc41300011_01`）的条目已直接丢弃，不做占位保留（敌人 −110、NPC −1337）。
  > **地标 / 牵绊对话**：wiki 没有这两类的坐标（`JSON:Gmk/landmark` 等均 404，牵绊对话页只有「地点1/2/3」文字）；APK 的 `Location` / `HeartToHeart` 世界坐标有 94% 落在底图之外，且与采集点坐标系不一致，**按「异常数据零容忍」不输出猜测位置**。

  **已完成标记**：宝箱 / 任务接取点可在弹窗里点「标记为已完成」，图标变灰；筛选条有「隐藏已完成」开关。**章节页「本章可接支线」每个支线左侧也有圆点**，点一下即标记完成（名称划掉），与地图上的任务接取点**共用同一份状态**。状态存在 `localStorage` 的 `x2.map.done`：宝箱按坐标记 `mapId|tbox|x|z`，任务按任务名记 `quest:<任务名>`（一个任务有多处接取点也只算一次）。

  **跨设备同步**：右上角「同步」按钮可设置自定义用户 ID（3~32 位字母数字/下划线/连字符）。同一 ID 在不同设备登录会拉取同一份已完成标记。**冲突策略为最后修改时间优先（LWW）**，服务器只保存勾选状态与时间戳，不收集任何设备信息。后端是 `site/functions/api/sync.js`（Cloudflare Pages Function + KV 绑定 `SYNC`）；未绑定时自动降级为「仅本机」并明确提示。

  弹窗按类型展示：宝箱「宝箱：编号 + 内容 / 金币 / 场景技能」，采集点「采集点：类型名 + 掉落表（道具 + 概率）」，打捞点「打捞点：名称」，敌人「敌人：名称 + 出现时段 / 天气」，NPC「NPC：名称」；都带跳 wiki 的链接，不显示坐标。

- **名词深链**：任务流程 / 系统页 / 地图页正文里出现的 **NPC 名**、**敌人名**、**可采集道具名**（`mapsData.npcIndex` / `enemyIndex` / `itemIndex`）会自动变成可点按钮（NPC 紫色、敌人红色、道具绿色，带 ◎ 标记）。点一下会跳到对应章节的互动地图、打开相应图层、把标记点居中并弹出气泡。**一个名字能在多处出现时，会先弹出选择列表让你挑一个位置**。反向索引由 `rebuild_maps.cjs` 生成。为避免误伤，**自动链接只认 3 字以上的名字**（2 字名如「夏尔」会命中「哈达夏尔」、角色名「灭 / 真 / 齐格」也会和敌人重名，需要时用显式 `[[NPC:名]]` / `[[敌人:名]]` / `[[物品:名]]` 标注）。
- **任务接取点**：每张地图上标出发该地图支线任务的 NPC 位置（橙色 `!`），点开显示任务名与委托人，可一键跳任务详情。**默认只显示当前章节解锁的任务**（状态行有「显示全部 / 只看本章」开关），避免每张图都堆满好几章之后的任务。数据由 `tools/fetch_quest_points.cjs` 生成——用 APK 的「任务→发布 NPC」映射与 `available_chapter`（解锁章节），再去 wiki 的 `Gmk/npc` 取**同坐标系**的坐标（APK 自带的 `world_z` 有 0~66 的漂移，不能用）。任务浮窗的「基本信息」里也有「在互动地图上查看」按钮。
- **地图内搜索**：搜索框除了筛当前地图的标记点，还会在下方列出匹配的**道具获取点 / NPC / 敌人 / 任务接取点**，点一下直接跳转定位。
- **任务栏目**：任务库分为 全部 / 主线任务 / 支线任务 / 异刃任务 / DLC任务 五栏。**主线任务只出现在「主线任务」栏**（「支线任务」栏排除主线）；**异刃任务用紫色**（`#c792ea`，与主线红 `#ff6b6b`、普通任务灰/强调色青 `#0a8ea0` 色相相差 >90°），列表项带紫色左边条与「异刃任务 · 异刃名」标签。异刃任务的解锁条件统一在开头补上 **「需先解锁对应异刃「XX」」**（原数据只写了牵绊圆环阶段）。
- **任务流程双口径**：任务浮窗的「任务流程」有两个标签页——**攻略流程**（整理自攻略本，步骤更细）与**官方目标**（游戏内任务界面的原文，来自手机版 wiki 的 `task_workflow_step`，带「对话 / 前往 / 战斗 / 收集 / 条件 / 机关」分类与地点说明）。两者口径不同故并列而非互相覆盖；只有一边有数据时不显示切换按钮。官方目标由 `tools/fetch_quest_flows.cjs` 生成（146 个任务 / 1012 步）。

  > 旧版只抓了宝箱 475 + 采集点 854，因为脚本把 SMW 的 `limit=50` 写死在请求里。**SMW 的「查询级 limit」其实可达 2000**（offset 分页仍然无效），改成 `|limit=2000` 一次即可取全。敌人 / NPC 数据密集，默认不勾选，勾选后自动聚合（markercluster）。
- **区域与地图**：根据本章正文里出现的地名自动识别区域，再列出该区域的所有地图；章节地点列表里出现的区域会被优先选中。地图条按 `menuGroup` 分组，标签只留序号（`格尔特蒙特 f01/f03` → 格尔特蒙特1 / 格尔特蒙特3，`托里格镇 c_01` → 托里格镇1），一行放不下时自动换行；与主图同尺寸的 `_shipoff / lodoff` 重复变体会被剔除，DLC「黄金之国」地图单独归入一个区域。
- **交互**：Leaflet（`CRS.Simple` + `imageOverlay`）实现拖动 / 滚轮缩放，标记类型（宝箱 / 采集点）可开关，支持按名称筛选标记点，点标记弹出详情并可跳 wiki 原页。

> 坐标换算沿用 wiki 的规则：`bounds = [[-LowerZ, -LowerX], [-UpperZ, -UpperX]]`，标记点位置为 `[-PosZ, -PosX]`。

## 本地预览

```bash
cd site
python -m http.server 8899
# 打开 http://127.0.0.1:8899/
```

## 重新生成数据

构建脚本在 `tools/`，依赖 Python 3 与 PyMuPDF（用于渲染 PDF 原页；仅在需要重新渲染原刊图片时用到）。

按顺序执行即可从原始素材重建 `site/data/` 下的全部数据（脚本会复用 `.extract/` 里的 OCR 与 wiki 缓存，缺失时自动重新抓取）：

```bash
python tools/extract_doc.py         # 解析 .doc 每章备注
python tools/ocr_all.py all         # 渲染 PDF 页面并 OCR（首次约 20 分钟）
python tools/export_mag_images.py   # 导出原刊 68 页 WebP
python tools/build_quests_js.py     # quests.js（166 条任务，含 7 条 DLC 任务）
python tools/build_chapters.py      # chapters.js（10 章主线流程）
python tools/build_systems.py       # systems.js（10 篇系统与养成）
python tools/build_codex.py         # codex.js（异刃 / 辅助核心 / 饰品 / 地标 / 珍稀种）
python tools/build_extras.py        # extras.js（差异对照 + 地图与收集）
python tools/build_mag.py           # mag.js（原刊 68 页索引与 OCR 文本）
python tools/build_index.py         # index.js（模块清单 + 可链接名词索引）
python tools/build_chapter_images.py # 把原刊配图挂到对应章节
python tools/link_quests.py         # 把正文里的任务名标注成可点击的浮窗链接
python tools/link_names.py          # 把异刃/道具/敌人/地标名标注成跳转 wiki 的外链
```

互动地图的数据（依赖 wiki 的 JSON 地图元数据与 Gmk 数据，需要联网）：

```bash
python tools/fetch_mapdata.py       # 抓 JSON:Mapinfo/* 与 JSON:FLD maplist/*，并解析底图真实 URL
node tools/fetch_layers.cjs         # 抓 6 个图层（宝箱 / 采集点 / 打捞点 / 敌人 / NPC + 采集掉落）
node tools/fetch_quest_points.cjs   # 任务接取点（APK 的任务→NPC 映射 + wiki 坐标）
node tools/fetch_quest_flows.cjs    # 官方任务目标（APK task_workflow_step）→ data/questflows.js
node tools/fetch_map_images.cjs     # 把 90 张底图下载到 site/assets/maps/（本地托管，可断点续传）
node tools/rebuild_maps.cjs         # 重建 maps.js（本地底图 + 6 个图层 + 反向索引）
node tools/check_map_images.cjs     # 校验 90 张底图是否齐全
```

> `fetch_layers.cjs` / `fetch_quest_points.cjs` / `fetch_quest_flows.cjs` 需要解包后的
> `xenoblade2.db`（提供 NPC 名称、任务目标等）。脚本会在仓库内及常见位置自动查找，
> 也可用环境变量指定：`XB2_APK_DB=<路径>`；仓库根目录可用 `XB2_WORKSPACE=<路径>` 覆盖。
>
> `rebuild_maps.cjs` 的输出是确定性的：同样的输入会生成完全相同的 `maps.js`。

> 注意顺序：`link_quests.py` 必须在 `link_names.py` 之前跑，否则已经标注的 `[[任务:…]]` 不会被保护。

本地预览（任一方式）：

```bash
node tools/serve.cjs 8899           # Node 版静态服务器
python -m http.server 8899          # 或 Python 版（在 site/ 目录下执行）
```

测试：

```bash
node tools/test_site.cjs    # jsdom 冒烟测试（路由 / 浮窗 / 搜索 / 图鉴 / 图片 / DLC / 互动地图）
node tools/check_links.cjs  # 站内链接、任务链接与资源引用检查
```

## 部署

线上地址：**https://xb2-guide.pages.dev**

详细步骤见 [DEPLOY.md](DEPLOY.md)。简述：

**重新发布**：设置 `CLOUDFLARE_API_TOKEN` 后执行 `python tools/cf_publish.py`（只上传变化的文件）。

**推送到 GitHub**：`python tools/gh_push_state.py "提交信息"`（本机对 `github.com:443` 直连被阻断，该脚本走 GitHub API）。

想在推送后自动部署，在 Cloudflare 控制台把仓库连成 Pages 的 Git 项目即可（Build command 留空，输出目录 `site`）。

## 版权

本站为玩家自发的非商业整理，不作为任何商业用途。
《异度神剑 2》（Xenoblade Chronicles 2）相关商标、图像与文本版权归 Nintendo / MONOLITHSOFT 所有；
wiki 内容遵循 [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)。
