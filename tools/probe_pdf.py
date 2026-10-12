import os, sys
sys.path.insert(0, r"C:\Users\ZhuanZ\Documents\deepseek-harness\default-workspace\.pylibs")
import pymupdf

OUT = r"C:\Users\ZhuanZ\Documents\deepseek-harness\default-workspace\.extract\img"
os.makedirs(OUT, exist_ok=True)

for path, tag in [
    (r"C:\Users\ZhuanZ\Desktop\异度之刃2终极攻略上.pdf", "vol1"),
    (r"C:\Users\ZhuanZ\Desktop\异度之刃2终极攻略下.pdf", "vol2"),
]:
    doc = pymupdf.open(path)
    for i in (0, 1, 2):
        page = doc[i]
        imgs = page.get_images(full=True)
        print(f"{tag} p{i+1}: rect={page.rect} images={len(imgs)}")
        for j, im in enumerate(imgs[:3]):
            print("   ", im[2], "x", im[3], "bpc", im[4], "cs", im[5])
    # export first 3 pages as png at moderate dpi
    for i in (0, 1, 2):
        page = doc[i]
        pix = page.get_pixmap(matrix=pymupdf.Matrix(1.4, 1.4))
        fn = os.path.join(OUT, f"{tag}_p{i+1:03d}.png")
        pix.save(fn)
        print("saved", fn, os.path.getsize(fn))
    doc.close()
