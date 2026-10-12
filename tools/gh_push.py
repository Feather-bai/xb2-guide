# -*- coding: utf-8 -*-
"""通过 GitHub 的 Git Data API 推送提交（绕过被墙的 github.com:443，api.github.com 可用）。"""
import base64, json, os, subprocess, sys, urllib.error, urllib.request

WS = r"C:\Users\ZhuanZ\Documents\deepseek-harness\default-workspace"
OWNER = "Feather-bai"
REPO = "xb2-guide"
API = "https://api.github.com"
UA = {"User-Agent": "xb2-guide-pusher", "Accept": "application/vnd.github+json"}


def token():
    return subprocess.check_output(["gh", "auth", "token"], text=True).strip()


def api(path, method="GET", payload=None, tok=None):
    headers = dict(UA)
    if tok:
        headers["Authorization"] = "Bearer " + tok
    body = json.dumps(payload).encode() if payload is not None else None
    if body is not None:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(API + path, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            data = r.read()
            return r.status, (json.loads(data) if data else {})
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, raw.decode("utf-8", "ignore")


def git(*args):
    return subprocess.check_output(["git", "-C", WS] + list(args), text=True).strip()


def main():
    message = sys.argv[1] if len(sys.argv) > 1 else "更新内容"
    tok = token()
    branch = "main"

    st, ref = api(f"/repos/{OWNER}/{REPO}/git/ref/heads/{branch}", tok=tok)
    if st != 200:
        print("读取分支失败:", st, ref)
        return 1
    parent = ref["object"]["sha"]
    st, commit = api(f"/repos/{OWNER}/{REPO}/git/commits/{parent}", tok=tok)
    base_tree = commit["tree"]["sha"]
    print("父提交:", parent[:8], "| base tree:", base_tree[:8])

    # 需要提交的文件：git 未提交的改动
    changed = [l for l in git("status", "--porcelain").splitlines() if l.strip()]
    files = {}
    deleted = []
    for line in changed:
        status = line[:2].strip()
        path = line[3:].strip().strip('"')
        if status == "D":
            deleted.append(path)
            continue
        full = os.path.join(WS, path.replace("/", os.sep))
        if os.path.exists(full):
            files[path] = full
    print(f"变更 {len(files)} 个文件，删除 {len(deleted)} 个")

    # 1. 建 blob
    blobs = {}
    for path, full in files.items():
        with open(full, "rb") as f:
            content = base64.b64encode(f.read()).decode()
        st, d = api(f"/repos/{OWNER}/{REPO}/git/blobs", "POST",
                    {"content": content, "encoding": "base64"}, tok=tok)
        if st != 201:
            print("blob 失败:", path, st, str(d)[:200])
            return 1
        blobs[path] = d["sha"]
        print("  blob", path, d["sha"][:8])

    # 2. 建立目录树：沿路径自底向上建
    def build_tree(entries, base=None):
        payload = {"tree": entries}
        if base:
            payload["base_tree"] = base
        st, d = api(f"/repos/{OWNER}/{REPO}/git/trees", "POST", payload, tok=tok)
        if st != 201:
            raise RuntimeError(f"tree 失败: {st} {str(d)[:300]}")
        return d["sha"]

    # 收集需要修改的目录
    dirs = {}
    for path in files:
        parts = path.split("/")
        d = ""
        for p in parts[:-1]:
            d = (d + "/" + p) if d else p
            dirs.setdefault(d, [])
    # 记录被删除文件所在目录
    for path in deleted:
        parts = path.split("/")
        d = ""
        for p in parts[:-1]:
            d = (d + "/" + p) if d else p
            dirs.setdefault(d, [])

    # 取每个目录现有内容
    dir_entries = {}
    for d in dirs:
        st, t = api(f"/repos/{OWNER}/{REPO}/contents/{d}?ref={branch}", tok=tok)
        if st == 200 and isinstance(t, list):
            dir_entries[d] = {e["name"]: e for e in t}
        else:
            dir_entries[d] = {}

    # 自底向上重建
    deepest_first = sorted(dirs.keys(), key=lambda x: -x.count("/"))
    new_subtree_sha = {}
    for d in deepest_first:
        entries = []
        names = set(dir_entries.get(d, {}).keys())
        # 子目录替换
        prefix = d + "/"
        for sub, sha in list(new_subtree_sha.items()):
            if sub.startswith(prefix) and "/" not in sub[len(prefix):]:
                child = sub[len(prefix):]
                names.discard(child)
                entries.append({"path": child, "mode": "040000", "type": "tree", "sha": sha})
        for name, e in dir_entries.get(d, {}).items():
            if e["type"] == "file" and name not in names:
                continue
            if e["type"] == "file" and name in names:
                full_path = d + "/" + name
                if full_path in deleted:
                    continue
                if full_path in blobs:
                    entries.append({"path": name, "mode": "100644", "type": "blob", "sha": blobs[full_path]})
                else:
                    entries.append({"path": name, "mode": "100644", "type": "blob", "sha": e["sha"]})
                names.discard(name)
        # 该目录下新增的文件
        for path, sha in blobs.items():
            if path.startswith(prefix) and "/" not in path[len(prefix):]:
                name = path[len(prefix):]
                if name in names or any(x["path"] == name for x in entries):
                    continue
                entries.append({"path": name, "mode": "100644", "type": "blob", "sha": sha})
        new_subtree_sha[d] = build_tree(entries)
        print("  tree", d, new_subtree_sha[d][:8])

    # 根目录
    st, root = api(f"/repos/{OWNER}/{REPO}/git/trees/{base_tree}", tok=tok)
    root_entries = []
    replaced = set()
    for d, sha in new_subtree_sha.items():
        if "/" not in d:
            replaced.add(d)
    for e in root.get("tree", []):
        if e["path"] in replaced:
            root_entries.append({"path": e["path"], "mode": "040000", "type": "tree", "sha": new_subtree_sha[e["path"]]})
        elif e["type"] == "blob" and e["path"] in files:
            continue
        elif e["type"] == "blob" and e["path"] in deleted:
            continue
        else:
            root_entries.append({"path": e["path"], "mode": e["mode"], "type": e["type"], "sha": e["sha"]})
    for path, sha in blobs.items():
        if "/" not in path and not any(x["path"] == path for x in root_entries):
            root_entries.append({"path": path, "mode": "100644", "type": "blob", "sha": sha})
    root_sha = build_tree(root_entries)
    print("  新 root tree:", root_sha[:8])

    # 3. 提交
    st, newc = api(f"/repos/{OWNER}/{REPO}/git/commits", "POST",
                   {"message": message, "tree": root_sha, "parents": [parent]}, tok=tok)
    if st != 201:
        print("提交失败:", st, str(newc)[:300]); return 1
    new_sha = newc["sha"]
    print("新提交:", new_sha[:8])

    # 4. 更新分支
    st, d = api(f"/repos/{OWNER}/{REPO}/git/refs/heads/{branch}", "PATCH", {"sha": new_sha}, tok=tok)
    if st != 200:
        print("更新分支失败:", st, str(d)[:300]); return 1
    print("已推送:", d["object"]["sha"][:8], "->", branch)

    # 本地同步提交记录，避免下次重复推送
    subtree = subprocess.run(["git", "-C", WS, "fetch", "origin", branch], capture_output=True, text=True)
    subprocess.run(["git", "-C", WS, "reset", "--soft", new_sha], capture_output=True, text=True)
    print("本地 HEAD 已同步到", new_sha[:8])
    return 0


if __name__ == "__main__":
    sys.exit(main())
