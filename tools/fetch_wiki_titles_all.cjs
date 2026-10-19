// 抓取 wiki 各命名空间的全部页面标题 → site/data/wiki_titles_all.js（window.X2.wikiTitlesAll）
// 用途：图鉴里不在「物品:」命名空间下的条目（花的零件、武器…）也能给出有效外链；
//       app.js 的 wikiExists 会把这份标题并进白名单。
// 用法：node tools/fetch_wiki_titles_all.cjs
const fs = require("fs");
const path = require("path");
const https = require("https");

const WS = path.join(__dirname, "..");
const OUT = path.join(WS, "site", "data", "wiki_titles_all.js");
const API = "https://xenoblade2.cn/api.php";
const UA = { "User-Agent": "Mozilla/5.0 (compatible; guide-archiver/1.0)" };
// 图鉴用品相关的命名空间（页面标题自带「命名空间:」前缀）
const NAMESPACES = [3000 /* 物品 */, 3010 /* 花的零件 */, 3400 /* 异刃 */, 3800 /* 武器 */, 3100 /* 敌人 */];

function get(url) {
  return new Promise((res, rej) => https.get(url, { headers: UA }, (r) => {
    let b = ""; r.on("data", (d) => (b += d)); r.on("end", () => res(b));
  }).on("error", rej));
}

(async () => {
  const all = new Set();
  for (const ns of NAMESPACES) {
    let cont = "";
    for (let i = 0; i < 40; i++) {
      const url = API + "?action=query&format=json&formatversion=2&list=allpages&apnamespace=" + ns + "&aplimit=500" +
        (cont ? "&apcontinue=" + encodeURIComponent(cont) : "");
      const j = JSON.parse(await get(url));
      for (const p of (j.query && j.query.allpages) || []) all.add(p.title);
      cont = j["continue"] && j["continue"].apcontinue;
      if (!cont) break;
    }
    console.log("ns", ns, "累计", all.size);
  }
  const arr = [...all].sort();
  fs.writeFileSync(OUT, "window.X2=window.X2||{};window.X2.wikiTitlesAll=" + JSON.stringify(arr) + ";\n", "utf8");
  console.log("wik_titles_all.js", arr.length, "条", (fs.statSync(OUT).size / 1024).toFixed(0) + " KB");
})();
