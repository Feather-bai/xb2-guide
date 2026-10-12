"""Fetch the wikitext of every quest page listed in smw_all_quests.json."""
import json, os, sys, time, urllib.parse, urllib.request

WS = r"C:\Users\ZhuanZ\Documents\deepseek-harness\default-workspace"
W = os.path.join(WS, ".extract", "wiki")
API = "https://xenoblade2.cn/api.php"
UA = {"User-Agent": "Mozilla/5.0 (compatible; guide-archiver/1.0)"}


def get(params):
    url = API + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers=UA)
    for a in range(4):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.load(r)
        except Exception as e:
            time.sleep(2 + 3 * a)
    return None


def bulk(titles):
    res = {}
    for i in range(0, len(titles), 40):
        d = get({"action": "query", "prop": "revisions", "rvprop": "content", "rvslots": "main",
                 "titles": "|".join(titles[i:i + 40]), "format": "json", "formatversion": "2"})
        if not d or "query" not in d:
            continue
        for pg in d["query"].get("pages", []):
            if "revisions" in pg:
                res[pg["title"]] = pg["revisions"][0]["slots"]["main"]["content"]
        print(f"  batch {i//40+1}: total {len(res)}", flush=True)
    return res


if __name__ == "__main__":
    smw = json.load(open(os.path.join(W, "smw_all_quests.json"), encoding="utf-8"))
    titles = list(smw["query"]["results"].keys())
    print("quest titles:", len(titles))
    data = bulk(titles)
    with open(os.path.join(W, "content_all_quests.json"), "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)
    print("saved", len(data))
