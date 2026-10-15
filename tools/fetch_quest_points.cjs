// 生成「支线任务接取点」数据：.extract/mapdata/quest_points.json
//
// 来源：手机版 wiki 的 SQLite（quest_frontiernav_marker → frontiernav_map_marker），
// 给出「任务名 → 发布该任务的 NPC 的 gmk id」；坐标不直接取 APK 的 world_x/world_z，
// 而是拿 feature_id 里的 npc gmk id 去 wiki 的 JSON:Gmk/npc 里取**同一坐标系**的坐标
// （实测 APK 的 world_x 与 wiki PosX 一致，但 world_z 有 0~66 的漂移）。
//
// 用法：node tools/fetch_quest_points.cjs [--apk <xenoblade2.db>]
const fs = require("fs");
const path = require("path");
const https = require("https");

const { WS, SRC, APK_DB } = require("./paths.cjs");

function get(url) {
  return new Promise((res, rej) => {
    https.get(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; guide-archiver/1.0)" } }, (r) => {
      if (r.statusCode !== 200) { r.resume(); return rej(new Error("HTTP " + r.statusCode)); }
      const c = []; r.on("data", (b) => c.push(b)); r.on("end", () => res(Buffer.concat(c).toString("utf8")));
    }).on("error", rej);
  });
}

async function main() {
  const apkArg = process.argv.indexOf("--apk");
  const apkPath = apkArg >= 0 ? process.argv[apkArg + 1] : APK_DB;
  if (!fs.existsSync(apkPath)) { console.error("找不到 APK 数据库：" + apkPath); process.exit(1); }

  // wiki 的 NPC 图层（同底图坐标系）
  const gmkFile = path.join(SRC, "gmk_npc.json");
  let wikiNpc;
  if (fs.existsSync(gmkFile)) wikiNpc = JSON.parse(fs.readFileSync(gmkFile, "utf8"));
  else {
    wikiNpc = JSON.parse(await get("https://xenoblade2.cn/JSON:" + encodeURIComponent("Gmk/npc") + "?action=raw"));
    fs.writeFileSync(gmkFile, JSON.stringify(wikiNpc), "utf8");
  }
  const byGmk = {};
  for (const n of wikiNpc) (byGmk[n.Name] = byGmk[n.Name] || []).push(n);

  // APK：任务 -> 发布任务的 NPC；quest.available_chapter 给出解锁章节（如「第4章后」）
  const { DatabaseSync } = require("node:sqlite");
  const db = new DatabaseSync(apkPath, { readOnly: true });
  const rows = db.prepare(`SELECT qfm.quest_id, fmm.feature_id, fmm.map_game_name, e.name_zh AS qname,
      (SELECT q.available_chapter FROM quest q WHERE q.entity_id=qfm.quest_id) AS chap
    FROM quest_frontiernav_marker qfm
    JOIN frontiernav_map_marker fmm ON qfm.feature_id=fmm.feature_id
    LEFT JOIN entity e ON CAST(qfm.quest_id AS TEXT)=CAST(e.id AS TEXT)`).all();
  const npcName = {};
  for (const r of db.prepare(`SELECT DISTINCT ga.gmk_id g, e.name_zh n FROM npc_game_appearance ga
    JOIN entity e ON ga.npc_id=e.id WHERE e.name_zh IS NOT NULL AND e.name_zh!=''`).all()) npcName[r.g] = r.n;
  db.close();

  // 「第N章后」-> 站点章节 id（第10章 = 最终章）
  const chapId = (s) => {
    const m = /第\s*(\d+)\s*章/.exec(s || "");
    if (!m) return "";
    const n = +m[1];
    return n >= 10 ? "final" : "ch" + n;
  };

  const gmkOf = (f) => { const m = String(f).match(/npc-?(\d+)-(\d+)-map-feature/i); return m ? "npc" + m[1] + "_" + m[2] : null; };

  // 地图 id 归一化：wiki 的 Gmk/npc 里偶有大小写不一致（如 ma07a_b_floor_B01）
  const known = {};
  for (const v of Object.values(JSON.parse(fs.readFileSync(path.join(SRC, "mapinfo.json"), "utf8")))) {
    const o = JSON.parse(v); known[o.Name.toLowerCase()] = o.Name;
  }
  const canon = (a) => known[String(a).toLowerCase()] || a;

  const byQuest = {};
  let miss = 0;
  for (const r of rows) {
    const gmk = gmkOf(r.feature_id);
    const qn = (r.qname || "").trim();
    if (!gmk || !qn) { miss++; continue; }
    const cands = byGmk[gmk] || [];
    // 优先取与 APK 记录的地图同名的那一条（地图 id 大小写可能不一致）
    const want = String(r.map_game_name || "").toLowerCase();
    const c = cands.find((x) => (x.areas || []).some((a) => a.toLowerCase() === want)) || cands.find((x) => (x.areas || []).length) || cands[0];
    if (!c || !(c.areas || []).length) { miss++; continue; }
    const pt = { m: canon(c.areas[0]), x: +(+c.PosX).toFixed(3), z: +(+c.PosZ).toFixed(3) };
    if (npcName[gmk]) pt.npc = npcName[gmk];
    const cid = chapId(r.chap);
    if (cid) pt.ch = cid;
    const arr = (byQuest[qn] = byQuest[qn] || []);
    if (!arr.some((p) => p.m === pt.m && p.x === pt.x && p.z === pt.z)) arr.push(pt);
  }

  fs.writeFileSync(path.join(SRC, "quest_points.json"), JSON.stringify(byQuest), "utf8");
  const pts = Object.values(byQuest).reduce((a, v) => a + v.length, 0);
  console.log(`任务接取点：${Object.keys(byQuest).length} 个任务 / ${pts} 个位置（跳过 ${miss} 行）`);
}

main().catch((e) => { console.error("失败：", e.message); process.exit(1); });
