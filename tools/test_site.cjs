/* 用 jsdom 对站点做真实 DOM 冒烟测试：路由渲染、支线浮窗、搜索、图鉴、图片路径 */
const fs = require("fs");
const path = require("path");
const WS = "C:\\Users\\ZhuanZ\\Documents\\deepseek-harness\\default-workspace";
const SITE = path.join(WS, "site");
const { JSDOM } = require(path.join(WS, ".npm", "node_modules", "jsdom"));

const html = fs.readFileSync(path.join(SITE, "index.html"), "utf8").replace(/<script[^>]*><\/script>/g, "");
const dom = new JSDOM(html, { url: "http://127.0.0.1:8899/index.html#/home", pretendToBeVisual: true });
const { window } = dom;
const { document } = window;

global.window = window;
global.document = document;

const results = [];
function ok(name, cond, extra) {
  results.push({ name, pass: !!cond, extra: extra || "" });
}

// 注入数据与脚本（顺序与 index.html 一致）
const jsFiles = ["data/index.js", "data/quests.js", "data/chapters.js", "data/systems.js", "data/codex.js", "data/extras.js", "data/mag.js", "assets/app.js"];
for (const f of jsFiles) {
  const code = fs.readFileSync(path.join(SITE, f), "utf8");
  try {
    // 在 window 作用域内执行，并把 location 显式传进去（jsdom 的 window.eval 作用域差异）
    const mm = (window.matchMedia && window.matchMedia.bind(window)) || function () { return { matches: false, addListener() {}, removeListener() {} }; };
    const fn = new Function("window", "document", "location", "localStorage", "navigator", "matchMedia", code);
    fn(window, document, window.location, window.localStorage, window.navigator, mm);
  } catch (e) {
    ok("加载 " + f, false, e.message);
  }
}
ok("加载全部脚本无异常", true);

const X2 = window.X2 || {};
ok("数据：章节 10 章", (X2.chapters || []).length === 10, "得到 " + (X2.chapters || []).length);
ok("数据：任务 166 条", (X2.quests || []).length === 166, "得到 " + (X2.quests || []).length);
ok("数据：系统 10 篇", (X2.systems || []).length === 10, "得到 " + (X2.systems || []).length);
ok("数据：DLC 任务已标记", (X2.quests || []).filter((q) => q.dlc).length === 7, "得到 " + (X2.quests || []).filter((q) => q.dlc).length);
ok("数据：原刊 68 页", (X2.mag || []).length === 68, "得到 " + (X2.mag || []).length);
ok("数据：图鉴分类", Object.keys(X2.codex || {}).length === 6, Object.keys(X2.codex || {}).join(","));

const view = document.getElementById("view");
ok("首页已渲染", view.innerHTML.indexOf("异度之刃2 完整攻略站") > -1);
ok("导航已生成", document.querySelectorAll(".nav-link").length >= 9, document.querySelectorAll(".nav-link").length + " 个");

// 路由遍历
const routes = [
  ["#/story", "主线流程"],
  ["#/story/ch3", "第三章"],
  ["#/quests", "任务库"],
  ["#/systems", "系统与养成"],
  ["#/systems/battle", "连锁攻击"],
  ["#/codex", "图鉴"],
  ["#/maps", "地图与收集"],
  ["#/compare", "攻略差异对照"],
  ["#/mag", "原刊对照"],
  ["#/mag/vol1-005", "第 5 页"],
  ["#/about", "资料来源"],
];
for (const [hash, needle] of routes) {
  window.location.hash = hash;
  window.dispatchEvent(new window.Event("hashchange"));
  const h = view.innerHTML;
  ok("路由 " + hash, h.indexOf(needle) > -1, h.length + " 字符");
}

