const fs = require("fs");
const p = "tools/fetch_quest_points.cjs";
let s = fs.readFileSync(p, "utf8");
const bs = String.fromCharCode(92);

// 1) 修好被 shell 吃掉反斜杠的正则
const bad = 'const qn = String(r.qname || "").replace(/#s*QUERYw*$/i, "").trim();';
const good = 'const qn = String(r.qname || "").replace(/' + bs + '/#s*QUERY' + bs + 'w*$/i, "").trim();'.replace("#s", "#" + bs + "s").replace("QUERYw", "QUERY" + bs + "w");
if (s.includes(bad)) s = s.replace(bad, good);

// 2) 加「按任务名里的 NPC 名反查位置」的兜底
const anchor = "    if (!pt) { miss++; continue; }";
if (!s.includes(anchor)) { console.error("anchor missing"); process.exit(1); }
const add = [
  "    // 最后兜底：frontiernav 没有这条任务的记录时，按「任务名里包含哪个 NPC 名」反查 NPC 位置",
  "    // （搜寻吉西西 / 打倒瓦甘 / 学校/卡兹娜 这类；同名多人的取地图上出现的那一个）",
  "    if (!pt) {",
  "      const cands2 = Object.keys(wikiGmk).filter((g) => qn.indexOf(wikiGmk[g].name) > -1 && wikiGmk[g].name.length >= 2);",
  "      const g2 = cands2.map((g) => byGmk[g]).filter((x) => x && x.length)[0];",
  "      if (g2) {",
  "        pt = { m: canon(g2.areas[0]), x: +(+g2.PosX).toFixed(3), z: +(+g2.PosZ).toFixed(3) };",
  "        pt.npc = wikiGmk[cands2[0]].name;",
  "        pt.guessed = 1;",
  "      }",
  "    }",
  anchor,
].join("\n");
s = s.replace(anchor, add);
fs.writeFileSync(p, s, "utf8");
console.log("ok");
