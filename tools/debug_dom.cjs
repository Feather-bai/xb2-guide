const fs = require("fs");
const path = require("path");
const WS = "C:\\Users\\ZhuanZ\\Documents\\deepseek-harness\\default-workspace";
const SITE = path.join(WS, "site");
const { JSDOM } = require(path.join(WS, ".npm", "node_modules", "jsdom"));

const hash = process.argv[2] || "#/mag/vol1-005";
const html = fs.readFileSync(path.join(SITE, "index.html"), "utf8").replace(/<script[^>]*><\/script>/g, "");
const dom = new JSDOM(html, { url: "http://127.0.0.1:8899/index.html" + hash, pretendToBeVisual: true });
const { window } = dom;
const { document } = window;
const files = ["data/index.js", "data/quests.js", "data/chapters.js", "data/systems.js", "data/codex.js", "data/extras.js", "data/mag.js", "assets/app.js"];
for (const f of files) {
  const code = fs.readFileSync(path.join(SITE, f), "utf8");
  const mm = (window.matchMedia && window.matchMedia.bind(window)) || function () { return { matches: false, addListener() {}, removeListener() {} }; };
  new Function("window", "document", "location", "localStorage", "navigator", "matchMedia", code)(
    window, document, window.location, window.localStorage, window.navigator, mm);
}
const view = document.getElementById("view");
console.log("hash:", window.location.hash, "| view 长度:", view.innerHTML.length);
const objs = (view.innerHTML.match(/\[object Object\]/g) || []).length;
console.log("[object Object] 次数:", objs);
console.log("note-h 标签:", view.querySelectorAll(".note-h").length, "| 首个:", (view.querySelector(".note-h") || {}).textContent);
console.log("details:", view.querySelectorAll("details").length, "| .qlink:", view.querySelectorAll(".qlink").length);
const body = view.querySelector("details .acc-body");
console.log("acc-body:", body ? body.innerHTML.length : "无");
if (body) {
  const m = body.innerHTML.match(/\[\[[^\]]*\]\]/);
  console.log("残留 markup:", m ? m[0] : "无");
  console.log("片段:", body.innerHTML.slice(0, 400));
  console.log("内部 a 标签:", body.querySelectorAll("a").length);
}
