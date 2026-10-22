const fs = require("fs");
const p = "site/assets/map.js";
let s = fs.readFileSync(p, "utf8");

// 1) 卡片内统一走 markDone：写状态 + 重画 + 通知页面上的圆点
const old1 = `    // 外部改了完成状态后只需重画标记，不必重建整张卡片
    box._redoMarkers = function () { try { drawMarkers(); } catch (e) {} };`;
const new1 = `    // 外部改了完成状态后只需重画标记，不必重建整张卡片
    box._redoMarkers = function () { try { drawMarkers(); } catch (e) {} };
    // 地图弹窗里切换完成状态：写状态 → 重画标记 → 通知页面上的「本章可接支线」圆点
    box._markDone = function (layer, pt, on) {
      setDone(state.id, layer, pt, on);
      drawMarkers();
      if (window.X2App && window.X2App.refreshQuestDoneUI) window.X2App.refreshQuestDoneUI(pt && pt.t);
      return on;
    };`;
if (!s.includes(old1)) { console.error("pattern _redoMarkers missing"); process.exit(1); }
s = s.replace(old1, new1);

// 2) 弹窗按钮改调 _markDone
const old2 = `      setDone(state.id, layer, pt, !isDone(state.id, layer, pt));
      drawMarkers();`;
const new2 = `      if (box._markDone) box._markDone(layer, pt, !isDone(state.id, layer, pt));
      else setDone(state.id, layer, pt, !isDone(state.id, layer, pt));`;
if (!s.includes(old2)) { console.error("pattern setDone missing"); process.exit(1); }
s = s.replace(old2, new2);
fs.writeFileSync(p, s, "utf8");
console.log("map.js ok");
