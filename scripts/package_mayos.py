"""Stage GitHub Pages and a versioned, complete game package for MayOS."""

import argparse
import hashlib
import json
import re
import shutil
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("revision")
    parser.add_argument("destination", type=Path)
    args = parser.parse_args()
    if not re.fullmatch(r"[0-9a-f]{40}", args.revision):
        parser.error("revision must be a full Git commit SHA")

    source = Path(__file__).resolve().parents[1] / "site"
    files = sorted(path for path in source.rglob("*") if path.is_file())
    shutil.copytree(source, args.destination)
    downloads = args.destination / "mayos"
    downloads.mkdir()
    package = downloads / f"summer-letters-{args.revision}.zip"
    with ZipFile(package, "w", compression=ZIP_DEFLATED) as archive:
        for path in files:
            entry = ZipInfo(path.relative_to(source).as_posix())
            archive.writestr(entry, path.read_bytes(), compress_type=ZIP_DEFLATED)

    data = package.read_bytes()
    manifest = {
        "schema": 1,
        "revision": args.revision,
        "entrypoint": "index.html",
        "package": package.name,
        "size": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
    }
    (downloads / "manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
    )


if __name__ == "__main__":
    main()
