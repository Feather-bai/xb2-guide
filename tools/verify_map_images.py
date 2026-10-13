# -*- coding: utf-8 -*-
"""验证地图底图是否能从本机访问并下载。"""
import json, os, sys, urllib.parse, urllib.request

WS = r"C:\Users\ZhuanZ\Documents\deepseek-harness\default-workspace"
OUT = os.path.join(WS, ".extract", "mapdata", "img")
os.makedirs(OUT, exist_ok=True)
API = "https://xenoblade2.cn/api.php"
UA = {"User-Agent": "Mozilla/5.0 (compatible; guide-archiver/1.0)"}


def api(params):
    url = API + "?" + urllib.parse.urlencode(params)
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
        return json.load(r)


def imageinfo(title):
    d = api({"action": "query", "titles": title, "prop": "imageinfo", "iiprop": "url|size|mime",
             "format": "json", "formatversion": "2"})
    for pg in d.get("query", {}).get("pages", []):
        if "imageinfo" in pg:
            return pg["imageinfo"][0]
    return None


def guess_image_name(map_name):
    """ma02a_f01 -> Ma02a f01 map 0.png"""
    s = map_name.replace("_", " ")
    s = s[:1].upper() + s[1:]
    return "文件:" + s + " map 0.png"


def main():
    info = json.load(open(os.path.join(WS, ".extract", "mapdata", "mapinfo.json"), encoding="utf-8"))
    ok = miss = 0
    samples = []
    for key, raw in list(info.items())[:200]:
        obj = json.loads(raw)
        name = obj.get("Name")
        title = guess_image_name(name)
        ii = imageinfo(title)
        if ii:
            ok += 1
            if len(samples) < 5:
                samples.append((name, obj.get("mapName"), title, ii.get("url"), ii.get("width"), ii.get("height")))
        else:
            miss += 1
            if miss <= 5:
                print("  缺失:", name, "->", title)
    print(f"\n命中 {ok} / 共 {ok + miss}")
    for s in samples:
        print("  ", s[0], "|", s[1], "|", s[3], f"({s[4]}x{s[5]})")

    if samples:
        url = samples[0][3]
        dest = os.path.join(OUT, os.path.basename(urllib.parse.unquote(url)))
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=180) as r:
                data = r.read()
            with open(dest, "wb") as f:
                f.write(data)
            print(f"\n下载成功 {len(data)/1024:.0f} KB -> {dest}")
        except Exception as e:
            print("\n下载失败:", type(e).__name__, e)
            # 试 wiki 的 /images/ 相对路径
            alt = "https://xenoblade2.cn" + url if url.startswith("/") else url
            if alt != url:
                try:
                    with urllib.request.urlopen(urllib.request.Request(alt, headers=UA), timeout=180) as r:
                        data = r.read()
                    print(f"  备用路径成功 {len(data)/1024:.0f} KB")
                except Exception as e2:
                    print("  备用路径也失败:", e2)


if __name__ == "__main__":
    main()
