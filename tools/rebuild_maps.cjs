// 重建 site/data/maps.js —— 底图走站内本地路径（tools/fetch_map_images.py 下载），
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

// 图层 -> 每张地图的标记点（a=Areas 只用于归图，不写进地图数据）
const perMap = {};
for (const kind of LAYERS)
  for (const it of layers[kind] || []) {
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
  return e;
});

const areas = {};
for (const m of maps) (areas[m.area] = areas[m.area] || []).push(m.id);
for (const a of Object.keys(areas)) areas[a].sort();

const payload = {
  imgBase: IMG_BASE,
  areas: Object.fromEntries(Object.entries(areas).sort((a, b) => (a[0] < b[0] ? -1 : 1))),
  maps: maps.sort((a, b) => (a.area + a.id < b.area + b.id ? -1 : 1)),
  // 采集点类型 -> 掉落表（道具 + 概率），供弹窗展示
  colleDrops: layers.colleDetail || {},
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
