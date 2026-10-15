// 各脚本共用的路径解析：优先用环境变量，其次从脚本位置向上找仓库根目录。
//
//   XB2_WORKSPACE  仓库根目录（默认自动探测）
//   XB2_APK_DB     解包后的 xenoblade2.db 路径（NPC / 任务数据需要，可选）
//
// 这样脚本不再依赖某台机器的绝对路径。
const fs = require("fs");
const path = require("path");

const MARKERS = ["site/index.html", "README.md", "tools"];

function findWorkspace() {
  if (process.env.XB2_WORKSPACE) return path.resolve(process.env.XB2_WORKSPACE);
  // tools/ 的上一级就是仓库根目录；再从那里向上兜底探测
  let dir = path.resolve(__dirname, "..");
  for (let i = 0; i < 6; i++) {
    if (MARKERS.every((m) => fs.existsSync(path.join(dir, m)))) return dir;
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return path.resolve(__dirname, "..");
}

const WS = findWorkspace();

// APK 解包目录（内含 assets/xenoblade2.db）的几个常见位置
const APK_CANDIDATES = [
  process.env.XB2_APK_DB,
  path.join(WS, "xb2-apk", "extracted", "assets", "xenoblade2.db"),
  path.join(WS, "..", "xb2-apk", "extracted", "assets", "xenoblade2.db"),
  "C:/Users/ZhuanZ/Desktop/work/xb2-apk/extracted/assets/xenoblade2.db",
].filter(Boolean);

function findApkDb() {
  for (const p of APK_CANDIDATES) {
    try {
      if (fs.existsSync(p)) return p;
    } catch (e) { /* 忽略无权限的候选路径 */ }
  }
  return APK_CANDIDATES[0];
}

module.exports = {
  WS,
  SITE: path.join(WS, "site"),
  DATA: path.join(WS, "site", "data"),
  SRC: path.join(WS, ".extract", "mapdata"),
  APK_DB: findApkDb(),
  findApkDb,
};
