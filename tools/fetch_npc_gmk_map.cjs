// 抓 wiki 「NPC:」命名空间所有页面里「Pop: NNNN → data-gmk-id="npcXXXXX_NN"」的对应关系，
// 用来校正 APK npc_game_appearance 的 NPC 名称映射：
//   - APK 里缺失的行（例：npc41300027_03 属于萨雷斯，APK 完全没有 → 地图上少一个点位）
//   - APK 里错位的行（同一个 gmk 在 APK 与 wiki 上属于不同 NPC 时，以 wiki 为准）
// 输出：tools/npc_gmk_map.json  { "npc41300027_03": { "name": "萨雷斯", "pop": "5270" }, ... }
// 用法：node tools/fetch_npc_gmk_map.cjs       （8 路并发，约 1 分钟）
const fs = require("fs");
const https = require("https");

const API = "https://xenoblade2.cn/api.php";
const UA = { "User-Agent": "Mozilla/5.0 (compatible; guide-archiver/1.0)" };
const OUT = __dirname + "/npc_gmk_map.json";
const CONCURRENCY = 8;

function get(url) {
  return new Promise((res, rej) => https.get(url, { headers: UA }, (r) => {
    let b = ""; r.on("data", (d) => (b += d)); r.on("end", () => res(b));
  }).on("error", rej));
}

(async () => {
  const titles = [];
  let cont = "";
  for (let i = 0; i < 20; i++) {
    const u = API + "?action=query&format=json&formatversion=2&list=allpages&apnamespace=3550&aplimit=500" +
      (cont ? "&apcontinue=" + encodeURIComponent(cont) : "");
    const j = JSON.parse(await get(u));
    for (const p of j.query.allpages || []) titles.push(p.title);
    cont = j["continue"] && j["continue"].apcontinue;
    if (!cont) break;
  }
  console.log("NPC 页", titles.length);

  const out = {};
  let done = 0;
  async function worker(queue) {
    while (queue.length) {
      const title = queue.shift();
      let j;
      try {
        j = JSON.parse(await get(API + "?action=parse&format=json&formatversion=2&prop=text&page=" + encodeURIComponent(title)));
      } catch (e) { done++; continue; }
      const html = j.parse ? String(j.parse.text || "").replace(/&#95;/g, "_") : "";
      const name = String(title).replace(/^NPC:/, "");
      html.split(/<h3>/).slice(1).forEach((seg) => {
        const pop = (seg.match(/Pop:\s*(\d+)/) || [])[1];
        const gmk = (seg.match(/data-gmk-id="([^"]+)"/) || [])[1];
        if (pop && gmk && !out[gmk]) out[gmk] = { name: name, pop: pop };
      });
      done++;
      if (done % 100 === 0) process.stdout.write(`\r  ${done}/${titles.length}  ${Object.keys(out).length} 条`);
    }
  }
  const queue = titles.slice();
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(queue)));
  console.log(`\r  ${titles.length}/${titles.length}  ${Object.keys(out).length} 条`);
  fs.writeFileSync(OUT, JSON.stringify(out, null, 0), "utf8");
  console.log("npc_gmk_map.json", Object.keys(out).length, "条");
})();
