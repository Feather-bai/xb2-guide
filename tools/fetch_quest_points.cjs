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
  const rows = db.prepare(`SELECT qfm.quest_id, fmm.feature_id, fmm.map_game_name, fmm.target_game_name, e.name_zh AS qname,
      (SELECT q.available_chapter FROM quest q WHERE q.entity_id=qfm.quest_id) AS chap
    FROM quest_frontiernav_marker qfm
    JOIN frontiernav_map_marker fmm ON qfm.feature_id=fmm.feature_id
    LEFT JOIN entity e ON CAST(qfm.quest_id AS TEXT)=CAST(e.id AS TEXT)`).all();
  // wiki NPC 页的 Pop→gmk 映射（比 APK 全），用于 fallback 时给 NPC 命名
  const wikiGmk = {};
  const wikiGmkFile = path.join(__dirname, "npc_gmk_map.json");
  if (fs.existsSync(wikiGmkFile)) {
    try { const w = JSON.parse(fs.readFileSync(wikiGmkFile, "utf8")); for (const [g, v] of Object.entries(w)) if (v && v.name) wikiGmk[g] = v; } catch (e) {}
  }
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
    // wiki 页面标题偶尔带 SMW 的「# QUERY…」尾缀，去掉
    const qn = String(r.qname || "").replace(/\s*#\s*QUERY\w*$/i, "").trim();
    if (!gmk || !qn) { miss++; continue; }
    const cands = byGmk[gmk] || [];
    // 优先取与 APK 记录的地图同名的那一条（地图 id 大小写可能不一致）
    const want = String(r.map_game_name || "").toLowerCase();
    const c = cands.find((x) => (x.areas || []).some((a) => a.toLowerCase() === want)) || cands.find((x) => (x.areas || []).length) || cands[0];
    // APK 的 quest_frontiernav_marker 有时只给地图名、不给 NPC 坐标（Gmk/npc 里没有这一条）；
    // 这时退到目标 NPC 本身的 gmk（NPC 页面 Pop 映射里能查到它出现在哪张图），用 NPC 的位置当接取点。
    let pt = null;
    const tgt = gmkOf(r.target_game_name);
    if (c && (c.areas || []).length) {
      pt = { m: canon(c.areas[0]), x: +(+c.PosX).toFixed(3), z: +(+c.PosZ).toFixed(3) };
      if (npcName[gmk]) pt.npc = npcName[gmk];
    } else if (tgt && byGmk[tgt] && (byGmk[tgt][0].areas || []).length) {
      const t2 = byGmk[tgt][0];
      pt = { m: canon(t2.areas[0]), x: +(+t2.PosX).toFixed(3), z: +(+t2.PosZ).toFixed(3) };
      if (npcName[tgt] || (wikiGmk[tgt] && wikiGmk[tgt].name)) pt.npc = npcName[tgt] || wikiGmk[tgt].name;
    }
    // 最后兜底：frontiernav 没有这条任务的记录时，按「任务名里包含哪个 NPC 名」反查 NPC 位置
    // （搜寻吉西西 / 打倒瓦甘 / 学校/卡兹娜 这类；同名多人的取地图上出现的那一个）
    if (!pt) {
      const cands2 = Object.keys(wikiGmk).filter((g) => qn.indexOf(wikiGmk[g].name) > -1 && wikiGmk[g].name.length >= 2);
      const g2 = cands2.map((g) => byGmk[g]).filter((x) => x && x.length)[0];
      if (g2) {
        pt = { m: canon(g2.areas[0]), x: +(+g2.PosX).toFixed(3), z: +(+g2.PosZ).toFixed(3) };
        pt.npc = wikiGmk[cands2[0]].name;
        pt.guessed = 1;
      }
    }
    if (!pt) { miss++; continue; }
    const cid = chapId(r.chap);
    if (cid) pt.ch = cid;
    const arr = (byQuest[qn] = byQuest[qn] || []);
    if (!arr.some((p) => p.m === pt.m && p.x === pt.x && p.z === pt.z)) arr.push(pt);
  }

  // ------------------------------------------------------------------
  // 第二轮：frontiernav 里完全没有记录的任务（没有 NPC / 没有地图标记），
  // 按「任务名里包含哪个 NPC 名」反查 NPC 的位置（搜寻吉西西 / 打倒瓦甘 / 学校/卡兹娜 这类）。
  // 只用于支线任务；ch 留空，由 UI 按实际地图所属章节展示。
  // ------------------------------------------------------------------
  const { DatabaseSync: DB2 } = require("node:sqlite");
  const db2 = new DB2(apkPath, { readOnly: true });
  const allQuests = db2.prepare("SELECT e.name_zh AS name, q.category AS cat, q.available_chapter AS chap FROM quest q JOIN entity e ON e.id=q.entity_id WHERE e.name_zh IS NOT NULL AND e.name_zh != ''").all();
  db2.close();
  const nameCands = Object.keys(wikiGmk)
    .filter((g) => byGmk[g] && byGmk[g].length)
    .sort((a, b) => wikiGmk[b].name.length - wikiGmk[a].name.length);   // 长名优先，避免「萨拉」抢在「萨拉夫」前面
  let guessed = 0;
  for (const q of allQuests) {
    if (byQuest[q.name] || q.cat === "主线任务") continue;
    const hit = nameCands.filter((g) => q.name.indexOf(wikiGmk[g].name) > -1 && wikiGmk[g].name.length >= 2)[0];
    if (!hit) continue;
    const g = byGmk[hit][0];
    const pt = { m: canon(g.areas[0]), x: +(+g.PosX).toFixed(3), z: +(+g.PosZ).toFixed(3), npc: wikiGmk[hit].name, guessed: 1 };
    // 由任务名反推的接取点：章节以地图实际归属为准（不写 ch），避免「搜寻吉西西」被标成最终章
    byQuest[q.name] = [pt];
    guessed++;
  }
  if (guessed) console.log("按任务名里的 NPC 名补了", guessed, "个任务的接取点");

  fs.writeFileSync(path.join(SRC, "quest_points.json"), JSON.stringify(byQuest), "utf8");
  const pts = Object.values(byQuest).reduce((a, v) => a + v.length, 0);
  console.log(`任务接取点：${Object.keys(byQuest).length} 个任务 / ${pts} 个位置（跳过 ${miss} 行）`);
}

main().catch((e) => { console.error("失败：", e.message); process.exit(1); });
