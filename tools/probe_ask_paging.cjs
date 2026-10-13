// 找 gadget 里的分页逻辑与查询拼接方式
const fs = require("fs");
const WS = "C:\\Users\\ZhuanZ\\Documents\\deepseek-harness\\default-workspace";
const files = ["Xb2map.js", "Xb2mapTbox.js", "Xb2mapCollection.js", "Xb2mapEnemy.js", "Xb2mapNpc.js", "Xb2mapSalvage.js"];
const all = files.map((f) => ({ f, s: fs.readFileSync(WS + "\\.extract\\x2map\\" + f, "utf8") }));

for (const { f, s } of all) {
  for (const kw of ["offset", "continue", "askargs", "ask", "parameters", "printouts", "query-continue"]) {
    let i = -1;
    while ((i = s.indexOf(kw, i + 1)) !== -1) {
      const ctx = s.slice(Math.max(0, i - 180), i + 220).replace(/\n/g, " ");
      // 只打印看起来像请求构造的上下文
      if (/ajax|action|query|data:|url:/.test(ctx)) {
        console.log(`[${f}] ${kw}: …${ctx}…\n`);
        break;
      }
    }
  }
}
