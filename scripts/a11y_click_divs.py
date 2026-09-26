from pathlib import Path

root = Path(r"E:\aifazi Neon city\aifazi.net\aifazi.net-frontend-next")

KEYBOARD = ' role="button" tabIndex={0} onKeyDown={(e)=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); e.currentTarget.click() } }}'

def find_open_tags(src: str):
    """Yield (start, end) of <div ...> open tags, brace/quote aware."""
    i = 0
    n = len(src)
    while True:
        j = src.find("<div", i)
        if j < 0:
            return
        # ensure word boundary
        if j + 4 < n and src[j + 4].isalnum():
            i = j + 4
            continue
        k = j + 4
        brace = 0
        quote = ""
        while k < n:
            c = src[k]
            if quote:
                if c == quote:
                    quote = ""
                k += 1
                continue
            if c in "\"'`":
                quote = c
                k += 1
                continue
            if c == "{":
                brace += 1
                k += 1
                continue
            if c == "}":
                brace = max(0, brace - 1)
                k += 1
                continue
            if c == ">" and brace == 0:
                yield j, k + 1
                i = k + 1
                break
            k += 1
        else:
            return

changed_files = 0
changed_tags = 0
for p in list(root.rglob("*.jsx")) + list(root.rglob("*.tsx")):
    s = str(p)
    if "node_modules" in s or ".next" in s:
        continue
    src = p.read_text(encoding="utf-8", errors="ignore")
    pieces = []
    last = 0
    n_before = src
    for a, b in find_open_tags(src):
        tag = src[a:b]
        if "onClick" not in tag or "role=" in tag:
            continue
        if "currentTarget" in tag and "onClose" in tag:
            continue  # modal backdrop
        if 'role="presentation"' in tag or "role='presentation'" in tag:
            continue
        if tag.endswith("/>"):
            new = tag[:-2] + KEYBOARD + " />"
        else:
            new = tag[:-1] + KEYBOARD + ">"
        pieces.append(src[last:a])
        pieces.append(new)
        last = b
        changed_tags += 1
    if last:
        pieces.append(src[last:])
        out = "".join(pieces)
        if out != n_before:
            p.write_text(out, encoding="utf-8")
            changed_files += 1

print("files", changed_files, "tags", changed_tags)
