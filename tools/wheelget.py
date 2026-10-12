"""Download wheels from PyPI directly and unpack into a local lib dir (no pip)."""
import json, os, sys, urllib.request, zipfile, re

WS = r"C:\Users\ZhuanZ\Documents\deepseek-harness\default-workspace"
LIB = os.path.join(WS, ".pylibs")
CACHE = os.path.join(WS, ".piptmp")
os.makedirs(LIB, exist_ok=True)
os.makedirs(CACHE, exist_ok=True)

PY_VER = (3, 12)
PLAT = sys.argv[1] if len(sys.argv) > 1 else "win_amd64"


def norm(name):
    return re.sub(r"[-_.]+", "-", name).lower()


def pick(urls, pkg, ver=None):
    """Choose the best wheel: prefer py3-none-any, else cp3xx/abi3 for win_amd64."""
    cands = [u for u in urls if u["packagetype"] == "bdist_wheel"]
    if not cands:
        return None
    anyw = [u for u in cands if u["filename"].endswith("py3-none-any.whl") or u["filename"].endswith("py2.py3-none-any.whl")]
    if anyw:
        return anyw[0]
    good = []
    for u in cands:
        f = u["filename"]
        if PLAT not in f:
            continue
        m = re.search(r"cp(\d)(\d+)", f)
        if m:
            if (int(m.group(1)), int(m.group(2))) <= PY_VER:
                good.append((0 if int(m.group(2)) == PY_VER[1] else 1, u))
        elif "abi3" in f:
            m2 = re.search(r"cp(\d)(\d+)-abi3", f)
            if m2 and (int(m2.group(1)), int(m2.group(2))) <= PY_VER:
                good.append((2, u))
        elif "py3" in f:
            good.append((3, u))
    if not good:
        return None
    good.sort(key=lambda t: t[0])
    return good[0][1]


def fetch(pkg, ver=None):
    url = f"https://pypi.org/pypi/{pkg}/{ver}/json" if ver else f"https://pypi.org/pypi/{pkg}/json"
    with urllib.request.urlopen(url, timeout=120) as r:
        d = json.load(r)
    u = pick(d["urls"], pkg, ver)
    if not u:
        print(f"  !! no suitable wheel for {pkg}")
        return None
    fn = u["filename"]
    dest = os.path.join(CACHE, fn)
    if not os.path.exists(dest) or os.path.getsize(dest) != u["size"]:
        print(f"  dl {fn} ({u['size']/1e6:.1f} MB)")
        with urllib.request.urlopen(u["url"], timeout=900) as r, open(dest, "wb") as f:
            while True:
                c = r.read(1 << 20)
                if not c:
                    break
                f.write(c)
    else:
        print(f"  cached {fn}")
    if fn.endswith(".whl"):
        with zipfile.ZipFile(dest) as z:
            z.extractall(LIB)
    reqs = []
    for rq in (d["info"].get("requires_dist") or []):
        if "extra" in rq:
            continue
        name = re.split(r"[<>=!;\[ ]", rq.strip())[0]
        if name:
            reqs.append(name)
    return reqs


def main(roots):
    seen = set()
    queue = list(roots)
    while queue:
        pkg = queue.pop(0)
        n = norm(pkg)
        if n in seen:
            continue
        seen.add(n)
        print(f"[{n}]")
        try:
            reqs = fetch(pkg)
        except Exception as e:
            print(f"  ERR {e}")
            continue
        if reqs:
            queue.extend(reqs)
    print("done ->", LIB)


if __name__ == "__main__":
    pkgs = sys.argv[2:] or ["rapidocr_onnxruntime"]
    main(pkgs)
