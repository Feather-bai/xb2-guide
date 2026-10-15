// 把 wiki 的地图底图下载到 site/assets/maps/<地图id>.png（本地托管，避免外链）。
//
// 图片地址来自 .extract/mapdata/imageurls.json（由 tools/fetch_mapdata.py 解析并缓存）。
// 已存在的文件默认跳过，可断点续传；加 --force 强制重新下载。
//
// 用法：node tools/fetch_map_images.cjs [--force]
const fs = require("fs");
const path = require("path");
const https = require("https");
const { SITE, SRC } = require("./paths.cjs");

const DST = path.join(SITE, "assets", "maps");
const UA = {
  "User-Agent": "Mozilla/5.0 (compatible; guide-archiver/1.0)",
  "Referer": "https://xenoblade2.cn/",
};

function get(url) {
  return new Promise((res, rej) => {
    https.get(url, { headers: UA }, (r) => {
      if (r.statusCode >= 300 && r.headers.location) return get(r.headers.location).then(res, rej);
      if (r.statusCode !== 200) { r.resume(); return rej(new Error("HTTP " + r.statusCode)); }
      const c = [];
      r.on("data", (b) => c.push(b));
      r.on("end", () => res(Buffer.concat(c)));
    }).on("error", rej);
  });
}

async function main() {
  const force = process.argv.includes("--force");
  fs.mkdirSync(DST, { recursive: true });
  const urlsPath = path.join(SRC, "imageurls.json");
  if (!fs.existsSync(urlsPath)) {
    console.error("缺少 " + urlsPath + "（先跑 python tools/fetch_mapdata.py）");
    process.exit(1);
  }
  const urls = JSON.parse(fs.readFileSync(urlsPath, "utf8"));
  let total = 0, downloaded = 0, failed = 0;
  for (const name of Object.keys(urls).sort()) {
    const dst = path.join(DST, name + ".png");
    if (fs.existsSync(dst) && !force) { total += fs.statSync(dst).size; continue; }
    try {
      const data = await get(urls[name]);
      fs.writeFileSync(dst, data);
      total += data.length;
      downloaded++;
      console.log(`  下载 ${name}.png  ${(data.length / 1024).toFixed(0)} KB`);
    } catch (e) {
      failed++;
      console.error(`  失败 ${name}: ${e.message}`);
    }
  }
  console.log(`底图 ${Object.keys(urls).length} 张 | 本次下载 ${downloaded} | 失败 ${failed} | 合计 ${(total / 1048576).toFixed(2)} MB`);
  console.log(`输出目录：${DST}`);
}

main().catch((e) => { console.error("失败：", e.message); process.exit(1); });
