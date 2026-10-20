const fs = require("fs");
const p = "site/assets/map.js";
let s = fs.readFileSync(p, "utf8");
// focusInDock：只在侧边地图里找卡片（章节页有同名 id 的内嵌地图卡片）
const from1 = '      var card = document.getElementById("mapcard-" + t.c);\n      if (card && card._focusMarker && document.getElementById("mapDock").contains(card)) {';
const to1 = '      var card = document.querySelector(\'#mapDock .mapcard[id="mapcard-\' + t.c + \'"]\');\n      if (card && card._focusMarker) {';
if (!s.includes(from1)) { console.error("focusInDock pattern missing"); process.exit(1); }
s = s.replace(from1, to1);
// gotoAndFocus：在页面视图里找（避免拿到侧边地图的同 id 卡片）
const from2 = '      var card = document.getElementById("mapcard-" + chapterId);';
const to2 = '      var card = document.querySelector(\'#view .mapcard[id="mapcard-\' + chapterId + \'"], .mapcard[id="mapcard-\' + chapterId + \'"]:not(#mapDock .mapcard)\');';
if (!s.includes(from2)) { console.error("gotoAndFocus pattern missing"); process.exit(1); }
s = s.replace(from2, to2);
fs.writeFileSync(p, s, "utf8");
console.log("ok");
