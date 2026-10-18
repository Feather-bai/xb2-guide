# 部署说明

## 当前状态

站点已经部署上线：

**https://xb2-guide.pages.dev**

- GitHub 仓库：**https://github.com/Feather-bai/xb2-guide**（分支 `main`，输出目录 `site`）
- Cloudflare Pages 项目：`xb2-guide`（项目 ID `23dc81aa-b9c6-43a1-bd65-892bc839c1c4`，账号 `0d085a73dc77531f6dfd4ba837ab5a2d`）

---

## 更新内容的三种方式

### 方式 1：命令行重新发布（当前可用）

改完 `site/` 里的内容后，在仓库根目录执行：

```powershell
$env:CLOUDFLARE_API_TOKEN = "你的 API 令牌"
python tools/cf_publish.py
```

脚本会自动比对文件哈希，只上传变化的文件，然后创建一次新的正式部署。
（脚本位置：`tools/cf_publish.py`，依赖 Python 3，无需安装第三方库。）

> 注意：创建部署这一步必须用**账号级 API 令牌**，Pages 的上传 JWT 只对 assets 接口有效，
> 用它调创建部署接口会返回 `9106 Authentication failed`。

### 方式 2：只推 GitHub（推荐配置一次 Git 集成后使用）

```bash
git add -A
git commit -m "更新内容"
git push origin main
```

> 这台机器对 `github.com:443` 的直连被阻断（`api.github.com` 正常），`git push` 会超时。
> 替代方案：
> ```bash
> python tools/gh_push_state.py "提交信息"
> ```
> 它通过 GitHub 的 Git Data API 把工作区状态同步成一次提交，效果与 push 相同。
> 前提是 `gh auth status` 显示已登录。

想把「推送即自动部署」接起来，需要在 Cloudflare 控制台做一次 Git 集成（见方式 3）。

### 方式 3：GitHub 连接 Cloudflare Pages（push 即自动部署）

1. 打开 <https://dash.cloudflare.com/?to=/:account/workers-and-pages>
2. 找到项目 **xb2-guide** → **Settings** → **Builds & deployments**
3. 当前项目是 Direct Upload 类型，**不能**直接切换成 Git 集成，需要**新建一个 Git 项目**：
   - **Create application** → **Pages** → **Connect to Git**
   - 授权 GitHub（之前给 `isaac-pages` / `kazan-pages` 授权过的话，Cloudflare 已有权限，直接选仓库）
   - 选择仓库 **Feather-bai/xb2-guide**，分支 **main**
4. 构建设置（纯静态文件，不需要构建）：
   - **Framework preset**：`None`
   - **Build command**：留空
   - **Build output directory**：`site`
5. **Save and Deploy**

之后每次 push 到 `main`，Cloudflare 会自动重新部署。

---

## 跨设备同步（KV 配置）

站点右上角的「同步」按钮依赖一个 Pages Function（`functions/api/sync.js`）和一份 **KV 存储**，
用来保存「哪些标记已完成」。**KV 与 Functions 都没配置时，站点其它功能完全正常**，
同步面板会显示「未设置 ID：标记只保存在本机」或「同步失败：HTTP 404」（提示数据仍在本机）。

### 当前状态（已配置并验证通过）

| 项 | 值 |
| --- | --- |
| Functions | `functions/api/sync.js` 已部署（线上 `/api/sync` 返回 JSON） |
| KV 绑定 | 变量名 `SYNC` → namespace `671206d49fbb46f0be2eaf22dc524fe5`，**写在 `wrangler.toml` 里** |
| 线上接口 | `GET https://xb2-guide.pages.dev/api/sync?id=smoke-test` → `200 {"done":{},"rev":0}` |
| 自动化验收 | `node tools/test_sync_e2e.cjs` → 7 项全通过（见第 11 节） |

> KV namespace 目前复用的是账户上已存在的 `671206d4…`（原本由 `steam-price-tracker` 使用），
> 键前缀是 `done:`，与本项目不冲突。当前 API 令牌**没有 KV 权限**（`/storage/kv/namespaces` 返回 401），
> 所以无法新建专用 namespace；等令牌加上 `Workers KV Storage: Edit` 后，
> 新建 `xb2-guide-sync` 并替换 `wrangler.toml` 里的 `id` 即可，数据无需迁移。

### 0. 前置条件与环境

