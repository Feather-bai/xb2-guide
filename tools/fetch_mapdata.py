# -*- coding: utf-8 -*-
"""抓取 wiki 的地图元数据 JSON（Mapinfo/* 与 FLD maplist/*），并看清结构。"""
import json, os, sys, urllib.parse, urllib.request

WS = r"C:\Users\ZhuanZ\Documents\deepseek-harness\default-workspace"
OUT = os.path.join(WS, ".extract", "mapdata")
os.makedirs(OUT, exist_ok=True)
API = "https://xenoblade2.cn/api.php"
UA = {"User-Agent": "Mozilla/5.0 (compatible; guide-archiver/1.0)"}


def get(params):
    url = API + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers=UA)
    for a in range(3):
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                return json.load(r)
        except Exception as e:
            print("  retry", a, e)
    return None


def pages(prefix):
    out, cont = [], None
    while True:
        p = {"action": "query", "list": "allpages", "apnamespace": "8888", "apprefix": prefix,
             "aplimit": "500", "format": "json", "formatversion": "2"}
        if cont:
            p["apcontinue"] = cont
        d = get(p)
        if not d or "query" not in d:
            break
        out += [x["title"] for x in d["query"]["allpages"]]
        cont = d.get("continue", {}).get("apcontinue")
        if not cont:
            break
    return out


def content(titles):
    res = {}
    for i in range(0, len(titles), 30):
        d = get({"action": "query", "prop": "revisions", "rvprop": "content", "rvslots": "main",
                 "titles": "|".join(titles[i:i + 30]), "format": "json", "formatversion": "2"})
        if not d or "query" not in d:
            continue
        for pg in d["query"].get("pages", []):
            if "revisions" in pg:
                res[pg["title"]] = pg["revisions"][0]["slots"]["main"]["content"]
        print(f"  批次 {i//30+1}: 累计 {len(res)}", flush=True)
    return res


if __name__ == "__main__":
    for prefix, fname in (("Mapinfo", "mapinfo.json"), ("FLD maplist", "maplist.json")):
        titles = pages(prefix)
        print(f"== {prefix}: {len(titles)} 页")
        data = content(titles)
        with open(os.path.join(OUT, fname), "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)
        print(f"   保存 {len(data)} 条 -> {fname}")

    # 看结构
    for fname in ("mapinfo.json", "maplist.json"):
        data = json.load(open(os.path.join(OUT, fname), encoding="utf-8"))
        k = next(iter(data))
        print(f"\n===== {fname} 样例 key={k}")
        try:
            obj = json.loads(data[k])
            print(json.dumps(obj, ensure_ascii=False, indent=1)[:900])
        except Exception as e:
            print("  解析失败", e, data[k][:300])
