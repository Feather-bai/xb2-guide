// 打印 Xb2map.js 里地图数据请求的实现细节
const fs = require("fs");
const WS = "C:\\Users\\ZhuanZ\\Documents\\deepseek-harness\\default-workspace";
const s = fs.readFileSync(WS + "\\.extract\\x2map\\Xb2map.js", "utf8");

function show(needle, before, after, label) {
  const i = s.indexOf(needle);
  if (i === -1) {
    console.log("=== " + label + " 未找到");
    return;
  }
  console.log("=== " + label);
  console.log(s.slice(Math.max(0, i - before), i + after).replace(/\n/g, " "));
  console.log();
}

show('"/api.php"', 0, 1400, "数据请求实现");
show("imageOverlay", 700, 300, "地图图片与 bounds");
show("getXb2mapByName", 200, 500, "getXb2mapByName 定义处");
