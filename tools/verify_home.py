# -*- coding: utf-8 -*-
"""单独抓一次线上首页，确认返回内容（避免重复请求触发 Cloudflare 机器人拦截）。"""
import sys, urllib.error, urllib.request

url = (sys.argv[1] if len(sys.argv) > 1 else "https://xb2-guide.pages.dev") + "/index.html"
req = urllib.request.Request(url, headers={
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9",
})
try:
    with urllib.request.urlopen(req, timeout=60) as r:
        html = r.read().decode("utf-8", "ignore")
    print("HTTP", r.status, "| 长度", len(html), "| server:", r.headers.get("server"), "| cf-cache:", r.headers.get("cf-cache-status"))
    for needle in ["异度之刃2 完整攻略站", 'id="modal"', 'id="modalClose"', "data/mag.js", "assets/app.js", "viewport-fit=cover"]:
        print(("  OK   " if needle in html else "  缺失 ") + needle)
except urllib.error.HTTPError as e:
    print("HTTP", e.code, "| server:", e.headers.get("server"), "| cf-mitigated:", e.headers.get("cf-mitigated"))
    print("（浏览器正常访问不受影响；这是脚本请求被 Cloudflare 机器人防护拦截）")
