# -*- coding: utf-8 -*-
"""验证已部署站点的关键资源可访问。"""
import sys, time, urllib.error, urllib.request

BASE = sys.argv[1] if len(sys.argv) > 1 else "https://xb2-guide.pages.dev"
PATHS = [
    "/", "/index.html", "/assets/style.css", "/assets/app.js",
    "/data/index.js", "/data/quests.js", "/data/chapters.js", "/data/systems.js",
    "/data/codex.js", "/data/extras.js", "/data/mag.js",
    "/assets/mag/vol1-p007.webp", "/assets/mag/vol2-p028.webp",
]

ok = 0
fail = 0
for p in PATHS:
    url = BASE + p
    done = False
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=45) as r:
                data = r.read()
            print("%s  %9d  %s" % (r.status, len(data), p))
            ok += 1
            done = True
            break
        except urllib.error.HTTPError as e:
            code = e.code
            time.sleep(3)
        except Exception as e:
            code = type(e).__name__
            time.sleep(3)
    if not done:
        print("FAIL %s  %s" % (code, p))
        fail += 1

print("\n可访问 %d / %d" % (ok, ok + fail))

# 首页内容抽查
try:
    with urllib.request.urlopen(BASE + "/index.html", timeout=45) as r:
        html = r.read().decode("utf-8", "ignore")
    for needle in ["异度之刃2 完整攻略站", "id=\"modal\"", "id=\"modalClose\"", "data/mag.js", "assets/app.js"]:
        print(("  OK   " if needle in html else "  缺失 ") + needle)
except Exception as e:
    print("首页抓取失败:", e)
