#!/usr/bin/env python3
"""Verify a downloaded MayOS game package without changing its contents.

Manifest JSON format:
{"files":[{"path":"site/index.html","size":123,"sha256":"64 lowercase hex"}]}
"""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath

def verify(root: Path, manifest: Path) -> int:
    data = json.loads(manifest.read_text(encoding="utf-8"))
    entries = data["files"]
    if not isinstance(entries, list) or not entries:
        raise ValueError("Manifest must contain a non-empty files list")
    root = root.resolve()
    seen = set()
    errors = []
    for item in entries:
        name, expected_size, digest = item["path"], item["size"], item["sha256"]
        rel = PurePosixPath(name)
        if (not name or rel.is_absolute() or ".." in rel.parts
                or "\\" in name or name in seen):
            errors.append(f"Unsafe or duplicate path: {name!r}")
            continue
        seen.add(name)
        target = (root / name).resolve()
        if not target.is_relative_to(root) or not target.is_file():
            errors.append(f"Missing or unsafe file: {name}")
            continue
        if target.stat().st_size != expected_size:
            errors.append(f"Size mismatch: {name}")
            continue
        h = hashlib.sha256()
        with target.open("rb") as f:
            for chunk in iter(lambda: f.read(1024 * 1024), b""):
                h.update(chunk)
        if h.hexdigest() != digest:
            errors.append(f"SHA-256 mismatch: {name}")
    for error in errors:
        print("FAIL:", error)
    if errors:
        return 1
    print(f"PASS: {len(entries)} original files verified")
    return 0

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("game_root", type=Path)
    parser.add_argument("manifest", type=Path)
    args = parser.parse_args()
    raise SystemExit(verify(args.game_root, args.manifest))
