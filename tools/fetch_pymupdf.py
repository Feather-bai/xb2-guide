import json, os, sys, urllib.request, zipfile

TMP = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".piptmp")
LIB = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".pylibs")
os.makedirs(TMP, exist_ok=True)
os.makedirs(LIB, exist_ok=True)

with urllib.request.urlopen("https://pypi.org/pypi/PyMuPDF/json", timeout=120) as r:
    data = json.load(r)

urls = data["urls"]
cand = [u for u in urls if u["filename"].endswith("win_amd64.whl") and "cp310" in u["filename"]]
if not cand:
    cand = [u for u in urls if u["filename"].endswith("win_amd64.whl")]
if not cand:
    cand = [u for u in urls if u["filename"].endswith(".whl")]
u = cand[0]
print("version", data["info"]["version"], "file", u["filename"], "size", u["size"])

whl = os.path.join(TMP, u["filename"])
if not os.path.exists(whl) or os.path.getsize(whl) != u["size"]:
    with urllib.request.urlopen(u["url"], timeout=600) as r, open(whl, "wb") as f:
        while True:
            chunk = r.read(1 << 20)
            if not chunk:
                break
            f.write(chunk)
print("downloaded", os.path.getsize(whl))

with zipfile.ZipFile(whl) as z:
    z.extractall(LIB)
print("extracted to", os.path.abspath(LIB))
