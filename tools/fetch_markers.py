# -*- coding: utf-8 -*-
"""按地图抓取带坐标的标记（宝箱 / 采集点）。

wiki 的 SMW ask 接口每次最多返回 50 条且分页参数无效，
所以和 wiki 自己的地图脚本一样：逐张地图查询（[[Areas::<mapid>]]），并做断点续传。
"""
import json, os, sys, time, urllib.parse, urllib.request

WS = r"C:\Users\ZhuanZ\Documents\deepseek-harness\default-workspace"
SRC = os.path.join(WS, ".extract", "mapdata")
os.makedirs(SRC, exist_ok=True)
API = "https://xenoblade2.cn/api.php"
UA = {"User-Agent": "Mozilla/5.0 (compatible; guide-archiver/1.0)"}

QUERIES = {
    "tbox": "[[PosX::+]][[宝箱:+]][[Areas::{area}]]|?PosX|?PosY|?PosZ|?Areas|?TboxPopDisplay|?Gold",
    "colle": "[[PosX::+]][[采集点:+]][[Areas::{area}]]|?PosX|?PosY|?PosZ|?Areas",
}


def ask(query, timeout=90):
    url = API + "?" + urllib.parse.urlencode({
        "action": "ask", "query": query, "format": "json", "api_version": "2", "limit": "50"})
    req = urllib.request.Request(url, headers=UA)
    for a in range(3):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.load(r)
        except Exception as e:
            if a == 2:
                return {"_err": f"{type(e).__name__}: {e}"}
            time.sleep(2 + 2 * a)


def main():
    info = json.load(open(os.path.join(SRC, "mapinfo.json"), encoding="utf-8"))
    map_ids = sorted(json.loads(v)["Name"] for v in info.values())

    out = {"tbox": {}, "colle": {}}
    cache_path = os.path.join(SRC, "markers_raw.json")
    if os.path.exists(cache_path):
        try:
            out = json.load(open(cache_path, encoding="utf-8"))
        except Exception:
            pass
    done = {k: set(v.get("_done", [])) for k, v in out.items()}

    for kind, tpl in QUERIES.items():
        bucket = out.setdefault(kind, {})
        finished = set(bucket.get("_done", []))
        todo = [m for m in map_ids if m not in finished]
        print(f"== {kind}: 待处理地图 {len(todo)} / {len(map_ids)}", flush=True)
        for i, area in enumerate(todo):
            d = ask(tpl.format(area=area))
            if "_err" in d:
                print(f"   {area} 出错 {d['_err']}，跳过", flush=True)
                continue
            for title, rec in (d.get("query", {}).get("results", {}) or {}).items():
                bucket[title] = rec
            finished.add(area)
            if (i + 1) % 10 == 0 or i + 1 == len(todo):
                bucket["_done"] = sorted(finished)
                json.dump(out, open(cache_path, "w", encoding="utf-8"), ensure_ascii=False)
                print(f"   进度 {i+1}/{len(todo)}｜累计 宝箱 {len(out['tbox'])-1} 采集点 {len(out['colle'])-1}", flush=True)
            time.sleep(0.15)

    # 汇总成紧凑结构
    def pack(kind):
        items = []
        for title, rec in out.get(kind, {}).items():
            if title == "_done":
                continue
            pr = rec.get("printouts", {})
            try:
                x = float(pr["PosX"][0]); z = float(pr["PosZ"][0])
            except Exception:
                continue
            areas = []
            for a in (pr.get("Areas") or []):
                areas.append(a if isinstance(a, str) else a.get("fulltext", ""))
            areas = [a.split(":", 1)[-1] for a in areas if a]
            it = {"t": title, "x": round(x, 3), "z": round(z, 3), "a": areas}
            if kind == "tbox":
                it["pop"] = (pr.get("TboxPopDisplay") or [""])[0]
                it["gold"] = (pr.get("Gold") or [""])[0]
            items.append(it)
        return items

    data = {"tbox": pack("tbox"), "colle": pack("colle")}
    json.dump(data, open(os.path.join(SRC, "markers.json"), "w", encoding="utf-8"), ensure_ascii=False)
    print(f"\n宝箱 {len(data['tbox'])} | 采集点 {len(data['colle'])}")

    from collections import defaultdict
    per = defaultdict(lambda: defaultdict(int))
    for kind in ("tbox", "colle"):
        for it in data[kind]:
            for a in it["a"]:
                per[a][kind] += 1
    print(f"覆盖地图 {len(per)} 张（共 {len(map_ids)} 张）")
    for k, v in sorted(per.items(), key=lambda kv: -(kv[1]["tbox"] + kv[1]["colle"]))[:12]:
        print(f"   {k}: 宝箱 {v['tbox']} | 采集点 {v['colle']}")


if __name__ == "__main__":
    main()
