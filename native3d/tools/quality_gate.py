#!/usr/bin/env python3
"""Release blocker for the original-anime-art native 3D edition.

This *does not* certify artistic quality by itself. It prevents fake assetless
builds and requires recorded human visual approval and original model files.
"""
import hashlib
import json
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REQUIRED = {
    "world": ROOT / "assets/world/kamakura_full.glb",
    "player": ROOT / "assets/characters/player.glb",
    "mio": ROOT / "assets/characters/mio.glb",
    "nagi": ROOT / "assets/characters/nagi.glb",
    "shiori": ROOT / "assets/characters/shiori.glb",
}
REVIEW_FOLDER = ROOT / "assets/reviews"
REQUIRED_FIELDS = {"approved", "reviewed_by", "source", "license", "sha256", "notes"}

def validate(path: Path, name: str) -> list[str]:
    errors = []
    if not path.exists():
        return [f"{name}: missing original production model at {path.relative_to(ROOT)}"]
    raw = path.read_bytes()
    if len(raw) < 250_000:
        errors.append(f"{name}: suspiciously small GLB ({len(raw)} bytes); no placeholders")
    if len(raw) < 20 or raw[:4] != b"glTF":
        return errors + [f"{name}: invalid GLB header"]
    version, declared = struct.unpack_from("<II", raw, 4)
    if version != 2 or declared != len(raw):
        errors.append(f"{name}: invalid glTF version/size")
    chunk_size, chunk_type = struct.unpack_from("<I4s", raw, 12)
    if chunk_type != b"JSON" or chunk_size > len(raw) - 20:
        return errors + [f"{name}: missing valid glTF JSON chunk"]
    try:
        manifest = json.loads(raw[20:20 + chunk_size].decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        return errors + [f"{name}: invalid embedded JSON: {exc}"]
    if not manifest.get("meshes"):
        errors.append(f"{name}: must include actual 3D meshes")
    if name != "world" and not manifest.get("skins"):
        errors.append(f"{name}: full-body character must include a skin/skeleton")
    if not manifest.get("materials"):
        errors.append(f"{name}: missing PBR materials")
    if name != "world" and not manifest.get("animations"):
        errors.append(f"{name}: missing required character animations")
    review = REVIEW_FOLDER / f"{name}.json"
    if not review.exists():
        return errors + [f"{name}: missing human art review {review.relative_to(ROOT)}"]
    try:
        record = json.loads(review.read_text(encoding="utf-8"))
    except (ValueError, OSError) as exc:
        return errors + [f"{name}: cannot read art review: {exc}"]
    for field in REQUIRED_FIELDS - record.keys():
        errors.append(f"{name}: missing review field {field}")
    if record.get("approved") is not True:
        errors.append(f"{name}: not human-approved; cannot export as final game")
    if not str(record.get("reviewed_by", "")).strip():
        errors.append(f"{name}: reviewer's name/identifier required")
    if not str(record.get("source", "")).strip() or not str(record.get("license", "")).strip():
        errors.append(f"{name}: origin and license required")
    if record.get("sha256") != hashlib.sha256(raw).hexdigest():
        errors.append(f"{name}: model changed after human approval")
    return errors

def main() -> int:
    errors = [issue for name, path in REQUIRED.items() for issue in validate(path, name)]
    if errors:
        print("⛔ NOT A PLAYABLE 3D RELEASE — asset quality gate blocked export:")
        for error in errors:
            print(" -", error)
        print("Do not replace missing models with flat sprites or basic primitives.")
        return 1
    print("Asset structure and recorded approval verified; visual/device QA is still required.")
    return 0

if __name__ == "__main__":
    sys.exit(main())
