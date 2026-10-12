import os, sys, time, json
WS = r"C:\Users\ZhuanZ\Documents\deepseek-harness\default-workspace"
sys.path.insert(0, os.path.join(WS, ".pylibs"))
import numpy as np
from PIL import Image
from rapidocr_onnxruntime import RapidOCR

IMG = os.path.join(WS, ".extract", "img")
OCR = os.path.join(WS, ".extract", "ocr")
os.makedirs(OCR, exist_ok=True)

engine = RapidOCR()


def layout_lines(boxes, page_w):
    """boxes: list of (x0,y0,x1,y1,text,score). Sort into reading order by rough column detection."""
    if not boxes:
        return []
    mid = page_w / 2
    # classify column by x-center, but only when the page really is two-column-ish
    left = [b for b in boxes if (b[0] + b[2]) / 2 < mid]
    right = [b for b in boxes if (b[0] + b[2]) / 2 >= mid]
    out = []
    for group in (left, right):
        group.sort(key=lambda b: (round(b[1] / 18.0), b[0]))
        out.extend(group)
    return out


def run(tag, pages):
    for p in pages:
        src = os.path.join(IMG, f"{tag}_p{p:03d}.png")
        dst = os.path.join(OCR, f"{tag}_p{p:03d}.json")
        if os.path.exists(dst) and os.path.getsize(dst) > 100:
            print("skip", dst, flush=True)
            continue
        im = Image.open(src)
        w, h = im.size
        t0 = time.time()
        result, _ = engine(np.array(im.convert("RGB")))
        boxes = []
        for box, txt, score in (result or []):
            xs = [pt[0] for pt in box]
            ys = [pt[1] for pt in box]
            boxes.append((min(xs), min(ys), max(xs), max(ys), txt, float(score)))
        lines = layout_lines(boxes, w)
        with open(dst, "w", encoding="utf-8") as f:
            json.dump({
                "tag": tag, "page": p, "w": w, "h": h,
                "raw": boxes,
                "lines": [{"x": round(b[0]), "y": round(b[1]), "t": b[4], "s": round(b[5], 2)} for b in lines],
            }, f, ensure_ascii=False, indent=0)
        with open(os.path.join(OCR, f"{tag}_p{p:03d}.txt"), "w", encoding="utf-8") as f:
            f.write(f"===== {tag} p{p} =====\n")
            for b in lines:
                f.write(b[4] + "\n")
        print(f"{tag} p{p} boxes={len(boxes)} {time.time()-t0:.1f}s", flush=True)


if __name__ == "__main__":
    import pymupdf
    which = sys.argv[1] if len(sys.argv) > 1 else "all"
    jobs = []
    if which in ("all", "v1"):
        jobs.append((r"C:\Users\ZhuanZ\Desktop\异度之刃2终极攻略上.pdf", "vol1"))
    if which in ("all", "v2"):
        jobs.append((r"C:\Users\ZhuanZ\Desktop\异度之刃2终极攻略下.pdf", "vol2"))
    for path, tag in jobs:
        doc = pymupdf.open(path)
        n = doc.page_count
        for i in range(n):
            src = os.path.join(IMG, f"{tag}_p{i+1:03d}.png")
            if not os.path.exists(src):
                pix = doc[i].get_pixmap(matrix=pymupdf.Matrix(1.4, 1.4))
                pix.save(src)
                print("render", src, flush=True)
        doc.close()
    for path, tag in jobs:
        doc = pymupdf.open(path)
        run(tag, list(range(1, doc.page_count + 1)))
        doc.close()
    print("ALL DONE", flush=True)
