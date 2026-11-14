#!/usr/bin/env python3
"""Stage a real, separately generated GLB asset without pretending it is approved.

Run after producing a genuine 3D model from an AI 3D service or DCC software.
Never inserts blank meshes, character sprites, static images, or placeholder art.
"""
import argparse
import hashlib
import json
import shutil
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGETS = {
    "world": ROOT / "assets/world/kamakura_full.glb",
    "player": ROOT / "assets/characters/player.glb",
    "mio": ROOT / "assets/characters/mio.glb",
    "nagi": ROOT / "assets/characters/nagi.glb",
    "shiori": ROOT / "assets/characters/shiori.glb",
}
REVIEWS = {
    "world": ROOT / "assets/reviews/kamakura_full.json",
    **{item: ROOT / f"assets/reviews/{item}.json" for item in ("player", "mio", "nagi", "shiori")},
}

def validate_glb(data: bytes) -> dict:
    if len(data) < 20 or data[:4] != b"glTF":
        raise ValueError("Not a GLB file (missing glTF header)")
    version, declared = struct.unpack_from("<II", data, 4)
    if version != 2 or declared != len(data):
        raise ValueError("Malformed GLB: version or total length is invalid")
    chunk_len, kind = struct.unpack_from("<I4s", data, 12)
    if kind != b"JSON" or chunk_len > len(data) - 20:
        raise ValueError("Malformed GLB: no valid JSON manifest")
    manifest = json.loads(data[20:20 + chunk_len].decode("utf-8"))
    if not manifest.get("meshes") or not manifest.get("materials"):
        raise ValueError("This asset must contain real 3D meshes and authored materials")
    return manifest

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("name", choices=TARGETS)
    parser.add_argument("input", type=Path)
    parser.add_argument("--source", required=True,
                        help="AI asset provider, creation process, source/reference ID")
    parser.add_argument("--license", required=True,
                        help="Rights, license and commercial use terms")
    parser.add_argument("--replace", action="store_true")
    options = parser.parse_args()
    incoming = options.input.resolve()
    if not incoming.is_file():
        parser.error(f"Source GLB not found: {incoming}")
    data = incoming.read_bytes()
    manifest = validate_glb(data)
    destination = TARGETS[options.name]
    review_path = REVIEWS[options.name]
    if destination.exists() and not options.replace:
        parser.error("Destination exists; use --replace after reviewing changes")
    destination.parent.mkdir(parents=True, exist_ok=True)
    review_path.parent.mkdir(parents=True, exist_ok=True)
    if incoming != destination.resolve():
        shutil.copyfile(incoming, destination)
    review = {
        "approved": False,
        "reviewed_by": "",
        "source": options.source,
        "license": options.license,
        "sha256": hashlib.sha256(data).hexdigest(),
        "notes": "待人工核对四方向结构、服装细节、绑定动画、授权和性能",
        "asset_type": options.name,
        "mesh_count": len(manifest.get("meshes", [])),
        "material_count": len(manifest.get("materials", [])),
        "skin_count": len(manifest.get("skins", [])),
        "animation_count": len(manifest.get("animations", [])),
        "texture_count": len(manifest.get("textures", []))
    }
    review_path.write_text(json.dumps(review, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")
    print(f"Staged: {destination}")
    print(f"Review: {review_path}")
    print("NOT APPROVED: a human must inspect the model before marking approved=true.")
    print("This script intentionally does not export Windows/Android installers.")

if __name__ == "__main__":
    main()
