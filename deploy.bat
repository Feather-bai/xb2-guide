@echo off
REM 直接部署当前站点到 Cloudflare Pages（不需要 Git）
REM
REM 目录约定（Cloudflare 要求）：
REM   site\        静态输出目录，由 wrangler.toml 的 pages_build_output_dir 指定
REM   functions\   Pages Functions，必须与 site\ 同级（放在 site\ 里面不会生效）
REM
REM 这里有两条可用的发布路线，按是否要用 /api/sync 跨设备同步来选：
REM   有 functions\ -> 用 wrangler（本脚本）。注意不要再传位置参数 site，
REM                    否则会和 wrangler.toml 的输出目录冲突、functions 可能被静默丢掉。
REM   没有 functions\ -> 用 tools\cf_publish.py（更快，按 hash 增量上传）。
setlocal
cd /d "%~dp0"
set WRANGLER_SEND_METRICS=false

if not exist "functions\api\sync.js" (
  echo [!] 未找到 functions\api\sync.js，将只部署静态文件（同步接口不可用）。
)

npx --yes wrangler@latest pages deploy --project-name xb2-guide --branch main --commit-dirty=true
if errorlevel 1 (
  echo.
  echo [x] 部署失败。常见原因：
  echo     1. 未登录：先运行 npx wrangler login
  echo     2. 部署到 Direct Upload 项目但 functions 未绑定 KV：同步接口会返回 503
  echo     3. wrangler.toml 里 pages_build_output_dir 与实际目录不符
  exit /b 1
)

echo.
echo [√] 已部署。同步接口自检：
echo     curl -i "https://xb2-guide.pages.dev/api/sync?id=smoke-test"
endlocal
