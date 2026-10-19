// 生成图鉴数据：site/data/codex_v2.js
//
// 分类与统计口径**以手机版 wiki 的 SQLite 为准**（游戏内分页）：
//   异刃 / 核心晶片 / 饰品 / 辅助核心 / 收纳包道具 / 收藏道具 / 宝藏 / 贵重品 / 产权证
//
// 异刃：
//   - 只取 APK `blade` 表里的条目（场景技能行如「火花/料理」「焰/料理」是 wiki 的子页面，不在表里）
//   - 顺序 = APK entity_id 顺序（主线 → 稀有 → 二周目 → 扩充票 → NS2），与手机 APP 一致
//   - 场景技能取 blade_skill(category=field_skill)；APK 缺的（斩铁）用 EXTRA_FIELD_SKILLS 兜底
//   - APK 不区分「宫比罗（觉醒前/后）」，页面标题需按 wiki 的「异刃:宫比罗」「异刃:宫比罗(觉醒)」映射
//
// 物品类：
//   - 类型字段是 APP 的 item_type（筛选用）；个别行混进了效果文案，按 TYPE_FIX 归一
//   - 产权证按 APP 分页从「贵重品」拆出；地区从 shop 表反推（「XX店铺产权证」↔「商店:XX店铺」）
//   - wiki 缺「物品:全名」页时，用 name 去 ◆/「店铺产权证」后缀并查白名单，命中则 wiki 字段填最接近的标题
//
// 用法：node tools/build_codex.cjs
const fs = require("fs");
const path = require("path");
const { SITE, findApkDb } = require("./paths.cjs");

function wikiUrl(title) {
  return "https://xenoblade2.cn/" + encodeURIComponent(String(title).replace(/ /g, "_"));
}

/* 用已有的白名单判断 wiki 是否有该页（避免给死链） */
function loadWikiExists() {
  const p = path.join(SITE, "data", "wiki_targets.json");
  if (!fs.existsSync(p)) return new Set();
  try { return new Set(JSON.parse(fs.readFileSync(p, "utf8")).exists || []); } catch (e) { return new Set(); }
}

/* wiki 全部标题（tools/fetch_wiki_titles_all.cjs 抓的各命名空间）：用于补非「物品:」命名空间的页面，
   例如花的零件在「花的零件:」下（橙色定制花JD → 花的零件:橙色定制花JD）。app.js 的 WIKI_EXISTS 也读同一份。 */
function loadWikiTitlesAll() {
  const p = path.join(SITE, "data", "wiki_titles_all.js");
  if (!fs.existsSync(p)) return new Set();
  try {
    const src = fs.readFileSync(p, "utf8");
    const m = /window\.X2\.wikiTitlesAll=([\s\S]*);\s*$/.exec(src);
    return new Set(m ? JSON.parse(m[1]) : []);
  } catch (e) { return new Set(); }
}
/* 物品在 wiki 上的标题：先查「物品:」，再查其他命名空间（花的零件 / 武器 …）。
   APP 与 wiki 偶尔用不同标点（「真·英雄阿德尔烤饼」vs「真・英雄阿德尔烤饼」），先按原名查，
   再把「·」「・」「•」「･」互换后查一次。 */
function wikiTitleFor(name, existsAll) {
  const alt = name.replace(/[·・•･]/g, "");
  const candidates = ["物品:", "花的零件:", "武器:"].map((ns) => ns + name);
  if (alt !== name) {
    candidates.push("物品:" + name.replace(/·/g, "・"), "物品:" + name.replace(/・/g, "·"), "物品:" + alt);
  }
  for (const t of candidates) if (existsAll.has(t)) return t;
  // 名字里的分隔符不同时，按「去掉分隔符后相等」再扫一遍物品命名空间
  if (alt !== name) {
    for (const t of existsAll) {
      if (t.indexOf("物品:") === 0 && t.slice(3).replace(/[·・•･]/g, "") === alt) return t;
    }
  }
  return "";
}

