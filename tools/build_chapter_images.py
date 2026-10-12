# -*- coding: utf-8 -*-
"""把杂志配图挂到对应章节，并修正章节里的名词链接标注。"""
import json, os, re, urllib.parse

WS = r"C:\Users\ZhuanZ\Documents\deepseek-harness\default-workspace"
D = os.path.join(WS, "site", "data")
WIKI = "https://xenoblade2.cn/"

# 章节 -> 相关原刊页（人工对照）
PAGES = {
    "ch1": [("vol1", 2, "初心者入门指南与键位操作表"), ("vol1", 3, "刷核心水晶 / 角甲兽千万别打死 / 战斗系统入门"),
            ("vol1", 12, "第 1 章流程：商会 → 古代船")],
    "ch2": [("vol1", 6, "异刃系统：种类、位阶效果、心相"), ("vol1", 7, "场景技能 / 异刃去留 / 破球者与产球者"),
            ("vol1", 11, "迷你游戏《TIGER! TIGER!》"), ("vol1", 13, "第 2 章流程与宝箱"),
            ("vol1", 14, "第 2 章流程：巨神兽战舰 / 莫夫 / 梅勒芙")],
    "ch3": [("vol1", 15, "第 3 章流程与英维迪亚腹部地图"), ("vol1", 18, "英维迪亚支线：佣兵团的模仿者"),
            ("vol1", 31, "佣兵团系统说明")],
    "ch4": [("vol1", 16, "第 4 章：凡达姆的意志 / 佣兵团"), ("vol1", 17, "神秘零件与阿伐利缇亚的真相"),
            ("vol2", 20, "第 4 章流程：菊的去向 / 废弃工厂")],
    "ch5": [("vol2", 21, "第 5 章：焰光自由切换 / 云海道"), ("vol2", 22, "第 5 章 BOSS：阿耶修玛·核心与电力线"),
            ("vol1", 9, "异刃任务：水分（核心水晶猎手）"), ("vol2", 32, "全异刃收集 / 卢加大瀑布")],
    "ch6": [("vol2", 23, "第 6 章：王都特奥斯奥莱地图与王宫"), ("vol1", 21, "阿卡狄亚教廷支线（时限警告）")],
    "ch7": [("vol2", 24, "第 7 章：弥先岛与守护神地标"), ("vol2", 25, "第 7 章 BOSS：幻影 / Lv52 灭"),
            ("vol1", 20, "支线：离别赠礼"), ("vol1", 25, "异刃任务：洛修利亚崩城")],
    "ch8": [("vol2", 26, "第 8 章：莫尔斯之地世界树 / 巨大防壁第八隧道"), ("vol2", 27, "第 8 章：封印增援与放射性废弃物处理室")],
    "ch9": [("vol2", 28, "最终章：第一低轨道站地图 / 老旧教会")],
    "final": [("vol2", 28, "最终章：第一低轨道站地图 / 老旧教会")],
}


def main():
    src = open(os.path.join(D, "chapters.js"), encoding="utf-8").read()
    chapters = json.loads(src.split("window.X2.chapters=", 1)[1].rstrip(";\n"))
    for c in chapters:
        imgs = []
        for tag, pg, cap in PAGES.get(c["id"], []):
            vol = "上册" if tag == "vol1" else "下册"
            imgs.append({
                "src": f"assets/mag/{tag}-p{pg:03d}.webp",
                "alt": f"{vol} 第 {pg} 页：{cap}",
                "caption": cap,
                "src_ref": f"原刊：{vol} 第 {pg} 页（《掌机王Plus 异度神剑2 攻略特辑》）",
                "link": f"#/mag/{tag}-{pg:03d}",
            })
        c["images"] = imgs
    js = "window.X2=window.X2||{};window.X2.chapters=" + json.dumps(chapters, ensure_ascii=False, separators=(",", ":")) + ";\n"
    with open(os.path.join(D, "chapters.js"), "w", encoding="utf-8") as f:
        f.write(js)
    print("chapters with images:", sum(1 for c in chapters if c["images"]), "size KB:", round(len(js.encode('utf-8')) / 1024, 1))


if __name__ == "__main__":
    main()
