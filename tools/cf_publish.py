# -*- coding: utf-8 -*-
"""用 API 令牌把 site/ 部署到 Cloudflare Pages（复刻 wrangler 的直传流程）。

用法：设置环境变量 CLOUDFLARE_API_TOKEN 后运行。
"""
import base64, hashlib, json, mimetypes, os, sys, time, urllib.error, urllib.request, uuid

WS = r"C:\Users\ZhuanZ\Documents\deepseek-harness\default-workspace"
SITE = os.path.join(WS, "site")
PROJECT = "xb2-guide"
BRANCH = "main"
ACCOUNT_ID = "0d085a73dc77531f6dfd4ba837ab5a2d"
API = "https://api.cloudflare.com/client/v4"

EXTRA_MIME = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".txt": "text/plain; charset=utf-8",
}


def call(path, method="GET", payload=None, ctype="application/json", raw=None, token=None):
    headers = {"User-Agent": "Mozilla/5.0",
               "Authorization": "Bearer " + token}
    if raw is not None:
        body, headers["Content-Type"] = raw, ctype
    elif payload is not None:
        body, headers["Content-Type"] = json.dumps(payload).encode(), ctype
    else:
        body = None
    req = urllib.request.Request(API + path, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=600) as r:
            data = r.read()
            try:
                return r.status, json.loads(data)
            except Exception:
                return r.status, data.decode("utf-8", "ignore")
    except urllib.error.HTTPError as e:
        data = e.read()
        try:
            return e.code, json.loads(data)
        except Exception:
            return e.code, data.decode("utf-8", "ignore")


def collect(root):
    files = {}
    for dirpath, _, filenames in os.walk(root):
        for fn in filenames:
            full = os.path.join(dirpath, fn)
            rel = "/" + os.path.relpath(full, root).replace("\\", "/")
            with open(full, "rb") as f:
                data = f.read()
            ext = os.path.splitext(fn)[1].lower()
            files[rel] = {
                "data": data,
                "hash": hashlib.md5(data).hexdigest(),
                "contentType": EXTRA_MIME.get(ext) or mimetypes.guess_type(fn)[0] or "application/octet-stream",
                "size": len(data),
            }
    return files


def multipart(fields):
    boundary = "----dsh" + uuid.uuid4().hex
    body = b""
    for name, value, filename in fields:
        body += ("--" + boundary + "\r\n").encode()
        if filename:
            body += (f'Content-Disposition: form-data; name="{name}"; filename="{filename}"\r\n'
                     "Content-Type: application/octet-stream\r\n\r\n").encode()
        else:
            body += (f'Content-Disposition: form-data; name="{name}"\r\n\r\n').encode()
        body += value + b"\r\n"
    body += ("--" + boundary + "--\r\n").encode()
    return body, "multipart/form-data; boundary=" + boundary


def main():
    token = os.environ.get("CLOUDFLARE_API_TOKEN", "").strip()
    if not token:
        print("缺少 CLOUDFLARE_API_TOKEN")
        return 1

    st, d = call(f"/accounts/{ACCOUNT_ID}/pages/projects/{PROJECT}", token=token)
    if st != 200:
        print("读取项目失败:", st, str(d)[:300])
        return 1
    proj = d["result"]
    print("项目:", proj["name"], "| 域名:", proj.get("subdomain"))

    files = collect(SITE)
    total = sum(f["size"] for f in files.values())
    print(f"本地文件 {len(files)} 个，{total/1048576:.1f} MB")

    # 上传令牌
    st, d = call(f"/accounts/{ACCOUNT_ID}/pages/projects/{PROJECT}/upload-token", token=token)
    if st != 200:
        print("获取上传令牌失败:", st, str(d)[:300])
        return 1
    jwt = d["result"]["jwt"]

    hashes = sorted(set(f["hash"] for f in files.values()))
    st, d = call("/pages/assets/check-missing", "POST", {"hashes": hashes}, token=jwt)
    if st != 200:
        print("check-missing 失败:", st, str(d)[:300])
        return 1
    missing = set(d["result"] if isinstance(d, dict) else d)
    todo = sorted([f for f in files.values() if f["hash"] in missing], key=lambda f: -f["size"])
    print(f"需上传 {len(todo)} 个（已存在 {len(files) - len(todo)} 个）")

    for i in range(0, len(todo), 50):
        chunk = todo[i:i + 50]
        payload = [{"key": f["hash"], "value": base64.b64encode(f["data"]).decode(),
                    "metadata": {"contentType": f["contentType"]}, "base64": True} for f in chunk]
        for attempt in range(4):
            st, d = call("/pages/assets/upload", "POST", payload, token=jwt)
            if st == 200:
                break
            print(f"  上传重试 {attempt+1}: {st} {str(d)[:150]}")
            time.sleep(2 ** attempt)
        else:
            print("上传失败，中止")
            return 1
        print(f"  上传进度 {min(i+50, len(todo))}/{len(todo)}", flush=True)

    call("/pages/assets/upsert-hashes", "POST", {"hashes": hashes}, token=jwt)

    manifest = {p: f["hash"] for p, f in files.items()}
    body, ctype = multipart([
        ("manifest", json.dumps(manifest).encode(), None),
        ("branch", BRANCH.encode(), None),
    ])
    # 注意：创建部署必须用账号级 API 令牌；上传 JWT 只对 assets 接口有效（否则返回 9106）
    st, d = call(f"/accounts/{ACCOUNT_ID}/pages/projects/{PROJECT}/deployments", "POST",
                 raw=body, ctype=ctype, token=token)
    if st not in (200, 201):
        print("创建部署失败:", st, str(d)[:400])
        return 1
    dep = d["result"]
    print("部署 ID:", dep["id"])
    print("预览地址:", dep.get("url"))
    print("正式地址: https://" + (proj.get("subdomain") or PROJECT + ".pages.dev"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
