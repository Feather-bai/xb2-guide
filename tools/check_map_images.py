# -*- coding: utf-8 -*-
"""检查地图底图在浏览器场景下能否加载（CORS / 防盗链 / 状态码）。"""
import json, os, random, sys, urllib.error, urllib.request

WS = r"C:\Users\ZhuanZ\Documents\deepseek-harness\default-workspace"
src = open(os.path.join(WS, "site", "data", "maps.js"), encoding="utf-8").read()
data = json.loads(src.split("window.X2.mapsData=", 1)[1].rstrip(";\n"))
maps = data["maps"]
print("地图总数:", len(maps))

random.seed(7)
sample = random.sample(maps, min(12, len(maps)))
ok = fail = 0
for m in sample:
    req = urllib.request.Request(m["img"], headers={
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0",
        "Referer": "https://xb2-guide.pages.dev/",
        "Origin": "https://xb2-guide.pages.dev",
    })
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            body = r.read()
        acao = r.headers.get("Access-Control-Allow-Origin")
        ctype = r.headers.get("Content-Type")
        print(f"  {r.status} {len(body):>8}  {m['id']:<28} CORS={acao} type={ctype}")
        ok += 1
    except urllib.error.HTTPError as e:
        print(f"  {e.code}  ----  {m['id']:<28} 失败")
        fail += 1
    except Exception as e:
        print(f"  ERR {type(e).__name__}  {m['id']:<28} {e}")
        fail += 1

# 全部地图的 URL 都做一次 HEAD 检查（并发 8）
print("\n全量检查（HEAD）…")
import concurrent.futures


def head(m):
    req = urllib.request.Request(m["img"], method="HEAD", headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(req, timeout=45) as r:
            return m["id"], r.status, r.headers.get("Content-Length")
    except urllib.error.HTTPError as e:
        return m["id"], e.code, None
    except Exception as e:
        return m["id"], type(e).__name__, None


bad = []
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:
    for mid, status, size in ex.map(head, maps):
        if status != 200:
            bad.append((mid, status))
print(f"可访问 {len(maps) - len(bad)} / {len(maps)}")
for mid, status in bad[:10]:
    print("   不可用:", mid, status)
