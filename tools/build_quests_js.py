# -*- coding: utf-8 -*-
"""生成 site/data/quests.js —— 任务库（wiki 结构化数据 + 攻略备注）"""
import json, os, re, urllib.parse

WS = r"C:\Users\ZhuanZ\Documents\deepseek-harness\default-workspace"
W = os.path.join(WS, ".extract", "wiki")
OUT = os.path.join(WS, "site", "data")

WIKI = "https://xenoblade2.cn/"


def wiki_url(title):
    return WIKI + urllib.parse.quote(title.replace(" ", "_"))


def strip_templates(s):
    """先处理常用模板为可读文本，再逐层剥离剩余模板。"""
    s = re.sub(r"\{\{任务流程折叠\|([^|{}]*)\|([^|{}]*)\|[^{}]*\}\}", r"\1（\2）", s)
    s = re.sub(r"\{\{ItemQuestRewardRow\|([^}|{}]*)[^{}]*\}\}", r"\1", s)
    s = re.sub(r"\{\{PAGENAME\}\}", "", s)
    s = re.sub(r"\{\{FULLPAGENAME\}\}", "", s)
    # 逐层剥离：把 {{...}} 换成其第一个参数（若有），否则删掉
    for _ in range(8):
        new = re.sub(r"\{\{([^{}]*)\}\}", lambda m: (m.group(1).split("|")[-1].strip()
                                                     if "|" in m.group(1) else ""), s)
        if new == s:
            break
        s = new
    s = re.sub(r"\{\{[^{}]*$", "", s)   # 收尾的未闭合模板
    s = re.sub(r"\[\[[^\[\]]*$", "", s)
    s = s.replace("{{", "").replace("}}", "")
    s = re.sub(r"\{\|.*?\|\}", "", s, flags=re.S)  # 表格语法残留
    return s


