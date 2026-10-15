// 检查站内地图底图是否齐全（rebuild_maps.cjs 里 img 指向本地文件时用）。
// 用法：node tools/check_map_images.cjs
const fs = require("fs");
const path = require("path");
const { SITE } = require("./paths.cjs");

const mapsJs = path.join(SITE, "data", "maps.js");
if (!fs.existsSync(mapsJs)) {
  console.error("缺少 site/data/maps.js（先跑 node tools/rebuild_maps.cjs）");
  process.exit(1);
}
const src = fs.readFileSync(mapsJs, "utf8");
const data = JSON.parse(src.split("window.X2.mapsData=")[1].replace(/;\s*$/, ""));
const maps = data.maps || [];

let local = 0, remote = 0;
const missing = [];
for (const m of maps) {
  const img = m.img || "";
  if (!/^https?:/.test(img)) {
    local++;
    const fp = path.join(SITE, img.replace(/^\//, ""));
    if (!fs.existsSync(fp)) missing.push([m.id, img]);
  } else {
    remote++;
  }
}
console.log(`地图 ${maps.length} 张：本地底图 ${local} | 仍走远端 ${remote}`);
if (missing.length) {
  console.log(`缺失 ${missing.length} 张：`);
  for (const [id, img] of missing.slice(0, 20)) console.log(`   ${id} -> ${img}`);
  process.exitCode = 1;
} else {
  console.log("本地底图全部存在 ✅");
}
