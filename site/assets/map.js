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
  /* 预处理地图索引：
     - 去掉 _shipoff / lodoff 这类与主图完全同尺寸的重复变体
     - 把 DLC「黄金之国」的地图从本体区域里拆出去，避免和本体地图混成一长串 */
  var DUP_VARIANT = /(_shipoff|lodoff)$/;
  var DLC_AREA = { "dlc3_ma41a": "黄金之国・古拉（DLC）" };
  var AREA_MAPS = (function () {
    var out = {};
    var has = {};
    MD.maps.forEach(function (m) { has[m.id] = true; });
    Object.keys(MD.areas || {}).forEach(function (a) {
      out[a] = out[a] || [];
      (MD.areas[a] || []).forEach(function (id) {
        if (DUP_VARIANT.test(id) && has[id.replace(DUP_VARIANT, "")]) return;
        var key = id.split("_").slice(0, 2).join("_");
        if (/^dlc3_/.test(id) && DLC_AREA[key] && a !== DLC_AREA[key]) {
          (out[DLC_AREA[key]] = out[DLC_AREA[key]] || []).push(id);
          return;
        }
        out[a].push(id);
      });
    });
    return out;
  })();
  var AREAS = Object.keys(AREA_MAPS);

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
      if (a && AREA_MAPS[a] && found.indexOf(a) === -1) found.push(a);
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

  /* 图层定义：on 为初始是否勾选；key 对应数据字段；prefix 是 wiki 页面名前缀 */
  var TYPE_META = {
    tbox: { key: "tbox", label: "宝箱", color: "#ffc857", glyph: "▣", on: true },
    colle: { key: "colle", label: "采集点", color: "#5ddc9a", glyph: "✦", on: true },
    salvage: { key: "salvage", label: "打捞点", color: "#4dd0e1", glyph: "⚓", on: true, prefix: "打捞点:" },
    enemy: { key: "enemy", label: "敌人", color: "#ff6b6b", glyph: "", dot: true, on: false, cluster: true, prefix: "敌人:" },
    npc: { key: "npc", label: "NPC", color: "#c792ea", glyph: "", dot: true, square: true, on: false, cluster: true, prefix: "NPC:" },
  };
  var LAYER_KEYS = Object.keys(TYPE_META);

  function defaultTypes() {
    var t = {};
    LAYER_KEYS.forEach(function (k) { t[k] = !!TYPE_META[k].on; });
    return t;
  }

  /* 敌人出现时段（POP_TIME 位掩码，换算同 wiki） */
  var POP_TIME = {
    1: "7:00~11:59", 2: "12:00~15:59", 4: "16:00~18:59", 8: "19:00~23:59",
    16: "0:00~4:59", 32: "5:00~6:59", 64: "7:00~18:59", 128: "19:00~6:59", 256: "0:00~23:59",
  };
  /* 敌人出现天气（popWeather 低 4 位：晴 / WA / WB / WC，与 wiki 前端一致） */
  function weatherText(w) {
    if (w == null) return "";
    var bit = function (n) { return (w >> n) % 2; };
    var names = ["晴", "雨", "雷", "沙"];
    var hit = names.filter(function (_, i) { return bit(i); });
    return hit.length ? hit.join(" / ") : "";
  }

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

  /* 标记点 (PosX, PosZ) -> Leaflet [lat, lng]，完全照搬 wiki 前端（Xb2map.js）的换算。
     底图 bounds 为 [[-LowerZ,-LowerX],[-UpperZ,-UpperX]]，图像左边缘 = lng -UpperX；
     取 XOffset = LowerX + UpperX，则 lng = PosX - XOffset 让 PosX=LowerX 落在左边缘、随 PosX 单调右移。
     注意：不能写成 lng = -PosX，那会让所有标记点左右镜像（曾出现过这个 bug）。 */
  function markerLatLng(m, pt) {
    var b = m.b;
    return [-pt.z, pt.x - b[0] - b[2]];
  }

  /**
   * 渲染一个章节的地图卡片
   * @param {object} chapter 章节对象
   * @returns {HTMLElement}
   */
  function renderChapterMap(chapter) {
    var areas = detectAreas(chapter).filter(function (a) { return (AREA_MAPS[a] || []).length; });
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
      (AREA_MAPS[a] || []).forEach(function (id) { if (mapIds.indexOf(id) === -1) mapIds.push(id); });
    });

    var firstId = mapIds[0];
    var state = { id: firstId, types: defaultTypes(), key: "" };

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
      return (AREA_MAPS[area] || []).slice();
    }

    function currentArea() {
      return MAPS[state.id] ? MAPS[state.id].area : areas[0];
    }

    function renderAreas() {
      areaBox.innerHTML = "";
      areas.forEach(function (a) {
        var b = el("button", "chip" + (a === currentArea() ? " blue" : ""), esc(a) +
          ' <span class="chip-n">' + (AREA_MAPS[a] || []).length + "</span>");
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

    /* 地图标签：按 menuGroup 分组后只留末尾序号（如 格尔特蒙特 f01/f03 → 格尔特蒙特1 / 格尔特蒙特3，
       托里格镇 c_01 → 托里格镇1）。仅在「同一分组内」序号撞车时才退回完整后缀区分。 */
    function groupLabels(ids) {
      var P = ids.map(function (id) {
        var m = MAPS[id] || {};
        var s = id.replace(/^(dlc3_)?/, "").replace(/(shipoff|lodoff)$/, "");
        var mm = s.match(/(\d+)([a-z]*)$/i);
        return { grp: m.group || m.area || "", num: mm ? +mm[1] : null, post: mm ? mm[2].toLowerCase() : "", full: s };
      });
      var count = {};
      P.forEach(function (p) { if (p.num != null) { var k = p.grp + "|" + p.num + p.post; count[k] = (count[k] || 0) + 1; } });
      return P.map(function (p) {
        if (p.num == null) return "";     // 没有序号的地图只显示分组名（如「废弃工厂」）
        return count[p.grp + "|" + p.num + p.post] > 1 ? p.full : p.num + p.post;
      });
    }

    function renderMaps() {
      var ids = areaMaps(currentArea());
      var labs = groupLabels(ids);
      mapBox.innerHTML = "";
      ids.forEach(function (id, i) {
        var m = MAPS[id];
        if (!m) return;
        var label = (m.group || m.area) + labs[i];
        var b = el("button", "chip" + (id === state.id ? " blue" : ""), esc(label));
        b.type = "button";
        b.title = m.area + " · " + m.id + "（" + m.w + "×" + m.h + "）";
        b.addEventListener("click", function () { state.id = id; renderMaps(); showMap(); });
        mapBox.appendChild(b);
      });
    }

    function renderTypes() {
      typeBox.innerHTML = "";
      var m = MAPS[state.id] || {};
      LAYER_KEYS.forEach(function (t) {
        var cnt = (m[t] || []).length;
        var b = el("button", "chip map-type" + (state.types[t] ? " on" : "") + (cnt ? "" : " no-data"),
          '<i class="dot" style="background:' + TYPE_META[t].color + (TYPE_META[t].square ? ";border-radius:2px" : "") + '"></i>' +
          TYPE_META[t].label + ' <span class="chip-n">' + cnt + "</span>");
        b.type = "button";
        if (!cnt) b.disabled = true;
        b.addEventListener("click", function () {
          if (!cnt) return;
          state.types[t] = !state.types[t];
          renderTypes(); showMap();
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
      // 底图边界：左下 (LowerX, LowerZ)、右上 (UpperX, UpperZ)，取负后作为 [lat, lng]
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
      var total = LAYER_KEYS.reduce(function (a, t) { return a + (m[t] || []).length; }, 0);

      // 组装每个图层的待绘点（敌人 / NPC 这类密集图层用聚合层渲染）
      var groups = [];
      LAYER_KEYS.forEach(function (t) {
        if (!state.types[t]) return;
        var pts = (m[t] || []).filter(function (p) {
          if (!key) return true;
          var hay = ((p.t || "") + " " + (p.n || "") + " " + (p.type || "")).toLowerCase();
          return hay.indexOf(key) > -1;
        });
        if (!pts.length) return;
        groups.push({ t: t, pts: pts });
        shown += pts.length;
      });

      if (map) {
        if (layers.markers) { map.removeLayer(layers.markers); layers.markers = null; }
        var outer = window.L.layerGroup();
        groups.forEach(function (g) {
          var meta = TYPE_META[g.t];
          // 密集图层用聚合，避免几百个点挤在一起卡顿、也没法点
          var useCluster = !!meta.cluster && g.pts.length > 60 && !!window.L.markerClusterGroup;
          var layer = useCluster
            ? window.L.markerClusterGroup({ maxClusterRadius: 48, showCoverageOnHover: false, chunkedLoading: true })
            : window.L.layerGroup();
          var icon = layerIcon(meta);   // 同一图层共用一个图标实例
          g.pts.forEach(function (pt) { layer.addLayer(makeMarker(pt, meta, icon)); });
          outer.addLayer(layer);
        });
        outer.addTo(map);
        layers.markers = outer;
      }
      status.innerHTML = "<b>" + esc(m.area) + "</b> · " + esc(m.id) +
        " ｜ 显示 <b>" + shown + "</b> / " + total + " 个标记点" +
        (total ? "" : "（该地图暂无标记数据，仅作底图参考）");
    }

    var iconCache = {};
    function layerIcon(meta) {
      var k = meta.label;
      if (!iconCache[k]) iconCache[k] = window.L.divIcon({
        className: "x2map-marker" + (meta.dot ? " dot" : ""),
        html: '<span' + (meta.square ? ' class="sq"' : "") + ' style="background:' + meta.color + '">' + (meta.glyph || "") + "</span>",
        iconSize: [18, 18], iconAnchor: [9, 9],
      });
      return iconCache[k];
    }

    function makeMarker(pt, meta, icon) {
      var mk = window.L.marker(markerLatLng(MAPS[state.id] || {}, pt), { icon: icon, title: pt.t || "", riseOnHover: true, x2pt: pt, x2meta: meta });
      // 用函数形式的 content：内容在悬停/点击时才生成，几百个点也能秒开
      mk.bindTooltip(function (l) { return markerTip(l.options.x2pt, l.options.x2meta); }, { direction: "top", offset: [0, -8] });
      mk.bindPopup(function (l) { return popupHtml(l.options.x2pt, l.options.x2meta); });
      return mk;
    }

    /* 弹窗标题：类型 + 名称（宝箱用编号，采集点用类型名，其余用中文名，缺则退回内部编号） */
    function poiName(pt, key) {
      if (key === "tbox") return pt.t || "";
      if (key === "colle") return pt.type || pt.n || pt.t || "";
      return pt.n || pt.t || "";
    }

    function markerTip(pt, meta) {
      return "<b>" + esc(meta.label + "：" + poiName(pt, meta.key)) + "</b>";
    }

    function popupHtml(pt, meta) {
      var h = '<div class="x2pop"><b>' + esc(meta.label + "：" + poiName(pt, meta.key)) + "</b>";
      if (meta.key === "tbox") {
        if (pt.pop) h += "<div>内容：" + esc(pt.pop) + "</div>";
        if (pt.gold) h += "<div>金币：" + esc(pt.gold) + "</div>";
        if (pt.skill) h += "<div>开启所需场景技能：" + esc(pt.skill) + "</div>";
      } else if (meta.key === "colle") {
        var d = (MD.colleDrops || {})[pt.type];
        if (d && d.drops && d.drops.length) {
          h += '<div class="x2pop-drops">' + d.drops.map(function (x) {
            var p = String(x[1] || ""); if (p && !/%/.test(p)) p += "%";
            return '<span class="x2pop-item">' + esc(x[0]) + '</span><span class="x2pop-p">' + esc(p) + "</span>";
          }).join("") + "</div>";
        }
        if (d && d.multi) h += '<div class="x2pop-sub">单次采集数量：' + esc(d.multi) + "</div>";
      } else if (meta.key === "enemy") {
        if (POP_TIME[pt.pop]) h += "<div>出现时段：" + esc(POP_TIME[pt.pop]) + "</div>";
        var w = weatherText(pt.w); if (w) h += "<div>出现天气：" + esc(w) + "</div>";
      }
      // wiki 链接：宝箱编号 / 采集点类型名 / 其余用中文名
      var page = "";
      if (meta.key === "tbox" && /^\d+$/.test(pt.t || "")) page = "宝箱:" + pt.t;
      else if (meta.key === "colle" && pt.type) page = "采集点:" + pt.type;
      else if (pt.n) page = meta.prefix + pt.n;
      if (page) {
        var label = meta.key === "salvage" ? "具体打捞物品在 wiki 查看 ↗" : "在 wiki 查看 ↗";
        h += '<div class="x2pop-link"><a href="' + esc(wikiUrl(page)) + '" target="_blank" rel="noopener">' + label + "</a></div>";
      }
      return h + "</div>";
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

  window.X2Map = { renderChapterMap: renderChapterMap, mountChapters: mountChapters, detectAreas: detectAreas, MAPS: MAPS, markerLatLng: markerLatLng };
})();