/* APK 缺数据时的兜底：斩铁（二周目异刃）没有 blade_skill 行，按 wiki 异刃页补 */
const EXTRA_FIELD_SKILLS = {
  斩铁: ["风属性之力", "怪力", "昆虫学"],
};

/* item_type 混入效果文案的行：按同类正确类型归一 */
const TYPE_FIX = {
  "重生瓶◆◆◆": "复活强化",
};

/* 稀有度：大部分行是 普通/稀有/史诗；少数 DLC 服装类行是数字码 1/2/3，含义相同 */
const RARITY_NORM = { "1": "普通", "2": "稀有", "3": "史诗", 1: "普通", 2: "稀有", 3: "史诗" };
function normRarity(r) { return RARITY_NORM[r] || r || ""; }
const RARITY_ORDER = ["普通", "稀有", "史诗"];

/* wiki 页面标题与 APP 名称不同的条目（APP 合并了觉醒前后） */
const WIKI_TITLE_OVERRIDE = {
  "宫比罗（觉醒前）": "异刃:宫比罗",
  "宫比罗（觉醒后）": "异刃:宫比罗(觉醒)",
};

const CAT_ORDER = ["核心晶片", "饰品", "辅助核心", "收纳包道具", "收藏道具", "宝藏", "贵重品", "产权证"];
const ALL_CATS = ["异刃"].concat(CAT_ORDER);

/* 地区筛选：收藏道具 / 宝藏 / 产权证 共用一个「主线先后顺序」的地区表。
   APK 的地区名与章节里手写的简称不一致（英维迪亚 / 阿卡狄亚 / 世界树…），这里统一成 APK 名，
   并按主线流程依次出现的区域排序；没列到的（如「云海探查船 涡潮号」「古代船」）排在最后。 */
const REGION_ORDER = [
  "阿伐利缇亚商会", "古拉", "英维迪亚烈王国", "斯佩比亚帝国", "利贝拉里塔斯岛屿群",
  "檀佩兰提亚", "阿卡狄亚教廷", "洛修利亚王国", "艾尔皮斯灵洞", "莫尔斯断崖",
  "莫尔斯之地", "世界树", "第一低轨道站",
];

/* 物品地区补充：tools/fetch_item_regions.cjs 从 wiki 物品页抓的「获得地点」。
   采集/打捞/宝箱表只覆盖一部分；wiki 的字段最全（收藏道具 323 条全有，宝藏 61 条全有）。 */
function loadItemRegions() {
  const p = path.join(__dirname, "item_regions.json");
  if (!fs.existsSync(p)) return {};
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch (e) { return {}; }
}

/* 收藏道具的「种类」：APK 的 item_type 有错位/空值（油牡蛎→机械、条纹瓢虫→敌人掉落），
   以 wiki 页面的 |种类= 为准；wiki 没写时沿用 APK 值。 */
function loadItemKinds() {
  const p = path.join(__dirname, "item_kinds.json");
  if (!fs.existsSync(p)) return {};
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch (e) { return {}; }
}

/* 每个收藏道具可能出现在多个采集点，取「最早出现」的地区（按 REGION_ORDER）作主地区 */
function pickRegion(list) {
  const rank = (r) => { const i = REGION_ORDER.indexOf(r); return i < 0 ? 999 : i; };
  const uniq = list.filter((r, i) => r && list.indexOf(r) === i).sort((a, b) => rank(a) - rank(b));
  return uniq[0] || "";
}

/* 核心晶片按等级排序：等级1 → 等级20，同等级内按名称（等级字段来自 item_type「等级N」） */
function chipLevel(t) { const m = /(\d+)/.exec(t || ""); return m ? +m[1] : 0; }

