# -*- coding: utf-8 -*-
"""解析 wiki 的异刃连击路线表格（HTML 渲染版），输出路线数据。"""
import re, sys, os, json, urllib.request

WS = r"C:\Users\ZhuanZ\Documents\deepseek-harness\default-workspace"
UA = {"User-Agent": "Mozilla/5.0 (compatible; guide-archiver/1.0)"}


def fetch_html(title):
    import urllib.parse
    url = "https://xenoblade2.cn/api.php?" + urllib.parse.urlencode(
        {"action": "parse", "page": title, "prop": "text", "format": "json", "formatversion": "2"})
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=120) as r:
        d = json.load(r)
    return d["parse"]["text"]


def parse_tables(html):
    """把每个 blade-combo-table 解析成 (rows) —— 每个单元格是图标名。"""
    tables = []
    for tm in re.finditer(r'<table class="blade-combo-table">(.*?)</table>', html, re.S):
        body = tm.group(1)
        rows = []
        pending = {}  # col -> (remaining, value)
        for rm in re.finditer(r"<tr>(.*?)</tr>", body, re.S):
            cells = re.findall(r"<t[dh]([^>]*)>(.*?)</t[dh]>", rm.group(1), re.S)
            row = []
            col = 0
            # 先放 rowspan 延续的单元格
            while col in pending:
                remain, val = pending[col]
                row.append(val)
                remain -= 1
                if remain <= 0:
                    del pending[col]
                else:
                    pending[col] = (remain, val)
                col += 1
            for attrs, content in cells:
                while col in pending:
                    remain, val = pending[col]
                    row.append(val)
                    remain -= 1
                    if remain <= 0:
                        del pending[col]
                    else:
                        pending[col] = (remain, val)
                    col += 1
                m = re.search(r'title="([^"]+)"', content) or re.search(r'alt="([^"]+)"', content)
                name = m.group(1) if m else re.sub(r"<[^>]+>", "", content).strip()
                name = name.strip()
                rs = re.search(r'rowspan="(\d+)"', attrs)
                if rs:
                    pending[col] = (int(rs.group(1)) - 1, name)
                row.append(name)
                col += 1
            rows.append(row)
        tables.append(rows)
    return tables


def routes_from_table(rows):
    """3 列表格：[第一段, 第二段, 第三段] 逐行；合并同前两段。"""
    out = {}
    cur2 = None
    first = rows[0][0]
    for row in rows:
        if len(row) >= 3:
            e1, e2, e3 = row[0], row[1], row[2]
        elif len(row) == 2:
            e1, e2, e3 = (first if False else row[0]), row[1], row[1]
            e2, e3 = row[1], None
            continue
        else:
            continue
        if e1 != first:
            continue
        out.setdefault(e2, [])
        if e3 and e3 not in out[e2]:
            out[e2].append(e3)
    return first, out


if __name__ == "__main__":
    html = fetch_html("异刃连击路线")
    tables = parse_tables(html)
    print("tables:", len(tables))
    for i, t in enumerate(tables):
        print("--- table", i)
        for r in t:
            print("   ", r)
