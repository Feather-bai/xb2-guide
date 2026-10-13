/* =========================================================================
   异度之刃2 完整攻略站 — 互动地图组件
   用 Leaflet 渲染 wiki 的底图（CRS.Simple + imageOverlay），
   坐标与标记来自 wiki 的 SMAP 数据（PosX / PosZ）与 Mapinfo JSON。
   支持：拖动 / 缩放 / 区域切换 / 标记类型筛选 / 名称搜索。
   ========================================================================= */
(function () {
  "use strict";

  var MD = (window.X2 && window.X2.mapsData) || { areas: {}, maps: [] };
  var MAPS = {};
  MD.maps.forEach(function (m) { MAPS[m.id] = m; });

  /* 章节 -> 区域：自动扫描章节正文里出现的地名，命中地图库里的区域名 */
  var ALIAS = {
    "利贝拉里塔斯": "利贝拉里塔斯岛屿群",
    "群岛": "利贝拉里塔斯岛屿群",
    "阿伐利缇亚": "阿伐利缇亚商会",
    "格尔特蒙特": "阿伐利缇亚商会",
    "涡潮号": "云海探查船 涡潮号",
    "英维迪亚": "英维迪亚烈王国",
    "英维迪亚烈": "英维迪亚烈王国",
    "斯佩比亚": "斯佩比亚帝国",
    "洛修利亚": "洛修利亚王国",
    "阿卡狄亚": "阿卡狄亚教廷",
    "教廷": "阿卡狄亚教廷",
    "莫尔斯之地": "世界树",
    "莫尔斯": "莫尔斯断崖",
    "檀佩兰提亚": "檀佩兰提亚",
    "伊拉": "伊拉王国",
    "第一低轨道站": "第一低轨道站",
  };
  var AREAS = Object.keys(MD.areas || {});

  function chapterText(ch) {
    var parts = [];
    if (ch.summary) parts.push(ch.summary);
    (ch.keypoints || []).forEach(function (k) {
      parts.push(typeof k === "string" ? k : (k.title || "") + " " + (k.text || ""));
    });
    (ch.steps || []).forEach(function (s) {
      parts.push(s.title || "");
      if (s.body) parts.push(s.body);
      (s.notes || []).forEach(function (n) { parts.push((n.title || "") + " " + (n.text || "")); });
    });
    (ch.place || []).forEach(function (p) { parts.push(p); });
    (ch.quests || []).forEach(function (q) { parts.push(q); });
    return parts.join(" ");
  }

  /** 找出该章节涉及的地区：优先 position 字段，其次扫描正文命中，最后回退到地标名 */
  function detectAreas(ch, landmarks) {
    var found = [];
    function push(a) {
      if (a && MD.areas[a] && found.indexOf(a) === -1) found.push(a);
    }
    // 1) 正文里出现区域名
    var text = chapterText(ch);
    AREAS.forEach(function (a) {
      if (text.indexOf(a) > -1) push(a);
    });
    // 2) 别名
    Object.keys(ALIAS).forEach(function (k) {
      if (text.indexOf(k) > -1) push(ALIAS[k]);
    });
    // 3) place 字段优先排前
    (ch.place || []).forEach(function (p) {
      Object.keys(ALIAS).forEach(function (k) {
        if (p.indexOf(k) > -1) {
          var a = ALIAS[k];
          var i = found.indexOf(a);
          if (i > 0) { found.splice(i, 1); found.unshift(a); }
        }
      });
      AREAS.forEach(function (a) {
        if (p.indexOf(a) > -1) {
          var j = found.indexOf(a);
          if (j > 0) { found.splice(j, 1); found.unshift(a); }
        }
      });
    });
    return found;
  }

  var TYPE_META = {
    tbox: { label: "宝箱", color: "#ffc857", glyph: "▣" },
    colle: { label: "采集点", color: "#5ddc9a", glyph: "✦" },
  };

  var uid = 0;

  function el(tag, cls, html) {
    var d = document.createElement(tag);
    if (cls) d.className = cls;
    if (html != null) d.innerHTML = html;
    return d;
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function wikiUrl(title) {
    return "https://xenoblade2.cn/" + encodeURIComponent(String(title).replace(/ /g, "_"));
  }

  /**
   * 渲染一个章节的地图卡片
   * @param {object} chapter 章节对象
   * @returns {HTMLElement}
   */
  function renderChapterMap(chapter) {
    var areas = detectAreas(chapter).filter(function (a) { return (MD.areas[a] || []).length; });
    var box = el("section", "mapcard");
    box.id = "mapcard-" + chapter.id;

    if (!areas.length) {
      box.innerHTML = '<div class="mapcard-head"><h2>互动地图</h2></div>' +
        '<div class="map-empty">本章对应的区域暂时没有可用的地图数据。</div>';
      return box;
    }

    // 该章节涉及的地图（保持区域顺序）
    var mapIds = [];
    areas.forEach(function (a) {
      (MD.areas[a] || []).forEach(function (id) { if (mapIds.indexOf(id) === -1) mapIds.push(id); });
    });

    var firstId = mapIds[0];
    var state = { id: firstId, types: { tbox: true, colle: true }, key: "" };

    box.innerHTML =
      '<div class="mapcard-head">' +
        '<h2>互动地图</h2>' +
        '<span class="map-hint">拖动 / 滚轮缩放 · 数据来自 wiki</span>' +
      "</div>" +
      '<div class="map-toolbar">' +
        '<div class="map-areas" role="tablist"></div>' +
      "</div>" +
      '<div class="map-toolbar map-toolbar2">' +
        '<div class="map-maps" role="tablist"></div>' +
      "</div>" +
      '<div class="map-filters">' +
        '<div class="map-types"></div>' +
        '<input class="map-search" type="search" placeholder="筛选标记点名称…">' +
      "</div>" +
      '<div class="map-canvas"></div>' +
      '<div class="map-status"></div>';

    var areaBox = box.querySelector(".map-areas");
    var mapBox = box.querySelector(".map-maps");
    var typeBox = box.querySelector(".map-types");
    var search = box.querySelector(".map-search");
    var canvas = box.querySelector(".map-canvas");
    var status = box.querySelector(".map-status");

    var leafletMap = null;
    var layers = { markers: null };
    var node = "map-" + (++uid);

    function areaMaps(area) {
      return (MD.areas[area] || []).slice();
    }

    function currentArea() {
      return MAPS[state.id] ? MAPS[state.id].area : areas[0];
    }

    function renderAreas() {
      areaBox.innerHTML = "";
      areas.forEach(function (a) {
        var b = el("button", "chip" + (a === currentArea() ? " blue" : ""), esc(a) +
          ' <span class="chip-n">' + (MD.areas[a] || []).length + "</span>");
        b.type = "button";
        if (a === currentArea()) b.classList.add("active");
        b.addEventListener("click", function () {
          var ids = areaMaps(a);
          if (!ids.length) return;
          state.id = ids[0];
          renderAreas(); renderMaps(); showMap();
        });
        areaBox.appendChild(b);
      });
    }

    function renderMaps() {
      mapBox.innerHTML = "";
      areaMaps(currentArea()).forEach(function (id) {
        var m = MAPS[id];
        if (!m) return;
        var b = el("button", "chip" + (id === state.id ? " blue" : ""),
          esc(m.group ? m.group + "・" + (m.id.indexOf("floor") > -1 ? m.id.split("_").pop() : m.id) : m.id));
        b.type = "button";
        b.title = m.area + " · " + m.id + "（" + m.w + "×" + m.h + "）";
        b.addEventListener("click", function () { state.id = id; renderMaps(); showMap(); });
        mapBox.appendChild(b);
      });
    }

    function renderTypes() {
      typeBox.innerHTML = "";
      Object.keys(TYPE_META).forEach(function (t) {
        var m = MAPS[state.id] || { tbox: [], colle: [] };
        var cnt = (m[t] || []).length;
        var b = el("button", "chip map-type" + (state.types[t] ? " on" : ""),
          '<i class="dot" style="background:' + TYPE_META[t].color + '"></i>' + TYPE_META[t].label +
          ' <span class="chip-n">' + cnt + "</span>");
        b.type = "button";
        b.addEventListener("click", function () {
          state.types[t] = !state.types[t];
          renderTypes(); drawMarkers();
        });
        typeBox.appendChild(b);
      });
    }

    function ensureMap() {
      if (leafletMap) return leafletMap;
      if (!window.L) return null;
      leafletMap = window.L.map(canvas, {
        crs: window.L.CRS.Simple,
        minZoom: -3, maxZoom: 3, zoomSnap: 0.25, zoomDelta: 0.5,
        attributionControl: true, doubleClickZoom: false, zoomControl: true,
      });
      window.L.control.scale({ imperial: false, metric: true }).addTo(leafletMap);
      return leafletMap;
    }

    function boundsOf(m) {
      // wiki 的换算：左下 (LowerX, LowerZ)、右上 (UpperX, UpperZ)，取负后作为 [lat, lng]
      var b = m.b;
      return [[-b[1], -b[0]], [-b[3], -b[2]]];
    }

    function showMap() {
      var m = MAPS[state.id];
      if (!m) return;
      var map = ensureMap();
      var b = boundsOf(m);
      if (map) {
        if (layers.img) map.removeLayer(layers.img);
        if (layers.markers) { map.removeLayer(layers.markers); layers.markers = null; }
        layers.img = window.L.imageOverlay(m.img, b, { className: "x2map-img" });
        layers.img.addTo(map);
        map.fitBounds(b);
        map.setMaxBounds([
          [Math.min(b[0][0], b[1][0]) - 40, Math.min(b[0][1], b[1][1]) - 40],
          [Math.max(b[0][0], b[1][0]) + 40, Math.max(b[0][1], b[1][1]) + 40],
        ]);
        map.attributionControl.setPrefix("");
        map.attributionControl._container.innerHTML =
          '底图与标记数据来自 <a href="https://xenoblade2.cn/" target="_blank" rel="noopener">乐园数据管理室</a>（CC BY-NC-SA 4.0）';
        // 容器尺寸在插入 DOM 后才正确
        setTimeout(function () { try { map.invalidateSize(); } catch (e) {} }, 60);
      } else {
        canvas.innerHTML = '<img class="x2map-fallback" src="' + esc(m.img) + '" alt="' + esc(m.area) + '">' +
          '<div class="map-empty">地图库未加载，先显示底图。</div>';
      }
      renderTypes();
      drawMarkers();
    }

    function drawMarkers() {
      var map = leafletMap;
      var m = MAPS[state.id] || {};
      var key = (state.key || "").trim().toLowerCase();
      var shown = 0;
      var total = (m.tbox || []).length + (m.colle || []).length;
      if (map) {
        if (layers.markers) { map.removeLayer(layers.markers); layers.markers = null; }
        var group = window.L.layerGroup();
        Object.keys(TYPE_META).forEach(function (t) {
          if (!state.types[t]) return;
          (m[t] || []).forEach(function (pt) {
            var title = pt.t || "";
            if (key && title.toLowerCase().indexOf(key) === -1) return;
            var meta = TYPE_META[t];
            var icon = window.L.divIcon({
              className: "x2map-marker",
              html: '<span style="background:' + meta.color + '">' + meta.glyph + "</span>",
              iconSize: [18, 18], iconAnchor: [9, 9],
            });
            var mk = window.L.marker([-pt.z, -pt.x], { icon: icon, title: title, riseOnHover: true });
            var tip = "<b>" + esc(title) + "</b>";
            if (pt.pop) tip += "<br>内容：" + esc(pt.pop);
            if (pt.gold) tip += "<br>金币：" + esc(pt.gold);
            mk.bindTooltip(tip, { direction: "top", offset: [0, -8] });
            mk.bindPopup(
              '<div class="x2pop"><b>' + esc(title) + "</b>" +
              (pt.pop ? "<div>内容：" + esc(pt.pop) + "</div>" : "") +
              (pt.gold ? "<div>金币：" + esc(pt.gold) + "</div>" : "") +
              '<div class="x2pop-sub">' + meta.label + " · 坐标 " + pt.x.toFixed(1) + ", " + pt.z.toFixed(1) + "</div>" +
              '<div class="x2pop-link"><a href="' + esc(wikiUrl(pt.t)) + '" target="_blank" rel="noopener">在 wiki 查看 ↗</a></div>' +
              "</div>"
            );
            mk.addTo(group);
            shown++;
          });
        });
        group.addTo(map);
        layers.markers = group;
      } else {
        // 无 Leaflet 时只统计数量
        Object.keys(TYPE_META).forEach(function (t) {
          if (!state.types[t]) return;
          (m[t] || []).forEach(function (pt) {
            if (key && (pt.t || "").toLowerCase().indexOf(key) === -1) return;
            shown++;
          });
        });
      }
      status.innerHTML = "<b>" + esc(m.area) + "</b> · " + esc(m.id) +
        " ｜ 显示 <b>" + shown + "</b> / " + total + " 个标记点" +
        (total ? "" : "（该地图暂无标记数据，仅作底图参考）");
    }

    search.addEventListener("input", function () {
      state.key = search.value;
      drawMarkers();
    });

    box._showMap = showMap;
    renderAreas();
    renderMaps();
    // 初始地图：章节地点列表里的区域优先（越靠前权重越高），其次按标记点数量
    var placeText = (chapter.place || []).join(" ");
    var text = chapterText(chapter);
    var best = null;
    mapIds.forEach(function (id) {
      var mm = MAPS[id] || {};
      var n = (mm.tbox || []).length + (mm.colle || []).length;
      if (!n) return;
      var placeHit = mm.area && placeText.indexOf(mm.area) > -1;
      var groupHit = mm.group && (placeText.indexOf(mm.group) > -1 || text.indexOf(mm.group) > -1);
      var score = n + (placeHit ? 200000 : 0) + (groupHit ? 50000 : 0);
      if (!best || score > best.score) best = { id: id, score: score, n: n, area: mm.area, group: mm.group };
    });
    if (best) state.id = best.id;
    // 首选区域排到最前，方便切换
    if (best && best.area && areas.indexOf(best.area) > 0) {
      areas.splice(areas.indexOf(best.area), 1);
      areas.unshift(best.area);
    }
    renderAreas();
    renderMaps();
    renderTypes();
    // 同步初始化（容器插入 DOM 后由 requestAnimationFrame 做尺寸校正）
    showMap();
    var raf = window.requestAnimationFrame || function (fn) { return setTimeout(fn, 0); };
    raf(function () {
      if (leafletMap) { try { leafletMap.invalidateSize(); } catch (e) {} }
    });
    return box;
  }

  /** 页面渲染完后调用：把地图挂到每章「流程步骤」上方 */
  function mountChapters() {
    var view = document.getElementById("view");
    if (!view) return;
    var hosts = view.querySelectorAll("[data-map-host]");
    Array.prototype.forEach.call(hosts, function (host) {
      var id = host.getAttribute("data-map-host");
      var ch = (window.X2.chapters || []).filter(function (c) { return c.id === id; })[0];
      if (!ch) return;
      host.innerHTML = "";
      var card = renderChapterMap(ch);
      host.appendChild(card);
      // 容器此刻才进入 DOM，做一次尺寸校正
      var raf = window.requestAnimationFrame || function (fn) { return setTimeout(fn, 0); };
      raf(function () {
        try { card._showMap(); } catch (e) { /* 忽略单张地图的渲染错误 */ }
      });
    });
  }

  window.X2Map = { renderChapterMap: renderChapterMap, mountChapters: mountChapters, detectAreas: detectAreas, MAPS: MAPS };
})();
