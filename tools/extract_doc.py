"""Minimal OLE2 (CFB) reader + Word 97-2003 (.doc) text extractor (no external deps)."""
import struct, sys, os, re

class CFB:
    def __init__(self, data):
        self.d = data
        if data[:8] != b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1":
            raise ValueError("not an OLE2 file")
        self.sector_shift = struct.unpack_from("<H", data, 0x1E)[0]
        self.mini_sector_shift = struct.unpack_from("<H", data, 0x20)[0]
        self.sector_size = 1 << self.sector_shift
        self.mini_sector_size = 1 << self.mini_sector_shift
        self.num_fat_sectors = struct.unpack_from("<I", data, 0x2C)[0]
        self.first_dir_sector = struct.unpack_from("<I", data, 0x30)[0]
        self.mini_cutoff = struct.unpack_from("<I", data, 0x38)[0]
        self.first_minifat_sector = struct.unpack_from("<I", data, 0x3C)[0]
        self.num_minifat_sectors = struct.unpack_from("<I", data, 0x40)[0]
        self.first_difat_sector = struct.unpack_from("<I", data, 0x44)[0]
        self.num_difat_sectors = struct.unpack_from("<I", data, 0x48)[0]
        self._build_fat()
        self._build_minifat()
        self._read_dir()

    def _sec_off(self, sec):
        return (sec + 1) * self.sector_size

    def _read_sector(self, sec):
        o = self._sec_off(sec)
        return self.d[o:o + self.sector_size]

    def _build_fat(self):
        fat = []
        sec = self.first_difat_sector
        difat = list(struct.unpack_from("<109I", self.d, 0x4C))
        guard = 0
        while sec not in (0xFFFFFFFE, 0xFFFFFFFF) and guard < 1000:
            raw = self._read_sector(sec)
            vals = struct.unpack_from("<%dI" % (self.sector_size // 4), raw, 0)
            difat.extend(vals[:-1])
            sec = vals[-1]
            guard += 1
        for s in difat[:self.num_fat_sectors]:
            if s in (0xFFFFFFFE, 0xFFFFFFFF):
                continue
            raw = self._read_sector(s)
            fat.extend(struct.unpack_from("<%dI" % (self.sector_size // 4), raw, 0))
        self.fat = fat

    def _chain(self, start, fat):
        out = []
        sec = start
        guard = 0
        while sec not in (0xFFFFFFFE, 0xFFFFFFFF) and guard < 2000000:
            out.append(sec)
            if sec >= len(fat):
                break
            sec = fat[sec]
            guard += 1
        return out

    def _build_minifat(self):
        raw = b"".join(self._read_sector(s) for s in self._chain(self.first_minifat_sector, self.fat))
        n = len(raw) // 4
        self.minifat = list(struct.unpack_from("<%dI" % n, raw, 0)) if n else []
        root = self._dir_entries[0] if hasattr(self, "_dir_entries") else None

    def _read_dir(self):
        raw = b"".join(self._read_sector(s) for s in self._chain(self.first_dir_sector, self.fat))
        entries = []
        for i in range(0, len(raw), 128):
            e = raw[i:i + 128]
            if len(e) < 128:
                break
            name_len = struct.unpack_from("<H", e, 0x40)[0]
            name = e[:max(0, name_len - 2)].decode("utf-16-le", "ignore") if name_len else ""
            etype = e[0x42]
            start = struct.unpack_from("<I", e, 0x74)[0]
            size = struct.unpack_from("<Q", e, 0x78)[0]
            if etype in (1, 2, 5):
                entries.append({"name": name, "type": etype, "start": start, "size": size})
        self._dir_entries = entries
        # now minimat needs root entry (index 0 typically)
        root = next((x for x in entries if x["type"] == 5), None)
        if root and not hasattr(self, "minifat_ready"):
            raw2 = b"".join(self._read_sector(s) for s in self._chain(self.first_minifat_sector, self.fat))
            n = len(raw2) // 4
            self.minifat = list(struct.unpack_from("<%dI" % n, raw2, 0)) if n else []
            self.root_start = root["start"]
            self.root_size = root["size"]
            self.minifat_ready = True
            # mini stream data
            self.ministream = b"".join(self._read_sector(s) for s in self._chain(self.root_start, self.fat))

    def read_stream(self, entry):
        if entry["size"] < self.mini_cutoff and entry["size"] > 0:
            chain = self._chain(entry["start"], self.minifat)
            data = b"".join(
                self.ministream[s * self.mini_sector_size:(s + 1) * self.mini_sector_size]
                for s in chain
            )
            return data[:entry["size"]]
        chain = self._chain(entry["start"], self.fat)
        data = b"".join(self._read_sector(s) for s in chain)
        return data[:entry["size"]]


def extract_doc_text(path):
    with open(path, "rb") as f:
        data = f.read()
    cfb = CFB(data)
    names = {e["name"]: e for e in cfb._dir_entries}
    wd = cfb.read_stream(names["WordDocument"])
    fib_flags = struct.unpack_from("<H", wd, 0x0A)[0]
    which = (fib_flags >> 9) & 1
    table_name = "1Table" if which else "0Table"
    tbl = cfb.read_stream(names[table_name])
    csw = struct.unpack_from("<H", wd, 0x20)[0]
    off = 0x22 + csw * 2
    cslw = struct.unpack_from("<H", wd, off)[0]
    off2 = off + 2 + cslw * 4
    cbRgFcLcb = struct.unpack_from("<H", wd, off2)[0]
    rg = off2 + 2
    # fcClx / lcbClx are the 33rd pair (index 66,67) in FibRgFcLcb97
    fcClx = struct.unpack_from("<I", wd, rg + 66 * 4)[0]
    lcbClx = struct.unpack_from("<I", wd, rg + 66 * 4 + 4)[0]
    clx = tbl[fcClx:fcClx + lcbClx]
    # parse Clx -> find Pcdt (0x02)
    i = 0
    pieces = None
    while i < len(clx):
        t = clx[i]
        if t == 1:
            cb = struct.unpack_from("<H", clx, i + 1)[0]
            i += 3 + cb
        elif t == 2:
            lcb = struct.unpack_from("<I", clx, i + 1)[0]
            pcdt = clx[i + 5:i + 5 + lcb]
            pieces = pcdt
            break
        else:
            break
    if pieces is None:
        raise ValueError("no piece table")
    n = (len(pieces) - 4) // 12
    cps = list(struct.unpack_from("<%dI" % (n + 1), pieces, 0))
    out = []
    for k in range(n):
        pcd_off = 4 * (n + 1) + k * 8
        fc = struct.unpack_from("<I", pieces, pcd_off + 2)[0]
        compressed = (fc & 0x40000000) != 0
        fcv = fc & 0x3FFFFFFF
        cch = cps[k + 1] - cps[k]
        if compressed:
            fcv = fcv // 2
            raw = wd[fcv:fcv + cch]
            # Word stores the 8-bit text as the ANSI codepage (GBK on zh-CN systems).
            try:
                out.append(raw.decode("gb18030", "strict"))
            except UnicodeDecodeError:
                out.append(raw.decode("cp1252", "ignore"))
        else:
            raw = wd[fcv:fcv + cch * 2]
            out.append(raw.decode("utf-16-le", "ignore"))
    return "".join(out)


def clean(t):
    t = t.replace("\r", "\n").replace("\x07", "\t|\t").replace("\x0c", "\n\n---PAGE---\n\n")
    t = t.replace("\x0b", "\n").replace("\x01", "").replace("\x02", "").replace("\x08", "")
    t = re.sub(r"\n{3,}", "\n\n", t)
    return t


if __name__ == "__main__":
    src = r"C:\Users\ZhuanZ\Desktop\异度之刃2每章更多备注.doc"
    dst = r"C:\Users\ZhuanZ\Documents\deepseek-harness\default-workspace\.extract\notes.txt"
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    txt = clean(extract_doc_text(src))
    with open(dst, "w", encoding="utf-8") as f:
        f.write(txt)
    print("chars", len(txt))
    print(txt[:3000])
