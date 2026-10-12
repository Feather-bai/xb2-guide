# -*- coding: utf-8 -*-
"""调试 Pages 部署创建接口的鉴权：分别用上传 JWT 与账号 API 令牌尝试。"""
import json, os, sys, urllib.error, urllib.request, uuid

WS = r"C:\Users\ZhuanZ\Documents\deepseek-harness\default-workspace"
ACCOUNT_ID = "0d085a73dc77531f6dfd4ba837ab5a2d"
PROJECT = "xb2-guide"
API = "https://api.cloudflare.com/client/v4"

sys.path.insert(0, os.path.join(WS, "tools"))
from cf_publish import call, collect, multipart

tok = os.environ["CLOUDFLARE_API_TOKEN"].strip()

st, d = call(f"/accounts/{ACCOUNT_ID}/pages/projects/{PROJECT}/upload-token", token=tok)
print("upload-token:", st)
jwt = d["result"]["jwt"]

files = collect(os.path.join(WS, "site"))
manifest = {p: f["hash"] for p, f in files.items()}
print("manifest 条目:", len(manifest))

for label, tk in (("上传JWT", jwt), ("账号令牌", tok)):
    body, ctype = multipart([
        ("manifest", json.dumps(manifest).encode(), None),
        ("branch", b"main", None),
    ])
    print(f"--- 用 {label} 创建部署（body {len(body)} 字节）---")
    st, d = call(f"/accounts/{ACCOUNT_ID}/pages/projects/{PROJECT}/deployments", "POST",
                 raw=body, ctype=ctype, token=tk)
    print("  ->", st, json.dumps(d, ensure_ascii=False)[:400] if isinstance(d, dict) else str(d)[:400])
    if st in (200, 201):
        dep = d["result"]
        print("  部署 ID:", dep.get("id"), "| url:", dep.get("url"))
        break
