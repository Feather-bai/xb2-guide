# -*- coding: utf-8 -*-
"""生成 site/data/quests.js —— 任务库（wiki 结构化数据 + 攻略备注）"""
import json, os, re, urllib.parse

WS = r"C:\Users\ZhuanZ\Documents\deepseek-harness\default-workspace"
W = os.path.join(WS, ".extract", "wiki")
OUT = os.path.join(WS, "site", "data")

WIKI = "https://xenoblade2.cn/"


def wiki_url(title):
    return WIKI + urllib.parse.quote(title.replace(" ", "_"))


def clean_wikitext(s):
    if not s:
        return ""
    s = re.sub(r"<br\s*/?>", "\n", s)
    s = re.sub(r"<[^>]+>", "", s)
    s = re.sub(r"\{\{任务流程折叠\|([^|}]*)\|([^|}]*)\|[^}]*\}\}", r"\1（\2）", s)
    s = re.sub(r"\{\{ItemQuestRewardRow\|([^}|]*)[^}]*\}\}", r"\1", s)
    s = re.sub(r"\{\{PAGENAME\}\}", "", s)
    for _ in range(4):
        new = re.sub(r"\[\[(?:[^\[\]|]*\|)?([^\[\]]*)\]\]", r"\1", s)
        new = re.sub(r"\[\[([^\[\]|]*)$", r"\1", new)
        if new == s:
            break
        s = new
    s = s.replace("[[", "").replace("]]", "")
    s = re.sub(r"'''?", "", s)
    s = re.sub(r"\n\s*\n+", "\n", s)
    return s.strip()


def parse_quest_body(wt):
    if not wt:
        return [], []
    m = re.search(r"==\s*任务流程\s*==(.*)$", wt, re.S)
    flow_raw = m.group(1) if m else ""
    before = wt[: m.start()] if m else wt
    lines = []
    if flow_raw:
        chunks = re.split(r"</?li>|\n(?=\s*[#*])|\n(?=[^\s#*<])", flow_raw)
        for c in chunks:
            t = clean_wikitext(c).strip()
            t = re.sub(r"^[#*]+\s*", "", t)
            t = re.sub(r"^\s*\d+[.、]\s*", "", t)
            t = re.sub(r"\s+", " ", t).strip()
            if t:
                lines.append(t)
    prose = []
    for name, content in re.findall(r"==+\s*([^=]+?)\s*==+\n(.*?)(?=\n==|\Z)", before, re.S):
        if name.strip() == "任务流程":
            continue
        t = clean_wikitext(content)
        if t:
            prose.append({"title": name.strip(), "text": t})
    return lines, prose


