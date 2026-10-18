// 重建 site/data/maps.js —— 底图走站内本地路径（tools/fetch_map_images.cjs 下载），
// 标记点包含 5 个图层：宝箱 / 采集点 / 打捞点 / 敌人 / NPC（来源见 tools/fetch_layers.cjs）。
// 用法：node tools/rebuild_maps.cjs
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const WS = __dirname + "/..";
const SRC = path.join(WS, ".extract", "mapdata");
const OUT = path.join(WS, "site", "data");

const IMG_BASE = "https://images.xenoblade2.cn/images";
const LOCAL_MAP_DIR = "assets/maps";
const LAYERS = ["tbox", "colle", "salvage", "enemy", "npc"];

const fileName = (n) => n.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()) + " map 0.png";
const fallbackUrl = (n) => {
  const fn = fileName(n).replace(/ /g, "_");
  const h = crypto.createHash("md5").update(fn, "utf8").digest("hex");
  return `${IMG_BASE}/${h[0]}/${h.slice(0, 2)}/${fn}`;
};

const mapinfo = {};
for (const v of Object.values(JSON.parse(fs.readFileSync(path.join(SRC, "mapinfo.json"), "utf8"))))
  { const o = JSON.parse(v); mapinfo[o.Name] = o; }
const resolved = JSON.parse(fs.readFileSync(path.join(SRC, "imageurls.json"), "utf8"));
const layers = JSON.parse(fs.readFileSync(path.join(SRC, "layers.json"), "utf8"));
const localDir = path.join(WS, "site", LOCAL_MAP_DIR);

// 任务接取点（可选）：任务名 -> [{m:地图, x, z, npc}]
let questPoints = {};
const qpFile = path.join(SRC, "quest_points.json");
if (fs.existsSync(qpFile)) questPoints = JSON.parse(fs.readFileSync(qpFile, "utf8"));
const questMarkers = {};   // 地图 id -> [{t:任务名, n:NPC名, c:解锁章节, x, z}]
for (const [qname, pts] of Object.entries(questPoints))
  for (const p of pts) (questMarkers[p.m] = questMarkers[p.m] || []).push({ t: qname, n: p.npc || "", c: p.ch || "", x: p.x, z: p.z });

// 图层 -> 每张地图的标记点（a=Areas 只用于归图，不写进地图数据）
/* 异常标记清理：敌人 / NPC 找不到中文名称、只剩内部 id（如 ma05a_a01_02、npc41300011_01）
   的条目直接丢弃，不做占位保留。中文名判定：至少含一个汉字。 */
const hasCJK = (s) => /[㐀-鿿]/.test(String(s || ""));
const isNamed = (it) => hasCJK(it && it.n);
const CLEAN_LAYERS = { enemy: true, npc: true };

const perMap = {};
const dropped = { enemy: 0, npc: 0 };
for (const kind of LAYERS)
  for (const it of layers[kind] || []) {
    if (CLEAN_LAYERS[kind] && !isNamed(it)) { dropped[kind]++; continue; }
    if (!it.a || !it.a.length) continue;
    for (const a of it.a) {
      const b = perMap[a] || (perMap[a] = Object.fromEntries(LAYERS.map((k) => [k, []])));
      b[kind].push(it);
    }
  }

const strip = (it) => { const { a, ...rest } = it; return rest; };

const maps = Object.keys(mapinfo).map((name) => {
  const o = mapinfo[name];
  const remote = resolved[name] || fallbackUrl(name);
  const local = `${LOCAL_MAP_DIR}/${name}.png`;
  const onDisk = fs.existsSync(path.join(localDir, name + ".png"));
  const m = perMap[name] || Object.fromEntries(LAYERS.map((k) => [k, []]));
  const e = {
    id: name, area: o.mapName || "", group: o.menuGroup || "",
    w: o.Width, h: o.Height,
    b: [o.LowerX, o.LowerZ, o.UpperX, o.UpperZ],
    img: onDisk ? local : remote, imgRemote: remote,
  };
  for (const k of LAYERS) e[k] = m[k].map(strip);
  if (questMarkers[name]) e.quest = questMarkers[name];
  return e;
});

const areas = {};
for (const m of maps) (areas[m.area] = areas[m.area] || []).push(m.id);
for (const a of Object.keys(areas)) areas[a].sort();

