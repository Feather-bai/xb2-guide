"""Build the quest database (quests.json) from wiki SMW dumps + quest page wikitext."""
import json, os, re, sys, urllib.parse

WS = r"C:\Users\ZhuanZ\Documents\deepseek-harness\default-workspace"
W = os.path.join(WS, ".extract", "wiki")
OUT = os.path.join(WS, "site", "data")
os.makedirs(OUT, exist_ok=True)

WIKI_BASE = "https://xenoblade2.cn/"


def wiki_url(title):
    return WIKI_BASE + urllib.parse.quote(title.replace(" ", "_"))


def clean_wikitext(s):
    if not s:
        return ""
    s = re.sub(r"<br\s*/?>", "\n", s)
    s = re.sub(r"<[^>]+>", "", s)
    s = re.sub(r"\{\{任务流程折叠\|([^|}]*)\|([^|}]*)\|[^}]*\}\}", r"\1（\2）", s)
    s = re.sub(r"\{\{ItemQuestRewardRow\|([^}|]*)[^}]*\}\}", r"\1", s)
    s = re.sub(r"\{\{PAGENAME\}\}", "", s)
    # strip wikilinks, tolerating nested brackets in the label
    for _ in range(4):
        new = re.sub(r"\[\[(?:[^\[\]|]*\|)?([^\[\]]*)\]\]", r"\1", s)
        new = re.sub(r"\[\[([^\[\]|]*)$", r"\1", new)
        if new == s:
            break
        s = new
    s = s.replace("[[", "").replace("]]", "")
    s = re.sub(r"'''?", "", s)
    s = re.sub(r"<ol>|</ol>|</?li>", "", s)
    return s.strip()


def parse_quest_body(wt):
    """Return (flow_lines, notes_text) from a quest page wikitext."""
    if not wt:
        return [], ""
    body = wt
    m = re.search(r"==\s*任务流程\s*==(.*)$", body, re.S)
    flow_raw = m.group(1) if m else ""
    before = body[: m.start()] if m else body
    lines = []
    if flow_raw:
        # each flow step starts with "#", "<li>" or a bare line
        chunks = re.split(r"</?li>|\n(?=\s*[#*])|\n(?=[^\s#*<])|(?<=[>）)])\s*(?=<li>)", flow_raw)
        for c in chunks:
            t = clean_wikitext(c).strip()
            t = re.sub(r"^[#*]+\s*", "", t)
            t = re.sub(r"^\s*\d+[.、]\s*", "", t)
            t = re.sub(r"\s+", " ", t).strip()
            if t:
                lines.append(t)
    # any other prose section (e.g. 备注/说明)
    prose = []
    for sec in re.findall(r"==+\s*([^=]+?)\s*==+\n(.*?)(?=\n==|\Z)", before, re.S):
        name, content = sec
        if name.strip() in ("任务流程",):
            continue
        t = clean_wikitext(content)
        if t:
            prose.append({"title": name.strip(), "text": t})
    return lines, prose


def main():
    smw = json.load(open(os.path.join(W, "smw_all_quests.json"), encoding="utf-8"))
    results = smw["query"]["results"]
    content = {}
    for f in os.listdir(W):
        if f.startswith("content_") and f.endswith(".json"):
            try:
                content.update(json.load(open(os.path.join(W, f), encoding="utf-8")))
            except Exception:
                pass
    # page_*.wiki files (single-page fetches) as fallback
    for f in os.listdir(W):
        if f.startswith("page_任务_") and f.endswith(".wiki"):
            nm = f[len("page_任务_"):-len(".wiki")]
            p = os.path.join(W, f)
            with open(p, encoding="utf-8") as fh:
                content.setdefault("任务:" + nm, fh.read())

    quests = []
    for title, rec in results.items():
        pr = rec.get("printouts", {})
        name = title.split(":", 1)[1] if ":" in title else title
        def first(k, default=""):
            v = pr.get(k) or []
            if not v:
                return default
            x = v[0]
            if isinstance(x, dict):
                return x.get("fulltext", default).split(":", 1)[-1]
            return x

        def allv(k):
            out = []
            for x in (pr.get(k) or []):
                out.append(x.get("fulltext", "").split(":", 1)[-1] if isinstance(x, dict) else str(x))
            return [a for a in out if a]

        cat = first("任务分类")
        body = content.get(title, "")
        flow, prose = parse_quest_body(body)
        q = {
            "id": first("任务ID") or name,
            "name": name,
            "cat": cat or "普通任务",
            "place": [x for x in [first("地点1"), first("地点2")] if x],
            "npc": first("NPC"),
            "cond": clean_wikitext(first("任务条件")),
            "blade": first("对应异刃"),
            "gold": first("金币"),
            "exp": first("EXP"),
            "sp": first("SP"),
            "devRegion": first("发展度地区"),
            "dev": first("发展度增加"),
            "trust": first("信赖度"),
            "flow": flow,
            "notes": prose,
            "url": wiki_url(title),
            "src": ["wiki"],
        }
        # quest rewards from template 物品=
        m = re.search(r"\|\s*物品\s*=\s*(.*)", body)
        rewards = []
        if m:
            for it in re.findall(r"ItemQuestRewardRow\|([^}|]*)", m.group(1)):
                it = it.strip()
                if it:
                    rewards.append(it)
        q["rewards"] = rewards
        quests.append(q)

    quests.sort(key=lambda q: (q["cat"], q["id"]))
    with open(os.path.join(OUT, "quests.json"), "w", encoding="utf-8") as f:
        json.dump(quests, f, ensure_ascii=False, separators=(",", ":"))
    from collections import Counter
    print("quests:", len(quests), Counter(q["cat"] for q in quests))
    print("with flow:", sum(1 for q in quests if q["flow"]))
    print("sample:", json.dumps(quests[0], ensure_ascii=False)[:500])


if __name__ == "__main__":
    main()