| 项目 | 要求 |
| --- | --- |
| Cloudflare 账号 | 拥有 `xb2-guide` Pages 项目（账号 `0d085a73dc77531f6dfd4ba837ab5a2d`）的编辑权限 |
| 部署方式 | **必须用 wrangler（方式 1 / `deploy.bat`）或 Git 集成**。控制台的 Direct Upload 上传 `/functions` **不生效** |
| 本地工具 | Node 18 以上（`npx wrangler` 会自动下载），以及浏览器可访问 Cloudflare 控制台 |
| 目录约定 | `functions/` 必须与 `site/` **同级**（仓库根目录），不能放在 `site/` 里面 |
| 绑定变量名 | 必须是 **`SYNC`**（代码里写死 `env.SYNC`，改名会导致接口 503） |

> ⚠️ **`tools/cf_publish.py` 不会上传 `functions/` 目录**。它只做静态资源增量上传，
> 适合「不带同步」的快速发布；一旦要用同步，请改用 `deploy.bat`（wrangler）或 Git 集成。
>
> ⚠️ **KV 绑定必须写在 `wrangler.toml` 的 `[[kv_namespaces]]` 里**。只在控制台配「项目级绑定」，
> 下一次 wrangler 部署会把它覆盖掉，接口随即变成 `503 NO_KV`（本项目踩过这个坑）。

### 1. 创建 KV namespace

1. 浏览器打开 <https://dash.cloudflare.com/?to=/:account/workers-and-pages>
2. 左侧选 **KV** → **Create instance**（旧版叫 Create namespace）
3. **Instance name**（名称只用于你在控制台辨认，不参与接口路径）建议填：`xb2-guide-sync`
4. 点 **Add** 保存

**预期结果**：KV 列表里出现 `xb2-guide-sync`，详情页顶部显示一串 **Namespace ID**（形如 `a1b2c3d4e5f60718293a4b5c6d7e8f90`）。

记下这串 ID，第 3 步要用。

### 2. 检查代码里的绑定名（只读确认，不需要改）

- 文件：`functions/api/sync.js`
- 代码读取的是 `env.SYNC`；未绑定时返回 `503 {"error":"kv not bound","code":"NO_KV"}`

**不要把绑定名改成其它值**，否则要同步改代码并重新部署。

### 3. 把 KV 绑定到 Pages 项目

1. <https://dash.cloudflare.com/?to=/:account/workers-and-pages> → 项目 **xb2-guide**
2. **Settings** → **Bindings**（旧界面在 **Functions** → **KV namespace bindings**）
3. **Add** → 选 **KV namespace**
4. 填写：

   | 字段 | 值 |
   | --- | --- |
   | **Variable name** | `SYNC` |
   | **KV namespace** | `xb2-guide-sync`（第 1 步创建的那个） |

5. **Save**（部分界面需要点 **Deploy** 才会应用到生产环境）

> 同一项目可以同时有 Preview 与 Production 两套绑定；只想在生产环境同步时，
> 把 Production 的 `SYNC` 绑定填上即可，Preview 可以不填。

**预期结果**：Bindings 列表里出现一行 `SYNC → xb2-guide-sync`。

### 4. 部署 Functions

三种方式任选，**都要在仓库根目录执行**（`functions/` 的父目录）：

**A. 用 `deploy.bat`（Windows）**

```bash
deploy.bat
```

**B. 用 wrangler 手动部署**

```bash
# 交互式登录（浏览器授权）
npx wrangler@latest login

# 或者用 API 令牌（CI / 无浏览器时）；必须给账号 ID，
# 否则 wrangler 会去调 /memberships，没有该权限的令牌会直接报 10000
$env:CLOUDFLARE_API_TOKEN = "<令牌>"
$env:CLOUDFLARE_ACCOUNT_ID = "0d085a73dc77531f6dfd4ba837ab5a2d"
npx wrangler@latest pages deploy site --project-name xb2-guide --branch main --commit-dirty=true
```

> 输出里必须能看到 **`Uploading Functions bundle`** 这一行，才说明 `functions/` 真的被上传了；
> 只有 `Uploading... (N/N)` 和静态文件列表 = Functions 被漏掉（接口会退回返回 `index.html`）。
>
> 位置参数 `site` 与 `wrangler.toml` 里的 `pages_build_output_dir` 同时给不会出错，
> 关键是看上面那行 Functions 提示。

**C. Git 集成**：按「方式 3」把仓库接到 Pages 后，push 即可，Functions 随代码一起部署。

**预期结果**：终端输出包含 `Uploading Functions bundle`；部署完成页显示新的部署 ID。

### 5. 本地调试（可选）

```bash
npx wrangler@latest pages dev --kv SYNC
```

