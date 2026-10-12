# -*- coding: utf-8 -*-
"""把章节 / 系统正文里出现的任务名自动标注为 [[任务:名称]]（前端渲染为可点击浮窗链接）。
调用时机：在 build_chapters.py / build_systems.py 写出 chapters.js、systems.js 之后运行。
"""
import json, os, re, sys

WS = r"C:\Users\ZhuanZ\Documents\deepseek-harness\default-workspace"
D = os.path.join(WS, "site", "data")


def load_js(fn, var):
    src = open(os.path.join(D, fn), encoding="utf-8").read()
    return json.loads(src.split(var + "=", 1)[1].rstrip(";\n"))


def dump_js(fn, var, obj):
    js = "window.X2=window.X2||{};" + var + "=" + json.dumps(obj, ensure_ascii=False, separators=(",", ":")) + ";\n"
    with open(os.path.join(D, fn), "w", encoding="utf-8") as f:
        f.write(js)
    return len(js.encode("utf-8"))


quests = load_js("quests.js", "window.X2.quests")
# 只保留干净的任务名：过滤 SMW 查询残留与「A/B」这种合并名
names = []
for q in quests:
    n = q["name"]
    if len(n) < 2 or any(ch in n for ch in "/#:：?"):
        continue
    names.append(n)
names = sorted(set(names), key=len, reverse=True)

# 常见词不做自动标注，避免误伤普通叙述
BLOCK = {"学校", "制裁", "意识临界", "安稳", "水分", "重音", "凛音", "结", "壁画之谜", "好搭档", "离别赠礼"}


def _wrap(m):
    inner = m.group(1)
    if inner in BLOCK:
        return m.group(0)
    return "「[[任务:" + inner + "]]」"


def mark(text):
    if not text or "[[" in text:
        return text
    out = text
    for nm in names:
        if nm in BLOCK or nm not in out:
            continue
        # ① 「任务名」
        out = re.sub("「(" + re.escape(nm) + ")」", _wrap, out)
        # ② 前有标点 / 空白、后接标点或空白或结尾
        out = re.sub(r"(?<=[：:、，,。；;（(／/\s])" + re.escape(nm) + r"(?=[」』）)、，。；;：:！？!?\s]|$)",
                     lambda m: "[[任务:" + m.group(0) + "]]", out)
    return out


def walk(obj):
    if isinstance(obj, str):
        return mark(obj)
    if isinstance(obj, list):
        return [walk(x) for x in obj]
    if isinstance(obj, dict):
        return {k: walk(v) for k, v in obj.items()}
    return obj


def process(fn, var, keys):
    data = load_js(fn, var)
    for item in data:
        for k in keys:
            if k == "steps":
                for s in item.get("steps") or []:
                    s["title"] = mark(s["title"])
                    if s.get("body"):
                        s["body"] = mark(s["body"])
                    for n in s.get("notes") or []:
                        n["text"] = mark(n["text"])
            elif k == "diffs":
                for d in item.get("diffs") or []:
                    d["text"] = mark(d["text"])
            elif k == "blocks":
                for b in item.get("blocks") or []:
                    if "p" in b: b["p"] = mark(b["p"])
                    if "list" in b: b["list"] = [mark(x) for x in b["list"]]
                    if "ol" in b: b["ol"] = [mark(x) for x in b["ol"]]
                    if "note" in b: b["note"]["text"] = mark(b["note"]["text"])
                    if "table" in b:
                        b["table"]["rows"] = [[mark(c) for c in row] for row in b["table"]["rows"]]
                    if "acc" in b:
                        for a in b["acc"]:
                            a["body"] = mark(a["body"])
            else:
                item[k] = walk(item.get(k) or [])
    size = dump_js(fn, var, data)
    n = len(re.findall(r"\[\[任务:", json.dumps(data, ensure_ascii=False)))
    print(f"{fn}: {size/1024:.1f} KB, 任务链接 {n}")


if __name__ == "__main__":
    process("chapters.js", "window.X2.chapters", ["keypoints", "steps", "diffs"])
    process("systems.js", "window.X2.systems", ["blocks"])
