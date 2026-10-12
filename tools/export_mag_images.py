"""Export magazine page images for the web: downsized, WebP, with a JSON manifest."""
import json, os, sys
sys.path.insert(0, r"C:\Users\ZhuanZ\Documents\deepseek-harness\default-workspace\.pylibs")
import pymupdf
from PIL import Image

WS = r"C:\Users\ZhuanZ\Documents\deepseek-harness\default-workspace"
OUT = os.path.join(WS, "site", "assets", "mag")
os.makedirs(OUT, exist_ok=True)

JOBS = [
    (r"C:\Users\ZhuanZ\Desktop\异度之刃2终极攻略上.pdf", "vol1"),
    (r"C:\Users\ZhuanZ\Desktop\异度之刃2终极攻略下.pdf", "vol2"),
]

MAXW = 1200
manifest = []
for path, tag in JOBS:
    doc = pymupdf.open(path)
    for i in range(doc.page_count):
        dst = os.path.join(OUT, f"{tag}-p{i+1:03d}.webp")
        if not os.path.exists(dst):
            pix = doc[i].get_pixmap(matrix=pymupdf.Matrix(1.4, 1.4))
            img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
            if img.width > MAXW:
                img = img.resize((MAXW, round(img.height * MAXW / img.width)), Image.LANCZOS)
            img.save(dst, "WEBP", quality=76, method=5)
        manifest.append({"file": f"assets/mag/{tag}-p{i+1:03d}.webp", "tag": tag, "page": i + 1,
                         "w": MAXW, "h": round(MAXW * 2986 / 2268)})
        if (i + 1) % 10 == 0:
            print(tag, i + 1, flush=True)
    doc.close()

total = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT))
print("pages", len(manifest), "total MB", round(total / 1e6, 1))
