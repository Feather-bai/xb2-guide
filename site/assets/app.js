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
    // **加粗** -> <strong>（数据里的重点标记）
    out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    // [[...]] 显式标注
    out = out.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, function (_, target, label) {
      var show = label || target.split(":").pop();
      var ns = target.indexOf(":") > -1 ? target.split(":")[0] : "";
      if (ns === "任务") {
        return '<button class="qlink" type="button" data-quest="' + esc(show) + '">' + esc(show) + "</button>";
      }
      var kind = ns === "异刃" ? "blade" : ns === "物品" || ns === "饰品" || ns === "辅助核心" ? "item" : ns === "敌人" || ns === "珍稀种" ? "enemy" : "term";
      return '<a class="qlink ' + kind + '" href="' + esc(wikiUrl(target)) + '" target="_blank" rel="noopener">' + esc(show) + "</a>";
    });
    // 自动识别任务名（「」内优先）
    out = out.replace(/「([^」]{2,24})」/g, function (m, name) {
      var idx = getLinkIndex();
      if (idx.quest[name]) {
        return "「<button class=\"qlink\" type=\"button\" data-quest=\"" + esc(name) + '">' + esc(name) + "</button>」";
      }
      return m;
    });
    return out;
  }

  /* ---------------------------------------------------------------- 浮窗 */
  var modal = $("#modal"), modalBody = $("#modalBody"), lastFocus = null;

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
    modal.hidden = true;
    document.body.style.overflow = "";
    modalBody.innerHTML = "";
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  document.addEventListener("click", function (e) {
    if (e.target.closest("[data-close]")) { closeModal(); return; }
    var q = e.target.closest("[data-quest]");
    if (q) { e.preventDefault(); showQuest(q.getAttribute("data-quest")); }
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
    h.push('<h2>' + esc(q.name) + "</h2>");
    var sub = [];
    if (q.cat) sub.push('<span class="tag ' + (q.cat === "异刃任务" ? "blue" : q.cat === "主线任务" ? "red" : q.cat === "DLC任务" ? "gold" : "grey") + '">' + esc(q.cat) + "</span>");
    if (q.dlc) sub.push('<span class="tag gold">DLC 限定</span>');
    if (q.id) sub.push('<span class="tag mono">' + esc(q.id) + "</span>");
    if (q.src && q.src.length) sub.push('<span class="srcbadge">来源：' + esc(q.src.join(" / ")) + "</span>");
    h.push('<div class="m-sub">' + sub.join(" ") + "</div>");

    var kv = [];
    if (q.place && q.place.length) kv.push(["地点", q.place.join("・")]);
    if (q.npc) kv.push(["委托人", q.npc]);
    if (q.blade) kv.push(["对应异刃", q.blade]);
    if (q.cond) kv.push(["解锁条件", q.cond]);
    var reward = [];
    if (q.gold) reward.push(q.gold + " G");
    if (q.exp) reward.push("EXP " + q.exp);
    if (q.sp) reward.push("SP " + q.sp);
    if (q.dev) reward.push("发展度 +" + q.dev + (q.devRegion ? "（" + q.devRegion + "）" : ""));
    if (q.trust) reward.push("信赖度 +" + q.trust);
    if (q.rewards && q.rewards.length) reward.push(q.rewards.join("、"));
    if (reward.length) kv.push(["报酬", reward.join("　")]);
    if (kv.length) {
      h.push('<div class="m-sec"><h4>基本信息</h4><dl class="kv">' +
        kv.map(function (r) { return "<dt>" + esc(r[0]) + "</dt><dd>" + renderLinks(r[1]) + "</dd>"; }).join("") + "</dl></div>");
    }
    if (q.flow && q.flow.length) {
      h.push('<div class="m-sec"><h4>任务流程</h4><ol>' +
        q.flow.map(function (s) { return "<li>" + renderLinks(s) + "</li>"; }).join("") + "</ol></div>");
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
    h.push('<div class="modal-foot"><a class="btn" href="' + esc(q.url || WIKI) + '" target="_blank" rel="noopener">在 wiki 查看原页 ↗</a>' +
      '<a class="btn" href="#/quests?q=' + encodeURIComponent(q.name) + '" data-close>在任务库中查看</a></div>');
    return h.join("");
  }
  function showQuest(name) {
    openModal(questModalHTML(questByName(name), name));
  }

  /* ---------------------------------------------------------- 导航构建 */
  var NAV_ICON = { home: "◆", story: "▤", quests: "☰", systems: "⚔", codex: "◈", maps: "◎", compare: "⇄", mag: "▦", about: "ℹ" };

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
        '<div class="cc-top"><span class="cc-num">' + esc(c.num || "") + "</span><h3>" + esc(c.title) + "</h3></div>" +
        "<p>" + esc(c.summary || "") + "</p></a>");
    });
    h.push("</div>");
    if (chapters.length > 6) {
      h.push('<div class="rowbtns"><a class="btn" href="#/story">查看全部 ' + chapters.length + " 章 →</a></div>");
    }

    h.push("<h2>模块导航</h2><div class=\"grid two\">");
    (X2.modules || []).filter(function (m) { return m.id !== "home"; }).forEach(function (m) {
      h.push('<a class="chapter-card" href="#/' + m.id + '"><div class="cc-top"><span class="cc-num">' +
        (NAV_ICON[m.id] || "•") + "</span><h3>" + esc(m.title) + "</h3></div><p>" + esc(m.desc || "") + "</p></a>");
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
        '<div class="cc-top"><span class="cc-num">' + esc(c.num) + "</span><h3>" + esc(c.title) + "</h3></div>" +
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
      return '<a href="#/story/' + esc(c.id) + '"' + (c.id === cur ? ' class="active"' : "") + ">" + esc(c.num) + " " + esc(c.short || c.title) + "</a>";
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

    if (ch.quests && ch.quests.length) {
      h.push('<div class="card tight"><h3 style="margin:0 0 6px">本章可接支线</h3><div class="chiprow">' +
        ch.quests.map(function (n) {
          return '<button class="chip" type="button" data-quest="' + esc(n) + '" style="cursor:pointer">' + esc(n) + "</button>";
        }).join("") + "</div></div>");
    }

    if (ch.keypoints && ch.keypoints.length) {
      h.push("<h2>本章要点</h2>" + ch.keypoints.map(function (k) { return renderable(k, { defaultKind: "tip" }); }).join(""));
    }

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
  function viewQuests(params) {
    if (params && params.q) questFilter.key = params.q;
    var cats = ["全部", "主线任务", "普通任务", "异刃任务", "DLC任务"];
    var list = (X2.quests || []).filter(function (q) {
      if (questFilter.cat !== "全部" && q.cat !== questFilter.cat) return false;
      if (questFilter.key) {
        var k = questFilter.key.toLowerCase();
        var hay = [q.name, q.id, q.cond, q.npc, q.blade, (q.place || []).join(" ")].join(" ").toLowerCase();
        if (hay.indexOf(k) === -1) return false;
      }
      return true;
    });
    var h = ['<section class="hero"><h1>任务库</h1><p>共 ' + (X2.quests || []).length + ' 条任务。点击任意任务可打开浮窗查看条件、流程与报酬；名称末尾带 ↗ 的会跳到 wiki 原页。</p></section>'];
    h.push('<div class="card tight"><div class="chiprow">' + cats.map(function (c) {
      var n = c === "全部" ? (X2.quests || []).length : (X2.quests || []).filter(function (q) { return q.cat === c; }).length;
      return '<button class="chip' + (questFilter.cat === c ? " blue" : "") + '" type="button" data-qcat="' + esc(c) + '">' +
        esc(c) + " " + n + "</button>";
    }).join("") + "</div>" +
      '<div style="margin-top:9px"><input id="qSearch" type="search" placeholder="按名称 / 条件 / 地点 / 异刃筛选…" value="' + esc(questFilter.key) + '" style="width:100%;background:var(--card-2);border:1px solid var(--line);border-radius:9px;padding:9px 12px;color:var(--fg);font-size:15px"></div></div>');

    h.push('<div class="list">');
    list.slice(0, 400).forEach(function (q) {
      h.push('<button class="list-item" type="button" data-quest="' + esc(q.name) + '">' +
        '<span class="li-main"><span class="li-name">' + esc(q.name) + "</span>" +
        '<span class="li-sub">' + esc([q.cat, (q.place || []).join("・"), q.cond].filter(Boolean).join(" ｜ ").slice(0, 90)) + "</span></span>" +
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
        '<div class="cc-top"><span class="cc-num">' + esc(s.icon || "⚔") + "</span><h3>" + esc(s.title) + "</h3></div>" +
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
  function viewCodex(params) {
    var cats = X2.codex || {};
    var keys = Object.keys(cats);
    var cur = (params && params.cat) || keys[0];
    if (keys.indexOf(cur) === -1) cur = keys[0];
    var data = cats[cur] || { title: cur, items: [] };
    var h = ['<section class="hero"><h1>图鉴</h1><p>名称可直接点击跳转到 wiki 查看完整数值与获得方式。</p></section>'];
    h.push('<div class="chiprow" style="margin-bottom:12px">' + keys.map(function (k) {
      return '<button class="chip' + (k === cur ? " blue" : "") + '" type="button" data-codex="' + esc(k) + '">' +
        esc((cats[k].title || k)) + " " + ((cats[k].items || []).length) + "</button>";
    }).join("") + "</div>");
    h.push('<div class="card tight"><div style="margin-bottom:9px"><input id="codexSearch" type="search" placeholder="筛选 ' + esc(data.title) + '…" style="width:100%;background:var(--card-2);border:1px solid var(--line);border-radius:9px;padding:9px 12px;color:var(--fg);font-size:15px"></div>');
    h.push('<div class="dexgrid" id="dexgrid">' + (data.items || []).map(function (it) {
      var href = it.url || wikiUrl(it.name);
      return '<a class="dex" href="' + esc(href) + '" target="_blank" rel="noopener" data-name="' + esc(it.name) + '">' +
        '<span class="dex-ico">' + esc(it.icon || it.name.slice(0, 1)) + "</span>" +
        '<span><span class="dex-nm">' + esc(it.name) + '</span><span class="dex-meta">' + esc(it.meta || "") + "</span></span></a>";
    }).join("") + "</div></div>");
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
    codex: viewCodex,
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
    var qc = t.closest("[data-qcat]");
    if (qc) { questFilter.cat = qc.getAttribute("data-qcat"); render(); return; }
    var cx = t.closest("[data-codex]");
    if (cx) { location.hash = "#/codex?cat=" + encodeURIComponent(cx.getAttribute("data-codex")); return; }
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
      var k = e.target.value.trim().toLowerCase();
      $$("#dexgrid .dex").forEach(function (a) {
        a.style.display = a.getAttribute("data-name").toLowerCase().indexOf(k) > -1 ? "" : "none";
      });
    }
    if (e.target.id === "searchInput") runSearch(e.target.value);
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
        return '<button class="sr-hit" type="button" data-sr="' + esc(JSON.stringify({ h: h.h || "", q: h.q || "", u: h.u || "" })) + '">' +
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
    if (d.q) showQuest(d.q);
    else if (d.h) location.hash = d.h;
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

  /* ------------------------------------------------------------ 启动 */
  buildNav();
  render();
  window.X2App = { openModal: openModal, closeModal: closeModal, showQuest: showQuest, render: render };
})();
