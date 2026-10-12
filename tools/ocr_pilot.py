import os, sys, time, json
WS = r"C:\Users\ZhuanZ\Documents\deepseek-harness\default-workspace"
sys.path.insert(0, os.path.join(WS, ".pylibs"))
import numpy as np
from PIL import Image
from rapidocr_onnxruntime import RapidOCR

engine = RapidOCR()
img_path = os.path.join(WS, ".extract", "img", "vol1_p002.png")
im = Image.open(img_path)
print("image", im.size)
arr = np.array(im.convert("RGB"))
t0 = time.time()
result, elapse = engine(arr)
print("elapse", elapse, "boxes", len(result) if result else 0, "wall", round(time.time() - t0, 1))
if result:
    for box, txt, score in result[:60]:
        xs = [p[0] for p in box]
        ys = [p[1] for p in box]
        print(f"[{int(min(xs)):5d},{int(min(ys)):5d}] {score:.2f} {txt}")
