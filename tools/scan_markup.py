# -*- coding: utf-8 -*-
"""只在字符串值里检查残留标记（JSON 结构里的 }} 是正常语法，不算残留）。"""
import json, os, re
from collections import Counter

D = r"C:\Users\ZhuanZ\Documents\deepseek-harness\default-workspace\site\data"
FILES = [("chapters.js", "window.X2.chapters"), ("systems.js", "window.X2.systems"),
         ("quests.js", "window.X2.quests"), ("codex.js", "window.X2.codex"),
         ("extras.js", "window.X2.maps"), ("mag.js", "window.X2.mag"),
         ("index.js", "window.X2.linkables")]


def load(fn, var):
    s = open(os.path.join(D, fn), encoding="utf-8").read()
    t = s.split(var + "=", 1)[1].rstrip()
    if t.endswith(";"):
        t = t[:-1]
    return json.loads(t)


def strings(o):
    if isinstance(o, str):
        yield o
    elif isinstance(o, dict):
        for v in o.values():
            yield from strings(v)
    elif isinstance(o, list):
        for v in o:
            yield from strings(v)


CHECKS = [
    ("类 HTML 标签", re.compile(r"</?[A-Za-z][A-Za-z0-9]*(?:\s+[^<>]*)?/?>")),
    ("HTML 实体", re.compile(r"&(?:[a-zA-Z]{2,10}|#\d{1,6});")),
    ("模板 {{ }}", re.compile(r"\{\{|\}\}")),
    ("裸露尖括号", re.compile(r"[<>]")),
    ("空括号（）", re.compile(r"（）")),
    ("孤立星号", re.compile(r"(?<!\*)\*(?!\*)")),
    ("图片语法", re.compile(r"\[\[(?:文件|File|Image):")),
]

grand = Counter()
samples = {}
for fn, var in FILES:
    for s in strings(load(fn, var)):
        for label, pat in CHECKS:
            m = pat.search(s)
            if m:
                grand[label] += 1
                samples.setdefault(label, (fn, s[max(0, m.start() - 30):m.start() + 40]))

print("== 字符串值里的残留检查 ==")
for label, _ in CHECKS:
    n = grand.get(label, 0)
    if n:
        fn, ctx = samples[label]
        print(f"  {label}: {n} 处  例（{fn}）: …{ctx}…")
    else:
        print(f"  {label}: 无")
