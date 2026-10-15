// 生成「官方任务目标」数据：site/data/questflows.js
//
// 来源：手机版 wiki 的 SQLite（task_workflow_step），即游戏内的官方任务步骤，
// 用来和站点整理自攻略本的流程互相核对。两者口径不同（站点流程更细，
// 官方目标更短、是任务界面上的原文），所以不覆盖，而是在任务浮窗里并列可切换。
//
// 用法：node tools/fetch_quest_flows.cjs [--apk <xenoblade2.db>] [--out <目录>]
const fs = require("fs");
const path = require("path");

const { WS, OUT, APK_DB } = require("./paths.cjs");

function main() {
  const apkArg = process.argv.indexOf("--apk");
  const apkPath = apkArg >= 0 ? process.argv[apkArg + 1] : APK_DB;
  if (!fs.existsSync(apkPath)) { console.error("找不到 APK 数据库：" + apkPath); process.exit(1); }

  // 站点任务名（只保留两边都有的）
  global.window = {};
  eval(fs.readFileSync(path.join(WS, "site/data/quests.js"), "utf8"));
  const siteNames = new Set((window.X2.quests || []).map((q) => q.name));

  const { DatabaseSync } = require("node:sqlite");
  const db = new DatabaseSync(apkPath, { readOnly: true });
  const rows = db.prepare(`SELECT e.name_zh AS title, s.position, s.kind, s.text, s.detail
    FROM task_workflow_step s JOIN entity e ON s.entity_id=e.id
    WHERE e.name_zh IS NOT NULL ORDER BY e.name_zh, s.position`).all();
  db.close();

  // kind 形如「官方目标 · Talk」-> 取出后缀做图标/配色
  const KIND = {
    Talk: "对话", ReachPlace: "前往", Battle: "战斗", Collect: "收集",
    QuestCondition: "条件", Gimmick: "机关", UseItem: "使用道具",
  };
  const out = {};
  let skipped = 0;
  for (const r of rows) {
    if (!siteNames.has(r.title)) { skipped++; continue; }
    const m = /·\s*(\w+)\s*$/.exec(r.kind || "");
    const k = m ? (KIND[m[1]] || m[1]) : "";
    (out[r.title] = out[r.title] || []).push(k ? { k: k, t: r.text } : { t: r.text });
    const last = out[r.title][out[r.title].length - 1];
    if (r.detail) last.d = r.detail;
  }

  const js = "window.X2=window.X2||{};window.X2.questFlows=" + JSON.stringify(out) + ";\n";
  fs.writeFileSync(path.join(OUT, "questflows.js"), js, "utf8");
  const steps = Object.values(out).reduce((a, v) => a + v.length, 0);
  console.log(`官方任务目标：${Object.keys(out).length} 个任务 / ${steps} 步（跳过 ${skipped} 条非站点任务）`);
  console.log(`questflows.js ${(Buffer.byteLength(js) / 1024).toFixed(1)} KB`);
}

main();
