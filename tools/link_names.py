# -*- coding: utf-8 -*-
"""把正文里的专有名词（异刃 / 道具 / 敌人 / 地标）标注成 [[命名空间:名称]]，
前端会渲染成跳转 wiki 的外链。用于原刊 OCR 文本、任务流程与备注。

只处理长度 >= 3 的名字，避免「光」「焰」这类单字在普通叙述里被误标。
"""
import json, os, re, sys

WS = r"C:\Users\ZhuanZ\Documents\deepseek-harness\default-workspace"
D = os.path.join(WS, "site", "data")


def load_js(fn, var):
    """读取形如 window.X2.xxx=<json>; 的数据；同一文件里有多个赋值时会截到当前对象末尾。"""
    src = open(os.path.join(D, fn), encoding="utf-8").read()
    tail = src.split(var + "=", 1)[1].rstrip()
    if tail.endswith(";"):
        tail = tail[:-1]
    depth = 0
    in_str = False
    esc = False
    for i, ch in enumerate(tail):
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
        elif ch in "{[":
            depth += 1
        elif ch in "}]":
            depth -= 1
        elif ch == ";" and depth <= 0:
            tail = tail[:i]
            break
    return json.loads(tail)


def dump_js(fn, var, obj):
    js = "window.X2=window.X2||{};" + var + "=" + json.dumps(obj, ensure_ascii=False, separators=(",", ":")) + ";\n"
    with open(os.path.join(D, fn), "w", encoding="utf-8") as f:
        f.write(js)
    return len(js.encode("utf-8"))


NS = {"blade": "异刃", "item": "物品", "enemy": "敌人", "landmark": "地标"}

# 数据里作者写的加粗标记 <b>…</b> 会被前端转义成可见文字，这里统一改成 **…**，
# 由前端渲染成 <strong>。其它零散的类 HTML 标记直接删除。
BOLD_RE = re.compile(r"<\s*b\s*>(.*?)<\s*/\s*b\s*>", re.S | re.I)
STRAY_TAG_RE = re.compile(r"</?[A-Za-z][A-Za-z0-9]*(?:\s+[^<>]*)?/?>")
# 明显是串码的残留（例如「光（）」这种空括号里的单字）
STRAY_PAREN_CHAR_RE = re.compile(r"（）")


def sanitize(s):
    if not s or ("<" not in s and "（）" not in s):
        return s
    out = BOLD_RE.sub(lambda m: "**" + m.group(1).strip() + "**", s)
    out = re.sub(r"<\s*br\s*/?\s*>", "\n", out, flags=re.I)
    out = STRAY_TAG_RE.sub("", out)
    out = STRAY_PAREN_CHAR_RE.sub("", out)
    out = re.sub(r"\*\*\s*\*\*", "", out)      # 空加粗
    out = re.sub(r"[ \t]{2,}", " ", out)
    return out.strip()


def build_pattern(codex):
    entries = []   # (name, ns)
    for it in codex.get("blade", {}).get("items", []):
        entries.append((it["name"], "blade"))
    for key in ("auxcore", "accessory", "pouch"):
        for it in codex.get(key, {}).get("items", []):
            entries.append((it["name"], "item"))
    for it in codex.get("unique", {}).get("items", []):
        entries.append((it["name"], "enemy"))
    for it in codex.get("landmark", {}).get("items", []):
        entries.append((it["name"], "landmark"))
    # 长的优先，保证「3 星加速护腕」不会被「加速护腕」抢先
    entries = [e for e in entries if len(e[0]) >= 3]
    entries.sort(key=lambda e: -len(e[0]))
    table = {}
    for name, ns in entries:
        table.setdefault(name, ns)
    pattern = re.compile("|".join(re.escape(n) for n in table))
    return pattern, table


def linker(codex):
    pattern, table = build_pattern(codex)
    # 已被 [[...]] 包住的部分先挖出来占位，避免重复处理
    holder = re.compile(r"\[\[[^\]]*\]\]")

    def mark(text):
        # 章节要点等位置可能是结构化的 note 对象（{text, kind, title}）
        if isinstance(text, dict):
            out = dict(text)
            for k in ("text", "title"):
                if isinstance(out.get(k), str):
                    out[k] = mark(out[k])
            return out
        if isinstance(text, list):
            return [mark(x) for x in text]
        if not isinstance(text, str):
            return text
        text = sanitize(text)
        if not text or "[[" in text and "]]" not in text:
            return text
        slots = []

        def stash(m):
            slots.append(m.group(0))
            return "\x00%d\x00" % (len(slots) - 1)

        out = holder.sub(stash, text)

        def repl(m):
            name = m.group(0)
            ns = table[name]
            return "[[%s:%s]]" % (NS[ns], name)

        out = pattern.sub(repl, out)
        # 还原占位
        out = re.sub(r"\x00(\d+)\x00", lambda m: slots[int(m.group(1))], out)
        return out

    return mark


