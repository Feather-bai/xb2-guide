# -*- coding: utf-8 -*-
"""把 wiki 的地图底图下载到 site/assets/maps/<id>.png（本地托管，避免外链）。

图片地址由 build_maps.py 的 resolve_image_urls 解析并缓存在
.extract/mapdata/imageurls.json。已存在的文件默认跳过，可断点续传。
"""
import json, os, urllib.request

WS = r"C:\Users\ZhuanZ\Documents\deepseek-harness\default-workspace"
SRC = os.path.join(WS, ".extract", "mapdata")
DST = os.path.join(WS, "site", "assets", "maps")
os.makedirs(DST, exist_ok=True)

UA = {"User-Agent": "Mozilla/5.0 (compatible; guide-archiver/1.0)",
      "Referer": "https://xenoblade2.cn/"}


def main(force=False):
    urls = json.load(open(os.path.join(SRC, "imageurls.json"), encoding="utf-8"))
    total = 0
    todo = 0
    for name, url in sorted(urls.items()):
        dst = os.path.join(DST, name + ".png")
        if os.path.exists(dst) and not force:
            total += os.path.getsize(dst)
            continue
        todo += 1
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=120) as r:
            data = r.read()
        open(dst, "wb").write(data)
        total += len(data)
        print(f"  下载 {name}.png  {len(data)/1024:.0f} KB", flush=True)
    print(f"底图 {len(urls)} 张 | 新下载 {todo} | 合计 {total/1048576:.2f} MB")


if __name__ == "__main__":
    import sys
    main(force="--force" in sys.argv)
