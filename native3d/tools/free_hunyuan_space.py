#!/usr/bin/env python3
"""Attempt ONE free official Hunyuan3D Hugging Face Space generation.

This never charges fal or a paid API, never silently switches accounts, and
never certifies a generated mesh for production. Failure is reported, not
replaced with a fake primitive model.

Run:
  python native3d/tools/free_hunyuan_space.py \
    --source site/assets/retro/nagi-0.webp \
    --output free3d/nagi_candidate.glb
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import struct
import sys
import tempfile
from pathlib import Path

from PIL import Image


def prepare_source(source: Path, dest: Path) -> None:
    with Image.open(source) as image:
        image = image.convert("RGBA")
        image.thumbnail((1536, 1536), Image.Resampling.LANCZOS)
        image.save(dest, format="PNG")


def find_model_files(result: object) -> list[Path]:
    """Gradio file responses can contain strings, dictionaries or lists."""
    candidates: list[Path] = []

    def scan(value: object) -> None:
        if isinstance(value, str):
            path = Path(value)
            if path.is_file() and path.suffix.lower() in {".glb", ".gltf", ".obj", ".ply"}:
                candidates.append(path)
        elif isinstance(value, dict):
            for key in ("path", "name", "url"):
                if key in value:
                    scan(value[key])
        elif isinstance(value, (tuple, list)):
            for item in value:
                scan(item)

    scan(result)
    return candidates


def verify_glb(path: Path) -> dict:
    data = path.read_bytes()
    if len(data) < 4096 or data[:4] != b"glTF":
        raise ValueError("Model output is missing or not a valid GLB file")
    version, declared = struct.unpack_from("<II", data, 4)
    if version != 2 or declared != len(data):
        raise ValueError("GLB header/version/size is invalid")
    chunk_size, chunk_type = struct.unpack_from("<I4s", data, 12)
    if chunk_type != b"JSON" or 20 + chunk_size > len(data):
        raise ValueError("GLB JSON chunk is invalid")
    scene = json.loads(data[20 : 20 + chunk_size].decode("utf-8"))
    if not scene.get("meshes"):
        raise ValueError("No 3D mesh in GLB output")
    return {
        "bytes": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
        "mesh_count": len(scene["meshes"]),
        "material_count": len(scene.get("materials", [])),
        "skin_count": len(scene.get("skins", [])),
        "animation_count": len(scene.get("animations", [])),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--space", default="tencent/Hunyuan3D-2.1")
    args = parser.parse_args()
    if args.space not in {"tencent/Hunyuan3D-2.1", "tencent/Hunyuan3D-2"}:
        parser.error("Only the official Tencent public demo Spaces are permitted")
    if not args.source.is_file():
        parser.error("The original character painting is missing: " + str(args.source))

    try:
        from gradio_client import Client, handle_file
    except ImportError:
        print("gradio_client is required; install with pip", file=sys.stderr)
        return 2

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as temp:
        png = Path(temp) / "original_character.png"
        prepare_source(args.source, png)
        print(f"Attempting ONE official ZeroGPU generation: {args.space}", flush=True)
        token = os.environ.get("HF_TOKEN") or None
        try:
            client = Client(args.space, hf_token=token)
            endpoints = client.view_api(return_format="dict")
            names = set(endpoints.get("named_endpoints", {}))
            # Use the actually public endpoint; never assume textured generation
            # exists if the demo disabled texture synthesis.
            if "/generation_all" in names:
                endpoint = "/generation_all"
            elif "/shape_generation" in names:
                endpoint = "/shape_generation"
            else:
                raise RuntimeError(
                    "The Space does not expose a supported public 3D generation endpoint: "
                    + ", ".join(sorted(names))
                )

            # Public gradio_app.py: caption, input, 4 optional MV images,
            # steps, guidance, seed, octree, rembg, chunks, randomize.
            # Source image is the original project asset (no invented identity).
            # One request only: honor ZeroGPU quotas; do not retry on 429/403.
            result = client.predict(
                None, handle_file(str(png)), None, None, None, None,
                30, 5.0, 1234, 256, False, 8000, False,
                api_name=endpoint,
            )
        except Exception as exc:
            print("FREE SERVICE GENERATION UNAVAILABLE:", str(exc)[:1600], file=sys.stderr)
            print("No model was created. No paid fallback will be attempted.", file=sys.stderr)
            return 3

        files = find_model_files(result)
        if not files:
            print("Demo returned no locally downloadable 3D mesh file.", file=sys.stderr)
            return 4
        # 'generation_all' returns white mesh first and textured mesh second.
        best = files[-1] if len(files) >= 2 else files[0]
        if best.suffix.lower() != ".glb":
            print("Free demo returned " + best.suffix + ", not GLB; no fake export.", file=sys.stderr)
            return 5
        shutil.copyfile(best, args.output)
        details = verify_glb(args.output)
        review = {
            "approved": False,
            "reviewed_by": "",
            "source": f"{args.space} free Hugging Face ZeroGPU; original project image",
            "license": "Tencent Hunyuan Community License — verify permitted use",
            "notes": "AI 3D draft; MUST verify model from all angles, topology, UV, original-art visual fidelity and skeleton. Not approved for native game release.",
            "image": str(args.source),
            "endpoint": endpoint,
            **details,
        }
        args.output.with_suffix(".review.json").write_text(
            json.dumps(review, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        print("Generated draft:", args.output, flush=True)
        print("Details:", json.dumps(details, ensure_ascii=False), flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
