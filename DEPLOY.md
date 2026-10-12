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
| 样式 / 脚本 | `site/assets/style.css`、`site/assets/app.js` |
| 原刊配图 68 页 | `site/assets/mag/` |
| 站点数据 | `site/data/*.js` |
| 数据生成脚本 | `tools/` |

修改文案最直接的方式是改 `site/data/*.js` 里对应的字符串；
如果是从原始素材重新生成，则改 `tools/build_*.py` 后按 README 的顺序重新跑一遍。

---

## 相关脚本

| 脚本 | 用途 |
| --- | --- |
| `tools/cf_publish.py` | 用 API 令牌把 `site/` 发布到 Cloudflare Pages |
| `tools/verify_deploy.py` | 检查线上关键资源是否都能访问 |
| `tools/gh_push_state.py` | 通过 GitHub API 推送提交（绕过被阻断的 github.com:443） |
| `tools/test_site.cjs` | jsdom 冒烟测试（路由 / 浮窗 / 搜索 / 图鉴 / 图片） |
| `tools/check_links.cjs` | 站内链接、任务链接与资源引用检查 |
