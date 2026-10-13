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
  | 敌人 | 4238 | `JSON:Gmk/enemy` + `EnemyGmkMap`/`EnemyIdMap`（名称、出现时段 / 天气） | 关 |
  | NPC | 2067 | `JSON:Gmk/npc` + APK 数据库（中文名，覆盖约 35%） | 关 |

  弹窗按类型展示：宝箱「宝箱：编号 + 内容 / 金币 / 场景技能」，采集点「采集点：类型名 + 掉落表（道具 + 概率）」，打捞点「打捞点：名称」，敌人「敌人：名称 + 出现时段 / 天气」，NPC「NPC：名称」；都带跳 wiki 的链接，不显示坐标。

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

互动地图的数据另有两步（依赖 wiki 的 JSON 地图元数据，需要联网）：

```bash
python tools/fetch_mapdata.py       # 抓 JSON:Mapinfo/* 与 JSON:FLD maplist/*
python tools/fetch_markers.py       # 兼容旧版：按地图抓带坐标的宝箱 / 采集点
python tools/fetch_layers.cjs       # 抓 5 个图层（JSON:Gmk/*）+ SMW 补宝箱 / 采集点详情
python tools/fetch_map_images.py    # 把 90 张底图下载到 site/assets/maps/（本地托管，可断点续传）
python tools/build_maps.py          # 兼容旧版：Excel/表格形式的地图数据
# 重建 maps.js（底图本地路径 + 5 个图层），无 Python 也能跑：
node tools/rebuild_maps.cjs
```

> 注意顺序：`link_quests.py` 必须在 `link_names.py` 之前跑，否则已经标注的 `[[任务:…]]` 不会被保护。

本地预览（任一方式）：

```bash
node tools/serve.cjs 8899           # Node 版静态服务器
python -m http.server 8899          # 或 Python 版（在 site/ 目录下执行）
```

测试：

```bash
node tools/test_site.cjs    # 52 项 jsdom 冒烟测试（路由 / 浮窗 / 搜索 / 图鉴 / 图片 / DLC / 互动地图）
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
