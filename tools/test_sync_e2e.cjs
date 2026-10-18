// 跨设备同步的端到端验收测试
// 用两个独立的 jsdom 实例模拟「设备 A」「设备 B」（各自独立 localStorage），
// 通过线上真实的 /api/sync 接口同步，验证同一 ID 的「已完成标记」在两端一致。
//
// 用法：node tools/test_sync_e2e.cjs [https://xb2-guide.pages.dev]
const path = require("path");
const fs = require("fs");

const WS = path.resolve(__dirname, "..");
const SITE = path.join(WS, "site");
const BASE = process.argv[2] || "https://xb2-guide.pages.dev";
const { JSDOM } = require(path.join(WS, ".npm", "node_modules", "jsdom"));

const FILES = ["data/index.js", "data/quests.js", "data/questflows.js", "data/chapters.js",
  "data/systems.js", "data/codex.js", "data/extras.js", "data/mag.js", "data/maps.js",
  "assets/map.js", "assets/sync.js", "assets/app.js"];

function bootDevice(label) {
  const html = fs.readFileSync(path.join(SITE, "index.html"), "utf8").replace(/<script[^>]*><\/script>/g, "");
  const dom = new JSDOM(html, { url: BASE + "/index.html#/home", pretendToBeVisual: true });
  const { window } = dom;
  const { document } = window;

  // 让 sync.js 里的相对路径 fetch("/api/sync") 走真实网络
  window.fetch = function (input, init) {
    const url = typeof input === "string" ? new URL(input, BASE).toString() : input;
    return globalThis.fetch(url, init);
  };
  window.confirm = () => true;

  for (const f of FILES) {
    const code = fs.readFileSync(path.join(SITE, f), "utf8");
    const mm = (window.matchMedia && window.matchMedia.bind(window)) ||
      function () { return { matches: false, addListener() {}, removeListener() {} }; };
    new Function("window", "document", "location", "localStorage", "navigator", "matchMedia", "fetch", "confirm", code)(
      window, document, window.location, window.localStorage, window.navigator, mm, window.fetch, window.confirm);
  }
  return { dom, window, document, label };
}

function setDone(dev, key) {
  // key: "mapId|layer|x|z"
  const [mapId, layer, x, z] = key.split("|");
  dev.window.X2Map.setDone(mapId, layer, { x: +x, z: +z }, true);
}

const results = [];
function check(name, pass, extra) {
  results.push({ name, pass, extra });
  console.log((pass ? "  PASS  " : "  FAIL  ") + name + (extra ? "   << " + extra : ""));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const uid = "e2e-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  console.log("测试用 ID:", uid, "| 站点:", BASE, "\n");

  // ---------- 设备 A ----------
  const A = bootDevice("A");
  A.window.localStorage.setItem("x2.sync.id", uid);
  setDone(A, "ma05a_f02|tbox|1.5|2.5");
  setDone(A, "ma05a_f02|colle|3.5|4.5");
  setDone(A, "ma05a_f02|tbox|10|20");
  const aLocal = A.window.X2Map.exportDone();
  check("设备 A 本机记下 3 个标记", Object.keys(aLocal).length === 3, Object.keys(aLocal).length + " 个");
  const pushOk = await A.window.X2Sync.push();
  check("设备 A 上传成功", pushOk === true, A.window.X2Sync.status());

  // ---------- 设备 B（全新 localStorage，等于另一台设备） ----------
  await sleep(300);
  const B = bootDevice("B");
  B.window.localStorage.setItem("x2.sync.id", uid);
  const bBefore = B.window.X2Map.exportDone();
  check("设备 B 登录前本机为空", Object.keys(bBefore).length === 0, Object.keys(bBefore).length + " 个");
  const pullOk = await B.window.X2Sync.pull();
  await sleep(200);
  const bAfter = B.window.X2Map.exportDone();
  const same = JSON.stringify(Object.keys(bAfter).sort()) === JSON.stringify(Object.keys(aLocal).sort());
  check("设备 B 拉取后与设备 A 完全一致", same,
    "A=" + Object.keys(aLocal).sort().join(",") + " | B=" + Object.keys(bAfter).sort().join(","));

  // ---------- 设备 B 勾选新的，设备 A 应能看到 ----------
  setDone(B, "ma05a_f02|npc|9|9");
  await B.window.X2Sync.push();
  await sleep(300);
  await A.window.X2Sync.pull();
  await sleep(200);
  const aFinal = A.window.X2Map.exportDone();
  check("设备 A 能看到设备 B 新增的标记", !!aFinal["ma05a_f02|npc|9|9"],
    Object.keys(aFinal).length + " 个：" + Object.keys(aFinal).sort().join(","));

  // ---------- 两台设备最终快照一致 ----------
  const keysA = Object.keys(A.window.X2Map.exportDone()).sort();
  const keysB = Object.keys(B.window.X2Map.exportDone()).sort();
  check("两端最终状态一致", JSON.stringify(keysA) === JSON.stringify(keysB),
    "A=" + keysA.length + " | B=" + keysB.length);

  // ---------- 取消勾选也能同步 ----------
  A.window.X2Map.setDone("ma05a_f02", "tbox", { x: 1.5, z: 2.5 }, false);
  await A.window.X2Sync.push();
  await sleep(300);
  await B.window.X2Sync.pull();
  await sleep(200);
  const bFinal = B.window.X2Map.exportDone();
  check("取消勾选也能同步到另一端", !bFinal["ma05a_f02|tbox|1.5|2.5"],
    Object.keys(bFinal).sort().join(","));

  const failed = results.filter((r) => !r.pass).length;
  console.log("\n" + (results.length - failed) + " passed, " + failed + " failed");
  process.exitCode = failed ? 1 : 0;
})();
