@echo off
REM 直接部署当前站点到 Cloudflare Pages（不需要 Git）
setlocal
cd /d "%~dp0"
set WRANGLER_SEND_METRICS=false
npx --yes wrangler@latest pages deploy site --project-name xb2-guide --branch main --commit-dirty=true
endlocal