/* ---- 反向索引：中文名 -> 出现位置，供任务的 NPC / 道具深链跳转 ----
   npcIndex:  名 -> [地图 id]（在该地图的 npc 图层里按 .n === 名 找标记）
   itemIndex: 名 -> [[地图 id, 查找键, 图层]]（采集点按键=类型名，打捞点按键=点名称） */
const npcIndex = {};
for (const n of layers.npc || []) {
  if (!isNamed(n)) continue;
  const s = (npcIndex[n.n] = npcIndex[n.n] || new Set());
  for (const mp of n.a || []) s.add(mp);
}

const itemIndex = {};
const addItem = (name, mapId, key, kind) => {
  if (!name || !mapId) return;
  const arr = (itemIndex[name] = itemIndex[name] || []);
  if (!arr.some((p) => p[0] === mapId && p[1] === key)) arr.push([mapId, key, kind]);
};// 采集点：某类型掉落的道具 -> 该类型所在的采集点
for (const c of layers.colle || []) {
  const d = (layers.colleDetail || {})[c.type];
  if (!d || !d.drops) continue;
  for (const dr of d.drops) for (const mp of c.a || []) addItem(dr[0], mp, c.type, "colle");
}
// 打捞点：该点能捞到的道具
for (const s of layers.salvage || []) {
  const items = (layers.salvageItems || {})[s.t];
  if (!items) continue;
  for (const item of items) for (const mp of s.a || []) addItem(item, mp, s.n || s.t, "salvage");
}

const npcIndexOut = {};
for (const k of Object.keys(npcIndex)) npcIndexOut[k] = Array.from(npcIndex[k]);

// 敌人名 -> [地图 id]（在该地图的 enemy 图层里按 .n === 名 找标记）
const enemyIndex = {};
for (const e of layers.enemy || []) {
  if (!isNamed(e)) continue;
  const s = (enemyIndex[e.n] = enemyIndex[e.n] || new Set());
  for (const mp of e.a || []) s.add(mp);
}
const enemyIndexOut = {};
for (const k of Object.keys(enemyIndex)) enemyIndexOut[k] = Array.from(enemyIndex[k]);

// 任务名 -> 地图 id 列表（供任务浮窗里做「在互动地图上找接取点」）
const questIndex = {};
for (const [qname, pts] of Object.entries(questPoints))
  questIndex[qname] = [...new Set(pts.map((p) => p.m))];

const payload = {
  imgBase: IMG_BASE,
  areas: Object.fromEntries(Object.entries(areas).sort((a, b) => (a[0] < b[0] ? -1 : 1))),
  maps: maps.sort((a, b) => (a.area + a.id < b.area + b.id ? -1 : 1)),
  // 采集点类型 -> 掉落表（道具 + 概率），供弹窗展示
  colleDrops: layers.colleDetail || {},
  // 反向索引：NPC 名 / 道具名 / 敌人名 -> 出现位置
  npcIndex: npcIndexOut,
  itemIndex: itemIndex,
  enemyIndex: enemyIndexOut,
  // 支线任务名 -> 接取点所在地图
  questIndex: questIndex,
};
const js = "window.X2=window.X2||{};window.X2.mapsData=" + JSON.stringify(payload) + ";\n";
fs.writeFileSync(path.join(OUT, "maps.js"), js, "utf8");

const gz = require("zlib").gzipSync(Buffer.from(js));
console.log(`地图 ${maps.length} 张 | 区域 ${Object.keys(areas).length} 个 | 本地底图 ${maps.filter((m) => m.img.startsWith(LOCAL_MAP_DIR)).length}`);
for (const k of LAYERS) {
  const n = maps.reduce((a, m) => a + m[k].length, 0);
  console.log(`  ${k.padEnd(9)} ${String(n).padStart(5)} 点`);
}
console.log(`maps.js ${(Buffer.byteLength(js) / 1024).toFixed(1)} KB（gzip ${(gz.length / 1024).toFixed(1)} KB）`);
console.log(`反向索引：NPC 名 ${Object.keys(npcIndexOut).length} / 道具名 ${Object.keys(itemIndex).length} / 敌人名 ${Object.keys(enemyIndexOut).length} / 任务接取点 ${Object.keys(questIndex).length}`);
console.log(`异常标记清理：敌人 ${dropped.enemy} 条、NPC ${dropped.npc} 条（无中文名，仅有内部 id）已丢弃`);
