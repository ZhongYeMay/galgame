#!/usr/bin/env python3
"""MayOS native game launcher for Linux.

Downloads the entire original game site from a pinned GitHub source commit, never
individual assets on demand. Every file must match the trusted build manifest
before the SDL executable is launched. No webview or browser is used.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.request
import zipfile

BASE = Path(__file__).resolve().parent
MAX_DOWNLOAD = 768 * 1024 * 1024
MAX_EXTRACTED = 1024 * 1024 * 1024


def package_config(directory: Path):
    data = json.loads((directory / "package-config.json").read_text(encoding="utf-8"))
    repository = data["repository"]
    commit = data["commit"]
    if repository != "ZhongYeMay/galgame" or not re.fullmatch(r"[0-9a-f]{40}", commit):
        raise ValueError("Unsupported game source or unpinned GitHub commit")
    return repository, commit


def file_manifest(directory: Path):
    data = json.loads((directory / "manifest.json").read_text(encoding="utf-8"))
    entries = data["files"]
    if not isinstance(entries, list) or not entries:
        raise ValueError("Empty game manifest")
    files = {}
    for entry in entries:
        name, size, digest = entry["path"], entry["size"], entry["sha256"]
        parts = PurePosixPath(name).parts
        if (len(parts) < 2 or parts[0] != "site" or
            ".." in parts or "\\" in name or name in files or
            type(size) is not int or size < 0 or
            not re.fullmatch("[0-9a-f]{64}", digest)):
            raise ValueError("Invalid manifest entry: " + str(name))
        files[name] = (size, digest)
    for essential in ("site/index.html", "site/story.js", "site/game.js", "site/style.css"):
        if essential not in files:
            raise ValueError("Incomplete trusted game manifest: " + essential)
    return files


def verify_cached(directory: Path, files: dict) -> bool:
    if not directory.is_dir():
        return False
    try:
        actual = set()
        for path in (directory / "site").rglob("*"):
            if path.is_symlink():
                return False
            if path.is_file():
                actual.add(path.relative_to(directory).as_posix())
        if actual != set(files):
            return False
        for name, (size, digest) in files.items():
            file = directory / name
            if not file.is_file() or file.is_symlink() or file.stat().st_size != size:
                return False
            h = hashlib.sha256()
            with file.open("rb") as stream:
                for block in iter(lambda: stream.read(1024 * 1024), b""):
                    h.update(block)
            if h.hexdigest() != digest:
                return False
        return True
    except (OSError, ValueError):
        return False


def extract_checked(archive_path: Path, target: Path, manifest: dict):
    """Only extract manifest-listed site files. Reject unsafe paths and mismatches."""
    total = 0
    found = set()
    with zipfile.ZipFile(archive_path) as archive:
        for entry in archive.infolist():
            path = PurePosixPath(entry.filename)
            parts = path.parts
            if path.is_absolute() or ".." in parts or "\\" in entry.filename:
                raise ValueError("Unsafe archive path")
            if entry.is_dir():
                continue
            # A GitHub archive contains repository metadata besides site; it is
            # intentionally never installed in the game's asset cache.
            if len(parts) < 3 or not parts[0].startswith("galgame-") or parts[1] != "site":
                continue
            relative = PurePosixPath(*parts[1:]).as_posix()
            if relative not in manifest or relative in found:
                raise ValueError("Unexpected or duplicate game asset: " + relative)
            file_size, digest = manifest[relative]
            if entry.file_size != file_size:
                raise ValueError("Wrong asset size: " + relative)
            total += file_size
            if total > MAX_EXTRACTED:
                raise ValueError("Unreasonably large game asset archive")
            mode = entry.external_attr >> 16
            if mode & 0o170000 == 0o120000:
                raise ValueError("Symlink game assets are forbidden")
            dest = target.joinpath(*parts[1:])
            dest.parent.mkdir(parents=True, exist_ok=True)
            h = hashlib.sha256()
            with archive.open(entry) as src, dest.open("xb") as out:
                while True:
                    chunk = src.read(1024 * 1024)
                    if not chunk:
                        break
                    h.update(chunk)
                    out.write(chunk)
            if h.hexdigest() != digest:
                raise ValueError("Game asset SHA-256 mismatch: " + relative)
            found.add(relative)
    if found != set(manifest):
        missing = sorted(set(manifest) - found)
        raise ValueError("Incomplete game download; missing: " + ", ".join(missing[:5]))


def download_archive(repository: str, commit: str, destination: Path):
    # Only a full, pinned commit archive is accepted, not a mutable branch ZIP.
    url = f"https://github.com/{repository}/archive/{commit}.zip"
    request = urllib.request.Request(url, headers={"User-Agent": "MayOS-NativeLauncher/1"})
    total = 0
    with urllib.request.urlopen(request, timeout=45) as response:
        if not response.geturl().startswith("https://"):
            raise ValueError("Unsafe download redirect")
        with destination.open("xb") as output:
            while True:
                block = response.read(1024 * 1024)
                if not block:
                    break
                total += len(block)
                if total > MAX_DOWNLOAD:
                    raise ValueError("GitHub game archive exceeds download limit")
                output.write(block)


def ensure_assets(bundle: Path, cache_root: Path) -> Path:
    repository, commit = package_config(bundle)
    manifest = file_manifest(bundle)
    installed = cache_root / commit
    if verify_cached(installed, manifest):
        return installed
    cache_root.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".mayos-fetch-", dir=cache_root) as workdir:
        staging = Path(workdir)
        archive = staging / "source.zip"
        target = staging / "game"
        target.mkdir()
        print("Downloading complete original assets from GitHub...", flush=True)
        download_archive(repository, commit, archive)
        extract_checked(archive, target, manifest)
        if not verify_cached(target, manifest):
            raise ValueError("Game package failed complete verification")
        if installed.exists():
            shutil.rmtree(installed)
        shutil.move(str(target), str(installed))
    return installed


def find_font(requested: str | None) -> Path:
    candidates = [
        requested,
        os.environ.get("MAYOS_GAME_FONT"),
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]
    for candidate in candidates:
        if candidate and Path(candidate).is_file():
            return Path(candidate)
    raise FileNotFoundError("No installed TTF/TTC font. Use --font with a CJK-capable font.")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--font", help="Path to a CJK-capable font installed on this system")
    parser.add_argument("--download-only", action="store_true")
    parser.add_argument("--cache-dir", type=Path)
    args = parser.parse_args()
    executable = BASE / "mayos_summer_play"
    story = BASE / "story.generated.json"
    cache = args.cache_dir or Path(os.environ.get("XDG_CACHE_HOME", Path.home() / ".cache")) / "mayos-summer"
    try:
        if not story.is_file():
            raise FileNotFoundError("Missing built-in story export")
        if not args.download_only and not executable.is_file():
            raise FileNotFoundError("Missing native SDL executable")
        assets = ensure_assets(BASE, cache)
        if args.download_only:
            print("Verified complete original game resources:", assets)
            return 0
        font = find_font(args.font)
        return subprocess.call([str(executable), str(assets), str(story), str(font)])
    except (OSError, ValueError, zipfile.BadZipFile) as error:
        print("MayOS game startup blocked:", error, file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
