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
const jsFiles = ["data/index.js", "data/quests.js", "data/questflows.js", "data/chapters.js", "data/systems.js", "data/codex.js", "data/extras.js", "data/mag.js", "data/maps.js", "assets/map.js", "assets/app.js"];
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
// 图鉴分类切换：#/codex?cat=xxx 必须真的生效（路由曾把 parts 当 params 传进来）
window.location.hash = "#/codex?cat=auxcore";
window.dispatchEvent(new window.Event("hashchange"));
const auxDex = view.querySelectorAll(".dex").length;
const auxActive = (view.querySelector("[data-codex].blue") || {}).getAttribute
  ? view.querySelector("[data-codex].blue").getAttribute("data-codex") : "";
ok("图鉴可切到辅助核心", auxDex === 35 && auxActive === "auxcore", auxDex + " 项 / 当前 " + auxActive);
window.location.hash = "#/codex?cat=accessory";
window.dispatchEvent(new window.Event("hashchange"));
ok("图鉴可切到饰品", view.querySelectorAll(".dex").length === 33, view.querySelectorAll(".dex").length + " 项");
// 稀有异刃页不应重复承载牵绊圆环内容（改为外链引导）
window.location.hash = "#/codex?cat=blade";
window.dispatchEvent(new window.Event("hashchange"));
const ringEntries = Array.from(view.querySelectorAll("#dexgrid .dex-nm")).filter((n) => /牵绊圆环/.test(n.textContent));
ok("稀有异刃页不含牵绊圆环条目", ringEntries.length === 0, ringEntries.length + " 条");
ok("稀有异刃条目提供圆环外链引导", view.querySelectorAll("#dexgrid .dex-ring").length > 40);
ok("稀有异刃页有圆环说明", !!view.querySelector(".codex-note"));

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

// 章节徽标：卡片左上角的图标应是紧凑数字，而不是「第一章」这类长文本
window.location.hash = "#/story";
window.dispatchEvent(new window.Event("hashchange"));
const badgeTexts = Array.prototype.map.call(view.querySelectorAll(".chapter-card .cc-badge"), (b) => b.textContent.trim());
ok("章节列表徽标数量正确", badgeTexts.length === 10, badgeTexts.length + " 个");
ok("章节徽标是紧凑数字", badgeTexts.slice(0, 9).join(",") === "1,2,3,4,5,6,7,8,9", badgeTexts.slice(0, 9).join(","));
ok("最终章徽标是「终」", badgeTexts[9] === "终", String(badgeTexts[9]));
ok("徽标里没有长文本", badgeTexts.every((t) => t.length <= 2), badgeTexts.join(" "));
ok("章节徽标都带配色类", Array.prototype.every.call(view.querySelectorAll(".chapter-card .cc-badge"),
   (b) => (b.className.match(/cc-bg[1-8]/) || []).length > 0));
window.location.hash = "#/home";
window.dispatchEvent(new window.Event("hashchange"));
const homeBadges = Array.prototype.map.call(view.querySelectorAll(".chapter-card .cc-badge"), (b) => b.textContent.trim());
ok("首页章节卡也用小徽标", homeBadges.length >= 6 && homeBadges.every((t) => t.length <= 2), homeBadges.join(" "));
// 模块导航的图标必须和章节徽标同一套样式（同一个 class + 配色）
const modBadges = Array.prototype.filter.call(view.querySelectorAll(".chapter-card .cc-badge"),
  (b) => (b.className.match(/cc-bg[1-8]/) || []).length > 0);
ok("首页所有卡片徽标统一带配色", modBadges.length === view.querySelectorAll(".chapter-card .cc-badge").length,
   modBadges.length + " / " + view.querySelectorAll(".chapter-card .cc-badge").length);
ok("模块图标与章节徽标同款 class", Array.prototype.every.call(view.querySelectorAll(".chapter-card .cc-badge"),
   (b) => b.classList.contains("cc-num") && b.classList.contains("cc-badge")));
