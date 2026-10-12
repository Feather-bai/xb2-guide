# -*- coding: utf-8 -*-
"""生成 site/data/index.js —— 模块清单 + 可链接名词索引"""
import json, os, re, urllib.parse

WS = r"C:\Users\ZhuanZ\Documents\deepseek-harness\default-workspace"
D = os.path.join(WS, "site", "data")
W = os.path.join(WS, ".extract", "wiki")
WIKI = "https://xenoblade2.cn/"


def u(t):
    return WIKI + urllib.parse.quote(t.replace(" ", "_"))


# 模块清单（导航顺序）
modules = [
    {"id": "home", "group": "开始", "title": "首页", "desc": "整合说明与快速入口"},
    {"id": "story", "group": "攻略主体", "title": "主线流程", "desc": "第一至最终章的完整流程，支线可点开浮窗"},
    {"id": "quests", "group": "攻略主体", "title": "任务库", "desc": "166 条主线 / 普通 / 异刃任务的条件、流程与报酬"},
    {"id": "systems", "group": "攻略主体", "title": "系统与养成", "desc": "战斗系统、异刃培养、佣兵团、打捞与经济"},
    {"id": "codex", "group": "资料", "title": "图鉴", "desc": "异刃、辅助核心、饰品、地标、珍稀种索引"},
    {"id": "maps", "group": "资料", "title": "地图与收集", "desc": "各区域地标、宝箱、打捞点与开环怪"},
    {"id": "mag", "group": "资料", "title": "原刊对照", "desc": "《攻略特辑》上下册 68 页原图与文字"},
    {"id": "compare", "group": "资料", "title": "攻略差异对照", "desc": "四份材料说法不同的地方集中对照"},
    {"id": "about", "group": "关于", "title": "资料来源与说明", "desc": "四份材料、整理原则与版权"},
]

# 可链接名词：从图鉴与 smw 数据聚合
linkables = []
seen = set()


def add(kind, name, url=None):
    key = (kind, name)
    if not name or key in seen:
        return
    seen.add(key)
    linkables.append({"kind": kind, "name": name, "url": url or u(name)})


try:
    codex = json.load(open(os.path.join(D, "codex.js"), encoding="utf-8").read().split("window.X2.codex=", 1)[1].rstrip(";\n"))
except Exception:
    codex = {}

for it in (codex.get("blade") or {}).get("items", []):
    add("blade", it["name"], it["url"])
for key in ("auxcore", "accessory", "pouch"):
    for it in (codex.get(key) or {}).get("items", []):
        add("item", it["name"], it["url"])
for it in (codex.get("unique") or {}).get("items", []):
    add("enemy", it["name"], it["url"])
for it in (codex.get("landmark") or {}).get("items", []):
    add("term", it["name"], it["url"])

# 敌人（章节与备注里出现的 BOSS / 珍稀种）
ENEMIES = ["王冠铠虾", "王者海蟑螂", "巨刃海豚蜥", "食虫巨蛙", "赚小零花的洛特", "斯佩比亚士兵",
           "帕克斯警卫队长", "迦具土", "莫夫", "梅勒芙", "勇", "周", "凡达姆", "义经", "灭", "齐格",
           "狂暴角甲兽", "长老蜘蛛", "蛮横的御刃者", "菊", "樱", "Ｇ樱", "G樱", "弁庆", "佐田彦",
           "火鸡人狱卒", "火鸡人警卫", "火鸡人工程师", "火鸡人", "电力线", "阿耶修玛·核心", "真",
           "阿耶修玛・核心", "幻影", "死亡恐惧异形怪", "地狱之血异形怪", "恶魔之王异形怪",
           "阿卡狄亚护卫兵", "阿卡狄亚煌星", "神铠麦佩尼", "永劫装置", "泰坦装置", "洛修利亚骑士",
           "孤高的巴巴里", "狙击的格斯", "晴天散步的玛德雷斯", "灵巧的萨基", "天伦拳的里奇",
           "迷宫的修特罗姆", "疾风的王冠虾", "美食的洛奇", "食蛙的史尼克", "吸血贵妇人玛蒙",
           "泽奥斯斑点龙鱼", "试刀杀人的弗兰", "机关枪的皮特", "绯红色的隆基凯普斯", "樱花一刀流",
           "圣枪的阿司匹德克隆", "托托里奥翻天鳐", "雷光羽蛇", "大陆狼兽", "亡者巨蜂", "寄居蟹",
           "冲撞寄居蟹", "潮流寄居蟹", "疾速羽毛龙", "疾飞翻天鳐", "福波利海豚蜥", "尖角龙鱼",
           "蜜罐兽", "利普狼兽", "食人花", "大章鱼", "泰坦"]
for e in ENEMIES:
    add("enemy", e, u("敌人:" + e))

# 术语（链接到系统模块或 wiki）
TERMS = [
    ("异刃连击", "异刃连击路线"), ("连锁攻击", None), ("御刃者连击", None), ("融合连击", None),
    ("属性球", None), ("全爆发", None), ("Overkill", None), ("走A", None), ("取消攻击", None),
    ("武技连锁", None), ("牵绊圆环", None), ("场景技能", "场景技能"), ("心相", None),
    ("超频", None), ("迷恋药", None), ("产球者", None), ("破球者", None),
    ("TIGER! TIGER!", "TIGER! TIGER!"), ("佣兵团", "佣兵团任务"), ("发展度", None),
    ("牵绊对话", "牵绊对话"), ("好感度", None), ("必杀技", None), ("武技", None),
]
for name, title in TERMS:
    add("term", name, u(title) if title else None)

js = ("window.X2=window.X2||{};"
      "window.X2.modules=" + json.dumps(modules, ensure_ascii=False, separators=(",", ":")) + ";"
      "window.X2.linkables=" + json.dumps(linkables, ensure_ascii=False, separators=(",", ":")) + ";\n")
with open(os.path.join(D, "index.js"), "w", encoding="utf-8") as f:
    f.write(js)
print("modules:", len(modules), "linkables:", len(linkables))
