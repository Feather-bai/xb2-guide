// 抓取互动地图的 5 个图层，产出 .extract/mapdata/layers.json 供 rebuild_maps.cjs 使用。
//
// 关键点：SMW 的 ask 接口「查询级 limit」有效（2000 可一次取全），offset 分页无效。
// 早期脚本写死 limit=50，才导致密集地图的标记被截断。
//
// 数据来源：
//   宝箱 / 采集点   SMW（坐标 + 所在地图 + 宝箱内容；采集点的类型名在标题里）
//   采集点掉落      SMW [[采集物::+]]（采集道具 1~4 + 概率 + 单次数量，按类型名匹配）
//   打捞点          JSON:Gmk/salvage + JSON:SalvagePoint/*（SalvagePointName）
//   敌人            JSON:Gmk/enemy + EnemyGmkMap（刷怪点→敌人 id）+ EnemyIdMap（id→名称）
//   NPC             JSON:Gmk/npc + APK SQLite（npc_game_appearance.gmk_id → entity.name_zh）
//
// 用法：node tools/fetch_layers.cjs [--apk <xenoblade2.db>]
const fs = require("fs");
const path = require("path");
const https = require("https");

const { WS, SRC, APK_DB } = require("./paths.cjs");
const API = "https://xenoblade2.cn/api.php";
const UA = { "User-Agent": "Mozilla/5.0 (compatible; guide-archiver/1.0)" };
const LIMIT = 2000;

