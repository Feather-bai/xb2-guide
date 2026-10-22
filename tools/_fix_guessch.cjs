const fs = require("fs");
const p = "tools/fetch_quest_points.cjs";
let s = fs.readFileSync(p, "utf8");
const a = `    const cid = chapId(q.chap);
    if (cid) pt.ch = cid;
    byQuest[q.name] = [pt];`;
if (!s.includes(a)) { console.error("anchor missing"); process.exit(1); }
// 由任务名反推的接取点：章节以地图实际归属为准（不写 ch），避免「搜寻吉西西」被标成最终章
s = s.replace(a, `    byQuest[q.name] = [pt];`);
fs.writeFileSync(p, s, "utf8");
console.log("ok");
