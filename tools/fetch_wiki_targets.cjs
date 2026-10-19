// 生成「wiki 上确实存在」的名词链接白名单，供 build_index.py / rebuild 时过滤。
//
// 背景：站点里有些名词（采集点类型、系统术语、部分饰品名）在 wiki 上没有独立页面，
// 点过去只会看到「此页面目前没有内容 / 您没有权限创建此页面」。这里先用 MediaWiki
// API 的 missing 字段核对，把不存在的目标记进 site/data/wiki_targets.json，
// 构建与运行时据此跳过外链。
//
// 用法：node tools/fetch_wiki_targets.cjs [--apply]
//   --apply  同时把它从 site/data/index.js 的 linkables 里剔除（立即生效）
const fs = require("fs");
const path = require("path");
const https = require("https");

const WS = path.join(__dirname, "..");
const SITE = path.join(WS, "site");
const INDEX_JS = path.join(SITE, "data", "index.js");
const OUT = path.join(SITE, "data", "wiki_targets.json");
const API = "https://xenoblade2.cn/api.php";
const UA = { "User-Agent": "Mozilla/5.0 (compatible; guide-archiver/1.0)" };

function get(url) {
  return new Promise((res, rej) => {
    https.get(url, { headers: UA }, (r) => {
      let b = ""; r.on("data", (d) => (b += d)); r.on("end", () => res(b));
    }).on("error", rej);
  });
}
const titleOf = (url) => {
  if (!url) return "";
  try { return decodeURIComponent(url.replace(/^https?:\/\/xenoblade2\.cn\//, "")).replace(/_/g, " "); }
  catch (e) { return ""; }
};

/* 从 index.js 里定位 linkables 数组（同文件里可能有多处 window.X2.*= ） */
function findLinkables(src) {
  const tag = "window.X2.linkables=";
  const start = src.indexOf(tag);
  if (start < 0) throw new Error("index.js 里找不到 window.X2.linkables");
  let i = start + tag.length;
  if (src[i] !== "[") throw new Error("linkables 不是数组");
  let depth = 0, inStr = false, esc = false;
  for (let k = i; k < src.length; k++) {
    const c = src[k];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === "[") depth++;
    else if (c === "]") {
      depth--;
      if (depth === 0) return { start, end: k + 1, text: src.slice(i, k + 1) };
    }
  }
  throw new Error("linkables 数组没有闭合");
}

async function main() {
  const src = fs.readFileSync(INDEX_JS, "utf8");
  const found = findLinkables(src);
  const list = JSON.parse(found.text);
  const titles = [...new Set(list.map((l) => titleOf(l.url)).filter(Boolean))];

  const missing = new Set();
  const BATCH = 40;
  for (let i = 0; i < titles.length; i += BATCH) {
    const url = API + "?action=query&format=json&formatversion=2&prop=info&titles=" +
      encodeURIComponent(titles.slice(i, i + BATCH).join("|"));
    let d;
    try { d = JSON.parse(await get(url)); } catch (e) { continue; }
    for (const p of (d.query && d.query.pages) || []) {
      if (p.missing !== undefined || p.invalid !== undefined) missing.add(p.title);
    }
    process.stdout.write(`\r  已检查 ${Math.min(i + BATCH, titles.length)}/${titles.length}`);
  }
  console.log();

  // 白名单：只保留可确认存在的标题
  const ok = titles.filter((t) => !missing.has(t)).sort();
  fs.writeFileSync(OUT, JSON.stringify({ checkedAt: new Date().toISOString().slice(0, 10), exists: ok }, null, 0), "utf8");
  console.log(`wiki 目标核验：存在 ${ok.length} / 检查 ${titles.length}，缺失 ${missing.size}`);
  console.log(`白名单已写入 site/data/wiki_targets.json`);

  if (process.argv.includes("--apply")) {
    const keep = list.filter((l) => !missing.has(titleOf(l.url)));
    const out = src.slice(0, found.start) + "window.X2.linkables=" + JSON.stringify(keep) + src.slice(found.end);
    fs.writeFileSync(INDEX_JS, out, "utf8");
    console.log(`已从 index.js 剔除 ${list.length - keep.length} 条死链，剩余 ${keep.length}`);
  }
}
main().catch((e) => { console.error("失败：", e.message); process.exit(1); });
