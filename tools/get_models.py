import os, sys, urllib.request, json

MODELS = r"C:\Users\ZhuanZ\Documents\deepseek-harness\default-workspace\.pylibs\rapidocr_onnxruntime\models"
os.makedirs(MODELS, exist_ok=True)
UA = {"User-Agent": "Mozilla/5.0"}

TARGETS = {
    "ch_PP-OCRv4_det_infer.onnx": [
        "https://www.modelscope.cn/models/RapidAI/RapidOCR/resolve/master/onnx/PP-OCRv4/ch_PP-OCRv4_det_infer.onnx",
        "https://huggingface.co/RapidAI/RapidOCR/resolve/main/onnx/PP-OCRv4/ch_PP-OCRv4_det_infer.onnx",
        "https://github.com/RapidAI/RapidOCR/releases/download/v1.1.0/ch_PP-OCRv4_det_infer.onnx",
    ],
    "ch_PP-OCRv4_rec_infer.onnx": [
        "https://www.modelscope.cn/models/RapidAI/RapidOCR/resolve/master/onnx/PP-OCRv4/ch_PP-OCRv4_rec_infer.onnx",
        "https://huggingface.co/RapidAI/RapidOCR/resolve/main/onnx/PP-OCRv4/ch_PP-OCRv4_rec_infer.onnx",
        "https://github.com/RapidAI/RapidOCR/releases/download/v1.1.0/ch_PP-OCRv4_rec_infer.onnx",
    ],
    "ch_ppocr_mobile_v2.0_cls_infer.onnx": [
        "https://www.modelscope.cn/models/RapidAI/RapidOCR/resolve/master/onnx/PP-OCRv4/ch_ppocr_mobile_v2.0_cls_infer.onnx",
        "https://huggingface.co/RapidAI/RapidOCR/resolve/main/onnx/PP-OCRv4/ch_ppocr_mobile_v2.0_cls_infer.onnx",
        "https://github.com/RapidAI/RapidOCR/releases/download/v1.1.0/ch_ppocr_mobile_v2.0_cls_infer.onnx",
    ],
    "ch_PP-OCRv4_rec_infer.txt": [
        "https://raw.githubusercontent.com/RapidAI/RapidOCR/main/rapidocr_onnxruntime/utils/ppocr_keys_v1.txt",
    ],
}

for fn, urls in TARGETS.items():
    dest = os.path.join(MODELS, fn)
    if os.path.exists(dest) and os.path.getsize(dest) > 1000:
        print("cached", fn, os.path.getsize(dest))
        continue
    ok = False
    for u in urls:
        try:
            print("try", u)
            req = urllib.request.Request(u, headers=UA)
            with urllib.request.urlopen(req, timeout=180) as r, open(dest, "wb") as f:
                while True:
                    c = r.read(1 << 20)
                    if not c:
                        break
                    f.write(c)
            sz = os.path.getsize(dest)
            if sz < 1000:
                raise ValueError(f"too small {sz}")
            print("  OK", fn, sz)
            ok = True
            break
        except Exception as e:
            print("  fail:", type(e).__name__, e)
    if not ok:
        print("!! FAILED", fn)
print("models dir:", os.listdir(MODELS))
