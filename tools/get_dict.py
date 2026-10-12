import os, urllib.request

DEST = r"C:\Users\ZhuanZ\Documents\deepseek-harness\default-workspace\.pylibs\rapidocr_onnxruntime\models\ppocr_keys_v1.txt"
UA = {"User-Agent": "Mozilla/5.0"}
CANDIDATES = [
    "https://www.modelscope.cn/models/RapidAI/RapidOCR/resolve/master/onnx/PP-OCRv4/ppocr_keys_v1.txt",
    "https://www.modelscope.cn/models/RapidAI/RapidOCR/resolve/master/paddle/PP-OCRv4/ppocr_keys_v1.txt",
    "https://raw.githubusercontent.com/RapidAI/RapidOCR/main/rapidocr_onnxruntime/models/ppocr_keys_v1.txt",
    "https://raw.githubusercontent.com/PaddlePaddle/PaddleOCR/main/ppocr/utils/ppocr_keys_v1.txt",
    "https://raw.githubusercontent.com/PaddlePaddle/PaddleOCR/release/2.6/ppocr/utils/ppocr_keys_v1.txt",
    "https://raw.githubusercontent.com/PaddlePaddle/PaddleOCR/release/2.7/ppocr/utils/ppocr_keys_v1.txt",
]
if os.path.exists(DEST) and os.path.getsize(DEST) > 10000:
    print("cached", os.path.getsize(DEST))
else:
    for u in CANDIDATES:
        try:
            print("try", u)
            req = urllib.request.Request(u, headers=UA)
            with urllib.request.urlopen(req, timeout=120) as r:
                data = r.read()
            if len(data) < 10000:
                print("  too small", len(data))
                continue
            with open(DEST, "wb") as f:
                f.write(data)
            print("  OK", len(data), "lines", data.count(b"\n"))
            break
        except Exception as e:
            print("  fail", type(e).__name__, e)
