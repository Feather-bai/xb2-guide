# -*- coding: utf-8 -*-
"""输出 OCR 文本的短索引：每页前若干行，便于人工定位内容。"""
import os, re, sys

WS = r"C:\Users\ZhuanZ\Documents\deepseek-harness\default-workspace"
OCR = os.path.join(WS, ".extract", "ocr")

for tag in ("vol1", "vol2"):
    print("=" * 30, tag)
    for i in range(1, 35):
        p = os.path.join(OCR, f"{tag}_p{i:03d}.txt")
        if not os.path.exists(p):
            continue
        with open(p, encoding="utf-8") as f:
            lines = [l.strip() for l in f.read().split("\n") if l.strip() and not l.startswith("=====")]
        head = " / ".join(lines[:7])
        print(f"p{i:02d}[{len(lines):3d}] {head[:150]}")
