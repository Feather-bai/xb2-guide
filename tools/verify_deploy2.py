# -*- coding: utf-8 -*-
"""验证线上站点（含本地化地图与新增插件）。"""
import random, re, sys, time, urllib.error, urllib.request

BASE = sys.argv[1] if len(sys.argv) > 1 else "https://xb2-guide.pages.dev"
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      "Accept-Language": "zh-CN,zh;q=0.9"}


def get(path, tries=3, timeout=60):
    code = None
    for _ in range(tries):
        try:
            req = urllib.request.Request(BASE + path, headers=UA)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.status, r.read(), r.headers
        except urllib.error.HTTPError as e:
            code = e.code
            time.sleep(3)
        except Exception as e:
            code = type(e).__name__
            time.sleep(3)
    return code, b"", {}


PATHS = ["/", "/assets/map.js", "/assets/app.js", "/assets/style.css",
         "/assets/vendor/leaflet.js", "/assets/vendor/leaflet.markercluster.js",
         "/assets/vendor/MarkerCluster.css", "/assets/vendor/MarkerCluster.Default.css",
         "/data/maps.js"]
ok = fail = 0
for p in PATHS:
    st, body, hdr = get(p)
    if st == 200:
        print("200  %9d  %s" % (len(body), p))
        ok += 1
    else:
        print("FAIL %s  %s" % (st, p))
        fail += 1

# 抽查本地化后的地图图片
st, body, _ = get("/data/maps.js")
if st == 200:
    text = body.decode("utf-8", "ignore")
    imgs = re.findall(r'"img":"([^"]+)"', text)
    remote = [i for i in imgs if i.startswith("http")]
    print("\nmaps.js 图片引用 %d 个，其中远端 %d 个" % (len(imgs), len(remote)))
    random.seed(3)
    for i in random.sample(imgs, min(6, len(imgs))):
        path = "/" + i.lstrip("/")
        st2, b2, _ = get(path, tries=2, timeout=90)
        size = len(b2)
        if st2 == 200:
            print("  200  %8d  %s" % (size, path))
            ok += 1
        else:
            print("  FAIL %s  %s" % (st2, path))
            fail += 1

print("\n成功 %d / %d" % (ok, ok + fail))
