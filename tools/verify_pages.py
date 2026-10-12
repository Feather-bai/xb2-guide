# -*- coding: utf-8 -*-
"""抓取线上几个页面，检查是否有裸露的 HTML 标记被当成正文显示。"""
import re, sys, time, urllib.error, urllib.request

BASE = "https://xb2-guide.pages.dev"
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      "Accept-Language": "zh-CN,zh;q=0.9"}


def get(path, tries=4):
    for _ in range(tries):
        try:
            req = urllib.request.Request(BASE + path, headers=UA)
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.status, r.read().decode("utf-8", "ignore")
        except urllib.error.HTTPError as e:
            code = e.code
            time.sleep(4)
        except Exception as e:
            code = type(e).__name__
            time.sleep(4)
    return code, ""


# 页面是 SPA，先确认外壳与渲染脚本能取到；再验证数据里没有裸露标记
st, html = get("/index.html")
print("index.html:", st, "| 长度", len(html) if isinstance(st, int) and st == 200 else "-")
if st == 200:
    print("  外壳含 viewport-fit:", "viewport-fit=cover" in html)
    print("  外壳含浮窗关闭按钮:", 'id="modalClose"' in html)
    print("  外壳里裸露 <b> 数量:", len(re.findall(r"</?b>", html)))

st, app = get("/assets/app.js")
if st == 200:
    # app.js 里 <b> 只应出现在静态视图模板里，且这些模板是直接写入 innerHTML 的
    print("app.js:", st, "|<b> 字样", len(re.findall(r"</?b>", app)), "| 含 ** 加粗渲染:", "strong>$1</strong>" in app or "\\*\\*" in app)

for p in ["/data/chapters.js", "/data/systems.js", "/data/quests.js", "/data/extras.js", "/data/mag.js"]:
    st, body = get(p)
    if st == 200:
        print("%-22s 裸露 <b> %d 处 | ** 加粗 %d 处" % (p, len(re.findall(r"</?b>", body)), body.count("**") // 2))
    else:
        print("%-22s %s" % (p, st))
