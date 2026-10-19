// 逐个分类全量核验 wiki 目标页（用于新图鉴）。
// 输入：site/data/codex_v2.js；输出：site/data/wiki_targets.json 里的 exists 合并扩充。
// 用法：node tools/fetch_wiki_targets_v2.cjs [--apply]
const fs = require("fs");
const path = require("path");
const https = require("https");

const WS = path.join(__dirname, "..");
const SITE = path.join(WS, "site");
const COdex = path.join(SITE, "data", "codex_v2.js");
const TARGETS = path.join(SITE, "data", "wiki_targets.json");
const OUT_JS = path.join(SITE, "data", "wiki_targets.js");
const API = "https://xenoblade2.cn/api.php";
const UA = { "User-Agent": "Mozilla/5.0 (compatible; guide-archiver/1.0)" };

function get(url) {
  return new Promise((res, rej) => {
    https.get(url, { headers: UA }, (r) => {
      let b = ""; r.on("data", (d) => (b += d)); r.on("end", () => res(b));
    }).on("error", rej);
  });
}

(async () => {
  global.window = {};
  eval(fs.readFileSync(COdex, "utf8"));
  const d = window.X2.codexV2 || {};

  const NS = { blade: "异刃:", item: "物品:" };
  const titles = new Map();     // title -> {kind,name}
  const collect = (arr, kind) => {
    (arr || []).forEach((x) => {
      const t = (NS[kind] || "") + x.name;
      if (!titles.has(t)) titles.set(t, { kind, name: x.name });
    });
  };
  collect(d.blade, "blade");
  ["核心晶片", "饰品", "辅助核心", "收纳包道具", "收藏道具", "宝藏", "贵重品", "产权证"].forEach((k) => collect(d[k], "item"));

  console.log("需要核验的标题:", titles.size);
  const list = [...titles.keys()];
  const exists = new Set();
  const BATCH = 40;
  for (let i = 0; i < list.length; i += BATCH) {
    const batch = list.slice(i, i + BATCH);
    const url = API + "?action=query&format=json&formatversion=2&prop=info&titles=" +
      encodeURIComponent(batch.join("|"));
    let r;
    try { r = JSON.parse(await get(url)); } catch (e) { continue; }
    for (const p of (r.query && r.query.pages) || []) {
      if (p.missing === undefined && p.invalid === undefined) exists.add(p.title);
    }
    process.stdout.write(`\r  已检查 ${Math.min(i + BATCH, list.length)}/${list.length}`);
  }
  console.log();

  // 与既有白名单合并（既有的是旧图鉴核验过的）
  let old = { exists: [] };
  if (fs.existsSync(TARGETS)) { try { old = JSON.parse(fs.readFileSync(TARGETS, "utf8")); } catch (e) {} }
  const merged = [...new Set([...(old.exists || []), ...exists])].sort();
  fs.writeFileSync(TARGETS, JSON.stringify({ checkedAt: new Date().toISOString().slice(0, 10), exists: merged }, null, 0), "utf8");
  fs.writeFileSync(OUT_JS, "window.X2=window.X2||{};window.X2.wikiExists=" + JSON.stringify(merged) + ";\n", "utf8");

  console.log(`核验完成：存在 ${exists.size} / ${list.length}，合并后白名单 ${merged.length}`);
  if (process.argv.includes("--apply")) {
    // 同时把 codex_v2.js 里的 url 字段按核验结果重建
    let c = fs.readFileSync(COdex, "utf8");
    const start = c.indexOf("window.X2.codexV2=") + "window.X2.codexV2=".length;
    let dep = 0, inS = false, esc = false, end = -1;
    for (let k = start; k < c.length; k++) {
      const ch = c[k];
      if (inS) { if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === '"') inS = false; continue; }
      if (ch === '"') { inS = true; continue; }
      if (ch === "{" || ch === "[") dep++; else if (ch === "}" || ch === "]") { dep--; if (dep === 0) { end = k + 1; break; } }
    }
    const obj = JSON.parse(c.slice(start, end));
    const setUrl = (arr, kind) => (arr || []).forEach((x) => {
      const t = (NS[kind] || "") + x.name;
      x.url = exists.has(t) ? "https://xenoblade2.cn/" + encodeURIComponent(t.replace(/ /g, "_")) : "";
    });
    setUrl(obj.blade, "blade");
    ["核心晶片", "饰品", "辅助核心", "收纳包道具", "收藏道具", "宝藏", "贵重品", "产权证"].forEach((k) => setUrl(obj[k], "item"));
    fs.writeFileSync(COdex, c.slice(0, start) + JSON.stringify(obj) + c.slice(end), "utf8");
    console.log("已按核验结果重建 codex_v2.js 的 url 字段");
  }
})();
