// 打印 getXb2mapByName 的完整实现（找出地图图片与地图元数据的来源）
const fs = require("fs");
const WS = "C:\\Users\\ZhuanZ\\Documents\\deepseek-harness\\default-workspace";
const s = fs.readFileSync(WS + "\\.extract\\x2map\\Xb2map.js", "utf8");

// 从 "function y(" 开始，截取到该函数结束（用括号配平粗切）
const start = s.indexOf("function y(");
const seg = s.slice(start, start + 3000);
console.log("=== getXb2mapByName 实现 ===");
console.log(seg.replace(/\n/g, " "));
console.log();

// 搜索地图图片相关：Image / ImageUrl / Bounds / LowerX 等
for (const kw of ["LowerX", "Image", "image", "Bounds", "mapName", "menuGroup", "menuOrder"]) {
  let i = -1;
  const hits = [];
  while ((i = s.indexOf(kw, i + 1)) !== -1 && hits.length < 3) hits.push(i);
  if (hits.length) {
    console.log("=== " + kw);
    for (const j of hits) console.log("   …" + s.slice(Math.max(0, j - 120), j + 160).replace(/\n/g, " ") + "…");
    console.log();
  }
}
