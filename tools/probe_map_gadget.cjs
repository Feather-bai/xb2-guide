// 从 wiki 的 Xb2map gadget 里定位 getXb2mapByName 的实现，找出数据来源
const fs = require("fs");
const path = require("path");
const https = require("https");

const CACHE = "C:\\Users\\ZhuanZ\\Documents\\deepseek-harness\\default-workspace\\.extract\\x2map";

function get(url) {
  return new Promise((res, rej) => {
    https.get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, (r) => {
      if (r.statusCode >= 300 && r.headers.location) return get(r.headers.location).then(res, rej);
      if (r.statusCode !== 200) return rej(new Error(url + " -> " + r.statusCode));
      const c = [];
      r.on("data", (d) => c.push(d));
      r.on("end", () => res(Buffer.concat(c).toString("utf8")));
    }).on("error", rej);
  });
}

(async () => {
  fs.mkdirSync(CACHE, { recursive: true });
  const files = ["Xb2map.js", "Xb2mapTbox.js", "Xb2mapCollection.js", "Xb2mapEnemy.js", "Xb2mapNpc.js", "Xb2mapSalvage.js", "Xb2map.css", "Leaflet.js"];
  const src = {};
  for (const f of files) {
    const p = path.join(CACHE, f);
    if (!fs.existsSync(p)) {
      const url = "https://xenoblade2.cn/index.php?title=MediaWiki:Gadget-" + f + "&action=raw";
      try {
        const text = await get(url);
        fs.writeFileSync(p, text);
        console.log("下载", f, text.length);
      } catch (e) {
        console.log("失败", f, e.message);
        continue;
      }
    }
    src[f] = fs.readFileSync(p, "utf8");
  }

  const blob = Object.values(src).join("\n");
  // 找 getXb2mapByName 的定义与调用上下文
  for (const kw of ["getXb2mapByName", "getXb2mapById", "mapinfo", "api.php", "action=", "index.php", "title=", "format=json", "Special:", "xenoblade2.cn"]) {
    const idx = [];
    let i = -1;
    while ((i = blob.indexOf(kw, i + 1)) !== -1 && idx.length < 6) idx.push(i);
    if (idx.length) {
      console.log("\n===", kw, "出现", idx.length, "次");
      for (const j of idx.slice(0, 3)) {
        console.log("   …" + blob.slice(Math.max(0, j - 160), j + 200).replace(/\n/g, " ") + "…");
      }
    }
  }
})();
