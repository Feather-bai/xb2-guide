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
    quest: { key: "quest", label: "任务接取点", color: "#ffa94d", glyph: "!", on: true },
  };
  /* 深链种类 -> 图层键 / 反向索引 / 提示前缀 */
  var LINK_KINDS = {
    npc: { layer: "npc", index: "npcIndex", label: "NPC" },
    enemy: { layer: "enemy", index: "enemyIndex", label: "敌人" },
    item: { layer: "colle", index: "itemIndex", label: "道具" },
    quest: { layer: "quest", index: "questIndex", label: "任务接取点" },
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
  var MAP_INSTANCES = [];   // 已创建的地图实例（窗口尺寸变化时统一定位）
  var resizeBound = false;
  function bindResize() {
    if (resizeBound) return;
    resizeBound = true;
    var t = null;
    window.addEventListener("resize", function () {
      clearTimeout(t);
      t = setTimeout(function () {
        MAP_INSTANCES = MAP_INSTANCES.filter(function (x) { return x.canvas.isConnected; });
        MAP_INSTANCES.forEach(function (x) { try { x.map.invalidateSize(); } catch (e) {} });
      }, 220);
    });
  }

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
   * 章节 -> 该章地图卡片会列出哪些地图（与 renderChapterMap 内一致）
   * @returns {string[]} 地图 id 列表
   */
  function chapterMaps(chapter) {
    var areas = detectAreas(chapter).filter(function (a) { return (AREA_MAPS[a] || []).length; });
    var ids = [];
    areas.forEach(function (a) {
      (AREA_MAPS[a] || []).forEach(function (id) { if (ids.indexOf(id) === -1) ids.push(id); });
    });
    return ids;
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
    var mapIds = chapterMaps(chapter);

    var firstId = mapIds[0];
    // chap: 当前章节 id；questAll: 任务接取点是只看本章解锁的，还是全看
    var state = { id: firstId, types: defaultTypes(), key: "", chap: chapter.id, questAll: false };

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
        '<input class="map-search" type="search" placeholder="筛选标记点 / 搜道具、NPC…">' +
      "</div>" +
      '<div class="map-hits" hidden></div>' +
      '<div class="map-canvas"></div>' +
      '<div class="map-status"></div>';

    var areaBox = box.querySelector(".map-areas");
    var mapBox = box.querySelector(".map-maps");
    var typeBox = box.querySelector(".map-types");
    var search = box.querySelector(".map-search");
    var hitsBox = box.querySelector(".map-hits");
    var canvas = box.querySelector(".map-canvas");
    var status = box.querySelector(".map-status");

    var leafletMap = null;
    var layers = { markers: null };
    var layerGroups = {};     // 图层键 -> 实际绘制的图层（可能是聚合层），深链时要用
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
        // zoomSnap 用 0：fitBounds 时取精确缩放，否则会被吸附到下一档，
        // 瘦高的地图（如 ma10a_f02）会白白缩掉一截、显得很小
        minZoom: -3, maxZoom: 3, zoomSnap: 0, zoomDelta: 0.5,
        attributionControl: true, doubleClickZoom: false, zoomControl: true,
        // 自己处理弹窗平移（见下方 popupopen）：Leaflet 自带的 autoPan
        // 对高弹窗推不到位，顶端会被画布裁掉，也会和手动拖动打架
        autoPan: false,
      });
      window.L.control.scale({ imperial: false, metric: true }).addTo(leafletMap);
      MAP_INSTANCES.push({ map: leafletMap, canvas: canvas });
      bindResize();
      /* 拖动地图时，底下的标记会从光标下滑过。Leaflet 在拖动中不会派发 mouseout，
         但 mouseover 还是会打在新滑进来的标记上，于是悬停标签（tooltip）只会加不会减，
         一拖就攒一堆 —— 用户看到的就是「掠过就弹、还不消失」。
         拖拽期间直接停掉标记的交互层，拖完再恢复并把残留的标签关干净。 */
      var dragging = false;
      var dragResetTimer = null;
      var endDrag = function () {
        if (!dragging) return;
        dragging = false;
        clearTimeout(dragResetTimer);
        // 稍等一下再恢复：dragend 之后还会有一两个 mouseover 补刀
        dragResetTimer = setTimeout(function () {
          canvas.classList.remove("x2-dragging");
          clearTooltips();
        }, 80);
      };
      var clearTooltips = function () {
        Object.keys(MAPS).forEach(function (id) {
          var m = MAPS[id] || {};
          LAYER_KEYS.forEach(function (k) {
            (m[k] || []).forEach(function (pt) {
              if (pt._mk && pt._mk.closeTooltip) { try { pt._mk.closeTooltip(); } catch (e) {} }
            });
          });
        });
        // 兜底：清掉画布内残留的标签节点
        var pane = canvas.querySelector(".leaflet-tooltip-pane");
        if (pane) pane.innerHTML = "";
      };
      leafletMap.on("dragstart", function () {
        dragging = true;
        clearTimeout(dragResetTimer);
        clearTooltips();
        canvas.classList.add("x2-dragging");   // 拖动中不响应标记悬停
      });
      leafletMap.on("dragend", endDrag);
      // 兜底：任何一次鼠标松开都收尾，避免 dragend 没触发时 x2-dragging 卡住
      document.addEventListener("mouseup", endDrag, true);
      window.addEventListener("blur", endDrag);
      // 鼠标离开画布时也收尾并清一次残留
      canvas.addEventListener("mouseleave", function () { endDrag(); clearTooltips(); });
      box._clearTooltips = clearTooltips;
      // Leaflet 自带的 autoPan 对高弹窗推不到位（顶端被画布裁掉），这里在弹窗打开后自己校正。
      // 弹窗是异步布局的，所以要重试几帧直到位置稳定。
      leafletMap.on("popupopen", function (e) {
        var tries = 0;
        (function fix() {
          var pop = e.popup && e.popup.getElement && e.popup.getElement();
          if (!pop) return;
          var cbox = canvas.getBoundingClientRect();
          var pbox = pop.getBoundingClientRect();
          if (!pbox.height) { if (++tries < 10) setTimeout(fix, 40); return; }
          var dx = 0, dy = 0, m = 10;
          if (pbox.left < cbox.left + m) dx = pbox.left - cbox.left - m;
          else if (pbox.right > cbox.right - m) dx = pbox.right - cbox.right + m;
          if (pbox.top < cbox.top + m) dy = pbox.top - cbox.top - m;
          else if (pbox.bottom > cbox.bottom - m) dy = pbox.bottom - cbox.bottom + m;
          if (dx || dy) { try { leafletMap.panBy([dx, dy], { animate: false }); } catch (err) {} }
          if (++tries < 6) setTimeout(fix, 60);   // 再确认几帧（布局/动画可能又挪了）
        })();
      });
      box._map = leafletMap;
      return leafletMap;
    }

    function boundsOf(m) {
      // 底图边界：左下 (LowerX, LowerZ)、右上 (UpperX, UpperZ)，取负后作为 [lat, lng]
      var b = m.b;
      return [[-b[1], -b[0]], [-b[3], -b[2]]];
    }

    /* 把视野对准整张地图。
       必须在容器完成布局之后调用：容器还是 0×0 时 fitBounds 会算出退化的缩放级别，
       被 minZoom 夹到 -3，整张图缩成一小块、也没法拖动（曾经的「自动居中 / 拖不动」根因）。 */
    var fitPending = null;
    var pendingFitId = null;
    function fitToMap(map, b) {
      map.invalidateSize();
      if (map.getSize().x < 2) return false;    // 还没布局，等下一帧
      map.fitBounds(b);
      return true;
    }

    function showMap() {
      var m = MAPS[state.id];
      if (!m) return;
      var map = ensureMap();
      var b = boundsOf(m);
      if (map) {
        var sameMap = layers.imgMap === state.id;   // 切换图层时不要重置视野
        if (layers.img) map.removeLayer(layers.img);
        if (layers.markers) { map.removeLayer(layers.markers); layers.markers = null; }
        layers.img = window.L.imageOverlay(m.img, b, { className: "x2map-img" });
        layers.img.addTo(map);
        layers.imgMap = state.id;
        if (!sameMap) { fitPending = b; pendingFitId = state.id; }   // 视图对齐交给下一帧（等容器布局完）
        // 允许把地图任一点拖到画布中央：四周各留一个地图跨度，
        // 否则靠近边缘的标记点弹窗会被画布裁掉、还拖不动（曾只外扩 40 单位）
        var padX = Math.abs(b[1][1] - b[0][1]) || 100;
        var padY = Math.abs(b[0][0] - b[1][0]) || 100;
        map.setMaxBounds([
          [Math.min(b[0][0], b[1][0]) - padY, Math.min(b[0][1], b[1][1]) - padX],
          [Math.max(b[0][0], b[1][0]) + padY, Math.max(b[0][1], b[1][1]) + padX],
        ]);
        map.attributionControl.setPrefix("");
        map.attributionControl._container.innerHTML =
          '底图与标记数据来自 <a href="https://xenoblade2.cn/" target="_blank" rel="noopener">乐园数据管理室</a>（CC BY-NC-SA 4.0）';
        // 容器尺寸在插入 DOM 后才正确：布局完成后再对准视野
        setTimeout(function () {
          try { if (fitPending) { fitToMap(map, fitPending); fitPending = null; } else map.invalidateSize(); } catch (e) {}
        }, 60);
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
      layerGroups = {};
      LAYER_KEYS.forEach(function (t) {
        if (!state.types[t]) return;
        var pts = (m[t] || []).filter(function (p) {
          // 任务接取点默认只显示本章解锁的（避免每张图都堆满几章后的任务）
          if (t === "quest" && !state.questAll && p.c && p.c !== state.chap) return false;
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
          // 聚合可以关掉（深链定位时会临时关，见 focusMarker）：markercluster 里
          // 被聚起来的点不在 DOM 中，openPopup 不生效，还要依赖 zoomToShowLayer
          var useCluster = !!meta.cluster && g.pts.length > 60 && !!window.L.markerClusterGroup && !state.noCluster;
          var layer = useCluster
            ? window.L.markerClusterGroup({ maxClusterRadius: 48, showCoverageOnHover: false, chunkedLoading: true })
            : window.L.layerGroup();
          var icon = layerIcon(meta);   // 同一图层共用一个图标实例
          g.pts.forEach(function (pt) {
            var mk = makeMarker(pt, meta, icon);
            pt._mk = mk;                          // 记下句柄，供深链跳转时打开弹窗
            layer.addLayer(mk);
          });
          layerGroups[g.t] = layer;               // 记住图层，深链时判断是不是聚合层
          outer.addLayer(layer);
        });
        outer.addTo(map);
        layers.markers = outer;
      }
      var nm = "<b>" + esc(m.area) + "</b> · " + esc(m.id) +
        " ｜ 显示 <b>" + shown + "</b> / " + total + " 个标记点" +
        (total ? "" : "（该地图暂无标记数据，仅作底图参考）");
      // 任务接取点默认按本章过滤，给个「显示全部」开关
      if (state.types.quest && (m.quest || []).length) {
        var all = m.quest.length;
        nm += ' ｜ 任务接取点 ' + (state.questAll ? "全部 " + all + " 个" : "本章 " + (m.quest || []).filter(function (p) { return !p.c || p.c === state.chap; }).length + " / " + all + " 个") +
          ' <button type="button" class="qfilter" data-qall="' + (state.questAll ? "0" : "1") + '">' +
          (state.questAll ? "只看本章" : "显示全部") + "</button>";
      }
      status.innerHTML = nm;
    }

    status.addEventListener("click", function (e) {
      var b = e.target.closest("[data-qall]");
      if (!b) return;
      state.questAll = b.getAttribute("data-qall") === "1";
      drawMarkers();
    });
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
      var title = meta.key === "quest" ? pt.t : poiName(pt, meta.key);
      return "<b>" + esc(meta.label + "：" + title) + "</b>";
    }

    function popupHtml(pt, meta) {
      if (meta.key === "quest") return questPopupHtml(pt);
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

    /* 任务接取点：任务名 + 委托人，可点开任务浮窗 */
    function questPopupHtml(pt) {
      var h = '<div class="x2pop"><b>任务接取点：' + esc(pt.t || "") + "</b>";
      if (pt.n) h += "<div>委托人：" + esc(pt.n) + "</div>";
      h += '<div class="x2pop-link"><button type="button" class="qlink" data-quest="' + esc(pt.t || "") + '">查看任务详情</button></div>';
      return h + "</div>";
    }

    /* 搜索框：
       - 先按名字筛当前地图的标记点（原有行为）
       - 若输入命中了「可采集道具 / NPC / 任务」索引，则在下方列出所有可跳转的位置 */
    function renderHits() {
      var kw = (search.value || "").trim();
      hitsBox.innerHTML = "";
      if (kw.length < 1) { hitsBox.hidden = true; return; }
      var items = Object.keys(MD.itemIndex || {}).filter(function (n) { return n.indexOf(kw) > -1; }).slice(0, 12);
      var npcs = Object.keys(MD.npcIndex || {}).filter(function (n) { return n.indexOf(kw) > -1; }).slice(0, 12);
      var enemies = Object.keys(MD.enemyIndex || {}).filter(function (n) { return n.indexOf(kw) > -1; }).slice(0, 12);
      var quests = Object.keys(MD.questIndex || {}).filter(function (n) { return n.indexOf(kw) > -1; }).slice(0, 12);
      if (!items.length && !npcs.length && !enemies.length && !quests.length) { hitsBox.hidden = true; return; }
      var h = [];
      var locBtn = function (kind, name, label, sub) {
        return '<button type="button" class="hit" data-hk="' + kind + '" data-hn="' + esc(name) + '">' +
          '<span class="hit-n">' + esc(label) + '</span>' + (sub ? '<span class="hit-s">' + esc(sub) + "</span>" : "") + "</button>";
      };
      if (quests.length) {
        h.push('<div class="hits-g"><h5>任务接取点</h5>' + quests.map(function (n) {
          var maps = (MD.questIndex || {})[n] || [];
          return locBtn("quest", n, n, maps.join(" / "));
        }).join("") + "</div>");
      }
      if (npcs.length) {
        h.push('<div class="hits-g"><h5>NPC</h5>' + npcs.map(function (n) {
          return locBtn("npc", n, n, ((MD.npcIndex || {})[n] || []).length + " 处");
        }).join("") + "</div>");
      }
      if (enemies.length) {
        h.push('<div class="hits-g"><h5>敌人</h5>' + enemies.map(function (n) {
          return locBtn("enemy", n, n, ((MD.enemyIndex || {})[n] || []).length + " 处");
        }).join("") + "</div>");
      }
      if (items.length) {
        h.push('<div class="hits-g"><h5>道具获取点</h5>' + items.map(function (n) {
          return locBtn("item", n, n, ((MD.itemIndex || {})[n] || []).length + " 处");
        }).join("") + "</div>");
      }
      hitsBox.innerHTML = h.join("");
      hitsBox.hidden = false;
    }

    hitsBox.addEventListener("click", function (e) {
      var b = e.target.closest("[data-hk]");
      if (!b) return;
      var kind = b.getAttribute("data-hk"), name = b.getAttribute("data-hn");
      hitsBox.hidden = true;
      search.value = "";
      state.key = "";
      drawMarkers();
      if (kind === "quest") {
        var targets = locateTargets("quest", name);
        if (targets.length === 1) { focusMapTarget("quest", name, 0); return; }
        if (!targets.length) return;
        openPicker(name, targets);
        return;
      }
      var targets = locateTargets(kind, name);
      if (targets.length === 1) { focusMapTarget(kind, name, 0); return; }
      if (!targets.length) return;
      openPicker(name, targets);
    });

    search.addEventListener("input", function () {
      state.key = search.value;
      drawMarkers();
      renderHits();
    });

    /* 深链跳转：切到指定地图、打开指定图层，找到匹配的标记点并聚焦 + 弹出气泡。
       matchPt 返回命中的标记点，matchLayer/label 用于给出提示。 */
    function selectMap(mapId) {
      state.id = mapId;
      state.noCluster = false;   // 切图恢复聚合（深链定位时会临时关掉）
      renderAreas(); renderMaps(); renderTypes();
      showMap();
    }

    function focusMarker(mapId, layerKey, matchPt, hint) {
      if (!MAPS[mapId]) return false;
      state.types[layerKey] = true;
      state.key = "";
      search.value = "";
      selectMap(mapId);
      // 取消 selectMap 排队的「重新对准整张图」：它会在几十毫秒后 fitBounds，
      // 把刚定位好的视野冲掉、弹窗也被关掉（就是「跳过去但没弹窗」的原因）。
      // showMap 的延时回调里会重新判定，这里清掉 pendingFitId 就不会再对准。
      fitPending = null;
      pendingFitId = null;
      // 临时关掉聚合：被聚起来的点不在 DOM 里，openPopup 不生效。
      // 标记少、又已经放大到目标附近，不聚合也看得清。
      state.noCluster = true;
      drawMarkers();
      var pt = (MAPS[mapId][layerKey] || []).filter(matchPt)[0];
      if (!pt || !pt._mk) return false;
      var map = ensureMap();
      // 定位到目标并放大一点看清周围；不要用固定的大缩放（会顶到 maxZoom）
      var z = Math.min(map.getMaxZoom(), Math.max(map.getZoom() + 0.75, -0.5));
      try { map.setView(pt._mk.getLatLng(), z, { animate: false }); } catch (e) {}
      // 标出来：周围同类标记很多时，靠高亮圈一眼找到
      highlightMarker(map, pt._mk);

      var lg = layerGroups[layerKey];
      var clustered = !!(lg && lg.zoomToShowLayer);
      var tries = 0;
      var done = false;
      var pop = function () {
        if (done) return;
        var el = pt._mk.getElement && pt._mk.getElement();
        if (!el && tries < 40) { tries++; setTimeout(pop, 80); return; }   // 还在聚合里，等等
        done = true;
        try {
          pt._mk.openPopup();
          var e2 = pt._mk.getElement && pt._mk.getElement();
          if (e2) { e2.classList.add("x2hit"); var sp = e2.querySelector("span"); if (sp) sp.classList.add("x2hit"); }
        } catch (e) {}
      };
      if (clustered) {
        // 聚合层里这个点可能还没进 DOM，必须先让所在聚合展开，否则 openPopup 无效
        try { lg.zoomToShowLayer(pt._mk, pop); } catch (e) { pop(); }
      }
      /* 切换地图 / 重绘标记时，showMap 会 removeLayer 掉旧的标记层，
         Leaflet 的 onRemove 会顺手把弹窗关掉（就是「跳过去但没弹窗」的原因）。
         这些都在切换后的几十到几百毫秒内发生，顺序不定，所以这里开一个 1.5s 的
         「重开窗口」：期间只要弹窗被关掉就再打开；用户主动关（点 X / 点地图）时窗口也结束。 */
      var reopenUntil = 0;
      var onClose = function () {
        if (Date.now() > reopenUntil) return;
        done = false; tries = 0;
        setTimeout(pop, 60);
      };
      map.on("popupclose", onClose);
      reopenUntil = Date.now() + 1500;
      setTimeout(function () { map.off("popupclose", onClose); }, 1600);
      setTimeout(pop, 120);
      status.innerHTML = "<b>" + esc(MAPS[mapId].area) + "</b> · " + esc(mapId) +
        " ｜ 已定位：" + esc(hint || poiName(pt, TYPE_META[layerKey].key));
      return true;
    }

    /* 给定位到的标记加一个高亮圈，几秒后自动消失 */
    var hlTimer = null, hlEl = null;
    function highlightMarker(map, mk) {
      try {
        if (hlEl && hlEl.parentNode) hlEl.parentNode.removeChild(hlEl);
        if (hlTimer) clearTimeout(hlTimer);
        var ring = window.L.circleMarker(mk.getLatLng(), {
          radius: 22, color: "#ffd166", weight: 3, opacity: 1, fillColor: "#ffd166", fillOpacity: 0.18,
          className: "x2hl", interactive: false,
        }).addTo(map);
        hlEl = ring;
        hlTimer = setTimeout(function () { if (ring && ring.remove) ring.remove(); }, 6000);
      } catch (e) {}
    }

    box._focusMarker = focusMarker;
    box._chapterId = chapter.id;
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

  /** 列出所有会显示某张地图的章节（按章节顺序） */
  var _mapChapters = null;
  function chaptersForMap(mapId) {
    if (!_mapChapters) {
      _mapChapters = {};
      (window.X2.chapters || []).forEach(function (c) {
        chapterMaps(c).forEach(function (id) { (_mapChapters[id] = _mapChapters[id] || []).push(c.id); });
      });
    }
    return _mapChapters[mapId] || [];
  }

  /** 选一个能显示该地图的章节：优先当前所在章节，否则取最先出现该地图的章节 */
  /** 当前所在的章节 id（用于「本区域优先」判断） */
  function currentChapterId() {
    var m = /^#\/story\/([^/?]+)/.exec(location.hash || "");
    return m ? m[1] : null;
  }

  function pickChapter(mapId) {
    var list = chaptersForMap(mapId);
    if (!list.length) return null;
    var cur = currentChapterId();
    if (cur && list.indexOf(cur) > -1) return cur;
    return list[0];
  }

  /**
   * 深链：跳到互动地图的指定位置并弹出标记点。
   * @param {string} kind "npc" | "colle" | "salvage"
   * @param {string} name NPC 名 / 采集点类型名 / 打捞点名称
   */
  /**
   * 列出某个 NPC / 敌人 / 道具 / 任务的所有可定位位置（供「多位置时让用户选」）。
   * 排序：优先当前所在章节 → 其次最先出现该地图的章节。
   * 正文里提到的名字，几乎都是本区域的东西，所以把「跨到别的章节」排到最后，
   * 避免点「火鸡人」被带到另一章的地图去。
   */
  function locateTargets(kind, name) {
    if (!name) return [];
    var out = [];
    var cur = currentChapterId();
    var mkLabel = function (mid, extra) {
      var mm = MAPS[mid] || {};
      var where = mm.group || mm.area || mid;
      return (extra ? extra + "：" : "") + where;
    };
    var seenKey = {};
    var add = function (mid, k, key, extra) {
      var ch = pickChapter(mid);
      if (!ch) return;
      var dk = mid + "|" + k + "|" + key;
      if (seenKey[dk]) return;
      seenKey[dk] = 1;
      // 同一张图会出现在多章（如 ma05a_c_03 在 ch1/ch4/ch5 都有），
      // 只要当前章也列出这张图就算「本章」，不能只比对 pickChapter 的返回值。
      var here = cur ? chaptersForMap(mid).indexOf(cur) > -1 : true;
      out.push({ m: mid, k: k, key: key, c: ch, label: mkLabel(mid, extra), sameChap: here });
    };
    if (kind === "npc" || kind === "enemy") {
      ((MD[LINK_KINDS[kind].index] || {})[name] || []).forEach(function (mid) { add(mid, kind, name); });
    } else if (kind === "quest") {
      ((MD.questIndex || {})[name] || []).forEach(function (mid) { add(mid, "quest", name); });
    } else {
      // 同一种采集点在一张图上会有好几个点，合并成一条（跳过去后地图上仍看得到全部）
      ((MD.itemIndex || {})[name] || []).forEach(function (it) {
        add(it[0], it[2], it[1], it[2] === "salvage" ? "打捞点" : "采集点");
      });
    }
    out.sort(function (a, b) { return (b.sameChap ? 1 : 0) - (a.sameChap ? 1 : 0); });
    return out;
  }

  /** 该名字在**当前章节**是否有位置（自动链接用它，避免把本章的任务链到别章地图去）。
      不在章节页（系统/地图/图鉴等）时没有「当前章节」，就不做这个限制。 */
  function locatableHere(kind, name) {
    var cur = currentChapterId();
    if (!cur) return locatableAnywhere(name);
    return locateTargets(kind, name).some(function (t) { return t.sameChap; });
  }
  /** 该名字在任意章节是否有位置（显式 [[敌人:X]] 这类仍允许跳） */
  function locatableAnywhere(name) {
    var md = MD;
    return !!((md.npcIndex || {})[name] || (md.enemyIndex || {})[name] || (md.itemIndex || {})[name] || (md.questIndex || {})[name]);
  }

  /** 生成「在某个地图上命中某个标记点」的判定函数 */
  function matcherFor(kind, name, key) {
    if (kind === "npc" || kind === "enemy") return function (p) { return p.n === name; };
    if (kind === "quest") return function (p) { return p.t === name; };
    return function (p) { return p.type === key || p.n === key; };
  }

  /**
   * 深链：跳到互动地图的指定位置并弹出标记点。
   * @param {string} kind "npc" | "item" | "quest"
   * @param {string} name NPC 名 / 道具名 / 任务名
   * @param {number} [idx] 指定第几个位置（不传则跳第一个）
   */
  function focusMapTarget(kind, name, idx) {
    var targets = locateTargets(kind, name);
    if (!targets.length) return false;
    var t = targets[idx || 0];
    if (!t) return false;
    var hint = kind === "npc" ? "NPC：" + name
      : kind === "enemy" ? "敌人：" + name
      : kind === "quest" ? "任务接取点：" + name
      : name + "（" + t.label + "）";
    return gotoAndFocus(t.c, t.m, t.k, matcherFor(t.k, name, t.key), hint);
  }

  /** 搜索定位：按类型 + 位置键直接聚焦 */
  function focusIndex(mapId, layerKey, keyValue, label) {
    if (!MAPS[mapId]) return false;
    var card = document.getElementById("mapcard-" + pickChapter(mapId));
    if (card && card._focusMarker) return card._focusMarker(mapId, layerKey, matcherFor(layerKey, keyValue, keyValue), label);
    return false;
  }

  /** 一个道具 / NPC 有多个位置时，弹一个选择列表让用户挑一个再跳 */
  function openPicker(name, targets) {
    var old = document.getElementById("x2picker");
    if (old) old.parentNode.removeChild(old);
    var box = el("div", "x2picker");
    box.id = "x2picker";
    box.innerHTML = '<div class="x2picker-panel"><h4>「' + esc(name) + '」可在 ' + targets.length + " 处获取，选择要跳转的位置：</h4>" +
      '<div class="x2picker-list">' + targets.map(function (t, i) {
        return '<button type="button" class="hit" data-pk="' + i + '"><span class="hit-n">' + esc(t.label) + "</span>" +
          (t.sameChap ? '<span class="hit-s">本章</span>' : '<span class="hit-s">第 ' + esc(String(t.c).replace(/^ch/, "").replace("final", "10")) + " 章</span>") + "</button>";
      }).join("") + "</div>" +
      '<button type="button" class="btn x2picker-close">取消</button></div>';
    function close() { if (box.parentNode) box.parentNode.removeChild(box); }
    box.addEventListener("click", function (e) {
      if (e.target === box || e.target.closest(".x2picker-close")) { close(); return; }
      var b = e.target.closest("[data-pk]");
      if (!b) return;
      var i = +b.getAttribute("data-pk");
      close();
      var t = targets[i];
      var hint = t.k === "npc" ? "NPC：" + name
        : t.k === "enemy" ? "敌人：" + name
        : t.k === "quest" ? "任务接取点：" + name
        : name + "（" + t.label + "）";
      gotoAndFocus(t.c, t.m, t.k, matcherFor(t.k, name, t.key), hint);
    });
    document.body.appendChild(box);
  }

  /** 切到章节并聚焦（若已在目标章节则直接聚焦），最多等 ~1.5s 让地图卡片挂上 */
  function gotoAndFocus(chapterId, mapId, layer, match, hint) {
    var already = location.hash === "#/story/" + chapterId;
    if (!already) location.hash = "#/story/" + chapterId;
    var tries = 0;
    (function attempt() {
      var card = document.getElementById("mapcard-" + chapterId);
      if (card && card._focusMarker) {
        if (card._focusMarker(mapId, layer, match, hint)) {
          try { card.scrollIntoView({ block: "center", behavior: already ? "smooth" : "auto" }); } catch (e) {}
        }
        return;
      }
      if (++tries < 40) setTimeout(attempt, 50);
    })();
    return true;
  }

  window.X2Map = {
    renderChapterMap: renderChapterMap, mountChapters: mountChapters, detectAreas: detectAreas,
    MAPS: MAPS, markerLatLng: markerLatLng, chapterMaps: chapterMaps,
    focusMapTarget: focusMapTarget, locateTargets: locateTargets, focusIndex: focusIndex,
    openPicker: openPicker, locatableHere: locatableHere, locatableAnywhere: locatableAnywhere,
  };
})();