- 在仓库根目录执行（`functions/` 与 `site/` 同级），输出目录由 `wrangler.toml` 的 `pages_build_output_dir` 决定
- `--kv SYNC` 会起一个本地 KV 模拟并绑定为 `env.SYNC`
- 浏览器打开 wrangler 输出的地址，点右上角「同步」→ 输入 ID → **保存并同步**
- 也可以直接请求接口（端口以 wrangler 输出为准）：

```bash
curl -i "http://localhost:8788/api/sync?id=local-test"
```

### 6. 验证

**6.1 接口可用性（不需要登录）**

```bash
curl -i "https://xb2-guide.pages.dev/api/sync?id=smoke-test"
```

| 返回 | 含义 |
| --- | --- |
| `200 {"done":{},"rev":0}` | ✅ 正常：Functions 已部署、KV 已绑定、该 ID 尚无数据 |
| `404` | ❌ Functions 没部署上去（多半是没走 wrangler/Git，或用 `cf_publish.py` 发的） |
| `503 {"code":"NO_KV"}` | ❌ Functions 正常，但 KV 绑定缺失或变量名不是 `SYNC` |
| `400 {"error":"invalid id"}` | ✅ 接口是通的，只是 `id` 不合法（必须 3~32 位字母/数字/`_`/`-`） |

**6.2 写入与读取**

```bash
# 写入（rev 越大越新）
curl -i -X PUT "https://xb2-guide.pages.dev/api/sync?id=smoke-test" \
  -H "Content-Type: application/json" \
  -d "{\"done\":{\"test-key\":1},\"rev\":1000}"

# 读回，应看到 done.test-key = 1
curl -i "https://xb2-guide.pages.dev/api/sync?id=smoke-test"
```

**6.3 浏览器端**

1. 打开 <https://xb2-guide.pages.dev/>，点右上角同步按钮
2. 输入 `smoke-test` → **保存并同步**，状态行应变成「已同步 · ID「smoke-test」· …」
3. 在任意章节的「本章可接支线」点一个任务左边的圆点
4. **换一个浏览器 / 无痕窗口**，用同一个 `smoke-test` 保存并同步，该任务应显示为已完成

### 7. 数据格式（排查时对照）

| 项 | 说明 | 示例 |
| --- | --- | --- |
| KV 键 | `done:<用户ID>` | `done:my-blade-001` |
| KV 值 | JSON 字符串 | 见下 |
| `done` 的键 | 宝箱：`<地图id>\|tbox\|<x>\|<z>`；任务：`quest:<任务名>` | `ma05a_c_03\|tbox\|633.19\|205.088`、`quest:托里格的起重机破坏事件` |
| `rev` | 最后修改时间（毫秒时间戳） | `1792314813958` |
| 上限 | 单用户 50000 条；ID 长度 ≤ 120 字符 | 超过返回 `413` |
| 过期 | 1 年不访问自动过期 | `expirationTtl = 31536000` |

### 8. 冲突处理

**以最后修改时间为准（last-write-wins），并用远端快照整份替换本机状态。**

- 客户端推送时带 `rev`（本机最近一次修改时间）。
- 服务端发现 `rev` 比已存的小，返回 `{"stale":true,"done":{…}}`，**不覆盖**；
  客户端收到后用服务器的快照替换本机。
- 拉取到更新的快照时（`rev` 更大），客户端调用 `X2Map.replaceDone()` **整份替换**本机勾选状态，
  然后重绘页面。这一点很关键：早期版本用「合并」，**取消勾选无法同步到另一台设备**（合并只能加不能删）。
- 因此：两台设备同时改，后改（时间较晚）的那台生效；被覆盖的设备下一次同步会拉回服务器的版本。
- 代价：如果某台设备刚改了但还没推送（900ms 防抖窗口内）就恰好拉取到更新的快照，
  这台设备的这次改动会被覆盖 —— 正常使用（改完即推）碰不到。

### 11. 端到端验收（两台设备一致性）

```bash
node tools/test_sync_e2e.cjs
# 可指定站点：node tools/test_sync_e2e.cjs http://localhost:8788
```

脚本用**两个独立的 jsdom 实例**模拟两台设备（各自独立的 `localStorage`），
通过线上真实的 `/api/sync` 走完整链路，检查 7 项：

| # | 检查 | 说明 |
| --- | --- | --- |
| 1 | 设备 A 本机记下 3 个标记 | 模拟玩家勾选 |
| 2 | 设备 A 上传成功 | `PUT /api/sync` |
| 3 | 设备 B 登录前本机为空 | 全新浏览器环境 |
| 4 | **设备 B 拉取后与设备 A 完全一致** | 验收核心：同 ID 两端已完成标记一致 |
| 5 | 设备 A 能看到设备 B 新增的标记 | 反向同步 |
| 6 | 两端最终状态一致 | 快照级对比 |
| 7 | 取消勾选也能同步到另一端 | 验证 replace 语义（合并做不到） |

