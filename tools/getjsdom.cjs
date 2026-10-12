// 从 npm registry 下载并解包 jsdom 及其依赖到 workspace 的 node_modules
const fs = require("fs");
const path = require("path");
const https = require("https");
const { execFileSync } = require("child_process");

const WS = "C:\\Users\\ZhuanZ\\Documents\\deepseek-harness\\default-workspace";
const NM = path.join(WS, ".npm");
const CACHE = path.join(WS, ".npmcache");
fs.mkdirSync(path.join(NM, "node_modules"), { recursive: true });
fs.mkdirSync(CACHE, { recursive: true });

function get(url) {
  return new Promise((res, rej) => {
    https.get(url, { headers: { "User-Agent": "node" } }, (r) => {
      if (r.statusCode >= 300 && r.headers.location) return get(r.headers.location).then(res, rej);
      if (r.statusCode !== 200) return rej(new Error(url + " -> " + r.statusCode));
      const c = [];
      r.on("data", (d) => c.push(d));
      r.on("end", () => res(Buffer.concat(c)));
    }).on("error", rej);
  });
}

const seen = new Set();
const queue = process.argv.slice(2);
if (!queue.length) queue.push("jsdom");

(async () => {
  while (queue.length) {
    const name = queue.shift();
    if (seen.has(name)) continue;
    seen.add(name);
    let meta;
    try {
      meta = JSON.parse((await get(`https://registry.npmjs.org/${encodeURIComponent(name)}`)).toString());
    } catch (e) {
      console.log("meta fail", name, e.message);
      continue;
    }
    const ver = meta["dist-tags"].latest;
    const v = meta.versions[ver];
    const tgz = path.join(CACHE, name.replace(/[@/]/g, "_") + "-" + ver + ".tgz");
    if (!fs.existsSync(tgz)) {
      const buf = await get(v.dist.tarball);
      fs.writeFileSync(tgz, buf);
      console.log("dl", name, ver, (buf.length / 1024).toFixed(0) + "KB");
    }
    const dir = path.join(NM, "node_modules", name);
    fs.mkdirSync(dir, { recursive: true });
    try {
      execFileSync("tar", ["-xzf", tgz, "-C", dir, "--strip-components=1"], { stdio: "ignore" });
    } catch (e) {
      // 回退：用 node 的 zlib + tar 解析太麻烦，交给系统 tar
      console.log("extract fail", name, e.message);
      continue;
    }
    const deps = Object.keys(v.dependencies || {});
    for (const d of deps) if (!seen.has(d)) queue.push(d);
    console.log("ok", name, ver, "deps:", deps.length);
  }
  console.log("done, packages:", seen.size);
})();