window.location.hash = "#/systems";
window.dispatchEvent(new window.Event("hashchange"));
const sysBadges = Array.prototype.map.call(view.querySelectorAll(".chapter-card .cc-badge"), (b) => b.textContent.trim());
ok("系统页徽标同样带配色", sysBadges.length > 0 && Array.prototype.every.call(
   view.querySelectorAll(".chapter-card .cc-badge"), (b) => (b.className.match(/cc-bg[1-8]/) || []).length > 0),
   sysBadges.join(" "));
window.location.hash = "#/story/ch3";
window.dispatchEvent(new window.Event("hashchange"));
const barNums = Array.prototype.map.call(view.querySelectorAll(".chapterbar .cb-num"), (b) => b.textContent.trim());
ok("章节切换条带小序号", barNums.length === 10 && barNums[0] === "1", barNums.join(" "));

// 互动地图：章节页应挂上地图卡片（含区域 / 地图 / 标记类型切换与搜索）
ok("地图数据：90 张地图", ((X2.mapsData || {}).maps || []).length === 90, "得到 " + (((X2.mapsData || {}).maps) || []).length);
ok("地图数据：区域索引", Object.keys((X2.mapsData || {}).areas || {}).length >= 15,
   Object.keys((X2.mapsData || {}).areas || {}).length + " 个区域");
const mapMarkers = ((X2.mapsData || {}).maps || []).reduce(
  (n, m) => n + ["tbox", "colle", "salvage", "enemy", "npc", "quest"].reduce((a, k) => a + (m[k] || []).length, 0), 0);
ok("地图数据：标记点数量", mapMarkers > 8000, mapMarkers + " 个");
const layerTotals = ["tbox", "colle", "salvage", "enemy", "npc", "quest"].map(
  (k) => k + ":" + ((X2.mapsData || {}).maps || []).reduce((n, m) => n + (m[k] || []).length, 0));