def clean_wikitext(s):
    if not s:
        return ""
    s = re.sub(r"\[\[(?:文件|File|Image):[^\[\]]*(\]\]|$)", "", s, flags=re.I)  # 图片
    s = strip_templates(s)
    s = re.sub(r"<br\s*/?>", "\n", s)
    s = re.sub(r"<[^>]+>", "", s)
    for _ in range(4):
        new = re.sub(r"\[\[(?:[^\[\]|]*\|)?([^\[\]]*)\]\]", r"\1", s)
        new = re.sub(r"\[\[([^\[\]|]*)$", r"\1", new)
        if new == s:
            break
        s = new
    s = s.replace("[[", "").replace("]]", "")
    s = re.sub(r"'''?", "", s)
    s = re.sub(r"\[\[分类:[^\]]*\]\]", "", s)
    s = re.sub(r"\{\|.*?\|\}", "", s, flags=re.S)
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
            t = re.sub(r"\s*\d*px\s*$", "", t)          # 去掉图片宽度残留
            t = re.sub(r"\|?\s*\d{2,4}px\s*", "", t)
            t = re.sub(r"\s+", " ", t).strip(" |·、,，")
            if not t or re.fullmatch(r"[\d\s.|px]+", t):  # 纯数字/尺寸残留
                continue
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
    "协助执笔": ["完成该支线后，可以在洛修利亚书店买到一本 [[物品:耽美绅士之书]]。洛修利亚书店另一本重要收纳道具是「天文占卜大词典」（做佣兵任务后解锁购买）。"],
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

    # ---- DLC（Expansion Pass）追加任务 ----
    "全新的力量": ["<b>DLC 限定</b>，需要购买季票（Expansion Pass），在主菜单 Expansion 一栏解锁任务。主线到达第 5 章之后，且梅勒芙、尼娅、虎都在队伍中才会触发；前往古拉・托里格镇虎的家接取。",
                "这个任务难度不大，但要求相当充足的<b>普通异刃</b>储备：需要 8 种特定外形/武器组合的普通异刃（稀有异刃无效），并用指定必杀技打倒敌人。因为战斗中积累的必杀技等级不会继承到下一场，需要尽量挑等级高、血厚的敌人（否则必杀技还没攒到指定阶段敌人就被打倒了）；如果此时全员已 Lv99，建议挑 60 级以上的高级稀有冠名怪，或某些地图的 90 级以上普通怪。",
                "就算普通异刃的武器种类相同，外形特征不同时必杀技也可能不同，所以要事先在异刃资料界面确认该异刃是否拥有任务所需的必杀技。",
                "三个阶段要求的必杀技：①女性型/以太巨炮/光束爆发（3 级）、男性型/拳套/猛冲突击（2 级）；②犬型/双环刃/双重獠牙（2 级）、男性型/斧/回旋战斧（3 级）、女性型/锤/浮空盾（1 级）；③女性型/弹击球/闪光轰炸（1 级）、男性型（魁梧型）/枪/光束战戟（2 级）、男性型/刀/多重突击（3 级）。",
                "收集完战斗数据后前往斯佩比亚・废弃工厂的巴尔吉港发生剧情；再到英维迪亚・塞斯罗亚水田的黄樟树下找到宝箱（需要地属性之力 Lv1、观察眼 Lv1），可获得「十分不正经的书」；之后前往巴尔吉港，最后到斯佩比亚帝国上层・杰利德恩高地打倒 BOSS 机枪蜘蛛（Lv33），返回巴尔吉港即可完成。",
                "报酬：6100 G、EXP 6160、SP 300，奖励道具马达晶片 ×3、[[物品:黄金诺彭面具◆◆◆]] ×1、物理防御提升 ×1。",
                "完成后花巴斯塔可以在不使用超频的情况下任意绑定给任何角色，是本作中除了 KOS-MOS Re 之外第二个光属性异刃，使用价值很高。",
                "如果恰好缺某一种普通异刃，不必拼脸硬抽 —— 先推主线，等身上的普通异刃自然积累充足了再回来做。"],
    "铁匠的爱好": ["<b>DLC 限定</b>。主线到达第 3 章后，在弗雷斯贝古村中央・出发市场与 NPC 希尔维奥对话接取。",
                "流程：①在古拉打捞获得丛林框架；②在英维迪亚获得黑葡萄石；③在英维迪亚打倒利普狼兽获得狼兽的牙（利普狼兽可在大胸骨拱门附近寻找）；④把材料交给希尔维奥完成任务。完成后可以在希尔维奥处制作各种饰品。"],
    "名流帽": ["<b>DLC 限定</b>。主线到达第 5 章后，在英维迪亚・冯斯麦姆港与 NPC 本尼迪克对话接取。",
             "流程：①到阿伐利缇亚商会靠北的位置找到露洁娜，需要「女孩谈话 Lv6」才能交流；②去附近帽子店找哈特特咨询（或把异刃「鸣」带在身上再对话，所需材料/技能会有不同）；③再和露洁娜对话获得她想要的帽子款式；④回去找哈特特得知材料：树叶光斑纹样的窗帘 ×3（古拉・托里格镇・格罗德居住区的涅罗米尼纺织品店购买）、枫叶碎石 ×6（斯佩比亚上层・死去劳动者之桥最深处的艾尔格利亚旧街区采集）、水晶山茶花 ×6（英维迪亚・赛斯罗亚水田采集）、彩虹冰糕 ×3（冯斯麦姆商业区的斯佩兰采甜品店购买）；⑤把材料交给哈特特得到时尚的帽子，再把帽子交给露洁娜完成任务。",
             "完成后还能获得可以使用「鸣」的机械纺织技能所制作的纺织品配方。"],
    "制作迷恋药": ["<b>DLC 限定</b>。主线到达第 7 章、且花 JK 在队伍中时，在阿伐利缇亚的旅店住宿后发生剧情接取。这是最值得做的 DLC 任务之一。",
               "流程：①前往洛修利亚・封闭矿石场获得<b>心跳蓟</b>——先传送到洛修利亚上层的渴望眼界，一路来到卢米娜利亚台柱，调查上层的冰柱，用场景技能筑起冰桥来到乌尔迦利亚正门，继续往上来到崩城的旧支柱都市，利用冰冻的滑道飞跃至封闭矿石场；②返回阿伐利缇亚商会上层，传送到格尔特蒙特飞行甲板，前往附近的格尔特蒙特居住区，调查「最强火力」篝火即可制作迷恋药。",
               "制作材料：心跳蓟 + 羽衣桃 ×2（弥先海域采集）+ 绚丽南瓜 ×2（古拉・托里格镇附近采集）+ 幸运锦兰 ×1（古拉・托里格镇附近采集）+ 迷情蜜瓜 ×1（阿伐利缇亚商会飞行甲板采集）。",
               "完成后只要凑齐材料就能在这里<b>重复制作迷恋药</b>（1 瓶 +3000 好感度），让提升异刃信赖度这件事轻松很多。"],
    "佣兵的规矩": ["<b>DLC 限定</b>。需要主线到达终章，并且完成 DLC 任务第二弹中的「繁星之夜」后才能触发。在英维迪亚王都冯斯麦姆的亲卫军兵舍前发生剧情接取，敌人较强，推荐全队平均 Lv60 以上。",
               "流程：①在檀佩兰提亚・圣杯之铁锤附近寻找佣兵的线索，调查目的地的脚印（需要观察眼 Lv6、集中力 Lv8）；②沿红色脚印来到被称为「灭之斩击」的地方，调查坟墓（需要观察眼 Lv7、忍耐力 Lv7）；③继续沿脚印前进，击败以戈弗雷多为首的 3 个御刃者并发生剧情；④前往战场平原打倒 BOSS 狂血的跟踪魔，回去找戈弗雷多对话；⑤回英维迪亚亲卫军兵舍与莫德斯托对话完成任务。",
               "完成后，佣兵团任务中会追加报酬额与提升信赖度较多的新任务。"],
    "梅尔可利贝的强敌": ["<b>DLC 限定</b>。需要主线到达终章，且八重切、雷鼓、天威三个异刃都在队伍中才会触发（雷鼓的雷电控制需 Lv5、天威的失控需 Lv5 才能顺利对话），出现敌人相当强力，推荐全队平均 Lv90 以上。在利贝拉里塔斯・里吉特港与卡瑟姆对话接取。",
                  "流程：①前往梅尔可利贝小岛（就在巴尔德塔斯岛右侧，直接跳下云海游过去即可），在岛上打倒 BOSS 海之恶德（Lv81），剧情后回到里吉特港；②再次来到梅尔可利贝小岛，这次要同时面对三个 BOSS：陆之渴望（Lv84）、空之怠倦（Lv78）、海之恶德（Lv81），建议优先击破等级最低的空之怠倦。<b>即使团灭，已经击杀的 BOSS 也不会复生</b>，强度不够可以靠车轮战一只只击杀；③回去和卡瑟姆对话完成任务。",
                  "完成后，佣兵团任务中会追加报酬额与提升信赖度较多的新任务。"],
    "繁星之夜": ["DLC 任务第二弹中的一环，是「佣兵的规矩」的前置。"],
}

