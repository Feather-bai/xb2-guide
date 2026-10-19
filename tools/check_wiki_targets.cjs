// 检查站点内所有跳 wiki 的名词链接，标出目标页面实际不存在（会被 wiki 提示「此页面目前没有内容」）的条目。
// 用法：node tools/check_wiki_targets.cjs [--apply]
//   --apply  把不存在的条目从 site/data/index.js 的 linkables 里剔除，并写回
const fs = require("fs");
const path = require("path");
const https = require("https");

const WS = path.join(__dirname, "..");
const INDEX_JS = path.join(WS, "site", "data", "index.js");
const API = "https://xenoblade2.cn/api.php";
const UA = { "User-Agent": "Mozilla/5.0 (compatible; guide-archiver/1.0)" };

function get(url) {
  return new Promise((res, rej) => {
    https.get(url, { headers: UA }, (r) => {
      let b = ""; r.on("data", (d) => (b += d)); r.on("end", () => res(b));
    }).on("error", rej);
  });
}

function loadLinkables() {
  const src = fs.readFileSync(INDEX_JS, "utf8");
  const m = /window\.X2\.linkables=(\[[\s\S]*?\]);/.exec(src);
  if (!m) throw new Error("index.js 里找不到 window.X2.linkables");
  return { src, match: m[0], list: JSON.parse(m[1]) };
}

/** wiki 上要检查的标题：从 url 反解（与渲染时用的 wikiUrl 一致） */
function titleOf(l) {
  try {
    return decodeURIComponent(l.url.replace(/^https?:\/\/xenoblade2\.cn\//, "")).replace(/_/g, " ");
  } catch (e) { return ""; }
}

async function main() {
  const { src, match, list } = loadLinkables();
  const titles = [...new Set(list.map(titleOf).filter(Boolean))];
  console.log("待检查标题:", titles.length);

  const missing = new Set();
  const BATCH = 40;
  for (let i = 0; i < titles.length; i += BATCH) {
    const batch = titles.slice(i, i + BATCH);
    const url = API + "?action=query&format=json&formatversion=2&prop=info&titles=" +
      encodeURIComponent(batch.join("|"));
    let d;
    try { d = JSON.parse(await get(url)); } catch (e) { console.log("  查询失败，跳过一批:", e.message); continue; }
    for (const p of (d.query && d.query.pages) || []) {
      if (p.missing !== undefined || p.invalid !== undefined) missing.add(p.title);
    }
    process.stdout.write(`\r  已检查 ${Math.min(i + BATCH, titles.length)}/${titles.length}`);
  }
  console.log();

  const bad = list.filter((l) => missing.has(titleOf(l)));
  console.log(`\n不存在的目标页面 ${missing.size} 个，涉及 ${bad.length} 条 linkable：`);
  bad.slice(0, 30).forEach((l) => console.log(`  [${l.kind}] ${l.name}`));
  if (bad.length > 30) console.log(`  … 其余 ${bad.length - 30} 条略`);

  if (process.argv.includes("--apply") && bad.length) {
    const keep = list.filter((l) => !missing.has(titleOf(l)));
    const out = "window.X2.linkables=" + JSON.stringify(keep) + ";";
    fs.writeFileSync(INDEX_JS, src.replace(match, out), "utf8");
    console.log(`\n已剔除 ${bad.length} 条，linkables ${list.length} → ${keep.length}`);
  }
  fs.writeFileSync(path.join(WS, ".extract", "wiki_missing.json"), JSON.stringify([...missing], null, 1), "utf8");
}

main().catch((e) => { console.error("失败：", e.message); process.exit(1); });