ok("地图数据：六个图层齐全", ["tbox", "colle", "salvage", "enemy", "npc", "quest"].every(
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
  ok("标记类型筛选按钮（6 个图层）", typeLabels.length === 6, typeLabels.join(" / "));
  ok("默认开着宝箱 / 采集点 / 打捞点 / 任务接取点", mapHost.querySelectorAll(".map-types .map-type.on").length === 4);
  // 任务接取点图层 + 索引
  const questPts = ((X2.mapsData || {}).maps || []).reduce((n, m) => n + (m.quest || []).length, 0);
  ok("地图数据：任务接取点", questPts > 100, questPts + " 个接取点");
  ok("地图数据：任务反向索引", Object.keys((X2.mapsData || {}).questIndex || {}).length > 100,
     Object.keys((X2.mapsData || {}).questIndex || {}).length + " 个任务");
  // 一个道具可在多处获取时，locateTargets 应返回多条
  const multi = Object.keys((X2.mapsData || {}).itemIndex || {}).find(
    (n) => X2.mapsData.itemIndex[n].length > 1);
  ok("道具可定位到多个位置", !!multi && window.X2Map.locateTargets("item", multi).length > 1,
     multi + " → " + (multi ? window.X2Map.locateTargets("item", multi).length : 0) + " 处");
  ok("导出了 locateTargets / openPicker", !!(window.X2Map.locateTargets && window.X2Map.openPicker));
  // 任务接取点要带解锁章节，地图上才能按当前章节过滤
  const qpts = ((X2.mapsData || {}).maps || []).reduce((a, m) => a.concat(m.quest || []), []);
  ok("任务接取点带章节标记", qpts.length > 0 && qpts.every((p) => p.c),
     qpts.filter((p) => p.c).length + "/" + qpts.length);
  ok("多位置时给出可区分的位置列表（含地区/分组名）",
     (window.X2Map.locateTargets("item", Object.keys((X2.mapsData || {}).itemIndex || {})[0]) || [])
       .every((t) => t.label && t.label.length > 2));
  ok("地图搜索框（可搜道具/NPC/任务）", !!mapHost.querySelector(".map-search") && !!mapHost.querySelector(".map-hits"));
  // 地图不能盖住页面浮层：Leaflet 内部 z-index 高达 1000，靠 .map-canvas 自成层叠上下文来隔离。
  // jsdom 不加载外部样式表，所以直接检查 CSS 源码。
  const cssSrc = fs.readFileSync(path.join(SITE, "assets/style.css"), "utf8");
  const canvasRule = (cssSrc.match(/\.map-canvas\{[^}]*\}/) || [""])[0];
  ok("地图画布自成层叠上下文（不压住浮窗）", /z-index\s*:\s*0/.test(canvasRule), canvasRule.slice(0, 90));
  // 拖动地图时要停掉标记悬停，否则滑过一堆标记会攒下一堆悬停标签
  ok("拖动时禁用标记悬停（CSS）", /\.map-canvas\.x2-dragging[^{]*\{[^}]*pointer-events\s*:\s*none/.test(cssSrc.replace(/\s*\n\s*/g, "")));
  const mapSrc = fs.readFileSync(path.join(SITE, "assets/map.js"), "utf8");
  ok("绑定了 dragstart / dragend 清理悬停标签", /on\("dragstart"/.test(mapSrc) && /on\("dragend"/.test(mapSrc));
  // 互动地图深链：NPC / 道具 反向索引与接口
  ok("地图数据：NPC 反向索引", Object.keys((X2.mapsData || {}).npcIndex || {}).length > 100,
     Object.keys((X2.mapsData || {}).npcIndex || {}).length + " 个 NPC 名");
  ok("地图数据：道具反向索引", Object.keys((X2.mapsData || {}).itemIndex || {}).length > 100,
     Object.keys((X2.mapsData || {}).itemIndex || {}).length + " 个道具名");
  ok("导出了 focusMapTarget / chapterMaps", !!(window.X2Map && window.X2Map.focusMapTarget && window.X2Map.chapterMaps));
  // 敌人也要能搜 / 能深链
  ok("地图数据：敌人反向索引", Object.keys((X2.mapsData || {}).enemyIndex || {}).length > 500,
     Object.keys((X2.mapsData || {}).enemyIndex || {}).length + " 个敌人名");
  const anyEnemy = Object.keys((X2.mapsData || {}).enemyIndex || {})[0];
  ok("敌人深链能定位到地图", !!anyEnemy && window.X2Map.locateTargets("enemy", anyEnemy).length > 0,
     anyEnemy + " → " + (anyEnemy ? window.X2Map.locateTargets("enemy", anyEnemy).length : 0) + " 处");
  // 自动链接不能把人带去别章的地图：在 ch2 上，「火鸡人」只在阿卡狄亚（别章）有 -> locatableHere 必须为 false
  window.location.hash = "#/story/ch2";
  window.dispatchEvent(new window.Event("hashchange"));
  const hereCh2 = window.X2Map.locateTargets("enemy", "火鸡人");
  ok("跨章的名字本章不自动链接", hereCh2.length > 0 && !hereCh2.some((t) => t.sameChap),
     "火鸡人 → " + hereCh2.map((t) => t.c).join("/") + "（当前 ch2）");
  ok("同一张图在多章出现也算「本章」", (function () {
    // ma05a_c_03 同时出现在 ch1/ch4/ch5，站在 ch4 上应算本章
    window.location.hash = "#/story/ch4";
    window.dispatchEvent(new window.Event("hashchange"));
    var r = window.X2Map.locateTargets("quest", "弄坏起重机的人是谁").some((t) => t.sameChap);
    window.location.hash = "#/story/ch2";     // 还原，后面的断言还要用 ch2 的 mapHost
    window.dispatchEvent(new window.Event("hashchange"));
    return r;
  })());
  // 地图标签不能露出内部 id（如 ma07a_b_floor_01）
  const allLabels = [];
  ["ch1", "ch2", "ch3", "ch4", "ch5", "ch6", "ch7", "ch8", "ch9", "final"].forEach(function (cid) {
    window.location.hash = "#/story/" + cid;
    window.dispatchEvent(new window.Event("hashchange"));
    Array.prototype.forEach.call(document.querySelectorAll(".map-maps .chip"), function (c) {
      allLabels.push(c.textContent.trim());
      // 切到每个区域，才能枚举所有地图
    });
    Array.prototype.forEach.call(document.querySelectorAll(".map-areas .chip"), function (a) {
      a.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
      Array.prototype.forEach.call(document.querySelectorAll(".map-maps .chip"), function (c) {
        allLabels.push(c.textContent.trim());
      });
    });
  });
  window.location.hash = "#/story/ch2";
  window.dispatchEvent(new window.Event("hashchange"));
  const rawLabels = allLabels.filter(function (t) { return /ma\d+a_|floor_|ship_|_f\d|\bdlc3/.test(t); });
  ok("地图标签里没有内部 id 残留", rawLabels.length === 0, rawLabels.slice(0, 5).join(" / "));
  // 本章可接的支线所在地图，必须出现在本章
  ok("第三章能看到第二章地图（跨章支线）", (function () {
    var maps = window.X2Map.chapterMaps({ id: "ch3" });
    return maps.length > 0 && maps.indexOf("ma05a_c_01") > -1;
  })());
  // 只因支线才带入的地图要被单独标出来（界面上标黄）
  ok("能区分「支线带入」的地图", (function () {
    var info = window.X2Map.chapterMapInfo({ id: "ch3" });
    return Object.keys(info.questMaps).length > 0 && info.ids.length > 0;
  })());
  // 本章可接支线：按地图接取点补齐，且套娃任务挂在父任务后面
  ok("本章可接支线由地图接取点生成", (function () {
    var list = window.X2Map.chapterQuests({ id: "ch2" });
    var names = list.map(function (x) { return x.name; });
    var pi = names.indexOf("托里格的起重机破坏事件");
    var kid = list.filter(function (x) { return x.parent === "托里格的起重机破坏事件"; }).length;
    return list.length >= 10 && pi > -1 && kid === 2;   // 父任务下挂 2 个套娃任务
  })());
  // 章节支线与地图任务接取点共用同一份完成状态
  ok("任务完成状态：章节列表与地图接取点同步", (function () {
    var M = window.X2Map;
    if (!M.setQuestDone || !M.isQuestDone) return false;
    var name = "托里格的起重机破坏事件", mid = "ma05a_c_03";
    var pt = (M.MAPS[mid].quest || []).filter(function (q) { return q.t === name; })[0];
    if (!pt) return false;
    M.setQuestDone(name, true);
    var onMap = M.isDone(mid, "quest", pt);          // 地图侧能读到
    M.setDone(mid, "quest", pt, false);              // 地图侧撤销
    var offList = !M.isQuestDone(name);              // 列表侧同步
    return onMap && offList;
  })());
  // 异刃任务的名称框要带紫色标识
  ok("本章支线里异刃任务有独立样式类", (function () {
    window.location.hash = "#/story/ch5";
    window.dispatchEvent(new window.Event("hashchange"));
    var n = document.querySelectorAll(".qflow .chip.qblade").length;
    window.location.hash = "#/story/ch2";
    window.dispatchEvent(new window.Event("hashchange"));
    return n > 0;
  })());
  ok("悬浮地图按钮存在", !!document.getElementById("mapDockBtn") && !!document.getElementById("mapDock"));
  // 官方任务目标（与攻略流程并列可切换）
  const qf = X2.questFlows || {};
  ok("官方任务目标数据", Object.keys(qf).length > 100, Object.keys(qf).length + " 个任务");
  const withOff = (X2.quests || []).find((q) => (q.flow || []).length && qf[q.name]);
  ok("有任务同时具备攻略流程与官方目标", !!withOff, withOff ? withOff.name : "");
  // 任务流程里的 NPC / 可采集道具名应渲染成可点（跳互动地图）的按钮
  // （上面切过章节，mapHost 已是旧节点，这里重新取当前 DOM）
  const mapLinks = view.querySelectorAll(".maplink");
  ok("流程正文里有跳互动地图的名词按钮", mapLinks.length > 0, mapLinks.length + " 个");
  if (mapLinks.length) {
    const b0 = mapLinks[0];
    ok("名词按钮带 data-mk / data-mn", !!b0.getAttribute("data-mk") && !!b0.getAttribute("data-mn"),
       b0.getAttribute("data-mk") + ":" + b0.getAttribute("data-mn"));
  }
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