def build_quest(name, title, body, pr=None, cat="普通任务", extra=None):
    """把一条任务的 wikitext 与 SMW 数据装配成任务对象。"""
    pr = pr or {}

    def first(k, d=""):
        v = pr.get(k) or []
        if not v:
            return d
        x = v[0]
        return x.get("fulltext", d).split(":", 1)[-1] if isinstance(x, dict) else x

    flow, prose = parse_quest_body(body)
    m = re.search(r"\|\s*物品\s*=\s*(.*)", body)
    rewards = []
    if m:
        for it in re.findall(r"ItemQuestRewardRow\|([^}|]*)", m.group(1)):
            it = it.strip()
            if it:
                rewards.append(it)
    qid = re.sub(r"[{}\s]", "", first("任务ID"))
    if not re.fullmatch(r"[A-Za-z]{1,3}-?\d{1,3}", qid):
        qid = ""
    q = {
        "id": qid or name,
        "name": name,
        "cat": first("任务分类") or cat,
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
    if extra:
        q.update(extra)
    if name in TIPS:
        q["tips"] = TIPS[name]
        src = ["wiki"]
        if extra and extra.get("dlc"):
            src.append("《攻略特辑》DLC 补完计划")
        else:
            src.append("攻略备注")
        q["src"] = src
    return q


def fetch_wiki_pages(titles, cache_path):
    """从 wiki 抓页面 wikitext（带本地缓存），用于 DLC 任务等不在 SMW 清单里的条目。"""
    cache = {}
    if os.path.exists(cache_path):
        try:
            cache = json.load(open(cache_path, encoding="utf-8"))
        except Exception:
            cache = {}
    missing = [t for t in titles if t not in cache or not cache[t]]
    if missing:
        try:
            import urllib.parse, urllib.request
            for i in range(0, len(missing), 20):
                batch = missing[i:i + 20]
                url = "https://xenoblade2.cn/api.php?" + urllib.parse.urlencode({
                    "action": "query", "prop": "revisions", "rvprop": "content", "rvslots": "main",
                    "titles": "|".join(batch), "format": "json", "formatversion": "2"})
                req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (guide builder)"})
                with urllib.request.urlopen(req, timeout=120) as r:
                    d = json.load(r)
                for pg in d.get("query", {}).get("pages", []):
                    if "revisions" in pg:
                        cache[pg["title"]] = pg["revisions"][0]["slots"]["main"]["content"]
            json.dump(cache, open(cache_path, "w", encoding="utf-8"), ensure_ascii=False)
        except Exception as e:
            print("  警告：抓取 wiki 页面失败（将只用已有缓存）:", e)
    return cache


# DLC（Expansion Pass）追加任务：不在 SMW 的「任务」查询结果里，单独抓取
DLC_QUESTS = ["全新的力量", "铁匠的爱好", "名流帽", "制作迷恋药", "佣兵的规矩", "梅尔可利贝的强敌", "繁星之夜"]


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
        name = title.split(":", 1)[1] if ":" in title else title
        quests.append(build_quest(name, title, content.get(title, ""), rec.get("printouts", {})))

    # DLC 任务：SMW 清单里已包含它们（带 任务分类），这里补上 DLC 标记与攻略备注
    dlc_cache = fetch_wiki_pages(["任务:" + n for n in DLC_QUESTS],
                                os.path.join(W, "content_dlc_quests.json"))
    by_name = {q["name"]: q for q in quests}
    added = 0
    for n in DLC_QUESTS:
        title = "任务:" + n
        body = dlc_cache.get(title) or content.get(title, "")
        q = by_name.get(n)
        if q is None:
            if not body:
                continue
            pr = (results.get(title) or {}).get("printouts", {})
            q = build_quest(n, title, body, pr, cat="DLC任务")
            quests.append(q)
            added += 1
        else:
            # 补全流程（部分 DLC 任务页面 SMW 有记录但正文没抓到）
            if not q["flow"] and body:
                f2, p2 = parse_quest_body(body)
                q["flow"] = f2
                q["notes"] = q["notes"] or p2
        q["dlc"] = True
        q["cat"] = "DLC任务"
        q["src"] = ["wiki", "《攻略特辑》DLC 补完计划"]
        if n in TIPS:
            q["tips"] = TIPS[n]
    print("DLC 任务：新增", added, "| 标记", sum(1 for x in quests if x.get("dlc")))

    order = {"主线任务": 0, "普通任务": 1, "异刃任务": 2, "DLC任务": 3}
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