// 支线浮窗
window.location.hash = "#/story/ch3";
window.dispatchEvent(new window.Event("hashchange"));
const qlinks = view.querySelectorAll("[data-quest]");
ok("第三章存在可点击支线", qlinks.length > 0, qlinks.length + " 个");
if (qlinks.length) {
  const name = qlinks[0].getAttribute("data-quest");
  qlinks[0].dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  const modal = document.getElementById("modal");
  const body = document.getElementById("modalBody");
  ok("浮窗已打开", modal.hidden === false);
  ok("浮窗标题是任务名", body.innerHTML.indexOf(name) > -1, name);
  ok("浮窗有关闭按钮", !!document.getElementById("modalClose"));
  ok("浮窗内容含分区", /任务流程|基本信息|攻略备注|解锁条件/.test(body.innerHTML));
  document.getElementById("modalClose").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  ok("浮窗可关闭", modal.hidden === true);
}

// 搜索
document.getElementById("searchBtn").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
const si = document.getElementById("searchInput");
ok("搜索面板打开", document.getElementById("searchPanel").hidden === false);
si.value = "捉迷藏";
si.dispatchEvent(new window.Event("input", { bubbles: true }));
const sr = document.getElementById("searchResults");
ok("搜索有结果", sr.querySelectorAll(".sr-hit").length > 0, sr.querySelectorAll(".sr-hit").length + " 条");

// 图鉴分类切换
window.location.hash = "#/codex?cat=blade";
window.dispatchEvent(new window.Event("hashchange"));
ok("图鉴异刃列表渲染", view.querySelectorAll(".dex").length > 50, view.querySelectorAll(".dex").length + " 项");
const bladeLinks = Array.from(view.querySelectorAll(".dex")).slice(0, 5).map((a) => a.getAttribute("href"));
ok("图鉴条目外链 wiki", bladeLinks.every((u) => u && u.indexOf("xenoblade2.cn") > -1), bladeLinks.join(" "));

// 名词外链：原刊 OCR 与任务流程里的异刃/道具/地标应渲染成 wiki 外链
window.location.hash = "#/mag/vol1-007";
window.dispatchEvent(new window.Event("hashchange"));
let magLinks = view.querySelectorAll("a.qlink");
ok("原刊 OCR 渲染出名词外链", magLinks.length > 0, magLinks.length + " 个");
if (magLinks.length) {
  const href = magLinks[0].getAttribute("href");
  ok("名词外链指向 wiki", href && href.indexOf("xenoblade2.cn") > -1, href);
  ok("名词外链新窗口打开", magLinks[0].getAttribute("target") === "_blank");
}
window.location.hash = "#/quests";
window.dispatchEvent(new window.Event("hashchange"));
const qlink0 = view.querySelector("[data-quest]");
if (qlink0) {
  qlink0.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  const mb = document.getElementById("modalBody");
  ok("任务浮窗内有名词外链", mb.querySelectorAll('a[href*="xenoblade2.cn"]').length > 0,
     mb.querySelectorAll('a[href*="xenoblade2.cn"]').length + " 个");
  document.getElementById("modalClose").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
}

// 资源文件存在性检查
function checkSrcs() {
  const missing = [];
  const seen = new Set();
  for (const c of X2.chapters || []) {
    for (const im of c.images || []) {
      const p = path.join(SITE, im.src);
      if (!seen.has(p)) { seen.add(p); if (!fs.existsSync(p)) missing.push(im.src); }
    }
  }
  for (const p of X2.mag || []) {
    const fp = path.join(SITE, p.img);
    if (!fs.existsSync(fp)) missing.push(p.img);
  }
  return missing;
}
const missing = checkSrcs();
ok("引用的图片全部存在", missing.length === 0, missing.slice(0, 5).join(", "));

// 浮窗里的任务链接可点（wiki 外链）
window.location.hash = "#/story/ch3";
window.dispatchEvent(new window.Event("hashchange"));
const storyLinks = view.querySelectorAll('a.qlink[target="_blank"]');
ok("章节正文里的名词外链新窗口打开", storyLinks.length > 0, storyLinks.length + " 个");

let pass = 0, fail = 0;
for (const r of results) {
  if (r.pass) { pass++; console.log("  PASS  " + r.name); }
  else { fail++; console.log("  FAIL  " + r.name + (r.extra ? "   << " + r.extra : "")); }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
