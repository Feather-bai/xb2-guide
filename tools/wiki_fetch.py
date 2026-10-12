import json, os, re, sys, time, urllib.parse, urllib.request

WS = r"C:\Users\ZhuanZ\Documents\deepseek-harness\default-workspace"
OUT = os.path.join(WS, ".extract", "wiki")
os.makedirs(OUT, exist_ok=True)
API = "https://xenoblade2.cn/api.php"
UA = {"User-Agent": "Mozilla/5.0 (compatible; personal-guide-archiver/1.0)"}


def get(params, host=API):
    url = host + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers=UA)
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                return json.load(r)
        except Exception as e:
            print("  retry", attempt, type(e).__name__, e)
            time.sleep(2 + attempt * 3)
    return None


def raw(title):
    d = get({"action": "parse", "page": title, "prop": "wikitext", "format": "json", "formatversion": "2"})
    if d and "parse" in d:
        return d["parse"]["wikitext"]
    return None


def save(name, text):
    p = os.path.join(OUT, name + ".wiki")
    with open(p, "w", encoding="utf-8") as f:
        f.write(text or "")
    return p


def category_members(cat, limit=500):
    out = []
    cont = None
    while True:
        params = {"action": "query", "list": "categorymembers", "cmtitle": "Category:" + cat,
                  "cmlimit": str(limit), "format": "json", "formatversion": "2"}
        if cont:
            params["cmcontinue"] = cont
        d = get(params)
        if not d or "query" not in d:
            break
        out.extend(m["title"] for m in d["query"]["categorymembers"])
        cont = d.get("continue", {}).get("cmcontinue")
        if not cont:
            break
    return out


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "main"
    if mode == "main":
        targets = [
            ("流程攻略", "流程攻略"),
        ] + [(f"流程攻略/第{n}章", f"流程攻略_第{n}章") for n in "一二三四五六七八九"] + [
            ("流程攻略/最终章", "流程攻略_最终章"),
        ]
        for title, name in targets:
            t = raw(title)
            print(name, "->", len(t) if t else "FAIL", flush=True)
            save(name, t)
    elif mode == "titles":
        # discover module landing pages
        for t in sys.argv[2:]:
            txt = raw(t)
            print("=====", t, len(txt) if txt else "FAIL")
            if txt:
                save(re.sub(r"[^\w\u4e00-\u9fff]+", "_", t), txt)
    elif mode == "cat":
        for cat in sys.argv[2:]:
            ms = category_members(cat)
            print(cat, len(ms))
            with open(os.path.join(OUT, "cat_" + re.sub(r"[^\w\u4e00-\u9fff]+", "_", cat) + ".json"), "w", encoding="utf-8") as f:
                json.dump(ms, f, ensure_ascii=False, indent=1)
            for m in ms:
                fn = "page_" + re.sub(r"[^\w\u4e00-\u9fff]+", "_", m)
                if os.path.exists(os.path.join(OUT, fn + ".wiki")):
                    continue
                txt = raw(m)
                save(fn, txt)
                print("  ", m, len(txt) if txt else "FAIL", flush=True)
