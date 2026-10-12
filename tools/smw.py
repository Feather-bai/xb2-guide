import json, os, re, sys, time, urllib.parse, urllib.request

WS = r"C:\Users\ZhuanZ\Documents\deepseek-harness\default-workspace"
OUT = os.path.join(WS, ".extract", "wiki")
API = "https://xenoblade2.cn/api.php"
UA = {"User-Agent": "Mozilla/5.0 (compatible; guide-archiver/1.0)"}


def get(params, host=API):
    url = host + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers=UA)
    last = None
    for a in range(3):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.load(r)
        except Exception as e:
            last = e
            time.sleep(2 + 3 * a)
    print("  FAIL", last)
    return None


def ask(query, extra=None):
    params = {"action": "ask", "query": query, "format": "json", "formatversion": "2"}
    if extra:
        params.update(extra)
    return get(params)


if __name__ == "__main__":
    q = sys.argv[1] if len(sys.argv) > 1 else "[[任务:+]][[任务分类::异刃任务]]|?对应异刃|?任务条件|limit=500"
    d = ask(q, {"api_version": "2"})
    print(json.dumps(d, ensure_ascii=False)[:3000])