function get(url) {
  return new Promise((res, rej) => {
    https.get(url, { headers: UA }, (r) => {
      if (r.statusCode !== 200) { r.resume(); return rej(new Error("HTTP " + r.statusCode)); }
      const c = []; r.on("data", (b) => c.push(b)); r.on("end", () => res(Buffer.concat(c).toString("utf8")));
    }).on("error", rej);
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jsonPage = async (n) => JSON.parse(await get("https://xenoblade2.cn/JSON:" + encodeURIComponent(n) + "?action=raw"));
async function ask(query) {
  const url = API + "?action=ask&format=json&api_version=2&query=" + encodeURIComponent(query + "|limit=" + LIMIT);
  for (let a = 0; a < 3; a++) {
    try { const d = JSON.parse(await get(url)); if (d.error) throw new Error(JSON.stringify(d.error)); return d.query.results || {}; }
    catch (e) { if (a === 2) throw e; await sleep(900); }
  }
}
const outs = (r, k) => (r.printouts && r.printouts[k]) || [];
const fv = (r, k) => { const a = outs(r, k); return a.length ? (typeof a[0] === "object" ? a[0].fulltext.split(":").pop() : a[0]) : ""; };

async function main() {
  const apkArg = process.argv.indexOf("--apk");

  // ---------- 1) 宝箱（SMW：坐标 + 所在地图 + 内容 / 金币 / 场景技能） ----------
  console.log("宝箱…");
  const tboxRes = await ask("[[宝箱:+||黄金之国宝箱:+]][[PosX::+]]|?PosX|?PosZ|?Areas|?TboxPopDisplay|?Gold|?FieldSkill");
  const tbox = [];
  for (const [title, rec] of Object.entries(tboxRes)) {
    const pr = rec.printouts || {};
    if (!pr.PosX || !pr.PosX[0]) continue;
    const it = { t: title.split(":").pop(), x: +(+pr.PosX[0]).toFixed(3), z: +(+pr.PosZ[0]).toFixed(3), a: outs(rec, "Areas") };
    const pop = outs(rec, "TboxPopDisplay").join("、"); if (pop) it.pop = pop;
    const gold = outs(rec, "Gold")[0]; if (gold) it.gold = gold;
    const skill = outs(rec, "FieldSkill").join("、"); if (skill) it.skill = skill;
    tbox.push(it);
  }
  console.log("  宝箱", tbox.length);

  // ---------- 2) 采集点（SMW：坐标 + 所在地图；类型名在标题里） ----------
  console.log("采集点…");
  const colRes = await ask("[[采集点:+||黄金之国采集点:+]][[PosX::+]]|?PosX|?PosZ|?Areas");
  const colle = [];
  for (const [title, rec] of Object.entries(colRes)) {
    const pr = rec.printouts || {};
    if (!pr.PosX || !pr.PosX[0]) continue;
    const type = title.replace(/^采集点:/, "").split("#")[0];      // 阿伐利缇亚商会/植物学1
    const gmk = (title.split("#")[1] || "").replace(/ /g, "_");     // colle_ma02a_c001
    colle.push({ t: gmk || type, type: type, x: +(+pr.PosX[0]).toFixed(3), z: +(+pr.PosZ[0]).toFixed(3), a: outs(rec, "Areas") });
  }
  console.log("  采集点", colle.length);

  // ---------- 3) 采集点掉落（SMW 批量：类型名 -> 道具 + 概率） ----------
  console.log("采集点掉落…");
  const dropRes = await ask("[[采集物::+]]|?采集道具1|?采集概率1|?采集道具2|?采集概率2|?采集道具3|?采集概率3|?采集道具4|?采集概率4|?单次采集数量");
  const colleDetail = {};
  for (const [title, rec] of Object.entries(dropRes)) {
    const type = title.replace(/^采集点:/, "").split("#")[0];
    const drops = [];
    for (let i = 1; i <= 4; i++) { const item = fv(rec, "采集道具" + i), p = fv(rec, "采集概率" + i); if (item) drops.push([item, p]); }
    colleDetail[type] = { drops: drops, multi: fv(rec, "单次采集数量") || "" };
  }
  console.log("  掉落表", Object.keys(colleDetail).length, "（覆盖采集点", colle.filter((c) => colleDetail[c.type]).length, "/", colle.length, "）");

  // ---------- 4) 打捞点（Gmk 坐标 + SalvagePoint 名称 / 掉落物） ----------
  console.log("打捞点…");
  const gmkSalvage = await jsonPage("Gmk/salvage");
  const salvage = [];
  const salvageItems = {};        // 打捞点 gmk id -> [可在该点捞到的道具名]
  for (const e of gmkSalvage) {
    const it = { t: e.Name, x: +(+e.PosX).toFixed(3), z: +(+e.PosZ).toFixed(3), a: (e.areas || []).filter(Boolean) };
    try {
      const d = await jsonPage("SalvagePoint/" + e.Name.replace(/_/g, " "));
      if (d && d.SalvagePointName) it.n = d.SalvagePointName;
      const items = new Set();
      for (let i = 1; i <= 5; i++) {
        const tbl = d && d["SalvageTable" + i];
        if (!tbl || typeof tbl !== "object") continue;
        for (const k of Object.keys(tbl)) {
          const c = tbl[k];
          if (!c || typeof c !== "object") continue;
          for (let j = 1; j <= 8; j++) { const nm = c["itm" + j + "ID"]; if (nm) items.add(nm); }
        }
      }
      if (items.size) salvageItems[e.Name] = Array.from(items);
    } catch (err) { /* 没有该页就跳过 */ }
    salvage.push(it);
    await sleep(60);
  }
  console.log("  打捞点", salvage.length, "（有名称", salvage.filter((s) => s.n).length, "，有掉落物", Object.keys(salvageItems).length, "）");

  // ---------- 5) 敌人（Gmk 坐标 + EnemyGmkMap / EnemyIdMap 名称） ----------
  console.log("敌人…");
  const gmkEnemy = await jsonPage("Gmk/enemy");
  const spawn2id = {};
  for (const [id, names] of Object.entries(await jsonPage("EnemyGmkMap"))) for (const n of names) spawn2id[n] = id;
  const id2name = {};
  for (const [name, ids] of Object.entries(await jsonPage("EnemyIdMap"))) for (const it of ids) id2name[typeof it === "object" ? it.id : it] = name;
  const seen = new Set();
  const enemy = [];
  for (const e of gmkEnemy) {
    const k = (+e.PosX).toFixed(2) + "," + (+e.PosZ).toFixed(2) + "," + (e.areas || []).filter(Boolean).join("|");
    if (seen.has(k)) continue; seen.add(k);
    const it = { t: e.Name, x: +(+e.PosX).toFixed(3), z: +(+e.PosZ).toFixed(3), a: (e.areas || []).filter(Boolean), zone: e.ZoneID, pop: e.POP_TIME, w: e.popWeather };
    const nm = id2name[spawn2id[e.Name]]; if (nm) it.n = nm;
    enemy.push(it);
  }
  console.log("  敌人", enemy.length, "（有名称", enemy.filter((e) => e.n).length, "）");

  // ---------- 6) NPC（Gmk 坐标 + APK 名称） ----------
  console.log("NPC…");
  const gmkNpc = await jsonPage("Gmk/npc");
  const npcName = {};
  const apkPath = apkArg >= 0 ? process.argv[apkArg + 1] : APK_DB;
  if (fs.existsSync(apkPath)) {
    try {
      const { DatabaseSync } = require("node:sqlite");
      const db = new DatabaseSync(apkPath, { readOnly: true });
      for (const r of db.prepare("SELECT DISTINCT ga.gmk_id g, e.name_zh n FROM npc_game_appearance ga JOIN entity e ON ga.npc_id=e.id WHERE e.name_zh IS NOT NULL AND e.name_zh!=''").all()) npcName[r.g] = r.n;
      db.close();
    } catch (e) { console.log("  APK 读取失败：", e.message); }
  }
  // 名称优先用 wiki 的「NPC 页 Pop → data-gmk-id」映射（tools/fetch_npc_gmk_map.cjs）：
  // APK npc_game_appearance 缺行（萨雷斯的 npc41300027_03）或错位时以 wiki 为准。
  const wikiGmk = {};
  const wikiGmkFile = path.join(__dirname, "npc_gmk_map.json");
  if (fs.existsSync(wikiGmkFile)) {
    try {
      const w = JSON.parse(fs.readFileSync(wikiGmkFile, "utf8"));
      for (const [g, v] of Object.entries(w)) if (v && v.name) wikiGmk[g] = v.name;
    } catch (e) { console.log("  npc_gmk_map 读取失败：", e.message); }
  }
  const nameOf = (g) => wikiGmk[g] || npcName[g] || "";
  // 去重键带上「名字」：同一坐标上可能有多个不同 NPC（如萨雷斯与彻班站位只差几单位，
  //   甚至完全重合），只按坐标去重会把其中一个整点丢掉。
  const seenN = new Set();
  const npc = [];
  for (const e of gmkNpc) {
    const nm = nameOf(e.Name);
    const k = (+e.PosX).toFixed(2) + "," + (+e.PosZ).toFixed(2) + "," + (e.areas || []).filter(Boolean).join("|") + "|" + nm;
    if (seenN.has(k)) continue; seenN.add(k);
    const it = { t: e.Name, x: +(+e.PosX).toFixed(3), z: +(+e.PosZ).toFixed(3), a: (e.areas || []).filter(Boolean) };
    if (nm) it.n = nm;
    npc.push(it);
  }
  console.log("  NPC", npc.length, "（有名称", npc.filter((n) => n.n).length, "）");

  const out = { tbox: tbox, colle: colle, salvage: salvage, enemy: enemy, npc: npc, colleDetail: colleDetail, salvageItems: salvageItems };
  fs.writeFileSync(path.join(SRC, "layers.json"), JSON.stringify(out), "utf8");
  console.log("\n=== 汇总 ===");
  for (const k of ["tbox", "colle", "salvage", "enemy", "npc"])
    console.log(`  ${k.padEnd(9)} ${String(out[k].length).padStart(5)} 条`);
}

main().catch((e) => { console.error("失败：", e.message); process.exit(1); });
