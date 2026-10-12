/* 校验站内所有链接与资源引用 */
const fs = require("fs");
const path = require("path");
const WS = "C:\\Users\\ZhuanZ\\Documents\\deepseek-harness\\default-workspace";
const SITE = path.join(WS, "site");

let fail = 0;
function bad(msg) { console.log("  FAIL " + msg); fail++; }

// 1. index.html 引用的脚本 / 样式是否存在
const html = fs.readFileSync(path.join(SITE, "index.html"), "utf8");
for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
  const p = m[1];
  if (/^(https?:|data:|#)/.test(p)) continue;
  if (!fs.existsSync(path.join(SITE, p))) bad("index.html 引用缺失: " + p);
}

// 2. 数据文件里的 hash 路由是否合法
const modules = ["home", "story", "quests", "systems", "codex", "maps", "mag", "compare", "about"];
const chapterIds = new Set();
const systemIds = new Set();
const files = ["data/index.js", "data/quests.js", "data/chapters.js", "data/systems.js", "data/codex.js", "data/extras.js", "data/mag.js"];
const sandbox = { window: {} };
for (const f of files) {
  const code = fs.readFileSync(path.join(SITE, f), "utf8");
  new Function("window", code)(sandbox.window);
}
const X2 = sandbox.window.X2;
(X2.chapters || []).forEach((c) => chapterIds.add(c.id));
(X2.systems || []).forEach((s) => systemIds.add(s.id));
const questNames = new Set((X2.quests || []).map((q) => q.name));

let hashCount = 0;
for (const f of files) {
  const code = fs.readFileSync(path.join(SITE, f), "utf8");
  for (const m of code.matchAll(/"#\/([^"\\]+)"/g)) {
    const route = m[1].split("?")[0].split("/").filter(Boolean);
    hashCount++;
    if (!modules.includes(route[0])) { bad(f + " 未知路由 #/" + m[1]); continue; }
    if (route[0] === "story" && route[1] && !chapterIds.has(route[1])) bad(f + " 未知章节 " + route[1]);
    if (route[0] === "systems" && route[1] && !systemIds.has(route[1])) bad(f + " 未知系统页 " + route[1]);
    if (route[0] === "mag" && route[1]) {
      const ids = new Set((X2.mag || []).map((p) => p.id));
      if (!ids.has(route[1])) bad(f + " 未知原刊页 " + route[1]);
    }
  }
}
console.log(`  检查 ${hashCount} 条 hash 链接`);

// 3. 所有 [[任务:名称]] 标注是否有对应任务条目
let linkCount = 0, missing = new Set();
for (const f of ["data/chapters.js", "data/systems.js"]) {
  const code = fs.readFileSync(path.join(SITE, f), "utf8");
  for (const m of code.matchAll(/\[\[任务:([^\]|]+)/g)) {
    linkCount++;
    if (!questNames.has(m[1])) missing.add(m[1]);
  }
}
console.log(`  检查 ${linkCount} 处任务名链接`);
if (missing.size) bad("任务链接没有对应条目: " + Array.from(missing).slice(0, 12).join("、"));

// 4. data-name 里的任务名是否都在库里（章节 quests 数组）
let qref = 0;
for (const c of X2.chapters || []) {
  for (const n of c.quests || []) {
    qref++;
    if (!questNames.has(n)) bad(`章节 ${c.id} 引用了不存在的任务「${n}」`);
  }
}
console.log(`  检查 ${qref} 个章节支线引用`);

// 5. 站点体积
function dirSize(d) {
  let s = 0;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    s += e.isDirectory() ? dirSize(p) : fs.statSync(p).size;
  }
  return s;
}
const total = dirSize(SITE);
const mag = dirSize(path.join(SITE, "assets", "mag"));
console.log(`  站点总体积 ${(total / 1048576).toFixed(1)} MB（其中原刊图片 ${(mag / 1048576).toFixed(1)} MB）`);

console.log(fail ? `\n${fail} 项问题` : "\n链接与资源检查全部通过");
process.exitCode = fail ? 1 : 0;
