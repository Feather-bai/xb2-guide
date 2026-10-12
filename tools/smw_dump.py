import json, os, re, sys, time, urllib.parse, urllib.request

WS = r"C:\Users\ZhuanZ\Documents\deepseek-harness\default-workspace"
OUT = os.path.join(WS, ".extract", "wiki")
os.makedirs(OUT, exist_ok=True)
API = "https://xenoblade2.cn/api.php"
UA = {"User-Agent": "Mozilla/5.0 (compatible; guide-archiver/1.0)"}


def get(params):
    url = API + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers=UA)
    last = None
    for a in range(3):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.load(r)
        except Exception as e:
            last = e
            time.sleep(2 + 3 * a)
    print("  FAIL", last, flush=True)
    return None


def ask(query):
    d = get({"action": "ask", "query": query, "format": "json", "api_version": "2"})
    if not d:
        return None
    return d


QUERIES = {
    "all_quests": "[[任务:+]]|?任务分类|?任务ID|?地点1|?地点2|?NPC|?任务条件|?对应异刃|?金币|?EXP|?SP|?发展度地区|?发展度增加|?信赖度|limit=800",
    "blade_quests": "[[任务:+]][[任务分类::异刃任务]]|?对应异刃|?任务条件|?地点1|?任务ID|limit=200",
    "merc_quests": "[[任务:+]][[任务分类::佣兵团任务]]|?任务ID|?地点1|?任务条件|limit=500",
    "blades": "[[异刃:+]]|?属性|?武器|?类型|?稀有度|?获取方式|limit=300",
    "aux_cores": "[[辅助核心:+]]|limit=500",
    "accessories": "[[饰品:+]]|limit=500",
    "pouch": "[[收纳包道具:+]]|limit=800",
    "chips": "[[核心晶片:+]]|limit=300",
    "landmarks": "[[地标:+]]|?所属地区|limit=800",
    "enemies_unique": "[[珍稀种:+]]|?等级|?所在地区|limit=800",
}

if __name__ == "__main__":
    only = sys.argv[1:] or list(QUERIES)
    for k in only:
        q = QUERIES[k]
        print("== asking", k, flush=True)
        d = ask(q)
        p = os.path.join(OUT, f"smw_{k}.json")
        with open(p, "w", encoding="utf-8") as f:
            json.dump(d, f, ensure_ascii=False, indent=1)
        n = 0
        if d and "query" in d:
            n = len(d["query"].get("results", {}))
        print(f"   results={n} -> {os.path.basename(p)}", flush=True)
