import os, sys, json, io, time
sys.path.insert(0, r"C:\Users\ZhuanZ\Documents\deepseek-harness\default-workspace\.pylibs")
import pymupdf

OUT = r"C:\Users\ZhuanZ\Documents\deepseek-harness\default-workspace\.extract"
os.makedirs(OUT, exist_ok=True)

jobs = [
    (r"C:\Users\ZhuanZ\Desktop\异度之刃2终极攻略上.pdf", "vol1"),
    (r"C:\Users\ZhuanZ\Desktop\异度之刃2终极攻略下.pdf", "vol2"),
]

for path, tag in jobs:
    t0 = time.time()
    doc = pymupdf.open(path)
    print(f"{tag}: pages={doc.page_count}", flush=True)
    pages = []
    for i, page in enumerate(doc):
        txt = page.get_text("text")
        pages.append({"p": i + 1, "text": txt})
        if (i + 1) % 50 == 0:
            print(f"  {tag} {i+1}/{doc.page_count} {time.time()-t0:.0f}s", flush=True)
    with open(os.path.join(OUT, tag + ".json"), "w", encoding="utf-8") as f:
        json.dump(pages, f, ensure_ascii=False)
    # plain text with page markers
    with open(os.path.join(OUT, tag + ".txt"), "w", encoding="utf-8") as f:
        for pg in pages:
            f.write(f"\n===== [{tag} p{pg['p']}] =====\n")
            f.write(pg["text"])
    total = sum(len(p["text"]) for p in pages)
    print(f"{tag}: done chars={total} {time.time()-t0:.0f}s", flush=True)
