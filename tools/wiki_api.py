import json, os, re, sys, time, urllib.parse, urllib.request

WS = r"C:\Users\ZhuanZ\Documents\deepseek-harness\default-workspace"
OUT = os.path.join(WS, ".extract", "wiki")
os.makedirs(OUT, exist_ok=True)
API = "https://xenoblade2.cn/api.php"
UA = {"User-Agent": "Mozilla/5.0 (compatible; personal-guide-archiver/1.0)"}


def get(params):
    url = API + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers=UA)
    for a in range(3):
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                return json.load(r)
        except Exception as e:
            print("  retry", a, e)
            time.sleep(2 + 3 * a)
    return None


def raw(title):
    d = get({"action": "parse", "page": title, "prop": "wikitext", "format": "json", "formatversion": "2"})
    if d and "parse" in d:
        return d["parse"]["wikitext"]
    return None


def links(title):
    d = get({"action": "parse", "page": title, "prop": "links", "format": "json", "formatversion": "2"})
    if d and "parse" in d:
        return [l["title"] for l in d["parse"].get("links", []) if l.get("exists")]
    return []


def members(cat, limit=500):
    out, cont = [], None
    while True:
        p = {"action": "query", "list": "categorymembers", "cmtitle": "Category:" + cat,
             "cmlimit": str(limit), "format": "json", "formatversion": "2"}
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


if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "raw":
        for t in sys.argv[2:]:
            txt = raw(t)
            fn = "page_" + re.sub(r"[^\w\u4e00-\u9fff]+", "_", t) + ".wiki"
            with open(os.path.join(OUT, fn), "w", encoding="utf-8") as f:
                f.write(txt or "")
            print(t, "->", len(txt) if txt else "FAIL", fn, flush=True)
    elif cmd == "links":
        for t in sys.argv[2:]:
            ls = links(t)
            print("=====", t, len(ls))
            for l in ls:
                print("   ", l)
    elif cmd == "cat":
        for c in sys.argv[2:]:
            ms = members(c)
            print("=====", c, len(ms))
            for m in ms:
                print("   ", m)
            with open(os.path.join(OUT, "cat_" + re.sub(r"[^\w\u4e00-\u9fff]+", "_", c) + ".json"), "w", encoding="utf-8") as f:
                json.dump(ms, f, ensure_ascii=False, indent=1)
    elif cmd == "catdump":
        for c in sys.argv[2:]:
            ms = members(c)
            print("=====", c, len(ms), flush=True)
            for m in ms:
                fn = "page_" + re.sub(r"[^\w\u4e00-\u9fff]+", "_", m) + ".wiki"
                p = os.path.join(OUT, fn)
                if os.path.exists(p) and os.path.getsize(p) > 0:
                    continue
                txt = raw(m)
                with open(p, "w", encoding="utf-8") as f:
                    f.write(txt or "")
                print("   ", m, len(txt) if txt else "FAIL", flush=True)