function main() {
  const apkPath = findApkDb();
  if (!fs.existsSync(apkPath)) { console.error("找不到 APK 数据库：" + apkPath); process.exit(1); }
  const { DatabaseSync } = require("node:sqlite");
  const db = new DatabaseSync(apkPath, { readOnly: true });
  // 同一个解包目录里还有 xenoblade2.sqlite（多出 manual_item_acquisition_link 等中文整理表），
  // 中文「获取途径」优先从它读取；没有该文件时退回 xenoblade2.db。
  const db2Path = path.join(path.dirname(apkPath), "xenoblade2.sqlite");
  const db2 = fs.existsSync(db2Path) ? new DatabaseSync(db2Path, { readOnly: true }) : db;
  const bigintRows = (conn, sql) => {
    const st = conn.prepare(sql);
    st.setReadBigInts(true);           // entity_id 超出 JS 安全整数，必须按 BigInt 读
    return st.all().map((r) => {
      const o = {};
      for (const k of Object.keys(r)) o[k] = typeof r[k] === "bigint" ? r[k].toString() : r[k];
      return o;
    });
  };
  const rows = (sql) => bigintRows(db, sql);
  const rows2 = (sql) => bigintRows(db2, sql);

  const exists = loadWikiExists();
  const existsAll = loadWikiTitlesAll();
  const wikiRegions = loadItemRegions();
  const wikiKinds = loadItemKinds();

  // ---------- 异刃 ----------
  const bladeRows = rows(`SELECT b.entity_id, e.name_zh, b.element, b.combat_role, b.weapon,
      b.aux_core_slots, c.category AS blade_category
    FROM blade b
    JOIN entity e ON b.entity_id = e.id
    LEFT JOIN blade_category c ON c.blade_id = b.entity_id
    WHERE e.name_zh IS NOT NULL AND e.name_zh <> ''
    ORDER BY b.entity_id`);
  const skills = {};
  for (const s of rows(`SELECT blade_id, category, name FROM blade_skill WHERE category='field_skill'`)) {
    (skills[s.blade_id] = skills[s.blade_id] || []);
    if (skills[s.blade_id].indexOf(s.name) === -1) skills[s.blade_id].push(s.name);
  }
  const blades = bladeRows.map((b) => {
    const fsList = (skills[b.entity_id] || []).slice();
    (EXTRA_FIELD_SKILLS[b.name_zh] || []).forEach((f) => { if (fsList.indexOf(f) === -1) fsList.push(f); });
    var title = WIKI_TITLE_OVERRIDE[b.name_zh] || "异刃:" + b.name_zh;
    return {
      name: b.name_zh,
      element: b.element || "",
      role: b.combat_role || "",
      weapon: b.weapon || "",
      slate: b.aux_core_slots == null ? "" : String(b.aux_core_slots),
      kind: b.blade_category || "",
      fs: fsList.sort(),
      wiki: existsAll.has(title) ? title : "",
    };
  });

  // ---------- 物品类 ----------
  const itemRows = rows(`SELECT i.entity_id, e.name_zh, i.category, i.item_type, i.rarity,
      i.sell_price, i.effect_description
    FROM item i JOIN entity e ON i.entity_id = e.id
    WHERE i.is_torna = 0 AND e.name_zh IS NOT NULL AND e.name_zh <> ''`);

  const cats = {};
  for (const it of itemRows) {
    // 产权证是「贵重品」下的一个 item_type，单独成页
    const cat = it.item_type === "店铺产权证" ? "产权证" : it.category;
    if (!cats[cat]) cats[cat] = [];
    const rec = {
      id: it.entity_id,
      name: it.name_zh,
      type: TYPE_FIX[it.name_zh] || (cat === "收藏道具" && wikiKinds[it.name_zh] === "鱼类" ? "鱼" : wikiKinds[it.name_zh]) || it.item_type || "",
      rarity: normRarity(it.rarity),
      sell: it.sell_price == null ? "" : String(it.sell_price),
      effect: it.effect_description || "",
    };
    if (cat === "产权证") rec.region = "";
    // 同一物品可能有重复行，按名称去重
    if (!cats[cat].some((x) => x.name === rec.name)) cats[cat].push(rec);
  }

  // 产权证地区：shop 实体名与「XX店铺产权证」对应（书名类店名为「花丸书房」这类，按前后缀匹配兜底）
  const shops = rows(`SELECT e.name_zh AS name, s.region FROM shop s JOIN entity e ON e.id = s.entity_id
    WHERE e.name_zh IS NOT NULL AND e.name_zh <> '' AND s.region IS NOT NULL AND s.region <> ''`);
  (cats["产权证"] || []).forEach((it) => {
    const base = it.name.replace(/店铺产权证$/, "");
    const hit = shops.find((s) => s.name === base || s.name.replace(/店铺$/, "") === base)
      || shops.find((s) => s.name.indexOf(base) === 0 || base.indexOf(s.name.replace(/(店|书房|咖啡厅|屋|房)$/, "")) === 0);
    it.region = hit ? hit.region : "";
  });

  // 打捞点/打捞地图 → 地区（宝藏与部分收藏道具只出现在打捞里）
  const mapRegion = {};
  for (const m of rows(`SELECT name, display_name FROM map`)) mapRegion[m.name] = m.display_name;
  const salvageRegions = {};
  for (const d of rows(`SELECT l.item_name AS name, m.map_name AS map_name
      FROM salvage_loot l LEFT JOIN salvage_marker m ON m.point_id = l.point_id AND m.gmk_id = l.gmk_id`)) {
    const region = mapRegion[d.map_name] || "";
    if (region) (salvageRegions[d.name] = salvageRegions[d.name] || []).push(region);
  }
  // entity_field 里人工补的「获得地点」作为最后兜底（如「挑战之地」「古拉」）
  const fieldPlace = {};
  for (const f of rows(`SELECT e.name_zh AS name, f.value AS place FROM entity_field f JOIN entity e ON e.id = f.entity_id
      WHERE f.name = '获得地点'`)) {
    if (f.place) fieldPlace[f.name] = f.place;
  }

  // 收藏道具地区：采集点的掉落表（同一道具可能在多个地区采集，取主线最早出现的那个）
  const collectRegions = {};
  for (const d of rows(`SELECT d.item_name AS name, p.region AS region
      FROM collection_drop d JOIN collection_point p ON p.entity_id = d.collection_point_id
      WHERE p.is_torna = 0`)) {
    (collectRegions[d.name] = collectRegions[d.name] || []).push(d.region);
  }
  // 宝藏道具的宝箱掉落表（打捞 + 宝箱 + wiki 三路合并）
  const treasureRegions = {};
  for (const d of rows(`SELECT t.item_name AS name, c.region AS region
      FROM treasure_loot t JOIN treasure_chest c ON c.entity_id = t.treasure_chest_id
      WHERE c.is_torna = 0`)) {
    if (d.region) (treasureRegions[d.name] = treasureRegions[d.name] || []).push(d.region);
  }
  // 收藏道具地区：采集点掉落表、打捞、wiki「获得地点」三路合并，取主线最早出现的地区
  (cats["收藏道具"] || []).forEach((it) => {
    it.region = pickRegion((collectRegions[it.name] || [])
      .concat(salvageRegions[it.name] || [], wikiRegions[it.name] || []))
      || fieldPlace[it.name] || "";
  });

  // 宝藏道具：打捞 → 宝箱掉落表 → wiki「获得地点」，同样取主线最早出现的地区
  (cats["宝藏"] || []).forEach((it) => {
    it.region = pickRegion((salvageRegions[it.name] || [])
      .concat(treasureRegions[it.name] || [], wikiRegions[it.name] || []))
      || fieldPlace[it.name] || "";
  });

  // 排序：
  //   核心晶片 → 等级 1→20，同级按名称（卡片不显示等级文字，等级只决定顺序）
  //   收藏道具 / 宝藏 / 产权证 → 按主线地区先后，同地区按名称（收藏道具先按采集类型）
  //   异刃 → APK 原始顺序（不重排）
  //   其余 → 类型 + 稀有度 + 名称（与 APP 一致，稀有度低→高）
  const regionRank = (r) => { const i = REGION_ORDER.indexOf(r); return i < 0 ? 999 : i; };
  const rarityRank = (r) => { const i = RARITY_ORDER.indexOf(r); return i < 0 ? 999 : i; };
  for (const k of Object.keys(cats)) {
    if (k === "核心晶片") {
      cats[k].sort((a, b) => chipLevel(a.type) - chipLevel(b.type) || (a.name < b.name ? -1 : 1));
    } else if (k === "收藏道具" || k === "宝藏" || k === "产权证") {
      cats[k].sort((a, b) => regionRank(a.region) - regionRank(b.region)
        || (k === "收藏道具" ? (a.type < b.type ? -1 : a.type > b.type ? 1 : 0) : 0)
        || (a.name < b.name ? -1 : 1));
    } else {
      cats[k].sort((a, b) => (a.type < b.type ? -1 : a.type > b.type ? 1 : 0)
        || rarityRank(a.rarity) - rarityRank(b.rarity)
        || (a.name < b.name ? -1 : 1));
    }
  }

  // wiki 字段放在每个条目的最后，便于脚本改动时 diff 干净
  for (const k of Object.keys(cats)) {
    (cats[k] || []).forEach((it) => {
      it.wiki = wikiTitleFor(it.name, existsAll);
      it.url = it.wiki ? wikiUrl(it.wiki) : "";
    });
  }
  blades.forEach((b) => {
    // 宫比罗（觉醒前/后）在 wiki 上是「异刃:宫比罗」「异刃:宫比罗(觉醒)」
    if (!b.wiki && existsAll.has("异刃:" + b.name)) b.wiki = "异刃:" + b.name;
    b.url = b.wiki ? wikiUrl(b.wiki) : "";
  });

  // ---------- 分栏字段（前端按它分组显示） ----------
  //   异刃 → 属性；核心晶片 → 稀有度；饰品 / 辅助核心 → 效果（item_type）；
  //   收纳包道具 / 贵重品 → 类型；收藏道具 / 宝藏 / 产权证 → 地区（已是分段标题）
  for (const b of blades) b.group = b.element || "其他";
  for (const k of CAT_ORDER) {
    (cats[k] || []).forEach((it) => {
      if (k === "核心晶片") it.group = it.rarity || "其他";
      else if (k === "饰品" || k === "辅助核心" || k === "收藏道具") it.group = it.type || "其他";
      else if (k === "收纳包道具" || k === "贵重品") it.group = it.type || "其他";
      else it.group = it.region || "";
    });
  }

  // ---------- 贵重品：获取途径（无 wiki 页的条目在弹窗里展示） ----------
  // 优先级：
  //   1) manual_item_acquisition_link.acquisition_text —— 中文的人工整理获取途径（最准）
  //   2) 任务奖励 / 怪物图鉴掉落 / 宝箱 / 商店 —— 用中文数据拼一句「完成/掉落/出售于…」
  //   3) entity_field.source —— 英文 Fandom 原文（没有中文数据时兜底）
  // 说明文字优先取中文 caption，没有中文再用英文 caption。
  const CAPTION_ZH = /[一-鿿]/;
  const sourceByItem = {}, captionByItem = {};
  for (const f of rows(`SELECT e.name_zh AS name, f.name AS k, f.value AS v
      FROM entity_field f JOIN entity e ON e.id = f.entity_id
      JOIN item i ON i.entity_id = e.id WHERE i.category = '贵重品'`)) {
    if (f.k === "source" && f.v) sourceByItem[f.name] = f.v;
    if (f.k === "caption" && f.v) {
      if (!captionByItem[f.name] || (CAPTION_ZH.test(f.v) && !CAPTION_ZH.test(captionByItem[f.name]))) captionByItem[f.name] = f.v;
    }
  }
/* 中文人工获取途径（一个物品可能有多条，合并去重） */
  // 个别手工修正（中文数据缺失/不准确时覆盖）
  const SOURCE_FIX = {
    幽界连结装置: "完成挑战战斗「艾尔玛再临」后，在挑战之地从诺彭大仙人处获得。",
  };
  const manualAcq = {};
  for (const r of rows2(`SELECT l.item_entity_id AS id, l.acquisition_text AS txt
      FROM manual_item_acquisition_link l JOIN item i ON i.entity_id = l.item_entity_id
      WHERE i.category = '贵重品' AND i.is_torna = 0`)) {
    (manualAcq[r.id] = manualAcq[r.id] || []);
    if (r.txt && manualAcq[r.id].indexOf(r.txt) === -1) manualAcq[r.id].push(r.txt);
  }
  // 任务奖励 / 怪物掉落 / 宝箱 / 商店 / 挑战奖励（都带中文名）
  const acqHints = {};
  const addHint = (name, text) => {
    const list = (acqHints[name] = acqHints[name] || []);
    if (list.indexOf(text) === -1) list.push(text);
  };
  const nameOfId = {};
  for (const e of rows(`SELECT id, name_zh, name_en FROM entity WHERE name_zh IS NOT NULL AND name_zh <> ''`)) nameOfId[e.id] = e.name_zh;
  for (const r of rows2(`SELECT r.item_name AS item, e.name_zh AS quest FROM quest_reward r
      LEFT JOIN entity e ON e.id = r.quest_id`)) {
    if (r.quest) addHint(r.item, "完成任务「" + r.quest + "」");
  }
  for (const r of rows2(`SELECT d.item_title AS item, e.name_zh AS enemy FROM enemy_drop d
      LEFT JOIN enemy en ON en.entity_id = d.enemy_id LEFT JOIN entity e ON e.id = en.entity_id
      WHERE d.first_named IN ('1', '0')`)) {
    if (r.enemy) addHint(r.item, "击败「" + r.enemy + "」获得");
  }
  for (const r of rows2(`SELECT l.item_name AS item, c.region AS region FROM treasure_loot l
      JOIN treasure_chest c ON c.entity_id = l.treasure_chest_id WHERE c.is_torna = 0`)) {
    if (r.region) addHint(r.item, "开启「" + r.region + "」的宝箱");
  }
  // 挑战奖励 / 佣兵任务奖励里的物品名若本身是中文实体，也补进去
  for (const r of rows2(`SELECT item_name AS item FROM challenge_reward`)) {
    if (r.item) addHint(r.item, "挑战战斗奖励");
  }
  for (const r of rows2(`SELECT g.item_name AS item, s.region AS region, e.name_zh AS shop FROM shop_good g
      JOIN shop s ON s.entity_id = g.shop_id LEFT JOIN entity e ON e.id = s.entity_id`)) {
    if (r.shop) addHint(r.item, "在「" + r.shop + "」购买");
  }
  for (const r of rows2(`SELECT cr.item_name AS item, e.name_zh AS battle FROM challenge_reward cr
      LEFT JOIN entity e ON e.id = cr.challenge_id`)) {
    if (r.battle) addHint(r.item, "挑战战斗「" + r.battle + "」奖励");
  }
  const zhOf = (s) => {
    // 英文来源里的实体名尽量换成中文（如 Central Exchange → 中央交易所）
    if (!s) return "";
    const map = {
      "Central Exchange": "中央交易所",
      "Nopon Archsage": "诺彭大仙人",
      "Noponstone Exchange": "诺彭水晶交换（挑战之地）",
      "Tiger! Tiger!": "Tiger! Tiger!（花的小游戏）",
      "Poppiswap": "花的零件交换",
      "Merc Mission reward": "佣兵团任务奖励",
      "New Difficulty Levels pack": "追加难度包",
      "Granted by Niall to Mòrag": "由奈费尔授予梅勒芙",
      "Blade-Sharp Memory": "任务「异刃的记忆」",
      "Gluttonous Marrin": "击败「大胃王尖角龙鱼」",
      "Elder Arachno": "击败「长老蜘蛛」",
    };
    return s.split("\n").map((x) => map[x.trim()] || x.trim()).filter(Boolean).join("、" );
  };
  (cats["贵重品"] || []).forEach((it) => {
    if (!it.url) {
      const manual = manualAcq[it.id] || [];
      const hints = acqHints[it.name] || [];
      it.source = SOURCE_FIX[it.name] || (manual.length ? manual.join("；") : (hints.length ? hints.join("；") : zhOf(sourceByItem[it.name])));
      // 说明只保留中文；纯英文的说明直接不展示（用户要求）
      const cap = captionByItem[it.name] || "";
      it.effect = it.effect || cap;
      if (!CAPTION_ZH.test(it.effect || "")) it.effect = "";
    }
  });

  // ---------- 汇总 ----------
  const out = {
    meta: { generatedFrom: "APK xenoblade2.db（游戏内分页口径）", counts: {} },
    blade: blades,
  };
  // id 只用于生成时关联中文获取途径，不写进前端数据
  for (const k of CAT_ORDER) out[k] = (cats[k] || []).map(function (it) { const c = Object.assign({}, it); delete c.id; return c; });
  out.meta.counts = { 异刃: blades.length };
  for (const k of CAT_ORDER) out.meta.counts[k] = (out[k] || []).length;
  // 各页筛选下拉的可选项（顺序即展示顺序）：
  //   异刃 → 前端自行按数据生成；核心晶片 → 不按类型筛选，空数组（按等级排列 + 稀有度筛选）
  //   收藏道具 → 类型 + 地区；宝藏 → 只有地区（原来那个「宝藏/全部」的类型筛选没有意义，已删）
  //   产权证 → 地区；其余 → item_type
  out.meta.types = {};
  for (const k of CAT_ORDER) {
    const vals = [];
    if (k === "核心晶片") { out.meta.types[k] = []; continue; }
    (out[k] || []).forEach((it) => {
      const v = it.type;
      if (v && vals.indexOf(v) === -1) vals.push(v);
    });
    out.meta.types[k] = vals.sort();
  }
  // 稀有度筛选选项：有稀有度的分类才给（核心晶片 / 饰品 / 收纳包道具 / 收藏道具 / 宝藏）
  out.meta.rarities = {};
  for (const k of CAT_ORDER) {
    const vals = [];
    (out[k] || []).forEach((it) => { if (it.rarity && vals.indexOf(it.rarity) === -1) vals.push(it.rarity); });
    out.meta.rarities[k] = vals.sort((a, b) => rarityRank(a) - rarityRank(b));
  }
  out.meta.regions = {};
  for (const k of ["收藏道具", "宝藏", "产权证"]) {
    const vals = [];
    (out[k] || []).forEach((it) => { if (it.region && vals.indexOf(it.region) === -1) vals.push(it.region); });
    out.meta.regions[k] = vals.sort((a, b) => regionRank(a) - regionRank(b));
  }
  // 「地区未知」排最后：UI 里作为独立分组，不混进主线的地区顺序里
  out.meta.unknownRegion = "地区未知";

  const js = "window.X2=window.X2||{};window.X2.codexV2=" + JSON.stringify(out) + ";\n";
  fs.writeFileSync(path.join(SITE, "data", "codex_v2.js"), js, "utf8");
  if (db2 !== db) db2.close();
  db.close();
  console.log("图鉴统计：", JSON.stringify(out.meta.counts));
  console.log("codex_v2.js", (Buffer.byteLength(js) / 1024).toFixed(1), "KB");
  console.log("异刃首条：", blades[0] && blades[0].name, "| 末条：", blades[blades.length - 1] && blades[blades.length - 1].name);
}

main();