# ------------------------------------------------ 攻略备注（按任务名索引）
TIPS = {
    "重要工作之前": ["任务本身很简单，但它是「捉迷藏」的前置。做完后别忘了在旅店休息以解锁更多支线。",
                 "wiki 给出的流程：在闪亮亮饰品店购买深渊背心 → 与中央交易所的梅洛洛交谈 → 向运输商马克西姆搭话寄送 90000G → 向打捞甲板的伊鲁伊鲁搭话 → 在打捞点打捞 → 回报 → 前往 3 楼鲜活鲜活鱼店购买食物。"],
    "捉迷藏": ["<b>推荐第一章就做</b>：完成后获得一个加力量的道具，顺便熟悉商会地图，还能把商会里能开的宝箱一起开了攒零用钱。",
             "要在阿伐利缇亚找到阿弗特、卡格格、塔鲁鲁三人，再回树荫休息处向阿弗特报告。"],
    "第1000次迟到": ["流程里需要在蜂蜜糖浆甜品店买「诺彭彭卷」，然后去打捞甲板；后续还要在打捞甲板钓上冲撞寄居蟹取回回忆的吊坠（普通气瓶、按键挑战全按错更容易出怪）。"],
    "善有善报": ["教学性质的支线，初步接触并获得商店的店契。第 2 章在托里格镇玛吉杂货店附近解锁。"],
    "崔娜的食谱": ["（可选）完成可增加焰的料理种类。"],
    "长不大的蔬菜": ["（可选）有后续支线；处理好毒池后，毒池里有个白金宝箱，再往前走一点可开启「托德里格花田」地标。"],
    "不会游泳的少年": ["第 2 章在托里格镇玛吉杂货店附近解锁。"],
    "家具工匠的烦恼": ["第 2 章在托里格镇玛吉杂货店附近解锁。"],
    "获得完美测距传感器": ["与「获得转轮连接器」同为凑齐花的零件的主线任务。"],
    "获得转轮连接器": ["与「获得完美测距传感器」同为凑齐花的零件的主线任务。"],
    "尼娅的情报收集": ["主线任务。完成后会触发托里格商店街的剧情事件：获得无名的核心水晶并强制调谐，必定是风属性拳套回复异刃（唯一一次不强制存档的调谐）。"],
    "神秘便笺": ["开启「诺彭族历史」大型系列支线，非常长且繁琐（嫌麻烦可以不做）。后续是第 5 章的「考古学家入境」。",
              "注意：在头部净身水池拿到任务道具后，湖上八跳石左边的山岩上能找到任务 NPC。"],
    "考古学家入境": ["诺彭族历史系列支线。需要先做佣兵任务，再去英维迪亚佣兵村继续找考古学家；佣兵村里的壁画点需要潜水过去（其中一个壁画要从湖上八跳石那个山洞过去），每张壁画需要白天和晚上各看一次。",
               "最终要去腹部的罗尼大树挖掘，需要场景技能【地属性之力 Lv6 + 观察眼 Lv2】—— 力男没开到一定程度做不动；在主线推进到洛修利亚（第六章后半）之前，力男最多把地属性之力升到 LV3，所以需要尼娅有另一个地属性之力 LV3 的普通异刃。",
               "完成后获得诺彭商会顶层祠堂的钥匙。<b>补充</b>：不做这个任务也能拿到祠堂钥匙 —— 在商会上面那个修船的诺彭那里发动萤的偷心即可。"],
    "再会": ["<b>必做</b>。斯佩比亚首都商业区找八千矛领取，是「斯佩比亚帝国反叛组织」大型系列支线的第一环，获得贝菲拉工业区厂区钥匙（重要）。",
           "只有完成该系列任务后，才能在最终章刷<b>牵绊攻击 5</b>（重要的准毕业输出辅助核心；牵绊攻击 6 只能在 DLC 挑战模式低概率出，主体游戏最多只爆到 5）。",
           "拿到厂区钥匙后，在多云天气（看屏幕右上角图标）到贝菲拉工业区厂区，搭乘进出的集装箱（跳到箱子上面，有个梯子爬上去刚好是集装箱进出口）。经过右手边的小山丘时半途跳到山丘上，可以找到 40 级精英 BOSS「试刀杀人的弗兰」（山羊），击杀百分百掉稀有核心水晶（可刷核心与等级）；同时在这个 BOSS 边的悬崖上可以开箱子获得<b>第 3 个收纳包扩展工具</b>。"],
    "追求新天地": ["第五章与伊拉一伙 BOSS 战结束后，在教会找诺彭旅行商人库库恩领取，顺路接一下还能给路痴方向指引。",
               "容易卡住的地方：「在檀佩兰提亚收集各种道具交给库库恩 0/100」—— 采集很多却还是 0/100，因为需要<b>返回营地找库库恩上交材料</b>才会增加进度。",
               "注意：进入世界树天空桥剧情后将无法接取此任务。"],
    "乌摩恩重振旗鼓": ["第六章在阿卡狄亚大圣堂教皇办公室解锁。"],
    "反帝国组织的调查": ["第六章在阿卡狄亚大圣堂教皇办公室解锁，与「再会」所属的反叛组织系列相关。"],
    "尤迪肯姆的遗产": ["第六章在阿卡狄亚大圣堂教皇办公室解锁。"],
    "圣歌队的梅丽卡": ["<b>注意时限</b>：进入世界树天空桥剧情后无法完成，想全收集请提前处理。"],
    "阿卡狄亚的教义": ["<b>注意时限</b>：进入世界树天空桥剧情后无法完成。"],
    "巴恩的阴谋": ["第六章主线任务，完成后继续推进哥特伊斯沃特港的剧情。"],
    "凯尼蒂亚的烦恼": ["第六章穿过特奥斯奥莱正门前往王宫时解锁。"],
    "丢失的宝物": ["第六章向特奥斯皮斯缇神殿遗迹深处前进时解锁。"],
    "协助执笔": ["完成该支线后，可以在洛修利亚书店买到一本 3 星加必杀技伤害的书。洛修利亚书店另一本重要收纳道具是「天文占卜大词典」（做佣兵任务后解锁购买）。"],
    "莫尔斯的特产": ["第七章向莫尔斯断崖深处前进寻找焰时解锁。"],
    "巴恩的秘密财产！？": ["第七章响应洛修利亚王号召前往觐见大厅时解锁。"],
    "壁画之谜": ["第七章在洛修利亚解锁，与诺彭族历史 / 壁画系列支线相关。"],
    "汇款流程": ["第七章在洛修利亚解锁。"],
    "过去的光辉": ["第七章在洛修利亚解锁。"],
    "好搭档": ["第七章在洛修利亚解锁。"],
    "花的魔改造": ["第八章前往世界树根部时解锁，关系到花的第三形态 —— 外观与性能都非常实用，培养过后是最强异刃没有之一。"],
    "双亲之仇": ["第八章莱克斯单人行动阶段解锁，地点在莫尔斯之地。"],
    "打捞员之王": ["第八章解锁。可与打捞员等级评定（商会 3 楼莫奇莫奇）一并处理。"],
    "持续运转的系统": ["第八章解锁。"],
    "冻成冰块的御刃者": ["第九章追逐真和灭登上世界树时解锁。"],
    "离别赠礼": ["第九章解锁。"],
    "在世界树遇难": ["第九章追逐真和灭、阻止弑神时解锁。"],
    "协助煮饭": ["第九章在第七外围机场推进时解锁。"],
    "集合吧！诺彭币": ["最终章乘坐太阳天第 1 电梯前往乐园时解锁。"],
    "巴恩的报复": ["最终章解锁。"],
    "考尔的病": ["最终章解锁。"],
    "学校": ["最终章解锁。"],
    "凡达姆的意志": ["第四章开头的主线任务，完成后光离队、焰入队，异刃绑定上限提升至 3。"],
    "托里格警卫团的委托": ["第四章开头解锁。"],
    "走在前面的她": ["第四章开头解锁。"],
    "巨神兽的研究者": ["第四章开头解锁。"],
    "安稳": ["第四章开头解锁的异刃任务。"],
    "扩散传言": ["第四章在格尔特蒙特飞行甲板买船票时解锁。"],
    "追逐扒手少年": ["第四章主线，追赶偷走朱雀核心水晶的少年。"],
    "向帝都进发": ["第四章到达斯佩比亚后解锁。"],
    "生态调查": ["第四章在帝都贾尔卡马洛旅店解锁。"],
    "古代诺彭族的壁画": ["第四章在帝都贾尔卡马洛旅店解锁，与壁画系列支线相关。"],
    "菊的去向": ["第四章主线，完成后解锁「再会」。"],
    "追踪机密文件！": ["第四章前往废弃工厂时解锁。"],
    "佣兵团的模仿者": ["第三章在弗雷斯贝古后门与凡达姆对话时解锁。后续是艾尔皮斯灵洞秘境「加雷西亚地低湖」相关支线（寻找前往下颚漂流地的孩子）。"],
    "飞向憧憬的天空": ["第三章穿越脊椎骨的界限前往乌摩恩造船厂时解锁。"],
    "少年的倔强": ["第三章同上解锁。"],
    "抛弃故乡": ["第三章同上解锁。"],
    "乌摩恩的船": ["第三章主线任务。"],
    "人人最初都是新手": ["第三章在英维迪亚・法凌中央华段群领取（原备注写作「最初人人都是新手」）。领取点左上方不远的大树是重要地标「罗尼大树」。"],
    "鲜艳的颜料": ["第三章在冯斯麦姆解锁，地点在巴杰纳剧场。"],
    "阿伐利缇亚的真相": ["第五章前往莱克斯故乡弥先村时解锁。"],
    "音讯不明": ["第五章在弥先村解锁。"],
    "搜寻密探": ["第五章在弥先村解锁。"],
    "第一次旅行": ["第五章在弥先村解锁。"],
    "抱头烦恼的商人": ["第五章在弥先村解锁。"],
    "被偷走的回忆": ["第五章前往伊谢巴港时解锁。"],
    "遭受袭击的诺彭商人": ["第二章前往托里格镇时解锁。"],
    "鲜艳的水果馅饼": ["第二章完成「尼娅的情报收集」后解锁。"],
    "托里格的起重机破坏事件": ["第二章完成「尼娅的情报收集」后解锁。"],
}

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
    for f in os.listdir(W):
        if f.startswith("page_任务_") and f.endswith(".wiki"):
            nm = f[len("page_任务_"):-len(".wiki")]
            with open(os.path.join(W, f), encoding="utf-8") as fh:
                content.setdefault("任务:" + nm, fh.read())

    quests = []
    for title, rec in results.items():
        pr = rec.get("printouts", {})
        name = title.split(":", 1)[1] if ":" in title else title

        def first(k, d=""):
            v = pr.get(k) or []
            if not v:
                return d
            x = v[0]
            return x.get("fulltext", d).split(":", 1)[-1] if isinstance(x, dict) else x

        body = content.get(title, "")
        flow, prose = parse_quest_body(body)
        m = re.search(r"\|\s*物品\s*=\s*(.*)", body)
        rewards = []
        if m:
            for it in re.findall(r"ItemQuestRewardRow\|([^}|]*)", m.group(1)):
                it = it.strip()
                if it:
                    rewards.append(it)
        q = {
            "id": first("任务ID") or name,
            "name": name,
            "cat": first("任务分类") or "普通任务",
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
            "rewards": rewards,
            "url": wiki_url(title),
            "src": ["wiki"],
        }
        if name in TIPS:
            q["tips"] = TIPS[name]
            q["src"] = ["wiki", "攻略备注"]
        quests.append(q)

    order = {"主线任务": 0, "普通任务": 1, "异刃任务": 2}
    quests.sort(key=lambda q: (order.get(q["cat"], 9), q["id"]))
    js = "window.X2=window.X2||{};window.X2.quests=" + json.dumps(quests, ensure_ascii=False, separators=(",", ":")) + ";\n"
    with open(os.path.join(OUT, "quests.js"), "w", encoding="utf-8") as f:
        f.write(js)
    from collections import Counter
    print("quests:", len(quests), Counter(q["cat"] for q in quests))
    print("with flow:", sum(1 for q in quests if q["flow"]), "with tips:", sum(1 for q in quests if q.get("tips")))
    print("size KB:", round(len(js.encode("utf-8")) / 1024, 1))


if __name__ == "__main__":
    main()
