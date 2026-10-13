# -*- coding: utf-8 -*-
"""验证线上互动地图相关的资源。"""
import sys, time, urllib.error, urllib.request

BASE = sys.argv[1] if len(sys.argv) > 1 else "https://xb2-guide.pages.dev"
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      "Accept-Language": "zh-CN,zh;q=0.9"}

PATHS = [
    "/", "/assets/map.js", "/assets/vendor/leaflet.js", "/assets/vendor/leaflet.css",
    "/data/maps.js", "/assets/style.css", "/assets/app.js",
]

ok = fail = 0
for p in PATHS:
    for attempt in range(3):
        try:
            req = urllib.request.Request(BASE + p, headers=UA)
            with urllib.request.urlopen(req, timeout=45) as r:
                body = r.read()
            print("%s  %9d  %s" % (r.status, len(body), p))
            ok += 1
            break
        except urllib.error.HTTPError as e:
            code = e.code
            time.sleep(3)
        except Exception as e:
            code = type(e).__name__
            time.sleep(3)
    else:
        print("FAIL %s  %s" % (code, p))
        fail += 1

print("\n可访问 %d / %d" % (ok, ok + fail))

# 内容抽查
try:
    req = urllib.request.Request(BASE + "/data/maps.js", headers=UA)
    with urllib.request.urlopen(req, timeout=45) as r:
        maps = r.read().decode("utf-8", "ignore")
    import re
    print("maps.js 含 mapsData:", "window.X2.mapsData" in maps)
    print("地图条目数（按 img 统计）:", len(re.findall(r'"img":"https://images\.xenoblade2\.cn', maps)))
    print("标记坐标条目数（按 x 统计）:", len(re.findall(r'\{"x":', maps)))
except Exception as e:
    print("maps.js 抽查失败:", e)

# 底图抽样（跨域图片）
for url in ["https://images.xenoblade2.cn/images/a/a6/Ma02a_f01_map_0.png"]:
    try:
        req = urllib.request.Request(url, headers={**UA, "Referer": BASE + "/"})
        with urllib.request.urlopen(req, timeout=60) as r:
            print("底图 %s  %d bytes  type=%s" % (r.status, len(r.read()), r.headers.get("Content-Type")))
    except Exception as e:
        print("底图失败:", type(e).__name__, e)
