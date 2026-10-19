// 抓取 wiki 物品页的「获得地点」与「种类」，供图鉴用：
//   - 收藏道具 / 宝藏 按地区筛选 → item_regions.json  { "物品名": ["地区", ...] }
//   - 收藏道具 按类型筛选     → item_kinds.json    { "物品名": "矿石" }
//     APK 的收藏道具 item_type 有错位/空值（油牡蛎→机械、花俏螺栓→蔬菜、条纹瓢虫→敌人掉落），
//     wiki 页面的 |种类= 是准的，用来覆盖。
// 用法：node tools/fetch_item_regions.cjs
const fs = require("fs");
const path = require("path");
const https = require("https");

const WS = path.join(__dirname, "..");
const API = "https://xenoblade2.cn/api.php";
const UA = { "User-Agent": "Mozilla/5.0 (compatible; guide-archiver/1.0)" };

function get(url) {
  return new Promise((res, rej) => https.get(url, { headers: UA }, (r) => {
    let b = ""; r.on("data", (d) => (b += d)); r.on("end", () => res(b));
  }).on("error", rej));
}

(async () => {
  const codex = JSON.parse(fs.readFileSync(path.join(WS, "site", "data", "codex_v2.js"), "utf8")
    .split("window.X2.codexV2=")[1].replace(/;\s*$/, ""));
  const names = [];
  for (const cat of ["收藏道具", "宝藏"]) for (const it of codex[cat] || []) names.push(it.name);
  const regions = {};
  const kinds = {};
  const BATCH = 40;
  for (let i = 0; i < names.length; i += BATCH) {
    const batch = names.slice(i, i + BATCH);
    const url = API + "?action=query&format=json&formatversion=2&prop=revisions&rvprop=content&rvslots=main&titles=" +
      encodeURIComponent(batch.map((n) => "物品:" + n).join("|"));
    let j;
    try { j = JSON.parse(await get(url)); } catch (e) { console.error("批次失败", e.message); continue; }
    for (const p of (j.query && j.query.pages) || []) {
      const title = (p.title || "").replace(/^物品:/, "");
      if (!batch.includes(title)) continue;
      const rev = p.revisions && p.revisions[0];
      const content = (rev && rev.slots && rev.slots.main && rev.slots.main.content) || "";
      const mk = /种类\s*=\s*([^\n|]*)/.exec(content);
      if (mk && mk[1].trim()) kinds[title] = mk[1].trim();
      const m = /获得地点\s*=\s*([^\n|]*)/.exec(content);
      if (!m) continue;
      // 个别页面有乱码（如「斯佩比亚���国」），按前缀归一到标准地区名
      const CANON = ["阿伐利缇亚商会", "古拉", "英维迪亚烈王国", "斯佩比亚帝国", "利贝拉里塔斯岛屿群",
        "檀佩兰提亚", "阿卡狄亚教廷", "洛修利亚王国", "艾尔皮斯灵洞", "莫尔斯断崖", "莫尔斯之地",
        "世界树", "第一低轨道站", "挑战之地"];
      const list = m[1].split(/[、，,／/]/).map((s) => s.trim()).filter(Boolean).map((r) => {
        if (CANON.includes(r)) return r;
        const hit = CANON.filter((c) => r.includes(c.slice(0, 3)))[0];
        return hit || r;
      });
      if (list.length) regions[title] = list;
    }
    process.stdout.write(`\r  ${Math.min(i + BATCH, names.length)}/${names.length}`);
  }
  console.log();
  fs.writeFileSync(path.join(WS, "tools", "item_regions.json"), JSON.stringify(regions, null, 0), "utf8");
  fs.writeFileSync(path.join(WS, "tools", "item_kinds.json"), JSON.stringify(kinds, null, 0), "utf8");
  console.log("地区:", Object.keys(regions).length, "条；种类:", Object.keys(kinds).length, "条");
})();
