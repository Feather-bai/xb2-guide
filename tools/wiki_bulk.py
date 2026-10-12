import json, os, re, sys, time, urllib.parse, urllib.request

WS = r"C:\Users\ZhuanZ\Documents\deepseek-harness\default-workspace"
OUT = os.path.join(WS, ".extract", "wiki")
API = "https://xenoblade2.cn/api.php"
UA = {"User-Agent": "Mozilla/5.0 (compatible; guide-archiver/1.0)"}


def get(params):
    url = API + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers=UA)
    last = None
    for a in range(4):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.load(r)
        except Exception as e:
            last = e
            time.sleep(2 + 3 * a)
    print("  FAIL", last)
    return None


def cat_members(cat):
    out, cont = [], None
    while True:
        p = {"action": "query", "list": "categorymembers", "cmtitle": "Category:" + cat,
             "cmlimit": "500", "format": "json", "formatversion": "2"}
        if cont:
            p["cmcontinue"] = cont
        d = get(p)
        if not d or "query" not in d:
            break
        out += [m["title"] for m in d["query"]["categorymembers"]]
        cont = d.get("continue", {}).get("cmcontinue")
        if not cont:
            break
    return out


def bulk_content(titles):
    """Return {title: wikitext} using prop=revisions, batching 40 titles."""
    res = {}
    for i in range(0, len(titles), 40):
        batch = titles[i:i + 40]
        d = get({"action": "query", "prop": "revisions", "rvprop": "content", "rvslots": "main",
                 "titles": "|".join(batch), "format": "json", "formatversion": "2"})
        if not d or "query" not in d:
            continue
        for pg in d["query"].get("pages", []):
            if "revisions" in pg:
                res[pg["title"]] = pg["revisions"][0]["slots"]["main"]["content"]
        print(f"  batch {i//40+1}: {len(res)} pages", flush=True)
    return res


if __name__ == "__main__":
    cats = sys.argv[1:]
    for cat in cats:
        ms = cat_members(cat)
        print(f"== {cat}: {len(ms)} members", flush=True)
        safe = re.sub(r"[^\w\u4e00-\u9fff]+", "_", cat)
        with open(os.path.join(OUT, f"members_{safe}.json"), "w", encoding="utf-8") as f:
            json.dump(ms, f, ensure_ascii=False, indent=1)
        data = bulk_content(ms)
        with open(os.path.join(OUT, f"content_{safe}.json"), "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)
        print(f"   saved {len(data)} wikitext bodies -> content_{safe}.json", flush=True)
