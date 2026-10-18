// 扩充校准样本：除了采集点，再用「wiki Gmk/npc ↔ APK 同名 NPC（npc_game_appearance）」对齐，
// 然后重新生成 extra_layers.json。
const fs = require("fs");
const path = require("path");
const { SRC, APK_DB, findApkDb } = require("./paths.cjs");

function main() {
  const apkPath = findApkDb();
  const info = {};
  for (const v of Object.values(JSON.parse(fs.readFileSync(path.join(SRC, "mapinfo.json"), "utf8")))) {
    const o = JSON.parse(v); info[o.Name] = o;
  }
  const layers = JSON.parse(fs.readFileSync(path.join(SRC, "layers.json"), "utf8"));
  const gmkNpc = JSON.parse(fs.readFileSync(path.join(SRC, "gmk_npc.json"), "utf8"));

  const { DatabaseSync } = require("node:sqlite");
  const db = new DatabaseSync(apkPath, { readOnly: true });
  const appMap = {};
  for (const r of db.prepare("SELECT name,lower_x,lower_z,upper_x,upper_z FROM map").all()) appMap[r.name] = r;
  const appColle = db.prepare("SELECT marker_id,x,z,map_name FROM collection_marker").all();
  const appNpc = db.prepare("SELECT gmk_id,game_map,areas_json,x,z FROM npc_game_appearance").all();
  const poi = db.prepare(`SELECT target_type,target_name,target_category,map_game_name,world_x,world_z
    FROM frontiernav_map_marker WHERE world_x IS NOT NULL AND target_name IS NOT NULL`).all();
  db.close();

  // ==== 校准样本 ====
  const pairsByMap = {};
  const add = (map, ax, az, wx, wz) => {
    const wi = info[map], am = appMap[map];
    if (!wi || !am) return;
    (pairsByMap[map] = pairsByMap[map] || []).push({
      au: (ax - am.lower_x) / (am.upper_x - am.lower_x),
      av: (az - am.lower_z) / (am.upper_z - am.lower_z),
      wu: (wx - wi.LowerX) / (wi.UpperX - wi.LowerX),
      wv: (wz - wi.LowerZ) / (wi.UpperZ - wi.LowerZ),
    });
  };
  // 1) 采集点
  const norm = (id) => {
    const m = String(id).match(/colle[\s_-]*ma[\s_-]*(\d+)[\s_-]*a[\s_-]*([a-z])[\s_-]*0*(\d+)/i);
    return m ? "ma" + String(m[1]).padStart(2, "0") + "a_" + m[2].toLowerCase() + String(parseInt(m[3], 10)) : null;
  };
  const wc = {};
  for (const c of layers.colle) { const k = norm(c.t); if (k) wc[k] = c; }
  for (const r of appColle) {
    const w = norm(r.marker_id) && wc[norm(r.marker_id)];
    if (w) add(r.map_name, r.x, r.z, w.x, w.z);
  }
  // 2) 同名 NPC（gmk id 相同）。注意 npc_game_appearance.gmk_id 大量为空，
  //    真正可用的子集是「gmk_id 非空 且 game_map 非空 且 坐标非 0」的那 915 条。
  const wikiByGmk = {};
  for (const n of gmkNpc) (wikiByGmk[n.Name] = wikiByGmk[n.Name] || []).push(n);
  for (const r of appNpc) {
    if (!r.gmk_id || !r.game_map || !(r.x || r.z)) continue;
    const cands = wikiByGmk[r.gmk_id];
    if (!cands) continue;
    const want = String(r.game_map).toLowerCase();
    const c = cands.find((x) => (x.areas || []).some((a) => a.toLowerCase() === want)) || cands[0];
    if (!c || !(c.areas || []).length) continue;
    add(c.areas[0], r.x, r.z, c.PosX, c.PosZ);
  }

  // ==== 分轴线性拟合 ====
  const linFit = (xs, ys) => {
    const n = xs.length;
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (let i = 0; i < n; i++) { sx += xs[i]; sy += ys[i]; sxx += xs[i] * xs[i]; sxy += xs[i] * ys[i]; }
    const d = n * sxx - sx * sx;
    if (!d) return null;
    const a = (n * sxy - sx * sy) / d;
    return { a: a, b: (sy - a * sx) / n };
  };
  const fitByMap = {};
  for (const [map, P] of Object.entries(pairsByMap)) {
    if (P.length < 5) continue;
    const fu = linFit(P.map((p) => p.au), P.map((p) => p.wu));
    const fv = linFit(P.map((p) => p.av), P.map((p) => p.wv));
    if (fu && fv) fitByMap[map] = { u: fu, v: fv, n: P.length };
  }

  // ==== 把 APK 的 POI 投到 wiki 坐标 ====
  const CAT = { Landmark: "landmark", "Secret Area": "secret", "Location (Location Category)": "place" };
  const hasCJK = (s) => /[㐀-鿿]/.test(String(s || ""));
  const isPlaceholder = (s) => /#\d+$/.test(String(s || ""));
  const out = [];
  let dropped = 0, noFitMaps = new Set();
  for (const r of poi) {
    let kind = r.target_type === "HeartToHeart" ? "h2h" : (r.target_type === "Location" ? CAT[r.target_category] : null);
    if (!kind) continue;
    if (!hasCJK(r.target_name) || isPlaceholder(r.target_name)) { dropped++; continue; }
    const fit = fitByMap[r.map_game_name], am = appMap[r.map_game_name], wi = info[r.map_game_name];
    if (!fit || !am || !wi) { noFitMaps.add(r.map_game_name); continue; }
    const au = (r.world_x - am.lower_x) / (am.upper_x - am.lower_x);
    const av = (r.world_z - am.lower_z) / (am.upper_z - am.lower_z);
    const wu = fit.u.a * au + fit.u.b, wv = fit.v.a * av + fit.v.b;
    if (wu < -0.05 || wu > 1.05 || wv < -0.05 || wv > 1.05) { dropped++; continue; }
    out.push({
      k: kind, t: r.target_name, map: r.map_game_name,
      x: +(wi.LowerX + wu * (wi.UpperX - wi.LowerX)).toFixed(3),
      z: +(wi.LowerZ + wv * (wi.UpperZ - wi.LowerZ)).toFixed(3),
    });
  }
  const byKind = {};
  out.forEach((o) => (byKind[o.k] = (byKind[o.k] || 0) + 1));
  fs.writeFileSync(path.join(SRC, "extra_layers.json"), JSON.stringify(out), "utf8");
  console.log("校准样本最多的 8 张地图:", Object.entries(fitByMap).sort((a, b) => b[1].n - a[1].n).slice(0, 8).map(([m, f]) => m + "(" + f.n + ")").join(", "));
  console.log("可校准地图:", Object.keys(fitByMap).length, "/", Object.keys(info).length);
  console.log("新增标记:", JSON.stringify(byKind), "| 丢弃:", dropped);
  console.log("因缺校准而跳过 POI 的地图:", [...noFitMaps].length);
}

main();
