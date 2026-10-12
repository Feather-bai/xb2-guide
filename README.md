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
2. **主线流程** — 第一至最终章，支线可点击浮窗
3. **任务库** — 166 条主线 / 普通 / 异刃 / DLC 任务，可按分类与关键词筛选
4. **系统与养成** — 新手入门、战斗系统详解、异刃系统、角色养成、佣兵团、TigerTiger 与花的定制、打捞与经济、状态效果、**DLC 补完计划**、**《黄金之国伊拉》前传攻略**
5. **图鉴** — 名称一键跳 wiki
6. **地图与收集** — 各区域地标、宝箱、打捞点、开环怪清单
7. **原刊对照** — 68 页原图 + OCR 文本
8. **攻略差异对照** — 各版本分歧集中对照
9. **资料来源与说明**

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

> 注意顺序：`link_quests.py` 必须在 `link_names.py` 之前跑，否则已经标注的 `[[任务:…]]` 不会被保护。

测试：

```bash
node tools/test_site.cjs    # 32 项 jsdom 冒烟测试（路由 / 浮窗 / 搜索 / 图鉴 / 图片 / DLC 标记）
node tools/check_links.cjs  # 站内链接、任务链接与资源引用检查
```

## 部署

详细步骤见 [DEPLOY.md](DEPLOY.md)。简述：

**Git 自动部署（推荐）**：在 Cloudflare Pages 里连接本仓库（分支 `main`，Build command 留空，Build output directory 填 `site`），之后双击 `push.bat` 提交推送，Cloudflare 会自动重新部署。

**手动部署**：执行 `npx wrangler login` 登录后，双击 `deploy.bat`。

## 版权

本站为玩家自发的非商业整理，不作为任何商业用途。
《异度神剑 2》（Xenoblade Chronicles 2）相关商标、图像与文本版权归 Nintendo / MONOLITHSOFT 所有；
wiki 内容遵循 [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)。
