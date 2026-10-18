// Cloudflare Pages Function：GET/PUT /api/sync?id=<用户ID>
//
// 存储：Pages 自带的 KV 绑定 SYNC（在 Cloudflare 控制台 → Pages 项目 → Settings → Functions
//       → KV namespace bindings 里新建一个 namespace 并绑定为 SYNC）。
// 键名：done:<uid>；值：{ done: {<mapId>|<layer>|<x>|<z>: 1, ...}, rev: <毫秒时间戳> }
//
// 冲突策略：以最后修改时间为准。PUT 只在 rev 更大时覆盖。
// 隐私：只存勾选状态与时间戳，不记录 IP、UA 或任何设备信息。

const MAX_ITEMS = 50000;

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function validId(id) {
  return typeof id === "string" && /^[A-Za-z0-9_-]{3,32}$/.test(id);
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const id = new URL(request.url).searchParams.get("id");
  if (!validId(id)) return json({ error: "invalid id" }, 400);
  if (!env.SYNC) return json({ error: "kv not bound", code: "NO_KV" }, 503);
  const raw = await env.SYNC.get("done:" + id);
  if (!raw) return json({ done: {}, rev: 0 });
  try { return json(JSON.parse(raw)); } catch (e) { return json({ done: {}, rev: 0 }); }
}

export async function onRequestPut(context) {
  const { request, env } = context;
  const id = new URL(request.url).searchParams.get("id");
  if (!validId(id)) return json({ error: "invalid id" }, 400);
  if (!env.SYNC) return json({ error: "kv not bound", code: "NO_KV" }, 503);
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: "bad json" }, 400); }
  const done = body && body.done;
  if (!done || typeof done !== "object") return json({ error: "missing done" }, 400);
  const keys = Object.keys(done);
  if (keys.length > MAX_ITEMS) return json({ error: "too many items" }, 413);

  const key = "done:" + id;
  const cur = await env.SYNC.get(key);
  let curRev = 0;
  if (cur) { try { curRev = JSON.parse(cur).rev || 0; } catch (e) {} }
  // 客户端给的 rev 代表这份数据「最后修改的时间」；若比服务器已有的旧，说明它过时了
  const rev = +body.rev || Date.now();
  if (rev < curRev) return json({ rev: curRev, stale: true, done: cur ? JSON.parse(cur).done : {} });

  const clean = {};
  for (const k of keys) {
    if (typeof k === "string" && k.length < 120 && done[k]) clean[k] = 1;
  }
  await env.SYNC.put(key, JSON.stringify({ done: clean, rev }), { expirationTtl: 60 * 60 * 24 * 365 });
  return json({ rev });
}

// 跨域只读（如需从别处读取）；页面本身同源，不需要
export async function onRequestOptions() {
  return new Response(null, { status: 204 });
}