脚本退出码非 0 表示失败，可直接放进 CI。

### 9. 常见问题

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 接口 404 | `functions/` 没上传（用了 `cf_publish.py` 或控制台 Direct Upload） | 改用 `deploy.bat` / wrangler / Git 集成 |
| 接口 404，且目录在 `site/functions` | 位置不对 | 移到仓库根目录 `functions/`，与 `site/` 同级 |
| 接口 503 `NO_KV` | 没绑定 KV，或变量名不是 `SYNC` | 回到第 3 步，**Variable name 必须是 `SYNC`** |
| 接口 400 `invalid id` | ID 不满足 `[A-Za-z0-9_-]{3,32}` | 换一个合法 ID（同一 ID 才能跨设备） |
| 同步面板显示「同步失败：HTTP 404（数据仍安全保存在本机）」 | 后端未部署 | 数据不会丢，配置好 KV 后再点「立即同步」 |
| 两台设备数据不一致 | 一边离线改过、或 `rev` 较旧 | 在较新的设备上点「立即同步」，旧设备再同步一次 |
| 想彻底清空 | — | 面板里「清空本机标记」；服务端键会随 1 年 TTL 过期 |
| wrangler 提示输出目录冲突 | 同时用了 `wrangler.toml` 和位置参数 `site` | 去掉位置参数，只保留 `wrangler.toml` |

### 10. 隐私说明

- 只保存「用户 ID → 已勾选的标记键」与时间戳，**不记录 IP、User-Agent、设备指纹**。
- 用户 ID 由用户自行填写，不需要邮箱或手机号；换一个 ID 即等于换一份独立数据。
- 需要在界面上向用户说明「同步范围 = 已完成标记」「冲突以最后修改时间为准」——同步面板里已有这段文案。

---

## 本地预览

```bash
cd site
python -m http.server 8899
```

然后打开 <http://127.0.0.1:8899/>

---

## 站点位置

| 内容 | 路径 |
| --- | --- |
| 站点根目录（部署目录） | `site/` |
| 页面外壳 | `site/index.html` |
| 样式 / 脚本 | `site/assets/style.css`、`site/assets/app.js`、`site/assets/map.js`、`site/assets/sync.js` |
| 本地底图（90 张） | `site/assets/maps/` |
| Pages Functions（同步接口） | `functions/api/sync.js`（**与 `site/` 同级**，不在 `site/` 里面） |
| 原刊配图 68 页 | `site/assets/mag/` |
| 站点数据 | `site/data/*.js` |
| 数据生成脚本 | `tools/` |

修改文案最直接的方式是改 `site/data/*.js` 里对应的字符串；
如果是从原始素材重新生成，则改 `tools/build_*.py` 后按 README 的顺序重新跑一遍。

### 正文格式约定

改 `site/data/*.js` 里的文字时请注意：

| 写法 | 渲染结果 |
| --- | --- |
| `**文字**` | 加粗（重点）。**不要写 `<b>`** —— HTML 会被转义成可见字符显示在页面上 |
| `[[任务:任务名]]` | 可点击的支线任务，点开弹出浮窗 |
| `[[异刃:焰\|焰]]`、`[[物品:加速护腕]]`、`[[敌人:齐格]]`、`[[地标:渴望眼界]]` | 跳转 wiki 的外链（`\|` 后可写显示文字） |
| `「任务名」` | 与任务库中任务同名时会自动变成可点击的支线链接 |

`tools/link_names.py` 在构建时会把遗留的 `<b>…</b>` 自动转成 `**…**`，并清掉其它零散的类 HTML 标记，
所以从旧素材导入的文本也不会漏出标记。

---

## 相关脚本

| 脚本 | 用途 |
| --- | --- |
| `tools/cf_publish.py` | 用 API 令牌把 `site/` 发布到 Cloudflare Pages（**只发静态文件，不含 `functions/`**） |
| `deploy.bat` | 用 wrangler 部署，**包含 `functions/`**（同步功能必须走这条或 Git 集成） |
| `tools/verify_deploy.py` | 检查线上关键资源是否都能访问 |
| `tools/gh_push_state.py` | 通过 GitHub API 推送提交（绕过被阻断的 github.com:443） |
| `tools/test_site.cjs` | jsdom 冒烟测试（路由 / 浮窗 / 搜索 / 图鉴 / 图片） |
| `tools/check_links.cjs` | 站内链接、任务链接与资源引用检查 |
