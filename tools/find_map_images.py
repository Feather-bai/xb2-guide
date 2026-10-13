# -*- coding: utf-8 -*-
"""寻找 wiki 上地图底图的 URL 规则：探测 File 名字空间与常见路径。"""
import json, os, re, sys, urllib.parse, urllib.request

WS = r"C:\Users\ZhuanZ\Documents\deepseek-harness\default-workspace"
API = "https://xenoblade2.cn/api.php"
UA = {"User-Agent": "Mozilla/5.0 (compatible; guide-archiver/1.0)"}


def api(params):
    url = API + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers=UA)
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.load(r)
    except Exception as e:
        return {"error": str(e)}


def main():
    # 1) 找 File 名字空间里名字含地图 id 的文件
    for q in ["ma02a_f01", "ma02a", "Map_ma02a", "阿伐利缇亚商会 地图", "Mapinfo"]:
        d = api({"action": "query", "list": "search", "srsearch": q, "srnamespace": "6",
                 "srlimit": "10", "format": "json", "formatversion": "2"})
        hits = [x["title"] for x in d.get("query", {}).get("search", [])] if "query" in d else []
        print(f"File 搜索 {q!r}: {hits[:8]}")

    # 2) 列举 File 名字空间里名字含 ma0 的文件
    d = api({"action": "query", "list": "allpages", "apnamespace": "6", "apprefix": "Ma",
             "aplimit": "100", "format": "json", "formatversion": "2"})
    pages = [p["title"] for p in d.get("query", {}).get("allpages", [])]
    print("\nFile 前缀 Ma:", len(pages), pages[:20])

    for pref in ["ma", "Map", "地图", "Ma02"]:
        d = api({"action": "query", "list": "allpages", "apnamespace": "6", "apprefix": pref,
                 "aplimit": "50", "format": "json", "formatversion": "2"})
        pages = [p["title"] for p in d.get("query", {}).get("allpages", [])]
        if pages:
            print(f"File 前缀 {pref}: {len(pages)}", pages[:12])

    # 3) 用 imageinfo 拿候选文件的真实 URL
    for title in ["File:Ma02a f01.png", "File:ma02a_f01.png", "File:Map ma02a f01.png"]:
        d = api({"action": "query", "titles": title, "prop": "imageinfo", "iiprop": "url|size",
                 "format": "json", "formatversion": "2"})
        pages = d.get("query", {}).get("pages", [])
        for pg in pages:
            if "imageinfo" in pg:
                ii = pg["imageinfo"][0]
                print(f"\n找到 {title}: {ii.get('url')} ({ii.get('width')}x{ii.get('height')})")
            else:
                print(f"\n不存在 {title}")


if __name__ == "__main__":
    main()
