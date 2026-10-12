# 部署说明

站点已经构建完成，代码在 GitHub 上：

**https://github.com/Feather-bai/xb2-guide**

Cloudflare Pages 项目名 `xb2-guide` 已经创建（当前是 Direct Upload 类型，还没有内容）。

---

## 方案 A：GitHub 连接 Cloudflare Pages（push 即自动部署，推荐）

这种模式下你以后只改仓库，Cloudflare 会自动重新构建部署。

### 1. 在 Cloudflare 里连接仓库

1. 打开 <https://dash.cloudflare.com/?to=/:account/workers-and-pages>
2. 找到项目 **xb2-guide** → **Settings** → **Builds & deployments**
3. 如果显示 **Connect to Git**（当前是 Direct Upload 项目），需要**新建一个 Git 项目**：
   - **Create application** → **Pages** → **Connect to Git**
   - 授权 GitHub（如果之前给 `isaac-pages` / `kazan-pages` 授权过，Cloudflare 已经有权限，直接选仓库即可）
   - 选择仓库 **Feather-bai/xb2-guide**，分支 **main**
4. 构建设置留空即可（本站是纯静态文件，不需要构建）：
   - **Framework preset**：`None`
   - **Build command**：留空
   - **Build output directory**：`site`
5. **Save and Deploy**

> 注意：Cloudflare 官方的限制是 Direct Upload 项目**不能**再切换成 Git 集成，
> 所以如果 `xb2-guide` 这个项目已经是 Direct Upload，就用上面的方式新建一个 Git 项目
> （名字可以叫 `xb2-guide-git`，或者先把旧的 Direct Upload 项目删掉再建同名的）。

### 2. 以后更新内容

改完内容后双击仓库根目录的 **`push.bat`**，它会自动 commit 并 push；
Cloudflare 检测到 main 分支有新提交就会自动重新部署。

也可以手动推送：

```bash
git add -A
git commit -m "更新内容"
git push origin main
```

---

## 方案 B：手动部署（不依赖 Git）

1. 在终端里重新登录一次 Cloudflare（OAuth 凭据过期了）：
   ```bash
   npx wrangler login
   ```
2. 双击仓库根目录的 **`deploy.bat`**，或执行：
   ```bash
   npx wrangler pages deploy site --project-name xb2-guide --branch main
   ```

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
