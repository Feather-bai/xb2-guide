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
const jsFiles = ["data/index.js", "data/quests.js", "data/chapters.js", "data/systems.js", "data/codex.js", "data/extras.js", "data/mag.js", "data/maps.js", "assets/map.js", "assets/app.js"];
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

// 遍历全部章节：要点等结构化内容不能被渲染成 [object Object]
let objLeak = 0, keypointTitles = 0, emptyNotes = 0;
for (const c of X2.chapters || []) {
  window.location.hash = "#/story/" + c.id;
  window.dispatchEvent(new window.Event("hashchange"));
  const html = view.innerHTML;
  const n = (html.match(/\[object Object\]/g) || []).length;
  if (n) { objLeak += n; console.log("   章节 " + c.id + " 出现 [object Object] ×" + n); }
  // 最后一个 .note.note-h 之后不应立刻是空内容
  const empty = html.match(/<span class="note-h">[^<]*<\/span>\s*<\/div>/g);
  if (empty) emptyNotes += empty.length;
  if (!c.steps || !c.steps.length) continue;
}
for (const c of X2.chapters || []) {
  window.location.hash = "#/story/" + c.id;
  window.dispatchEvent(new window.Event("hashchange"));
  if ((c.keypoints || []).length) keypointTitles += view.querySelectorAll(".note-h").length;
}
ok("所有章节都没有 [object Object]", objLeak === 0, objLeak + " 处");
ok("章节要点渲染出标题", keypointTitles > 0, keypointTitles + " 个标题");
ok("要点/备注没有空内容", emptyNotes === 0, emptyNotes + " 处");

// 互动地图：章节页应挂上地图卡片（含区域 / 地图 / 标记类型切换与搜索）
ok("地图数据：90 张地图", ((X2.mapsData || {}).maps || []).length === 90, "得到 " + (((X2.mapsData || {}).maps) || []).length);
ok("地图数据：区域索引", Object.keys((X2.mapsData || {}).areas || {}).length >= 15,
   Object.keys((X2.mapsData || {}).areas || {}).length + " 个区域");
const mapMarkers = ((X2.mapsData || {}).maps || []).reduce(
  (n, m) => n + ["tbox", "colle", "salvage", "enemy", "npc"].reduce((a, k) => a + (m[k] || []).length, 0), 0);
ok("地图数据：标记点数量", mapMarkers > 8000, mapMarkers + " 个");
const layerTotals = ["tbox", "colle", "salvage", "enemy", "npc"].map(
  (k) => k + ":" + ((X2.mapsData || {}).maps || []).reduce((n, m) => n + (m[k] || []).length, 0));
ok("地图数据：五个图层齐全", ["tbox", "colle", "salvage", "enemy", "npc"].every(
  (k) => ((X2.mapsData || {}).maps || []).reduce((n, m) => n + (m[k] || []).length, 0) > 0), layerTotals.join(" "));
window.location.hash = "#/story/ch2";
window.dispatchEvent(new window.Event("hashchange"));
const mapHost = view.querySelector("[data-map-host]");
ok("章节页有地图挂载点", !!mapHost);
if (mapHost) {
  ok("地图卡片已渲染", !!mapHost.querySelector(".mapcard"));
  ok("地图区域切换按钮", mapHost.querySelectorAll(".map-areas .chip").length > 0,
     mapHost.querySelectorAll(".map-areas .chip").length + " 个区域");
  ok("地图切换按钮", mapHost.querySelectorAll(".map-maps .chip").length > 0,
     mapHost.querySelectorAll(".map-maps .chip").length + " 张地图");
  const typeLabels = Array.prototype.map.call(mapHost.querySelectorAll(".map-types .map-type"), (c) => c.textContent.trim());
  ok("标记类型筛选按钮（5 个图层）", typeLabels.length === 5, typeLabels.join(" / "));
  ok("默认只开宝箱 / 采集点 / 打捞点", mapHost.querySelectorAll(".map-types .map-type.on").length === 3);
  ok("标记搜索框", !!mapHost.querySelector(".map-search"));
  ok("地图状态行显示标记数", /显示\s*\d+/.test(mapHost.querySelector(".map-status").textContent),
     (mapHost.querySelector(".map-status").textContent || "").slice(0, 60));
  // 第二章应识别出古拉等区域
  const areaNames = Array.prototype.map.call(mapHost.querySelectorAll(".map-areas .chip"), (c) => c.textContent.trim());
  ok("第二章识别出古拉区域", areaNames.join(" ").indexOf("古拉") > -1, areaNames.join(" / ").slice(0, 80));
  // 标记点坐标不能左右镜像：lng 必须与 PosX 正相关（wiki/app 都是 (PosX-LowerX)/W 方向）
  const ML = window.X2Map && window.X2Map.markerLatLng;
  ok("导出了 markerLatLng", !!ML);
  if (ML) {
    const m0 = (X2.mapsData.maps || []).find((m) => m.colle.length > 3) || (X2.mapsData.maps || [])[0];
    const pts = m0.colle;
    const xs = pts.map((p) => p.x), lngs = pts.map((p) => ML(m0, p)[1]);
    const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
    const mx = mean(xs), ml = mean(lngs);
    let num = 0, dx = 0, dl = 0;
    for (let i = 0; i < xs.length; i++) { num += (xs[i] - mx) * (lngs[i] - ml); dx += (xs[i] - mx) ** 2; dl += (lngs[i] - ml) ** 2; }
    const corr = num / Math.sqrt(dx * dl);
    ok("标记点 X 方向未镜像（lng 与 PosX 正相关）", corr > 0.9, "corr=" + corr.toFixed(3) + "（镜像时会 <0）");
  }
}

// 数据里不应该再把 <b> 之类的标记当成正文显示出来
window.location.hash = "#/systems/build";
window.dispatchEvent(new window.Event("hashchange"));
const buildHtml = view.innerHTML;
ok("正文里没有裸露的 <b> 标记", buildHtml.indexOf("&lt;b&gt;") === -1 && !/<\/?b>/.test(buildHtml.replace(/<strong>|<\/strong>/g, "")));
ok("重点渲染成 <strong>", view.querySelectorAll("strong").length > 0, view.querySelectorAll("strong").length + " 处");

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
