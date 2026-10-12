# -*- coding: utf-8 -*-
"""检查线上站点是否还残留裸露的 <b> 标记，并确认最新数据已生效。"""
import re, sys, time, urllib.error, urllib.request

BASE = "https://xb2-guide.pages.dev"
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      "Accept-Language": "zh-CN,zh;q=0.9"}


def get(path, tries=4):
    for i in range(tries):
        try:
            req = urllib.request.Request(BASE + path, headers=UA)
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.status, r.read()
        except urllib.error.HTTPError as e:
            last = e.code
            time.sleep(4)
        except Exception as e:
            last = type(e).__name__
            time.sleep(4)
    return last, b""


tag = re.compile(r"</?b>")
for path in ["/data/chapters.js", "/data/systems.js", "/data/quests.js", "/data/extras.js", "/assets/app.js"]:
    st, body = get(path)
    if isinstance(st, int) and st == 200:
        text = body.decode("utf-8", "ignore")
        n_b = len(tag.findall(text))
        n_bold = text.count("**") // 2
        has_render = "strong>$1</strong>" in text or "\\*\\*([^*]+)\\*\\*" in text
        print("%-22s 200  <b> 残留 %d | 加粗标记 %d | 渲染支持 %s" % (path, n_b, n_bold, has_render))
    else:
        print("%-22s %s" % (path, st))
