/* =========================================================================
   异度之刃2 完整攻略站 — 前端应用
   数据来自 window.X2（site/data/index.js 汇总注入）
   ========================================================================= */
(function () {
  "use strict";

  var X2 = window.X2 || { modules: [], chapters: [], quests: [], systems: [], codex: {}, maps: [], compare: [] };
  var WIKI = "https://xenoblade2.cn/";

  /* ---------------------------------------------------------------- 工具 */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function el(html) {
    var t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }
  function wikiUrl(title) {
    return WIKI + encodeURIComponent(String(title).replace(/ /g, "_"));
  }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  /* wiki 上确实存在的页面集合（由 tools/fetch_wiki_targets.cjs 核验生成）。
     集合里存的是**带命名空间前缀**的标题（如「异刃:KOS-MOS Re:」），
     所以按命名空间补全后再查：异刃→异刃:、敌人→敌人:、道具→物品:、其余为裸标题。
     目标不在集合里就不生成外链——否则点了只会看到「此页面目前没有内容」。 */
  var WIKI_EXISTS = null;
  var NS_OF = { blade: "异刃:", enemy: "敌人:", item: "物品:", term: "" };
  function wikiExists(title, kind) {
    if (!window.X2 || !window.X2.wikiExists) return true;   // 没有白名单数据时不过滤（向后兼容）
    if (!WIKI_EXISTS) {
      WIKI_EXISTS = {};
      window.X2.wikiExists.forEach(function (t) { WIKI_EXISTS[t] = 1; });
      // 全量标题（含「花的零件:」「武器:」等其他命名空间），由 tools/fetch_wiki_titles_all.cjs 生成
      (window.X2.wikiTitlesAll || []).forEach(function (t) { WIKI_EXISTS[t] = 1; });
    }
    var t = String(title).replace(/_/g, " ");
    if (WIKI_EXISTS[t]) return true;
    var prefix = NS_OF[kind || "term"];
    return !!(prefix && WIKI_EXISTS[prefix + t]);
  }
  /* 生成 wiki 外链；目标不存在时退化为纯文本 */
  function wikiLink(target, show, kind) {
    if (!wikiExists(target, kind)) return esc(show);
    return '<a class="qlink ' + (kind || "term") + '" href="' + esc(wikiUrl(target)) + '" target="_blank" rel="noopener">' + esc(show) + "</a>";
  }

  /* 把文本里的专有名词替换成可点击的 chip：
     - 支线任务名 -> 打开浮窗（quest）
     - 异刃 / 物品 / 敌人 / 关键词 -> 新窗口跳到 wiki
     语法：[[任务:捉迷藏]] [[异刃:焰|焰]] [[物品:强健腰带]] 之类 */
  var linkIndex = null;
  function getLinkIndex() {
    if (linkIndex) return linkIndex;
    linkIndex = { quest: {}, blade: {}, item: {}, enemy: {}, term: {} };
    (X2.quests || []).forEach(function (q) { linkIndex.quest[q.name] = q; });
    (X2.linkables || []).forEach(function (l) {
      var bucket = linkIndex[l.kind] || linkIndex.term;
      if (!bucket[l.name]) bucket[l.name] = l;
    });
    return linkIndex;
  }

  function renderLinks(text) {
    if (text == null || text === "") return "";
    if (typeof text !== "string") {
      // 结构对象（{text, kind, title}）走 renderable，避免渲染成 [object Object]
      if (typeof text === "object" && typeof text.text === "string") return renderable(text);
      return esc(String(text));
    }
    var out = esc(text);
    // **加粗** 与 [[...]] 先换成占位符，这样后面的「名词自动链接」只会作用在纯文本上，不会破坏标签
    var tokens = [];
    function stash(html) { tokens.push(html); return "" + (tokens.length - 1) + ""; }

    out = out.replace(/\*\*([^*]+)\*\*/g, function (_, t) { return stash("<strong>" + t + "</strong>"); });
    out = out.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, function (_, target, label) {
      var show = label || target.split(":").pop();
      var ns = target.indexOf(":") > -1 ? target.split(":")[0] : "";
      if (ns === "任务") return stash('<button class="qlink" type="button" data-quest="' + esc(show) + '">' + esc(show) + "</button>");
      if (ns === "NPC" && canLocate(show)) return stash(mapLinkHTML(show));
      if ((ns === "敌人" || ns === "珍稀种") && canLocate(show)) return stash(mapLinkHTML(show));
      if (ns === "地标" || ns === "物品" || ns === "饰品" || ns === "辅助核心") {
        var kind = ns === "地标" ? "term" : "item";
        // 能在互动地图上定位的，名字本身做成跳地图的按钮，另附一个 wiki 外链
        if (canLocate(show)) {
          var mini = wikiExists(target, kind)
            ? '<a class="qlink wiki-mini" href="' + esc(wikiUrl(target)) + '" target="_blank" rel="noopener" title="在 wiki 查看">↗</a>'
            : "";
          return stash(mapLinkHTML(show) + mini);
        }
        return stash(wikiLink(target, show, kind));
      }
      var k2 = ns === "异刃" ? "blade" : ns === "敌人" || ns === "珍稀种" ? "enemy" : "term";
      return stash(wikiLink(target, show, k2));
    });
    // 自动识别任务名（「」内优先）
    out = out.replace(/「([^」]{2,24})」/g, function (m, name) {
      if (getLinkIndex().quest[name]) return stash("「" + '<button class="qlink" type="button" data-quest="' + esc(name) + '">' + esc(name) + "</button>" + "」");
      return m;
    });
    // 名词自动链接：任务流程里出现的 NPC / 敌人 / 可采集道具名 -> 跳互动地图对应位置。
    // 两道闸门，避免「错误导向」：
    //   1) 修饰语 + 通用名（「百发百中的火鸡人」而库里只有「火鸡人」）不链；
    //   2) 只链**当前章节地图上真的能找到**的名字——本区域的任务不该把人带去别章的地图。
    var lc = locNames();
    if (lc.re) out = out.replace(lc.re, function (name, _g, off, whole) {
      var prev = off > 0 ? whole.charAt(off - 1) : "";
      if (/[的之]/.test(prev)) return name;      // 前面是修饰语，长名没被收录 -> 不链
      var kind = lc.npcSet[name] ? "npc" : lc.enemySet[name] ? "enemy" : "item";
      if (window.X2Map && window.X2Map.locatableHere && !window.X2Map.locatableHere(kind, name)) return name;
      return stash(mapLinkHTML(name));
    });
    // 还原占位符
    out = out.replace(new RegExp("([0-9]+)", "g"), function (_, i) { return tokens[+i]; });
    return out;
  }

  /* ---- 互动地图深链：NPC / 道具 名 -> 地图上的位置 ---- */
  var locCache = null;
  function escRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  function locNames() {
    if (locCache) return locCache;
    var md = X2.mapsData || {};
    var npc = Object.keys(md.npcIndex || {}).filter(function (n) { return n; });
    var enemy = Object.keys(md.enemyIndex || {}).filter(function (n) { return n; });
    var item = Object.keys(md.itemIndex || {}).filter(function (n) { return n; });
    var npcSet = {}, enemySet = {};
    npc.forEach(function (n) { npcSet[n] = 1; });
    enemy.forEach(function (n) { enemySet[n] = 1; });
    // 自动链接只认 3 字以上的名字：2 字名太容易误伤（如「夏尔」命中「哈达夏尔」、「特奥」命中「特奥斯奥莱」）。
    // 极少数 2 字名可用显式 [[NPC:名]] / [[敌人:名]] / [[物品:名]] 标注。
    var auto = npc.concat(enemy, item).filter(function (n) { return n.length >= 3; });
    auto.sort(function (a, b) { return b.length - a.length; });   // 长名优先，避免短名抢先命中
    locCache = { npcSet: npcSet, enemySet: enemySet, re: auto.length ? new RegExp("(" + auto.map(escRe).join("|") + ")", "g") : null };
    return locCache;
  }
  function canLocate(name) {
    var md = X2.mapsData || {};
    return !!((md.npcIndex || {})[name] || (md.itemIndex || {})[name] || (md.enemyIndex || {})[name]);
  }
  function mapLinkHTML(name) {
    var lc = locNames();
    var kind = lc.npcSet[name] ? "npc" : lc.enemySet[name] ? "enemy" : "item";
    return '<button type="button" class="qlink maplink ' + kind + '" data-mk="' + kind + '" data-mn="' + esc(name) +
      '" title="在互动地图上定位">' + esc(name) + "</button>";
  }

  /* ---------------------------------------------------------------- 浮窗 */
  var modal = $("#modal"), modalBody = $("#modalBody"), lastFocus = null;
  var modalDirty = false;   // 浮窗里改过完成状态，关闭时需要重绘页面

  /* 轻提示（如「地图上找不到该位置」） */
  var toastTimer = null;
  function toast(msg) {
    var t = $("#toast");
    if (!t) return;
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 2600);
  }

  function openModal(node, title) {
    lastFocus = document.activeElement;
    modalBody.innerHTML = "";
    if (typeof node === "string") modalBody.innerHTML = node;
    else modalBody.appendChild(node);
    modal.hidden = false;
    document.body.style.overflow = "hidden";
    modalBody.scrollTop = 0;
    var c = $("#modalClose");
    setTimeout(function () { c && c.focus(); }, 30);
  }
  function closeModal() {
    if (modal.hidden) return;
    var dirty = modalDirty;
    modalDirty = false;
    modal.hidden = true;
    document.body.style.overflow = "";
    modalBody.innerHTML = "";
    if (lastFocus && lastFocus.focus) lastFocus.focus();
    // 浮窗里改过完成状态：关掉后重绘章节页，让「本章可接支线」的圆点同步
    if (dirty) { try { render(); } catch (e) {} }
  }
  document.addEventListener("click", function (e) {
    if (e.target.closest("[data-close]")) { closeModal(); return; }
    var ft = e.target.closest("[data-flow]");
    if (ft) {
      var want = ft.getAttribute("data-flow");
      var sec = ft.closest(".m-sec");
      sec.querySelectorAll(".flowtab").forEach(function (b) { b.classList.toggle("on", b === ft); });
      sec.querySelectorAll(".flowpane").forEach(function (p) { p.hidden = p.getAttribute("data-pane") !== want; });
      return;
    }
    var q = e.target.closest("[data-quest]");
    if (q) { e.preventDefault(); showQuest(q.getAttribute("data-quest")); return; }
    var mk = e.target.closest("[data-mk]");
    if (mk) {
      e.preventDefault();
      closeModal();
      var kind = mk.getAttribute("data-mk"), name = mk.getAttribute("data-mn");
      var M = window.X2Map;
      if (!M || !M.locateTargets) return;
      var targets = M.locateTargets(kind, name);
      if (!targets.length) { toast("互动地图上找不到「" + name + "」的位置"); return; }
      // 有多个位置时先让用户选一个（常见于采集点/打捞点都能拿到的道具）
      if (targets.length > 1) { M.openPicker(name, targets); return; }
      M.focusMapTarget(kind, name, 0);
    }
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      if (!modal.hidden) closeModal();
      else if (!$("#searchPanel").hidden) closeSearch();
      else if (document.body.classList.contains("nav-open")) toggleNav(false);
    }
  });

  /* ------------------------------------------------------ 任务浮窗内容 */
  function questByName(name) {
    var idx = getLinkIndex();
    return idx.quest[name] || null;
  }
  function questModalHTML(q, matched) {
    if (!q) {
      return '<h2>「' + esc(matched || "") + '」</h2><p class="m-sub">任务库中暂无这条任务的收录条目。</p>' +
        '<p class="lede">可尝试在 <a href="' + WIKI + '" target="_blank" rel="noopener">乐园数据管理室 wiki</a> 搜索该名称，' +
        "或在本站任务库中按关键词搜索。</p>";
    }
    var h = [];
    h.push('<h2 class="' + (q.cat === "异刃任务" ? "qm-blade" : "") + '">' + esc(q.name) + "</h2>");
    var sub = [];
    if (q.cat) sub.push('<span class="tag ' + (q.cat === "异刃任务" ? "blade" : q.cat === "主线任务" ? "red" : q.cat === "DLC任务" ? "gold" : "grey") + '">' + esc(q.cat) + "</span>");
    if (q.dlc) sub.push('<span class="tag gold">DLC 限定</span>');
    if (q.id) sub.push('<span class="tag mono">' + esc(q.id) + "</span>");
    if (q.src && q.src.length) sub.push('<span class="srcbadge">来源：' + esc(q.src.join(" / ")) + "</span>");
    h.push('<div class="m-sub">' + sub.join(" ") + "</div>");

    var kv = [];
    if (q.place && q.place.length) kv.push(["地点", q.place.join("・")]);
    if (q.npc) kv.push(["委托人", q.npc]);
    if (q.blade) kv.push(["对应异刃", q.blade]);
    if (q.cond) kv.push(["解锁条件", isBladeQuest(q) ? bladeCondText(q) : q.cond]);
    // 有接取点数据时，给一个直接跳到互动地图的按钮（第 3 个元素 = 已经是 HTML，不要再转义）
    if ((X2.mapsData || {}).questIndex && X2.mapsData.questIndex[q.name])
      kv.push(["接取点", '<button type="button" class="qlink maplink quest" data-mk="quest" data-mn="' + esc(q.name) + '">在互动地图上查看</button>', true]);
    var reward = [];
    if (q.gold) reward.push(esc(q.gold + " G"));
    if (q.exp) reward.push(esc("EXP " + q.exp));
    if (q.sp) reward.push(esc("SP " + q.sp));
    if (q.dev) reward.push(esc("发展度 +" + q.dev + (q.devRegion ? "（" + q.devRegion + "）" : "")));
    if (q.trust) reward.push(esc("信赖度 +" + q.trust));
    // 报酬道具：名字在 linkables（物品）里的做成 wiki 外链；整行已是 HTML，渲染时不再二次处理
    if (q.rewards && q.rewards.length) reward.push(q.rewards.map(function (n) {
      var nm = String(n).replace(/\[\[|\]\]/g, "").replace(/^物品:/, "");
      var hit = getLinkIndex().item[nm];
      return hit ? wikiLink(hit.name, nm, "item") : esc(nm);
    }).join("、"));
    if (reward.length) kv.push(["报酬", reward.join("　"), true]);
    if (kv.length) {
      h.push('<div class="m-sec"><h4>基本信息</h4><dl class="kv">' +
        kv.map(function (r) { return "<dt>" + esc(r[0]) + "</dt><dd>" + (r[2] ? r[1] : renderLinks(r[1])) + "</dd>"; }).join("") + "</dl></div>");
    }
    if (q.flow && q.flow.length) {
      var off = (X2.questFlows || {})[q.name];
      if (off && off.length) {
        h.push('<div class="m-sec"><h4>任务流程 <span class="flowtabs">' +
          '<button type="button" class="flowtab on" data-flow="site">攻略流程</button>' +
          '<button type="button" class="flowtab" data-flow="off">官方目标</button></span></h4>');
        h.push('<ol class="flowpane" data-pane="site">' +
          q.flow.map(function (s) { return "<li>" + renderLinks(s) + "</li>"; }).join("") + "</ol>");
        h.push('<ol class="flowpane" data-pane="off" hidden>' +
          off.map(function (s) {
            return "<li>" + (s.k ? '<span class="flowk">' + esc(s.k) + "</span>" : "") + renderLinks(s.t) +
              (s.d ? '<div class="flowd">' + renderLinks(s.d) + "</div>" : "") + "</li>";
          }).join("") + "</ol>");
        h.push('<p class="flowhint">「攻略流程」整理自攻略本，步骤更细；「官方目标」是游戏内任务界面的原文，两者口径不同，可对照查看。</p></div>');
      } else {
        h.push('<div class="m-sec"><h4>任务流程</h4><ol>' +
          q.flow.map(function (s) { return "<li>" + renderLinks(s) + "</li>"; }).join("") + "</ol></div>");
      }
    }
    if (q.notes && q.notes.length) {
      h.push('<div class="m-sec"><h4>注意事项</h4>' + q.notes.map(function (n) {
        return '<div class="note"><span class="note-h">' + esc(n.title || "备注") + "</span>" + renderLinks(n.text) + "</div>";
      }).join("") + "</div>");
    }
    if (q.tips && q.tips.length) {
      h.push('<div class="m-sec"><h4>攻略备注</h4>' + q.tips.map(function (t) {
        return '<div class="note tip">' + renderLinks(t) + "</div>";
      }).join("") + "</div>");
    }
    if (q.diffs && q.diffs.length) {
      h.push('<div class="m-sec"><h4>各攻略差异</h4>' + q.diffs.map(function (d) {
        return '<div class="note diff"><span class="note-h">' + esc(d.src || "差异") + "</span>" + renderLinks(d.text) + "</div>";
      }).join("") + "</div>");
    }
    var qDone = !!(window.X2Map && window.X2Map.isQuestDone && window.X2Map.isQuestDone(q.name));
    h.push('<div class="modal-foot">' +
      '<button type="button" class="btn qdone-modal' + (qDone ? " done" : "") + '" data-quest-done="' + esc(q.name) + '">' +
        (qDone ? "✓ 已完成（点击撤销）" : "标记为已完成") + "</button>" +
      '<a class="btn" href="' + esc(q.url || WIKI) + '" target="_blank" rel="noopener">在 wiki 查看原页 ↗</a>' +
      '<a class="btn" href="#/quests?q=' + encodeURIComponent(q.name) + '" data-close>在任务库中查看</a></div>');
    return h.join("");
  }
  function showQuest(name) {
    openModal(questModalHTML(questByName(name), name));
  }

  /* ---------------------------------------------------------- 导航构建 */
  var NAV_ICON = { home: "◆", story: "▤", quests: "☰", systems: "⚔", codex: "◈", maps: "◎", compare: "⇄", mag: "▦", about: "ℹ" };

  /* 卡片徽标：章节用紧凑数字（1…9 / 终），模块与系统页用符号，样式与配色完全一致 */
  function chapterBadge(c) {
    if (c.badge) return c.badge;
    var num = String(c.num || "");
    if (num.indexOf("最终") > -1) return "终";
    var m = num.match(/[0-9一二三四五六七八九十]+/);
    return m ? m[0] : num.slice(0, 1);
  }

  function ccIco(opt) {
    return '<span class="cc-num cc-badge' + (opt.color ? " " + opt.color : "") + '">' +
      esc(opt.text || "•") + "</span>";
  }

  function buildNav() {
    var wrap = $("#navList");
    wrap.innerHTML = "";
    var groups = {};
    (X2.modules || []).forEach(function (m) {
      (groups[m.group] = groups[m.group] || []).push(m);
    });
    Object.keys(groups).forEach(function (g) {
      var box = el('<div class="nav-group"><h3>' + esc(g) + '</h3></div>');
      groups[g].forEach(function (m) {
        var a = el('<a class="nav-link" href="#/' + m.id + '"><span class="ico">' + (NAV_ICON[m.id] || "•") +
          '</span><span>' + esc(m.title) + "</span>" + (m.badge ? '<span class="badge">' + esc(m.badge) + "</span>" : "") + "</a>");
        a.dataset.route = m.id;
        box.appendChild(a);
      });
      wrap.appendChild(box);
    });
  }

  /* ------------------------------------------------------------ 首页 */
  function viewHome() {
    var chapters = X2.chapters || [];
    var questCount = (X2.quests || []).length;
    var h = [];
    h.push('<section class="hero"><h1>异度之刃2 完整攻略站</h1>' +
      "<p>把《掌机王Plus 异度神剑2 攻略特辑》上下册、乐园数据管理室 wiki 与玩家实战备注整合成一套连贯攻略：" +
      "流程取各版本最完善的内容，出现分歧的地方统一收进「差异备注」。</p></section>");

    h.push('<div class="grid two">');
    h.push('<div class="card"><h3 style="margin-top:0">开始游戏</h3><p class="lede">新手入门、键位操作、前期最容易踩的坑。</p>' +
      '<div class="rowbtns"><a class="btn primary" href="#/systems/beginner">新手入门</a>' +
      '<a class="btn" href="#/story">主线流程</a></div></div>');
    h.push('<div class="card"><h3 style="margin-top:0">快速查东西</h3><p class="lede">' +
      questCount + ' 条任务的解锁条件、流程与报酬；异刃、道具、珍稀种一键跳 wiki。</p>' +
      '<div class="rowbtns"><a class="btn" href="#/quests">任务库</a>' +
      '<a class="btn" href="#/codex">图鉴</a></div></div>');
    h.push("</div>");

    h.push("<h2>主线流程</h2>");
    h.push('<div class="grid two">');
    chapters.slice(0, 6).forEach(function (c) {
      h.push('<a class="chapter-card" href="#/story/' + esc(c.id) + '">' +
        '<div class="cc-top">' + ccIco({ text: chapterBadge(c), color: c.color }) +
        "<h3>" + esc(c.title) + "</h3></div>" +
        "<p>" + esc(c.summary || "") + "</p></a>");
    });
    h.push("</div>");
    if (chapters.length > 6) {
      h.push('<div class="rowbtns"><a class="btn" href="#/story">查看全部 ' + chapters.length + " 章 →</a></div>");
    }

    h.push("<h2>模块导航</h2><div class=\"grid two\">");
    (X2.modules || []).filter(function (m) { return m.id !== "home"; }).forEach(function (m) {
      // 图标与配色都取自模块数据（配色写死在数据里，避免排序变化导致串色）
      var text = m.id === "story" ? ((X2.chapters || [])[0] ? chapterBadge((X2.chapters || [])[0]) : (m.icon || "▤")) : (m.icon || NAV_ICON[m.id] || "•");
      h.push('<a class="chapter-card" href="#/' + m.id + '"><div class="cc-top">' +
        ccIco({ text: text, color: m.color }) + "<h3>" + esc(m.title) + "</h3></div><p>" + esc(m.desc || "") + "</p></a>");
    });
    h.push("</div>");
    return h.join("");
  }

  /* ---------------------------------------------------------- 主线流程 */
  function viewStoryList() {
    var h = ['<section class="hero"><h1>主线流程</h1><p>按章节整理的完整流程。流程中以<span class="qlink">彩色任务名</span>出现的地方都可以点开浮窗，直接看该支线的接取条件、流程与注意事项。</p></section>'];
    h.push('<div class="grid two">');
    (X2.chapters || []).forEach(function (c) {
      h.push('<a class="chapter-card" href="#/story/' + esc(c.id) + '">' +
        '<div class="cc-top">' + ccIco({ text: chapterBadge(c), color: c.color }) +
        "<h3>" + esc(c.title) + "</h3></div>" +
        "<p>" + esc(c.summary || "") + "</p>" +
        '<div class="chiprow" style="margin-top:7px">' +
        (c.quests && c.quests.length ? '<span class="chip">支线 ' + c.quests.length + "</span>" : "") +
        (c.steps ? '<span class="chip">步骤 ' + c.steps.length + "</span>" : "") +
        "</div></a>");
    });
    h.push("</div>");
    return h.join("");
  }

  function chapterBar(cur) {
    var ch = X2.chapters || [];
    return '<nav class="chapterbar">' + ch.map(function (c) {
      return '<a href="#/story/' + esc(c.id) + '"' + (c.id === cur ? ' class="active"' : "") + ">" +
        '<span class="cb-num">' + esc(chapterBadge(c)) + "</span>" + esc(c.short || c.title) + "</a>";
    }).join("") + "</nav>";
  }

  /* 统一处理「纯文本」或「{text, kind, title} 结构」的条目：
     章节要点与步骤备注都用这个结构，避免对象被当成字符串渲染成 [object Object] */
  function renderable(item, opt) {
    opt = opt || {};
    if (item == null) return "";
    if (typeof item === "string") return renderLinks(item);
    if (typeof item === "object") {
      var kind = item.kind || opt.defaultKind || "";
      return '<div class="note' + (kind ? " " + kind : "") + '"' + (opt.style ? ' style="' + opt.style + '"' : "") + ">" +
        (item.title ? '<span class="note-h">' + esc(item.title) + "</span>" : "") +
        renderLinks(item.text) + "</div>";
    }
    return renderLinks(String(item));
  }

  function viewChapter(id) {
    var ch = (X2.chapters || []).filter(function (c) { return c.id === id; })[0];
    if (!ch) return '<div class="empty">没有找到该章节。</div>';
    var idx = (X2.chapters || []).indexOf(ch);
    var h = [chapterBar(id)];
    h.push('<section class="hero"><h1>' + esc(ch.num) + "　" + esc(ch.title) + "</h1>" +
      (ch.summary ? '<p>' + renderLinks(ch.summary) + "</p>" : "") +
      (ch.place ? '<div class="chiprow" style="margin-top:8px">' + ch.place.map(function (p) {
        return '<span class="chip">◉ ' + esc(p) + "</span>";
      }).join("") + "</div>" : "") + "</section>");

    // 本章可接支线：以地图上的任务接取点为准（比手写列表完整），并把套娃支线挂在父任务下面
    var cq = (window.X2Map && window.X2Map.chapterQuests) ? window.X2Map.chapterQuests(ch) : [];
    if (cq.length) {
      h.push('<div class="card tight"><h3 style="margin:0 0 6px">本章可接支线 <span class="hint-n">' + cq.length +
        ' 条 · 按地图接取点整理；<i class="lg-blade"></i>异刃任务 <i class="lg-side"></i>套娃支线 · 点左侧圆点标记完成</span></h3><div class="chiprow qflow">' +
        cq.map(function (it, i) {
          var blade = it.cat === "异刃任务";
          var done = window.X2Map && window.X2Map.isQuestDone ? window.X2Map.isQuestDone(it.name) : false;
          var cls = "chip qitem" + (it.parent ? " qnested" : "") + (blade ? " qblade" : "") + (done ? " qdone" : "");
          return '<span class="' + cls + '"' +
            ' title="' + esc([it.cat, it.place, it.blade ? "异刃：" + it.blade : "", it.parent ? "套娃：「" + it.parent + "」过程中接取" : ""].filter(Boolean).join(" · ")) + '">' +
            '<button type="button" class="qdone-btn" data-quest-done="' + esc(it.name) + '" title="' +
            (done ? "已完成，点击撤销" : "标记为已完成") + '" aria-pressed="' + (done ? "true" : "false") + '">' +
            (done ? "✓" : "") + "</button>" +
            '<button type="button" class="qitem-name" data-quest="' + esc(it.name) + '">' +
            (it.parent ? '<span class="qn-di">↳</span>' : "") + esc(it.name) +
            (blade && it.blade ? '<span class="qn-blade">' + esc(it.blade) + "</span>" : "") + "</button></span>";
        }).join("") + "</div></div>");
    } else if (ch.quests && ch.quests.length) {
      h.push('<div class="card tight"><h3 style="margin:0 0 6px">本章可接支线</h3><div class="chiprow">' +
        ch.quests.map(function (n) {
          return '<button class="chip" type="button" data-quest="' + esc(n) + '" style="cursor:pointer">' + esc(n) + "</button>";
        }).join("") + "</div></div>");
    }

    if (ch.keypoints && ch.keypoints.length) {
      h.push("<h2>本章要点</h2>" + ch.keypoints.map(function (k) { return renderable(k, { defaultKind: "tip" }); }).join(""));
    }

    // 互动地图：挂在「流程步骤」上方，对照流程查看位置
    h.push('<div class="map-host" data-map-host="' + esc(ch.id) + '"></div>');

    if (ch.steps && ch.steps.length) {
      h.push("<h2>流程步骤</h2><ol class=\"steps\">");
      ch.steps.forEach(function (s) {
        h.push('<li class="step"><p class="step-title">' + renderLinks(s.title) + "</p>" +
          (s.body ? '<div class="step-body">' + renderLinks(s.body) + "</div>" : "") +
          (s.notes && s.notes.length ? s.notes.map(function (n) {
            return renderable(n, { defaultKind: "tip", style: "margin-top:8px" });
          }).join("") : "") + "</li>");
      });
      h.push("</ol>");
    }

    if (ch.diffs && ch.diffs.length) {
      h.push("<h2>各攻略差异备注</h2>");
      ch.diffs.forEach(function (d) {
        h.push('<div class="note diff"><span class="note-h">' + esc(d.src || "差异") + "</span>" + renderLinks(d.text) + "</div>");
      });
    }

    if (ch.images && ch.images.length) {
      h.push("<h2>参考图</h2>");
      ch.images.forEach(function (im) {
        h.push('<figure><img loading="lazy" src="' + esc(im.src) + '" alt="' + esc(im.alt || "") + '" data-zoom>' +
          (im.caption ? "<figcaption>" + esc(im.caption) + "</figcaption>" : "") +
          (im.src_ref ? '<div class="pagemeta">' + esc(im.src_ref) +
            (im.link ? ' · <a href="' + esc(im.link) + '">查看原页 →</a>' : "") + "</div>" : "") + "</figure>");
      });
    }

    var prev = (X2.chapters || [])[idx - 1], next = (X2.chapters || [])[idx + 1];
    h.push('<div class="rowbtns">' +
      (prev ? '<a class="btn" href="#/story/' + esc(prev.id) + '">← ' + esc(prev.num) + "</a>" : "") +
      (next ? '<a class="btn primary" href="#/story/' + esc(next.id) + '">' + esc(next.num) + " →</a>" : "") +
      '<a class="btn" href="#/story">全部章节</a></div>');
    return h.join("");
  }

  /* ------------------------------------------------------------ 任务库 */
  var questFilter = { cat: "全部", key: "" };
  /* 悬浮互动地图：最近浏览的章节（离开章节页后仍显示这一章） */
  var dockChapterId = null;

  /* 异刃任务：解锁条件里必须明示「需先解锁对应异刃」。
     原数据只写了「XX牵绊圆环第N阶段已解锁」，缺了最前面的这层前置。 */
  var BLADE_UNLOCK_PREFIX = "需先解锁对应异刃";
  function bladeCondText(q) {
    var cond = q.cond || "";
    if (!q.blade) return cond;
    if (cond.indexOf(BLADE_UNLOCK_PREFIX) > -1) return cond;
    return BLADE_UNLOCK_PREFIX + "「" + q.blade + "」" + (cond ? "；" + cond : "");
  }
  /* 清理条件文本里给链接用的 [[...]] 标记，用于列表展示 */
  function plainCond(s) {
    return String(s || "").replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, function (_, t, l) {
      return l || t.split(":").pop();
    });
  }
  function isBladeQuest(q) { return q && q.cat === "异刃任务"; }

  function viewQuests(params) {
    if (params && params.q) questFilter.key = params.q;
    var cats = ["全部", "主线任务", "支线任务", "异刃任务", "DLC任务"];
    var list = (X2.quests || []).filter(function (q) {
      if (questFilter.cat === "支线任务") { if (q.cat === "主线任务") return false; }
      else if (questFilter.cat !== "全部" && q.cat !== questFilter.cat) return false;
      if (questFilter.key) {
        var k = questFilter.key.toLowerCase();
        var hay = [q.name, q.id, q.cond, q.npc, q.blade, (q.place || []).join(" ")].join(" ").toLowerCase();
        if (hay.indexOf(k) === -1) return false;
      }
      return true;
    });
    var h = ['<section class="hero"><h1>任务库</h1><p>共 ' + (X2.quests || []).length +
      ' 条任务。主线任务只出现在「主线任务」栏；异刃任务用紫色标出，解锁条件已补上「需先解锁对应异刃」。</p></section>'];
    h.push('<div class="card tight"><div class="chiprow">' + cats.map(function (c) {
      var n = c === "全部" ? (X2.quests || []).length
        : c === "支线任务" ? (X2.quests || []).filter(function (q) { return q.cat !== "主线任务"; }).length
        : (X2.quests || []).filter(function (q) { return q.cat === c; }).length;
      return '<button class="chip' + (questFilter.cat === c ? " blue" : "") + '" type="button" data-qcat="' + esc(c) + '">' +
        esc(c) + " " + n + "</button>";
    }).join("") + "</div>" +
      '<div style="margin-top:9px"><input id="qSearch" type="search" placeholder="按名称 / 条件 / 地点 / 异刃筛选…" value="' + esc(questFilter.key) + '" style="width:100%;background:var(--card-2);border:1px solid var(--line);border-radius:9px;padding:9px 12px;color:var(--fg);font-size:15px"></div></div>');

    h.push('<div class="list">');
    list.slice(0, 400).forEach(function (q) {
      var blade = isBladeQuest(q);
      h.push('<button class="list-item' + (blade ? " is-blade" : "") + '" type="button" data-quest="' + esc(q.name) + '">' +
        '<span class="li-main"><span class="li-name">' + esc(q.name) +
        (blade ? '<span class="tag blade-tag">' + esc(q.blade ? "异刃任务 · " + q.blade : "异刃任务") + "</span>" : "") +
        "</span>" +
        '<span class="li-sub">' + esc([blade ? "异刃任务" : q.cat, (q.place || []).join("・"),
          plainCond(blade ? bladeCondText(q) : q.cond)].filter(Boolean).join(" ｜ ").slice(0, 96)) + "</span></span>" +
        '<span class="li-go">▸</span></button>');
    });
    h.push("</div>");
    if (!list.length) h.push('<div class="empty">没有匹配的任务。</div>');
    return h.join("");
  }

  /* ------------------------------------------------------ 系统 / 养成 */
  function systemById(id) { return (X2.systems || []).filter(function (s) { return s.id === id; })[0]; }
  function viewSystems() {
    var h = ['<section class="hero"><h1>系统与养成</h1><p>战斗系统、异刃连击、连锁攻击、御刃者连击、角色与异刃培养路线。' +
      "文中出现的异刃 / 道具 / 敌人名称可直接点击跳转 wiki 查数值。</p></section>"];
    h.push('<div class="grid two">');
    (X2.systems || []).forEach(function (s) {
      h.push('<a class="chapter-card" href="#/systems/' + esc(s.id) + '">' +
        '<div class="cc-top">' + ccIco({ text: s.icon || "⚔", color: s.color }) +
        "<h3>" + esc(s.title) + "</h3></div>" +
        "<p>" + esc(s.desc || "") + "</p></a>");
    });
    h.push("</div>");
    return h.join("");
  }
  function viewSystem(id) {
    var s = systemById(id);
    if (!s) return viewSystems();
    var h = ['<div class="rowbtns" style="margin-top:0"><a class="btn" href="#/systems">← 系统与养成</a></div>'];
    h.push('<section class="hero"><h1>' + esc(s.title) + "</h1>" + (s.desc ? "<p>" + esc(s.desc) + "</p>" : "") + "</section>");
    (s.blocks || []).forEach(function (b) {
      if (b.h) h.push("<h2>" + esc(b.h) + "</h2>");
      if (b.p) h.push("<p>" + renderLinks(b.p) + "</p>");
      if (b.list) h.push("<ul>" + b.list.map(function (i) { return "<li>" + renderLinks(i) + "</li>"; }).join("") + "</ul>");
      if (b.ol) h.push("<ol>" + b.ol.map(function (i) { return "<li>" + renderLinks(i) + "</li>"; }).join("") + "</ol>");
      if (b.note) h.push('<div class="note ' + (b.note.kind || "") + '">' + (b.note.title ? '<span class="note-h">' + esc(b.note.title) + "</span>" : "") + renderLinks(b.note.text) + "</div>");
      if (b.table) {
        h.push('<div class="tablewrap"><table><thead><tr>' + b.table.head.map(function (t) { return "<th>" + esc(t) + "</th>"; }).join("") + "</tr></thead><tbody>" +
          b.table.rows.map(function (r) { return "<tr>" + r.map(function (c) { return "<td>" + renderLinks(c) + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table></div>");
      }
      if (b.acc) {
        b.acc.forEach(function (a) {
          h.push("<details class=\"acc\"><summary>" + esc(a.t) + "</summary><div class=\"acc-body\">" + renderLinks(a.body) + "</div></details>");
        });
      }
    });
    return h.join("");
  }

  /* ------------------------------------------------------------ 图鉴 */
  /* 图鉴数据来自 site/data/codex_v2.js（按手机版 wiki 的游戏内分页口径生成）
     异刃：列表与顺序以 APP 的 blade 表为准；下拉筛选 属性 / 类型 / 场景技能，
           另有「全部 / 已收集 / 未收集」三态收集筛选（状态存进站点的完成状态，跟同步面板走）。
     其余分类：搜索框 + 下拉筛选（核心晶片按等级排好、不设筛选；收藏道具 类型+地区；
               宝藏 只有地区；产权证 地区；其余按 APP item_type）。
     选项多的筛选（场景技能 / 饰品 / 辅助核心 / 收藏道具…）在下拉框旁多给一个联想输入框：
     输入关键词出现候选词，点候选即选中；下拉框与输入框两种方式都可用。 */
  var CODEX_CATS = ["异刃", "核心晶片", "饰品", "辅助核心", "收纳包道具", "收藏道具", "宝藏", "贵重品", "产权证"];
  /* 旧的英文 cat 参数（书签 / 外部链接）兼容映射到新分类 */
  var CODEX_ALIAS = {
    blade: "异刃", auxcore: "辅助核心", accessory: "饰品", pouch: "收纳包道具",
    corechip: "核心晶片", collect: "收藏道具", treasure: "宝藏", valuable: "贵重品", deed: "产权证",
  };
  function codexCatFromParam(cur) {
    if (!cur) return "异刃";
    if (CODEX_CATS.indexOf(cur) > -1) return cur;
    if (CODEX_ALIAS[cur]) return CODEX_ALIAS[cur];
    return "异刃";
  }
  var CODEX_KEY = function (cat) { return cat === "异刃" ? "blade" : cat; };
  /* 图鉴页的筛选状态（每个分类各记一份） */
  // 供测试脚本清空筛选（页面内不依赖这个挂载）
  var codexState = { mood: {}, filters: {}, key: {} };
  window.__codexState = codexState;
  /* 当前图鉴分类（中文名），与 viewCodex 的规范化逻辑保持一致 */
  function currentCodexCat() {
    var r = parseHash();
    return codexCatFromParam(r.params && r.params.cat);
  }
  function codexItems(cat) {
    var d = (window.X2 && window.X2.codexV2) || {};
    return d[CODEX_KEY(cat)] || [];
  }
  function codexCollectedSet() {
    var M = window.X2Map;
    return (M && M.exportDone) ? M.exportDone() : {};
  }
  function codexKey(cat, name) { return "codex:" + cat + ":" + name; }
  function isCodexCollected(cat, name) {
    var M = window.X2Map;
    if (M && M.isFlag) return M.isFlag(codexKey(cat, name));
    return !!codexCollectedSet()[codexKey(cat, name)];
  }
  function toggleCodexCollected(cat, name) {
    var M = window.X2Map;
    if (!M || !M.setFlag) return;
    M.setFlag(codexKey(cat, name), !isCodexCollected(cat, name));
  }
  /* 各分类的筛选项（全部是下拉框）。稀有度只在有稀有度的分类出现。 */
  function codexFacets(cat, items, meta) {
    var uniq = function (arr) { return arr.filter(function (v, i) { return v && arr.indexOf(v) === i; }); };
    var regions = (meta.regions || {})[cat] || [];
    var rarities = (meta.rarities || {})[cat] || [];
    var rarityFacet = rarities.length > 1 ? [{ key: "rarity", label: "稀有度", values: rarities }] : [];
    if (cat === "异刃") {
      var allFs = [];
      items.forEach(function (it) { (it.fs || []).forEach(function (f) { if (allFs.indexOf(f) === -1) allFs.push(f); }); });
      return [
        { key: "element", label: "属性", values: uniq(items.map(function (i) { return i.element; })) },
        { key: "role", label: "类型", values: uniq(items.map(function (i) { return i.role; })) },
        { key: "fs", label: "场景技能", values: allFs.sort() },
      ];
    }
    if (cat === "核心晶片") return rarityFacet;             // 按等级排列，只筛稀有度
    if (cat === "宝藏" || cat === "产权证") return rarityFacet.concat([{ key: "region", label: "地区", values: regions }]);
    if (cat === "收藏道具") {
      return rarityFacet.concat([
        { key: "type", label: "类型", values: (meta.types || {})[cat] || [] },
        { key: "region", label: "地区", values: regions },
      ]);
    }
    return [{ key: "type", label: "类型", values: (meta.types || {})[cat] || [] }].concat(rarityFacet);
  }
  function codexMatches(cat, it) {
    var sel = codexState.filters[cat] || {};
    var k = (codexState.key[cat] || "").trim().toLowerCase();
    if (k) {
      var hay = [it.name, it.type, it.region, it.effect, it.element, it.role, (it.fs || []).join(" ")].join(" ").toLowerCase();
      if (hay.indexOf(k) === -1) return false;
    }
    for (var f in sel) {
      var v = sel[f];
      if (!v) continue;
      if (f === "fs") { if ((it.fs || []).indexOf(v) === -1) return false; }
      else if (it[f] !== v) return false;
    }
    var mood = codexState.mood[cat] || "all";
    if (mood !== "all") {
      var got = isCodexCollected(cat, it.name);
      if (mood === "got" && !got) return false;
      if (mood === "not" && got) return false;
    }
    return true;
  }
  function codexUnknownRegion() {
    var meta = ((window.X2 && window.X2.codexV2 && window.X2.codexV2.meta) || {});
    return meta.unknownRegion || "地区未知";
  }
  /* 下拉筛选：data-facet 交给委托的 change 处理 */
  function codexFacetHTML(facet, cat) {
    var cur = (codexState.filters[cat] || {})[facet.key] || "";
    var unknown = facet.key === "region" ? codexUnknownRegion() : "";
    var values = facet.values.slice();
    if (unknown && values.indexOf(unknown) === -1) values.push(unknown);   // 地区未知也允许从下拉选
    var opts = values.map(function (v) {
      return '<option value="' + esc(v) + '"' + (v === cur ? " selected" : "") + ">" + esc(v) + "</option>";
    });
    return '<label class="codex-sel"><span>' + esc(facet.label) + '</span><select data-facet="' + esc(facet.key) + '">' +
      '<option value="">全部</option>' + opts.join("") + "</select></label>";
  }

  /* 列表区单独渲染，供搜索时局部刷新（不整页重绘，输入法不会被打断） */
  function codexCardHTML(catName, it) {
    var got = catName === "异刃" && isCodexCollected(catName, it.name);
    // 元信息只放一行；分栏标题已经展示了分组，不再重复
    var metaTxt;
    if (catName === "异刃") metaTxt = [it.role, it.weapon, it.kind].filter(Boolean).join("・");
    else if (catName === "核心晶片" || catName === "收纳包道具" || catName === "收藏道具") metaTxt = it.rarity || "";   // 等级只用于排序
    else metaTxt = it.effect && it.effect !== it.type ? it.effect : (it.rarity || "");   // 饰品/辅助核心看效果，贵重品看说明
    var eff = it.effect && it.effect !== it.type ? it.effect : "";
    var tip = it.name + (metaTxt ? "｜" + metaTxt : "") + (eff ? "｜" + eff : "");
    var tag = catName === "异刃"
      ? '<button type="button" class="dex-got' + (got ? " on" : "") + '" data-codex-got="' + esc(it.name) + '" title="' +
        (got ? "取消已收集" : "标记为已收集") + '" aria-pressed="' + (got ? "true" : "false") + '">' + (got ? "✓" : "") + "</button>"
      : "";
    var inner = '<span class="dex-ico">' + esc(it.name.slice(0, 1)) + "</span>" +
      '<span class="dex-body"><span class="dex-nm">' + esc(it.name) + '</span>' +
      (metaTxt ? '<span class="dex-meta">' + esc(metaTxt) + "</span>" : "") + "</span>";
    var card;
    if (it.url) {
      card = '<a class="dex" href="' + esc(it.url) + '" target="_blank" rel="noopener" title="' + esc(tip) + '" data-name="' + esc(it.name) + '">' + inner + "</a>";
    } else if (catName === "贵重品") {
      // 没有 wiki 页的贵重品：点击弹出 APP 数据（名称 / 类型 / 获取途径 / 说明）
      card = '<button type="button" class="dex dex-more" title="' + esc(tip) + '" data-dexpop="' + esc(it.name) + '">' + inner +
        '<span class="dex-more-i" aria-hidden="true">i</span></button>';
    } else {
      card = '<span class="dex dex-plain" title="' + esc(tip) + '" data-name="' + esc(it.name) + '">' + inner + "</span>";
    }
    return '<span class="dex-wrap' + (got ? " got" : "") + '">' + card + tag + "</span>";
  }
  /* 分栏顺序：属性按游戏内顺序；核心晶片 普通→稀有→史诗；类型/效果按下面的人工顺序 */
  var ELEMENT_ORDER = ["火", "水", "雷", "风", "冰", "光", "暗", "地"];
  var GROUP_ORDER_OVERRIDE = {
    "收纳包道具": ["主食", "肉类", "蔬菜", "鱼类", "甜品", "饮料", "纺织品", "化妆品", "书籍", "乐器", "美术品", "桌游"],
    "贵重品": ["关键物品", "任务物品", "信息道具", "技能RAM", "其他"],
    "饰品": ["攻击强化", "防御强化", "回复强化", "HP回复", "HP增加", "属性强化", "会心强化", "连击强化", "仇恨增加", "仇恨降低",
      "回避强化", "格挡强化", "抗性强化", "特殊效果", "战斗强化", "牵绊强化", "异刃强化", "武器强化", "反应强化", "队伍槽强化",
      "连锁攻击强化", "掉落强化", "复活强化"],
    "辅助核心": ["攻击强化", "防御强化", "HP回复", "属性强化", "会心强化", "连击强化", "仇恨增加", "仇恨降低",
      "回避强化", "格挡强化", "抗性强化", "特殊效果", "战斗强化", "牵绊强化", "异刃强化", "种族特效"],
    "收藏道具": ["矿石", "花草", "树木", "蔬菜", "鱼", "虫", "机械", "敌人掉落"],
  };
  function codexGroupOrder(cat, meta) {
    if (cat === "异刃") return ELEMENT_ORDER;
    if (cat === "核心晶片") return ["普通", "稀有", "史诗"];
    if (GROUP_ORDER_OVERRIDE[cat]) {
      // 覆盖表里没列到的类型排在后面（按名称）
      var rest = [];
      (window.X2.codexV2[CODEX_KEY(cat)] || []).forEach(function (it) {
        if (it.type && rest.indexOf(it.type) === -1 && GROUP_ORDER_OVERRIDE[cat].indexOf(it.type) === -1) rest.push(it.type);
      });
      return GROUP_ORDER_OVERRIDE[cat].concat(rest.sort());
    }
    return (meta.regions || {})[cat] || [];
  }
  function codexGridHTML(catName) {
    var meta = ((window.X2 && window.X2.codexV2 && window.X2.codexV2.meta) || {});
    var items = codexItems(catName);
    var shown = items.filter(function (it) { return codexMatches(catName, it); });
    var h = ['<div class="codex-count">显示 ' + shown.length + " / " + items.length + " 条</div>"];
    if (!shown.length) {
      h.push('<div class="empty">没有符合当前条件的条目，换个筛选或清空搜索试试。</div>');
      return h.join("");
    }
    var order = codexGroupOrder(catName, meta);
    var rank = function (g) { var i = order.indexOf(g); return i < 0 ? 999 : i; };
    var groups = [], byGroup = {};
    shown.forEach(function (it) {
      var g = it.group || "其他";
      if (!byGroup[g]) { byGroup[g] = []; groups.push(g); }
      byGroup[g].push(it);
    });
    groups.sort(function (a, b) { return rank(a) - rank(b) || (a < b ? -1 : 1); });
    groups.forEach(function (g) {
      h.push('<div class="dex-region">' + esc(g) + " <span class=\"dex-gn\">" + byGroup[g].length + "</span></div>");
      h.push('<div class="dexgrid">' + byGroup[g].map(function (it) { return codexCardHTML(catName, it); }).join("") + "</div>");
    });
    return h.join("");
  }
  function refreshCodexGrid(catName) {
    var box = $("#codexList");
    if (box) box.innerHTML = codexGridHTML(catName);
  }
  /* 没有 wiki 页面的图鉴条目（主要是贵重品）：弹窗展示 APP 数据 */
  /* 弹窗文本里的 NPC / 敌人：在地图索引里能找到的，做成按钮，点了在右侧侧边地图上定位。
     只链 3 字以上的名字（2 字名太容易误伤），并从长到短匹配，避免「尖角龙鱼」抢在长名前面。 */
  var popMapCache = null;
  function popLocNames() {
    if (popMapCache) return popMapCache;
    var md = X2.mapsData || {};
    var out = { npc: {}, enemy: {}, list: [], shortList: [] };
    // NPC 索引优先于敌人索引：同名（如「梅勒芙」）时按 NPC 处理，否则定位层会用错
    ["npcIndex", "enemyIndex"].forEach(function (k) {
      Object.keys(md[k] || {}).forEach(function (n) {
        if (!n || n.length < 2 || out[k === "npcIndex" ? "npc" : "enemy"][n]) return;
        if (out.npc[n] || out.enemy[n]) return;
        out[k === "npcIndex" ? "npc" : "enemy"][n] = 1;
        (n.length >= 3 ? out.list : out.shortList).push(n);
      });
    });
    out.list.sort(function (a, b) { return b.length - a.length; });
    out.shortList.sort(function (a, b) { return b.length - a.length; });
    out.re = out.list.length ? new RegExp("(" + out.list.map(escRe).join("|") + ")", "g") : null;
    // 2 字名（如崔娜）只在左边不是汉字时匹配：「制派女子 崔娜那里」命中；嵌在别的词里的「租金」之类不误伤
    out.reShort = out.shortList.length
      ? new RegExp("(?<![\\u4e00-\\u9fff])(" + out.shortList.map(escRe).join("|") + ")", "g")
      : null;
    popMapCache = out;
    return out;
  }
  function popLinks(text) {
    // 任务链接 [[任务:名|显示名]] 先换成占位符，最后再还原为可点按钮（避免被 NPC 名匹配误伤）
    var raw = String(text == null ? "" : text);
    var tokens = [];
    var PO = String.fromCharCode(0xe100), PC = String.fromCharCode(0xe101);
    raw = raw.replace(/\[\[敌人:([^\]|]+)(?:\|([^\]]+))?\]\]/g, function (_, en, label) {
      tokens.push({ enemy: en, label: label || en });
      return PO + (tokens.length - 1) + PC;
    });
    raw = raw.replace(/\[\[外链:([^\]|]+)(?:\|([^\]]+))?\]\]/g, function (_, href, label) {
      tokens.push({ href: href, label: label || href });
      return PO + (tokens.length - 1) + PC;
    });
    raw = raw.replace(/\[\[任务:([^\]|]+)\|([^\]]+)\]\]/g, function (_, q, label) {
      tokens.push({ q: q, label: label });
      return PO + (tokens.length - 1) + PC;
    });
    var t = esc(raw).split(String.fromCharCode(10)).join("<br>");
    // 「任务名」：任务库里有这条任务就做成按钮（人工整理的获取途径里常见这种写法）
    var qIdx = {};
    (X2.quests || []).forEach(function (q) { qIdx[q.name] = 1; });
    t = t.replace(/「([^」]{2,24})」/g, function (m, qname) {
      if (!qIdx[qname]) return m;
      return "「" + '<button type="button" class="qlink" data-quest="' + esc(qname) + '" title="打开任务详情">' + esc(qname) + "</button>" + "」";
    });
    var lc = popLocNames();
    if (lc.re) {
      t = t.replace(lc.re, function (name, _g, off, whole) {
        // 已经被包进标签/按钮里的不重复包（如 <br> 后面的名字是独立的，仍然要包）
        var before = whole.slice(0, off);
        if (before.lastIndexOf("<") > before.lastIndexOf(">")) return name;
        var kind = lc.npc[name] ? "npc" : "enemy";
        return '<button type="button" class="qlink maplink ' + kind + '" data-dexloc="' + esc(name) + '" data-dexkind="' + kind + '" title="在右侧地图上定位">' + name + "</button>";
      });
    }
    // 2 字名（崔娜、巴恩…）单独一轮：只在左边不是汉字时命中，避免把「租金」这类普通词连成链接
    if (lc.reShort) {
      t = t.replace(lc.reShort, function (name, _g, off, whole) {
        var before = whole.slice(0, off);
        if (before.lastIndexOf("<") > before.lastIndexOf(">")) return name;
        if (/<button[^>]*$/.test(before)) return name;
        var kind = lc.npc[name] ? "npc" : "enemy";
        return '<button type="button" class="qlink maplink ' + kind + '" data-dexloc="' + esc(name) + '" data-dexkind="' + kind + '" title="在右侧地图上定位">' + name + "</button>";
      });
    }
    var reTok = new RegExp(PO + "(\\d+)" + PC, "g");
    t = t.replace(reTok, function (_, i) {
      var tk = tokens[+i];
      if (tk.q) return '<button type="button" class="qlink" data-quest="' + esc(tk.q) + '" title="打开任务详情">' + esc(tk.label) + "</button>";
      if (tk.enemy) return '<button type="button" class="qlink maplink enemy" data-dexloc="' + esc(tk.enemy) + '" data-dexkind="enemy" title="在右侧地图上定位">' + esc(tk.label) + "</button>";
      return '<a class="qlink" href="' + esc(wikiUrl(tk.href)) + '" target="_blank" rel="noopener">' + esc(tk.label) + " ↗</a>";
    });
    return t;
  }
  /* 没有 wiki 页面的图鉴条目（主要是贵重品）：弹窗展示 APP 数据 */
  function showCodexPopup(name) {
    var d = (window.X2 && window.X2.codexV2) || {};
    var cats = CODEX_CATS.filter(function (c) { return c !== "异刃"; });
    var cat = "", it = null;
    for (var i = 0; i < cats.length && !it; i++) {
      (d[cats[i]] || []).forEach(function (x) { if (!it && x.name === name) { cat = cats[i]; it = x; } });
    }
    if (!it) return;
    var rows = [["类型", it.type || "—"]];
    if (it.region) rows.push(["地区", it.region]);
    if (it.source) rows.push(["获取途径", it.source]);
    if (it.sell) rows.push(["出售价格", it.sell + " G"]);
    var h = ['<h2>' + esc(name) + "</h2>"];
    h.push('<div class="m-sec"><h4>基本信息</h4><dl class="kv">' +
      rows.map(function (r) { return "<dt>" + esc(r[0]) + "</dt><dd>" + popLinks(r[1]) + "</dd>"; }).join("") +
      "</dl></div>");
    if (it.effect) h.push('<div class="m-sec"><h4>说明</h4><p>' + popLinks(it.effect) + "</p></div>");
    openModal(h.join(""), name);
  }

  function viewCodex(params) {
    var catName = codexCatFromParam(params && params.cat);
    var meta = ((window.X2 && window.X2.codexV2 && window.X2.codexV2.meta) || {});
    var items = codexItems(catName);
    var gotCount = 0;
    if (catName === "异刃") items.forEach(function (it) { if (isCodexCollected(catName, it.name)) gotCount++; });

    var hint = catName === "异刃"
      ? "按属性分栏；可标记已收集，并可按属性 / 类型 / 场景技能筛选。"
      : catName === "核心晶片" ? "按稀有度分栏，栏内按等级从低到高排列。"
      : catName === "饰品" || catName === "辅助核心" ? "按效果分栏，可按效果与稀有度筛选。"
      : catName === "收纳包道具" ? "按类型分栏，可按类型与稀有度筛选。"
      : catName === "贵重品" ? "按类型分栏；没有 wiki 页面的条目点开可看名称、类型与获取途径。"
      : catName === "宝藏" ? "按地区分栏，地区顺序与主线流程一致，可按稀有度筛选。"
      : catName === "收藏道具" ? "按类型分栏，地区顺序与主线流程一致，可按类型 / 地区 / 稀有度筛选。"
      : "按地区分栏，地区顺序与主线流程一致。";
    var h = ['<section class="hero"><h1>图鉴</h1><p>共 ' + CODEX_CATS.reduce(function (a, c) { return a + codexItems(c).length; }, 0) +
      ' 条。分类与数据按手机版 APP 的游戏内分页整理；wiki 有对应页面时名称可点击查看。' + hint + "</p></section>"];

    /* 分类标签 */
    h.push('<div class="chiprow" style="margin-bottom:12px">' + CODEX_CATS.map(function (c) {
      // data-codex 存原始分类名，点击时再 encodeURIComponent 一次；
      // 这里若先编码一次、点击又编码一次，parseHash 解码一次后会对不上中文分类（只剩下「异刃」能进）
      var ck = c === "异刃" ? "blade" : c;
      return '<button class="chip' + (c === catName ? " blue" : "") + '" type="button" data-codex="' + esc(ck) + '">' +
        esc(c) + " " + codexItems(c).length + "</button>";
    }).join("") + "</div>");

    /* 搜索 + 筛选 */
    h.push('<div class="card tight codex-tools">');
    h.push('<input id="codexSearch" type="search" placeholder="搜索 ' + esc(catName) +
      '（名称 / 效果 / 类型…）" value="' + esc(codexState.key[catName] || "") + '" autocomplete="off" enterkeyhint="search">');
    var facets = codexFacets(catName, items, meta);
    if (facets.length) {
      // 每个筛选都是「输入框 + 右侧下拉」：既可以输入关键词联想，也可以点下拉选全量
      h.push('<div class="codex-sels">' + facets.map(function (f) { return codexFacetHTML(f, catName); }).join("") + "</div>");
    }
    /* 收集筛选（只有异刃）：全部 / 已收集 / 未收集 三态 */
    if (catName === "异刃") {
      var mood = codexState.mood[catName] || "all";
      h.push('<div class="codex-sels"><div class="seg" role="group" aria-label="按收集状态筛选">' +
        [["all", "全部"], ["got", "已收集"], ["not", "未收集"]].map(function (m) {
          return '<button type="button" class="chip' + (mood === m[0] ? " blue" : "") + '" data-cmood="' + m[0] + '">' + m[1] + "</button>";
        }).join("") + '<span class="codex-gotn">已收集 <b>' + gotCount + "</b> / " + items.length + "</span></div></div>");
    }
    h.push("</div>");

    /* 列表（单独包一层，搜索时只刷新这里） */
    h.push('<div id="codexList" data-cat="' + esc(catName) + '">' + codexGridHTML(catName) + "</div>");
    return h.join("");
  }

  /* ------------------------------------------------------------ 地图 */
  function viewMaps() {
    var h = ['<section class="hero"><h1>地图与收集</h1><p>各地标、宝箱、打捞点、采集点与冠名者（珍稀种）分布要点。</p></section>'];
    (X2.maps || []).forEach(function (m) {
      h.push('<details class="acc"' + (m.open ? " open" : "") + "><summary>" + esc(m.title) + "</summary><div class=\"acc-body\">");
      if (m.intro) h.push("<p>" + renderLinks(m.intro) + "</p>");
      if (m.list) h.push("<ul>" + m.list.map(function (i) { return "<li>" + renderLinks(i) + "</li>"; }).join("") + "</ul>");
      if (m.table) {
        h.push('<div class="tablewrap"><table><thead><tr>' + m.table.head.map(function (t) { return "<th>" + esc(t) + "</th>"; }).join("") + "</tr></thead><tbody>" +
          m.table.rows.map(function (r) { return "<tr>" + r.map(function (c) { return "<td>" + renderLinks(c) + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table></div>");
      }
      h.push("</div></details>");
    });
    return h.join("");
  }

  /* ---------------------------------------------------- 差异对照 */
  function viewCompare() {
    var h = ['<section class="hero"><h1>攻略差异对照</h1><p>同一件事，各份攻略说法不同的地方集中列在这里：<b>以最完善的说法作为正文</b>，其余保留为备注，方便你按自己的版本取舍。</p></section>'];
    (X2.compare || []).forEach(function (c) {
      h.push('<div class="card"><h3 style="margin-top:0">' + esc(c.topic) + "</h3>");
      if (c.canon) h.push('<div class="note tip"><span class="note-h">采用（正文）</span>' + renderLinks(c.canon) + "</div>");
      (c.others || []).forEach(function (o) {
        h.push('<div class="note diff"><span class="note-h">' + esc(o.src) + "</span>" + renderLinks(o.text) + "</div>");
      });
      h.push("</div>");
    });
    return h.join("");
  }

  /* ------------------------------------------------------------ 关于 */
  function viewAbout() {
    return '<section class="hero"><h1>资料来源与说明</h1>' +
      "<p>本站把四份材料整理成一套连贯攻略，并保留各自的独到之处。</p></section>" +
      '<div class="card"><h3 style="margin-top:0">四份原始材料</h3><ul>' +
      "<li><b>《异度神剑2 攻略特辑》上册</b>（《掌机王Plus Vol.8》扫描件，34 页）——系统讲解、流程攻略、装备与养成，含大量图文示例。</li>" +
      "<li><b>《异度神剑2 攻略特辑》下册</b>（34 页）——后续章节流程、支线、图鉴与数据表。</li>" +
      "<li><b>异度之刃2 每章更多备注.doc</b>——玩家实战向的每章补充：开环顺序、刷装备路线、场景技能与支线取舍。</li>" +
      "<li><b>乐园数据管理室（xenoblade2.cn）</b>——任务、异刃、道具、敌人等结构化数据与数值。</li>" +
      "</ul></div>" +
      '<div class="card"><h3 style="margin-top:0">整理原则</h3><ul>' +
      "<li><b>流程取最完善者</b>：同一段流程以信息最完整、步骤最清晰的版本作为正文，必要时合并多份材料的步骤。</li>" +
      "<li><b>差异转备注</b>：不同材料在打法、顺序、取舍上不一致的地方，统一以「差异备注」的形式保留在对应位置，并汇总在「攻略差异对照」。</li>" +
      "<li><b>支线可点开</b>：流程中出现的支线任务名都是可点击的，点开即弹出浮窗显示接取条件、流程与注意事项，右上角有关闭按钮。</li>" +
      "<li><b>专有名词外链</b>：异刃、道具、辅助核心、饰品、敌人等名称直接链接到 wiki 对应页面，方便查数值。</li>" +
      "</ul></div>" +
      '<div class="card"><h3 style="margin-top:0">版权</h3><p>本站为非商业性质的同人整理，不作为任何形式的商业用途。' +
      "《异度神剑2》（Xenoblade Chronicles 2）相关商标、图像与文本版权归 Nintendo / MONOLITHSOFT 所有；" +
      'wiki 内容遵循 <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/" target="_blank" rel="noopener">CC BY-NC-SA 4.0</a>。</p></div>';
  }

  /* ------------------------------------------------------------ 原刊对照 */
  function magById(id) { return (X2.mag || []).filter(function (m) { return m.id === id; })[0]; }
  function viewMagList(params) {
    var pages = X2.mag || [];
    var vol = (params && params.vol) || "vol1";
    var list = pages.filter(function (p) { return p.tag === vol; });
    var h = ['<section class="hero"><h1>原刊对照</h1><p>《异度神剑2 攻略特辑》（原载《掌机王Plus》）上下册共 68 页的原始版面与文字识别结果。' +
      "攻略正文里遇到「原刊 pXX」的引用时，可以来这里查看整页原图。</p></section>"];
    h.push('<div class="chiprow" style="margin-bottom:12px">' +
      '<button class="chip' + (vol === "vol1" ? " blue" : "") + '" type="button" data-magvol="vol1">上册 34 页</button>' +
      '<button class="chip' + (vol === "vol2" ? " blue" : "") + '" type="button" data-magvol="vol2">下册 34 页</button></div>');
    h.push('<div class="list">');
    list.forEach(function (p) {
      h.push('<a class="list-item" href="#/mag/' + esc(p.id) + '">' +
        '<span class="li-main"><span class="li-name">' + esc(p.vol) + " 第 " + p.page + " 页</span>" +
        '<span class="li-sub">' + esc(p.label || "—") + "</span></span>" +
        '<span class="li-go">▸</span></a>');
    });
    h.push("</div>");
    return h.join("");
  }
  function viewMagPage(id) {
    var p = magById(id);
    if (!p) return viewMagList();
    var idx = (X2.mag || []).indexOf(p);
    var h = ['<div class="rowbtns" style="margin-top:0"><a class="btn" href="#/mag?vol=' + esc(p.tag) + '">← 原刊目录</a></div>'];
    h.push('<section class="hero"><h1>' + esc(p.vol) + " 第 " + p.page + " 页</h1>" +
      (p.label ? "<p>" + esc(p.label) + "</p>" : "") + "</section>");
    h.push('<figure><img loading="lazy" src="' + esc(p.img) + '" alt="' + esc(p.vol + " 第" + p.page + "页") + '" data-zoom>' +
      '<figcaption>原刊整页（点击可放大）。文字为自动 OCR 结果，仅供检索，可能有识别错误。</figcaption></figure>');
    h.push('<details class="acc"><summary>本页 OCR 文字（' + (p.ocr || []).length + " 行）</summary><div class=\"acc-body\">" +
      (p.ocr || []).map(function (l) { return "<p style=\"margin:.2em 0\">" + renderLinks(l) + "</p>"; }).join("") +
      "</div></details>");
    var prev = (X2.mag || [])[idx - 1], next = (X2.mag || [])[idx + 1];
    h.push('<div class="rowbtns">' +
      (prev ? '<a class="btn" href="#/mag/' + esc(prev.id) + '">← ' + esc(prev.vol + " " + prev.page) + "</a>" : "") +
      (next ? '<a class="btn" href="#/mag/' + esc(next.id) + '">' + esc(next.vol + " " + next.page) + " →</a>" : "") +
      "</div>");
    return h.join("");
  }

  /* ------------------------------------------------------------ 路由 */
  var routes = {
    home: viewHome,
    story: function (parts, params) { return parts[1] ? viewChapter(parts[1]) : viewStoryList(); },
    quests: viewQuests,
    systems: function (parts) { return parts[1] ? viewSystem(parts[1]) : viewSystems(); },
    // 路由签名的第一个参数是 parts、第二个才是 params，这里必须显式取第二个
    codex: function (parts, params) { return viewCodex(params); },
    maps: viewMaps,
    compare: viewCompare,
    mag: function (parts, params) { return parts[1] ? viewMagPage(parts[1]) : viewMagList(params); },
    about: viewAbout
  };

  function parseHash() {
    var raw = location.hash.replace(/^#\/?/, "");
    var qi = raw.indexOf("?");
    var params = {};
    if (qi > -1) {
      raw.slice(qi + 1).split("&").forEach(function (kv) {
        var p = kv.split("=");
        if (p[0]) params[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || "");
      });
      raw = raw.slice(0, qi);
    }
    return { parts: raw.split("/").filter(Boolean), params: params };
  }

  function render() {
    var r = parseHash();
    var top = r.parts[0] || "home";
    // 记住最近浏览的章节，供悬浮地图使用（离开章节页后仍显示这一章）
    if (top === "story" && r.parts[1]) dockChapterId = r.parts[1];
    var fn = routes[top];
    var view = $("#view");
    if (!fn) { view.innerHTML = viewHome(); top = "home"; }
    else view.innerHTML = fn(r.parts, r.params);

    // 面包屑
    var mod = (X2.modules || []).filter(function (m) { return m.id === top; })[0];
    var crumbs = ['<a href="#/home">首页</a>'];
    if (mod && top !== "home") crumbs.push('<span class="sep">/</span><a href="#/' + top + '">' + esc(mod.title) + "</a>");
    if (r.parts[1]) {
      var label = r.parts[1];
      if (top === "story") {
        var c = (X2.chapters || []).filter(function (x) { return x.id === r.parts[1]; })[0];
        if (c) label = c.num + " " + c.title;
      } else if (top === "systems") {
        var s = systemById(r.parts[1]);
        if (s) label = s.title;
      }
      crumbs.push('<span class="sep">/</span><span>' + esc(label) + "</span>");
    }
    $("#crumbs").innerHTML = crumbs.join("");

    // 导航高亮
    $$(".nav-link").forEach(function (a) { a.classList.toggle("active", a.dataset.route === top); });
    if (top === "story" && !r.parts[1]) {
      var nl = $$(".nav-link").filter(function (a) { return a.dataset.route === "story"; })[0];
      if (nl) nl.classList.add("active");
    }
    document.title = (mod && top !== "home" ? mod.title + " · " : "") + "异度之刃2 完整攻略站";
    // 挂载互动地图（仅章节页有 map-host）
    if (window.X2Map && window.X2Map.mountChapters) window.X2Map.mountChapters();
    // 章节切换条：把当前章节滚进可视区（切换条本身可横向滚动）
    var cbar = $(".chapterbar");
    if (cbar && cbar.scrollWidth > cbar.clientWidth + 1) {
      var cur = cbar.querySelector("a.active");
      if (cur) {
        var want = cur.offsetLeft - (cbar.clientWidth - cur.offsetWidth) / 2;
        cbar.scrollLeft = Math.max(0, want);
      }
    }
    window.scrollTo({ top: 0, behavior: "instant" in document.documentElement.style ? "instant" : "auto" });
    toggleNav(false);
  }

  /* -------------------------------------------------------- 交互绑定 */
  function toggleNav(open) {
    var isOpen = typeof open === "boolean" ? open : !document.body.classList.contains("nav-open");
    document.body.classList.toggle("nav-open", isOpen);
    $("#navToggle").setAttribute("aria-expanded", String(isOpen));
    $("#scrim").hidden = !isOpen;
  }
  $("#navToggle").addEventListener("click", function () { toggleNav(); });
  $("#scrim").addEventListener("click", function () { toggleNav(false); });
  $("#modalClose").addEventListener("click", closeModal);
  window.addEventListener("hashchange", render);

  // 事件委托：动态渲染出来的控件
  document.addEventListener("click", function (e) {
    var t = e.target;
    // 「本章可接支线」左侧圆点：切换完成状态
    var qd = t.closest("[data-quest-done]");
    if (qd) {
      e.preventDefault();
      var qn = qd.getAttribute("data-quest-done");
      var M = window.X2Map;
      if (M && M.setQuestDone) {
        M.setQuestDone(qn, !M.isQuestDone(qn));
        modalDirty = true;
        // 浮窗开着时原地更新按钮，不闪一下重开
        if (qd.classList.contains("qdone-modal")) {
          var on = M.isQuestDone(qn);
          qd.classList.toggle("done", on);
          qd.textContent = on ? "✓ 已完成（点击撤销）" : "标记为已完成";
        } else {
          render();
        }
        // 地图上的任务接取点共用同一状态
        var card = document.querySelector(".mapcard");
        if (card && card._redoMarkers) { try { card._redoMarkers(); } catch (err) {} }
      }
      return;
    }
    var qc = t.closest("[data-qcat]");
    if (qc) { questFilter.cat = qc.getAttribute("data-qcat"); render(); return; }
    var cx = t.closest("[data-codex]");
    if (cx) {
      var ck = cx.getAttribute("data-codex");
      codexState.key = {};
      location.hash = "#/codex?cat=" + encodeURIComponent(ck);
      return;
    }
    // 图鉴：下拉筛选（旧版 chip 的 data-fv 写法已废弃，只认 select 的 change）
    // 图鉴：收集状态三态（全部 / 已收集 / 未收集）
    var cm = t.closest("[data-cmood]");
    if (cm) {
      var c3 = currentCodexCat();
      codexState.mood[c3] = cm.getAttribute("data-cmood");
      render();
      return;
    }
    // 图鉴：标记已收集
    var gt = t.closest("[data-codex-got]");
    if (gt) {
      e.preventDefault();
      toggleCodexCollected(currentCodexCat(), gt.getAttribute("data-codex-got"));
      render();
      return;
    }
    // 图鉴：无 wiki 的贵重品 / 其他条目 → 弹窗显示 APP 数据
    var dp = t.closest("[data-dexpop]");
    if (dp) {
      e.preventDefault();
      showCodexPopup(dp.getAttribute("data-dexpop"));
      return;
    }
    // 图鉴弹窗里的 NPC / 敌人：在右侧侧边地图上定位
    var dl = t.closest("[data-dexloc]");
    if (dl) {
      e.preventDefault();
      var M2 = window.X2Map;
      if (!M2 || !M2.focusInDock) { toast("地图数据未加载"); return; }
      var got = M2.focusInDock(dl.getAttribute("data-dexkind"), dl.getAttribute("data-dexloc"));
      if (!got) toast("互动地图上找不到「" + dl.getAttribute("data-dexloc") + "」的位置");
      return;
    }
    var mv = t.closest("[data-magvol]");
    if (mv) { location.hash = "#/mag?vol=" + encodeURIComponent(mv.getAttribute("data-magvol")); return; }
    var img = t.closest("[data-zoom]");
    if (img) {
      openModal('<figure style="margin:0"><img src="' + esc(img.getAttribute("src")) + '" alt="' + esc(img.alt || "") + '" style="width:100%;cursor:default"></figure>' +
        (img.nextElementSibling && img.nextElementSibling.tagName === "FIGCAPTION" ? "<p class=\"lede\">" + esc(img.nextElementSibling.textContent) + "</p>" : ""));
      return;
    }
    var nl = t.closest(".nav-link");
    if (nl) toggleNav(false);
  });
  document.addEventListener("input", function (e) {
    if (e.target.id === "qSearch") {
      questFilter.key = e.target.value;
      var pos = e.target.selectionStart;
      render();
      var n = $("#qSearch");
      if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (err) {} }
    }
    if (e.target.id === "codexSearch") {
      var cat = currentCodexCat();
      codexState.key[cat] = e.target.value;
      // 只刷新列表，不整页重绘：重绘会替换掉正在输入的输入框，
      // 中文输入法的组词框会跟着一起消失（手机上表现为「输入法弹不出来」）
      refreshCodexGrid(cat);
    }
    if (e.target.id === "searchInput") runSearch(e.target.value);
  });
  /* 图鉴下拉筛选：选择后只刷新列表（不整页重绘，保留滚动位置） */
  document.addEventListener("change", function (e) {
    var sel = e.target.closest("select[data-facet]");
    if (!sel) return;
    var cat = currentCodexCat();
    var f = codexState.filters[cat] = codexState.filters[cat] || {};
    f[sel.getAttribute("data-facet")] = sel.value;
    refreshCodexGrid(cat);
  });

  /* ------------------------------------------------------------ 搜索 */
  var searchIndex = null;
  function buildSearchIndex() {
    if (searchIndex) return searchIndex;
    searchIndex = [];
    (X2.chapters || []).forEach(function (c) {
      searchIndex.push({ t: c.num + " " + c.title, d: (c.summary || "").slice(0, 70), g: "主线流程", h: "#/story/" + c.id });
      (c.quests || []).forEach(function (n) { searchIndex.push({ t: n, d: "第 " + (c.num || "") + " 章支线任务", g: "支线任务", q: n }); });
    });
    (X2.quests || []).forEach(function (q) {
      searchIndex.push({ t: q.name, d: [q.cat, (q.place || []).join("・"), q.cond].filter(Boolean).join(" ｜ ").slice(0, 80), g: "任务库", q: q.name });
    });
    (X2.systems || []).forEach(function (s) { searchIndex.push({ t: s.title, d: s.desc || "", g: "系统与养成", h: "#/systems/" + s.id }); });
    // 图鉴 v2（九页）：名称 + 类型/地区，点结果直接进对应分类
    var md2 = (X2.mapsData || {});
    (function () {
      var d = X2.codexV2 || {};
      Object.keys(d).forEach(function (k) {
        if (k === "meta" || !Array.isArray(d[k])) return;
        var cat = k === "blade" ? "异刃" : k;
        d[k].forEach(function (it) {
          var extra = [it.type, it.region, it.element, it.role].filter(Boolean).join(" ｜ ");
          searchIndex.push({ t: it.name, d: cat + (extra ? " ｜ " + extra : ""), g: "图鉴", c: cat, u: it.url });
        });
      });
      ["npcIndex", "enemyIndex", "itemIndex"].forEach(function (ik) {
        var kind = ik === "npcIndex" ? "npc" : ik === "enemyIndex" ? "enemy" : "item";
        var label = kind === "npc" ? "NPC" : kind === "enemy" ? "敌人" : "道具";
        Object.keys(md2[ik] || {}).forEach(function (n) {
          searchIndex.push({ t: n, d: label + " · 在互动地图上定位", g: "地图", m: kind });
        });
      });
    })();
    Object.keys(X2.codex || {}).forEach(function (k) {
      ((X2.codex[k] || {}).items || []).forEach(function (it) {
        searchIndex.push({ t: it.name, d: (X2.codex[k].title || k) + (it.meta ? " ｜ " + it.meta : ""), g: "图鉴", u: it.url });
      });
    });
    return searchIndex;
  }
  function runSearch(kw) {
    var box = $("#searchResults");
    kw = (kw || "").trim().toLowerCase();
    if (kw.length < 1) { box.innerHTML = '<div class="empty">输入关键词，搜索章节、支线、系统与图鉴。</div>'; return; }
    var hits = buildSearchIndex().filter(function (i) {
      return (i.t + " " + i.d).toLowerCase().indexOf(kw) > -1;
    }).slice(0, 80);
    if (!hits.length) { box.innerHTML = '<div class="empty">没有找到匹配内容。</div>'; return; }
    var groups = {};
    hits.forEach(function (h) { (groups[h.g] = groups[h.g] || []).push(h); });
    box.innerHTML = Object.keys(groups).map(function (g) {
      return '<div class="sr-group"><h4>' + esc(g) + "</h4>" + groups[g].map(function (h) {
        return '<button class="sr-hit" type="button" data-sr="' + esc(JSON.stringify({ n: h.t || "", h: h.h || "", q: h.q || "", u: h.u || "", c: h.c || "", m: h.m || "" })) + '">' +
          '<span class="sr-n">' + esc(h.t) + '</span><span class="sr-d">' + esc(h.d) + "</span></button>";
      }).join("") + "</div>";
    }).join("");
  }
  function openSearch() {
    $("#searchPanel").hidden = false;
    document.body.style.overflow = "hidden";
    setTimeout(function () { $("#searchInput").focus(); }, 30);
    runSearch("");
  }
  function closeSearch() {
    $("#searchPanel").hidden = true;
    document.body.style.overflow = "";
  }
  $("#searchBtn").addEventListener("click", openSearch);
  $("#searchClose").addEventListener("click", closeSearch);
  document.addEventListener("click", function (e) {
    var hit = e.target.closest("[data-sr]");
    if (!hit) return;
    var d = JSON.parse(hit.getAttribute("data-sr"));
    closeSearch();
    if (d.m) {
      // 地图实体：打开侧边地图并定位
      var M3 = window.X2Map;
      if (M3 && M3.focusInDock && d.n) M3.focusInDock(d.m, d.n);
      return;
    }
    if (d.q) showQuest(d.q);
    else if (d.h) location.hash = d.h;
    else if (d.c) location.hash = "#/codex?cat=" + encodeURIComponent(d.c === "异刃" ? "异刃" : d.c);
    else if (d.u) window.open(d.u, "_blank", "noopener");
  });

  /* ------------------------------------------------------------ 主题 */
  var THEME_KEY = "x2.theme";
  function setTheme(t) {
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem(THEME_KEY, t); } catch (e) {}
  }
  (function initTheme() {
    var saved = null;
    try { saved = localStorage.getItem(THEME_KEY); } catch (e) {}
    setTheme(saved || (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"));
  })();
  $("#themeBtn").addEventListener("click", function () {
    setTheme(document.documentElement.dataset.theme === "light" ? "dark" : "light");
  });

  /* -------------------------------------------------- 悬浮互动地图（可收起） */
  var dockOpen = false;

  /** 当前应该展示哪一章的地图：章节页用本章；其它页面用最近一次查看的章节，默认第一章 */
  function dockChapter() {
    var r = parseHash();
    var chapters = X2.chapters || [];
    if (r.parts[0] === "story" && r.parts[1]) dockChapterId = r.parts[1];
    var id = dockChapterId || (chapters[0] && chapters[0].id);
    return chapters.filter(function (c) { return c.id === id; })[0] || chapters[0];
  }

  function buildDock() {
    var body = $("#mapDockBody");
    var ch = dockChapter();
    if (!ch || !window.X2Map) {
      body.innerHTML = '<div class="map-empty">地图数据未加载。</div>';
      return;
    }
    body.innerHTML = "";
    var card = window.X2Map.renderChapterMap(ch);
    card.classList.add("mapcard-in-dock");
    body.appendChild(card);
    $("#mapDockTitle").textContent = ch.num + " · 互动地图";
    $("#mapDockGo").setAttribute("href", "#/story/" + ch.id);
    // 章节切换：侧边地图就地换章节，不用回流程页
    var sel = $("#mapDockChapter");
    if (sel && !sel.options.length) {
      sel.innerHTML = (X2.chapters || []).map(function (c) {
        return '<option value="' + esc(c.id) + '">' + esc(c.num + " " + c.title) + "</option>";
      }).join("");
      // 用事件委托：buildDock 会反复重建地图卡片，但 <select> 本身不重建
      sel.addEventListener("change", function () { setDock(true, sel.value); });
    }
    if (sel) sel.value = ch.id;
    var raf = window.requestAnimationFrame || function (fn) { return setTimeout(fn, 0); };
    raf(function () {
      try { card._showMap(); } catch (e) {}
      setTimeout(function () { try { card._showMap(); } catch (e) {} }, 80);
    });
  }

  function setDock(open, chapterId) {
    dockOpen = !!open;
    if (chapterId) dockChapterId = chapterId;   // 从图鉴等页面定位时，指定侧边地图显示的章节
    var dock = $("#mapDock"), btn = $("#mapDockBtn");
    dock.hidden = !dockOpen;
    btn.classList.toggle("is-open", dockOpen);
    btn.setAttribute("aria-expanded", String(dockOpen));
    document.body.classList.toggle("dock-open", dockOpen);
    if (dockOpen) buildDock();
  }
  $("#mapDockBtn").addEventListener("click", function () { setDock(!dockOpen); });
  $("#mapDockClose").addEventListener("click", function () { setDock(false); });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && dockOpen && $("#modal").hidden && $("#searchPanel").hidden) setDock(false);
  });

  /* ------------------------------------------------------------ 启动 */
  buildNav();
  render();
  window.X2App = { openModal: openModal, closeModal: closeModal, showQuest: showQuest, render: render, openDock: function (chapterId) { setDock(true, chapterId); } };
})();
