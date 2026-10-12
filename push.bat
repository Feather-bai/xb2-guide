@echo off
REM 推送到 GitHub（自动带上 gh 的访问令牌，避免 schannel 证书问题）
setlocal
for /f "delims=" %%t in ('gh auth token') do set TOK=%%t
if "%TOK%"=="" (
  echo [x] 未获取到 GitHub 令牌，请先运行: gh auth login
  exit /b 1
)
cd /d "%~dp0"
git add -A
git commit -m "更新攻略内容 %date% %time%"
git -c http.sslBackend=openssl -c "http.https://github.com/.extraheader=Authorization: Basic %TOK%" push origin main
echo.
echo [√] 已推送。如果 Cloudflare Pages 已连接该仓库，稍等 1 分钟会自动重新部署。
endlocal