def main():
    codex = load_js("codex.js", "window.X2.codex")
    mark = linker(codex)

    stats = {}

    # 1) 原刊 68 页 OCR 文本
    mag = load_js("mag.js", "window.X2.mag")
    n = 0
    for p in mag:
        newlines = []
        for line in p["ocr"]:
            t = mark(line)
            if t != line:
                n += 1
            newlines.append(t)
        p["ocr"] = newlines
    stats["mag.js"] = (dump_js("mag.js", "window.X2.mag", mag), n)

    # 2) 任务流程与备注
    quests = load_js("quests.js", "window.X2.quests")
    n = 0
    for q in quests:
        q["flow"] = [mark(x) for x in q.get("flow", [])]
        for noteblock in q.get("notes", []):
            noteblock["text"] = mark(noteblock.get("text", ""))
        if q.get("cond"):
            q["cond"] = mark(q["cond"])
        if q.get("tips"):
            q["tips"] = [mark(x) for x in q["tips"]]
        n += 1
    stats["quests.js"] = (dump_js("quests.js", "window.X2.quests", quests), n)

    # 3) 章节与系统正文（任务名的 [[任务:…]] 标注已由 link_quests.py 完成，
    #    这里的 holder 会把它们原样保留，只补充名词外链）
    chapters = load_js("chapters.js", "window.X2.chapters")
    for c in chapters:
        c["keypoints"] = [mark(x) for x in c.get("keypoints", [])]
        for s in c.get("steps", []):
            s["title"] = mark(s["title"])
            if s.get("body"):
                s["body"] = mark(s["body"])
            for nb in s.get("notes", []):
                nb["text"] = mark(nb["text"])
        for d in c.get("diffs", []):
            d["text"] = mark(d["text"])
    stats["chapters.js"] = (dump_js("chapters.js", "window.X2.chapters", chapters), len(chapters))

    systems = load_js("systems.js", "window.X2.systems")
    for sysitem in systems:
        for b in sysitem.get("blocks", []):
            if "p" in b: b["p"] = mark(b["p"])
            if "list" in b: b["list"] = [mark(x) for x in b["list"]]
            if "ol" in b: b["ol"] = [mark(x) for x in b["ol"]]
            if "note" in b: b["note"]["text"] = mark(b["note"]["text"])
            if "table" in b:
                b["table"]["rows"] = [[mark(c) for c in row] for row in b["table"]["rows"]]
            if "acc" in b:
                for a in b["acc"]:
                    a["body"] = mark(a["body"])
    stats["systems.js"] = (dump_js("systems.js", "window.X2.systems", systems), len(systems))

    # 3) 地图与收集（地标名最密集的地方之一）
    extras_src = open(os.path.join(D, "extras.js"), encoding="utf-8").read()
    compare = load_js("extras.js", "window.X2.compare")
    maps = load_js("extras.js", "window.X2.maps")
    for m in maps:
        if m.get("intro"):
            m["intro"] = mark(m["intro"])
        m["list"] = [mark(x) for x in m.get("list", [])]
        if m.get("table"):
            m["table"]["rows"] = [[mark(c) for c in row] for row in m["table"]["rows"]]
    for c in compare:
        if c.get("canon"):
            c["canon"] = mark(c["canon"])
        for o in c.get("others", []):
            o["text"] = mark(o["text"])
    js = ("window.X2=window.X2||{};"
          "window.X2.compare=" + json.dumps(compare, ensure_ascii=False, separators=(",", ":")) + ";"
          "window.X2.maps=" + json.dumps(maps, ensure_ascii=False, separators=(",", ":")) + ";\n")
    with open(os.path.join(D, "extras.js"), "w", encoding="utf-8") as f:
        f.write(js)
    stats["extras.js"] = (len(js.encode("utf-8")), None)

    for fn, (size, cnt) in stats.items():
        print(f"{fn}: {size/1024:.1f} KB" + (f", 标注 {cnt} 处" if cnt is not None else ""))


if __name__ == "__main__":
    main()
