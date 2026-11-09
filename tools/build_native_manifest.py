#!/usr/bin/env python3
"""Create an exhaustive manifest for a frozen game site; does not alter assets."""
import hashlib
import json
import sys
from pathlib import Path

def main(root: Path, output: Path):
    root=root.resolve()
    files=[]
    for path in sorted((root/"site").rglob("*")):
        if not path.is_file():continue
        if path.is_symlink():raise ValueError(f"Symlink forbidden: {path}")
        h=hashlib.sha256()
        with path.open("rb") as f:
            for block in iter(lambda:f.read(1024*1024),b""):h.update(block)
        files.append({"path":path.relative_to(root).as_posix(),"size":path.stat().st_size,"sha256":h.hexdigest()})
    if not files:raise ValueError("Empty site")
    output.write_text(json.dumps({"files":files},ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(f"Manifest contains {len(files)} files")

if __name__=="__main__":
    if len(sys.argv)!=3:raise SystemExit("Usage: build_native_manifest.py <repository-root> <output.json>")
    main(Path(sys.argv[1]),Path(sys.argv[2]))
