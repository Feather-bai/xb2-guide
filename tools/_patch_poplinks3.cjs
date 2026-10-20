const fs = require("fs");
const p = "site/assets/app.js";
let s = fs.readFileSync(p, "utf8");

// 1) 长名列表仍按 ≥3 字；另外建一个「2 字名」正则（只在左侧是非汉字/标点或有空格时匹配，避免误伤）
const old = `      Object.keys(md[k] || {}).forEach(function (n) {
        if (!n || n.length < 3 || out[k === "npcIndex" ? "npc" : "enemy"][n]) return;
        if (out.npc[n] || out.enemy[n]) return;
        out[k === "npcIndex" ? "npc" : "enemy"][n] = 1;
        out.list.push(n);
      });
    });
    out.list.sort(function (a, b) { return b.length - a.length; });
    out.re = out.list.length ? new RegExp("(" + out.list.map(function (n) { return n.replace(/[.*+?^\${}()|[\]\\]/g, "\\$&"); }).join("|") + ")", "g") : null;`;
if (!s.includes(old)) { console.error("pattern 1 missing"); process.exit(1); }
const neu = `      Object.keys(md[k] || {}).forEach(function (n) {
        if (!n || n.length < 2 || out[k === "npcIndex" ? "npc" : "enemy"][n]) return;
        if (out.npc[n] || out.enemy[n]) return;
        out[k === "npcIndex" ? "npc" : "enemy"][n] = 1;
        (n.length >= 3 ? out.list : out.shortList).push(n);
      });
    });
    out.list.sort(function (a, b) { return b.length - a.length; });
    out.shortList.sort(function (a, b) { return b.length - a.length; });
    var escRe2 = function (n) { return n.replace(/[.*+?^\${}()|[\]\\]/g, "\\$&"); };
    out.re = out.list.length ? new RegExp("(" + out.list.map(escRe2).join("|") + ")", "g") : null;
    // 2 字名（如崔娜）只在左边不是汉字时匹配：「制派女子 崔娜那里」→ 命中；「租金」嵌在长句里一般不匹配
    out.reShort = out.shortList.length ? new RegExp("(?<![\u4e00-\u9fff])(" + out.shortList.map(escRe2).join("|") + ")", "g") : null;`;
s = s.replace(old, neu);
s = s.replace('var out = { npc: {}, enemy: {}, list: [] };', 'var out = { npc: {}, enemy: {}, list: [], shortList: [] };');

// 2) popLinks：先处理「任务名」，再处理长名、短名
const old2 = `    var t = esc(raw).split(String.fromCharCode(10)).join("<br>");
    var lc = popLocNames();
    if (lc.re) {`;
if (!s.includes(old2)) { console.error("pattern 2 missing"); process.exit(1); }
const neu2 = `    var t = esc(raw).split(String.fromCharCode(10)).join("<br>");
    // 「任务名」：任务库里有这条任务就做成按钮（人工整理的获取途径里常见这种写法）
    var questsIdx = (function () {
      var idx = {};
      (X2.quests || []).forEach(function (q) { idx[q.name] = 1; });
      return idx;
    })();
    t = t.replace(/「([^」]{2,24})」/g, function (m, name) {
      if (!questsIdx[name]) return m;
      return "「" + '<button type="button" class="qlink" data-quest="' + esc(name) + '" title="打开任务详情">' + esc(name) + "</button>" + "」";
    });
    var lc = popLocNames();
    if (lc.re) {`;
s = s.replace(old2, neu2);

// 短名处理：在长名之后、还原占位符之前插入
const old3 = `    var reTok = new RegExp(PO + "(\\d+)" + PC, "g");`;
if (!s.includes(old3)) { console.error("pattern 3 missing"); process.exit(1); }
const neu3 = `    if (lc.reShort) {
      t = t.replace(lc.reShort, function (name, _g, off, whole) {
        var before = whole.slice(0, off);
        if (before.lastIndexOf("<") > before.lastIndexOf(">")) return name;
        // 已经包在按钮里（前面的标签未闭合）→ 跳过
        if (/<button[^>]*$/.test(before)) return name;
        var kind = lc.npc[name] ? "npc" : "enemy";
        return '<button type="button" class="qlink maplink ' + kind + '" data-dexloc="' + esc(name) + '" data-dexkind="' + kind + '" title="在右侧地图上定位">' + name + "</button>";
      });
    }
    var reTok = new RegExp(PO + "(\\d+)" + PC, "g");`;
s = s.replace(old3, neu3);

fs.writeFileSync(p, s, "utf8");
console.log("patched");
