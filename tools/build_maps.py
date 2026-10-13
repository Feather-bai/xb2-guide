# -*- coding: utf-8 -*-
"""生成 site/data/maps.js —— 地图数据（底图信息 + 标记点 + 区域索引）

⚠️ 已被 tools/rebuild_maps.cjs 取代，不要再用本脚本覆盖 maps.js：
   本脚本只输出「宝箱 / 采集点」两个图层（且受 SMW 50 条上限截断），
   而现在的 maps.js 由 rebuild_maps.cjs 从 .extract/mapdata/layers.json 生成，
   包含宝箱 / 采集点 / 打捞点 / 敌人 / NPC 五个完整图层。保留仅供历史参考。

数据来源：wiki 的 JSON:Mapinfo/*（底图与边界）、JSON:FLD maplist/*（地图清单），
以及 SMW 带坐标的标记点（宝箱 / 采集点）。

底图已下载到本地（site/assets/maps/<id>.png，见 tools/fetch_map_images.py），
所以 img 指向站内相对路径；外部服务器地址保留在 imgRemote，便于核对与重新下载。
"""
import json, os, re
from collections import defaultdict

WS = r"C:\Users\ZhuanZ\Documents\deepseek-harness\default-workspace"
SRC = os.path.join(WS, ".extract", "mapdata")
OUT = os.path.join(WS, "site", "data")
os.makedirs(OUT, exist_ok=True)

IMG_BASE = "https://images.xenoblade2.cn/images"
LOCAL_MAP_DIR = "assets/maps"


def file_name(map_name):
    """mapinfo 的 Name -> 底图文件名：ma02a_f01 -> Ma02a f01 map 0.png"""
    s = map_name.replace("_", " ")
    s = s[:1].upper() + s[1:]
    return s + " map 0.png"


def resolve_image_urls(names):
    """向 wiki 批量查询底图真实 URL（本地缓存），避免自己推算散列路径。"""
    cache_path = os.path.join(SRC, "imageurls.json")
    cache = {}
    if os.path.exists(cache_path):
        try:
            cache = json.load(open(cache_path, encoding="utf-8"))
        except Exception:
            cache = {}
    todo = [n for n in names if n not in cache]
    if todo:
        import urllib.parse, urllib.request
        API = "https://xenoblade2.cn/api.php"
        UA = {"User-Agent": "Mozilla/5.0 (compatible; guide-archiver/1.0)"}
        for i in range(0, len(todo), 40):
            batch = ["文件:" + file_name(n) for n in todo[i:i + 40]]
            url = API + "?" + urllib.parse.urlencode({
                "action": "query", "titles": "|".join(batch), "prop": "imageinfo",
                "iiprop": "url|size", "format": "json", "formatversion": "2"})
            try:
                with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=180) as r:
                    d = json.load(r)
            except Exception as e:
                print("  图片 URL 查询失败:", e, flush=True)
                continue
            for pg in d.get("query", {}).get("pages", []):
                if "imageinfo" in pg:
                    ii = pg["imageinfo"][0]
                    title = pg["title"]                      # 文件:Ma02a f01 map 0.png
                    fname = title.split(":", 1)[-1]
                    # 反查是哪个 map name：用 file_name 的逆变换匹配
                    for n in todo:
                        if file_name(n) == fname:
                            cache[n] = ii["url"]
                            break
            print(f"  解析底图 URL {min(i+40, len(todo))}/{len(todo)}", flush=True)
        json.dump(cache, open(cache_path, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    return cache


def image_url(map_name, resolved=None):
    if resolved and map_name in resolved:
        return resolved[map_name]
    # 回退：按 wiki 的散列规则推算（md5 of 文件名，下划线形式）
    import hashlib
    fname = file_name(map_name).replace(" ", "_")
    h = hashlib.md5(fname.encode("utf-8")).hexdigest()
    return f"{IMG_BASE}/{h[0]}/{h[:2]}/{fname}"


def mapinfo():
    raw = json.load(open(os.path.join(SRC, "mapinfo.json"), encoding="utf-8"))
    out = {}
    for k, v in raw.items():
        o = json.loads(v)
        out[o["Name"]] = o
    return out


def markers():
    p = os.path.join(SRC, "markers.json")
    if not os.path.exists(p):
        return {"tbox": [], "colle": []}
    return json.load(open(p, encoding="utf-8"))


def main():
    info = mapinfo()
    resolved = resolve_image_urls(list(info.keys()))
    mk = markers()
    per_map = defaultdict(lambda: {"tbox": [], "colle": []})

    for kind in ("tbox", "colle"):
        for it in mk.get(kind, []):
            for area in it.get("a", []):
                bucket = per_map[area][kind]
                entry = {"x": it["x"], "z": it["z"], "t": it["t"].split(":", 1)[-1]}
                if kind == "tbox":
                    if it.get("pop"):
                        entry["pop"] = it["pop"]
                    if it.get("gold"):
                        entry["gold"] = it["gold"]
                bucket.append(entry)

    maps = []
    for name, o in info.items():
        m = per_map.get(name, {"tbox": [], "colle": []})
        remote = image_url(name, resolved)
        local = "{}/{}.png".format(LOCAL_MAP_DIR, name)
        on_disk = os.path.exists(os.path.join(OUT, "..", "assets", "maps", name + ".png"))
        maps.append({
            "id": name,
            "area": o.get("mapName", ""),
            "group": o.get("menuGroup", ""),
            "w": o.get("Width"),
            "h": o.get("Height"),
            "b": [o.get("LowerX"), o.get("LowerZ"), o.get("UpperX"), o.get("UpperZ")],
            # 本地有就优先用本地底图，没有则回退到 wiki 外链
            "img": local if on_disk else remote,
            "imgRemote": remote,
            "tbox": m["tbox"],
            "colle": m["colle"],
        })

    # 区域索引：区域名 -> 地图 id 列表（组内排序：先 group 空的情况）
    areas = defaultdict(list)
    for m in maps:
        areas[m["area"]].append(m["id"])
    for a in areas:
        areas[a].sort()

    payload = {
        "imgBase": IMG_BASE,
        "areas": {a: ids for a, ids in sorted(areas.items())},
        "maps": sorted(maps, key=lambda m: (m["area"], m["id"])),
    }
    js = "window.X2=window.X2||{};window.X2.mapsData=" + json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + ";\n"
    with open(os.path.join(OUT, "maps.js"), "w", encoding="utf-8") as f:
        f.write(js)

    tb = sum(len(m["tbox"]) for m in maps)
    cl = sum(len(m["colle"]) for m in maps)
    withmk = sum(1 for m in maps if m["tbox"] or m["colle"])
    print(f"地图 {len(maps)} 张 | 区域 {len(areas)} 个 | 宝箱标记 {tb} | 采集点标记 {cl} | 有标记的地图 {withmk}")
    print(f"maps.js {len(js.encode('utf-8'))/1024:.1f} KB")
    for a, ids in sorted(areas.items())[:8]:
        print(f"   {a}: {len(ids)} 张")
    # 抽查一张
    sample = next((m for m in maps if m["id"] == "ma02a_f01"), None)
    if sample:
        print("样例:", json.dumps({k: v for k, v in sample.items() if k != "tbox" and k != "colle"}, ensure_ascii=False))
        print("      ", sample["img"])


if __name__ == "__main__":
    main()
