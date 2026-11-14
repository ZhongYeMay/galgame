#!/usr/bin/env python3
"""Generate ONE *unreviewed* GLB via Stability AI's free Stable Fast 3D Space.

This replaces the Hunyuan3D 2.1 ZeroGPU demo, which requires 270 seconds of
GPU time and rejects free unauthed users. Uses the publicly running Space,
with no paid API keys and no payment fallback.

Do not treat a successful generated mesh as an approved production character:
it is not rigged, may differ from the original art, and needs human QA.
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

SPACE = "stabilityai/stable-fast-3d"


def extract_glbs(result: object) -> list[Path]:
    """Find downloaded Gradio files in nested output and component metadata."""
    found: list[Path] = []

    def walk(value: object, depth: int = 0) -> None:
        if depth > 12:
            return
        if isinstance(value, (str, Path)):
            p = Path(value)
            if p.suffix.lower() == ".glb" and p.is_file():
                found.append(p)
        elif isinstance(value, (list, tuple)):
            for part in value:
                walk(part, depth + 1)
        elif isinstance(value, dict):
            for part in value.values():
                walk(part, depth + 1)

    walk(result)
    return found


def check_glb(path: Path) -> dict:
    raw = path.read_bytes()
    if len(raw) < 4096 or raw[:4] != b"glTF":
        raise ValueError("No GLB geometry returned")
    version, total = struct.unpack_from("<II", raw, 4)
    if version != 2 or total != len(raw):
        raise ValueError("Corrupt GLB header")
    block_bytes, block_type = struct.unpack_from("<I4s", raw, 12)
    if block_type != b"JSON" or block_bytes > len(raw) - 20:
        raise ValueError("Missing GLB JSON geometry manifest")
    model = json.loads(raw[20:20 + block_bytes].decode("utf-8"))
    if not model.get("meshes"):
        raise ValueError("GLB has no mesh objects")
    return {
        "size_bytes": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest(),
        "meshes": len(model.get("meshes", [])),
        "materials": len(model.get("materials", [])),
        "skins": len(model.get("skins", [])),
        "animations": len(model.get("animations", [])),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if not args.source.is_file():
        parser.error(f"Original artwork missing: {args.source}")

    from gradio_client import Client, handle_file

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as workspace:
        original = Path(workspace) / "original_character.png"
        with Image.open(args.source) as im:
            art = im.convert("RGBA")
            art.thumbnail((1536, 1536), Image.Resampling.LANCZOS)
            art.save(original)

        # Public official Gradio app (gradio_app.py) declares two callbacks:
        # requires_bg_remove(image, ratio) and
        # run_button("Run", image, processed_image, ratio, remesh, vertices, texture).
        # Both are obtained using view_api rather than blindly guessing names.
        print(f"Opening official free 3D Space: {SPACE}", flush=True)
        try:
            client = Client(SPACE, hf_token=os.getenv("HF_TOKEN") or None)
            api = client.view_api(return_format="dict")
            endpoints = set(api.get("named_endpoints", {}))
            generate = next((n for n in endpoints if n.rstrip("/").endswith("/run_button")), None)
            preprocess = next((n for n in endpoints if n.rstrip("/").endswith("/requires_bg_remove")), None)
            if not generate or not preprocess:
                raise RuntimeError(
                    "Official Space changed its public API. Available: "
                    + repr(sorted(endpoints))
                )
            # Gradio State inputs are hidden from view_api but are REQUIRED
            # by the underlying run_button handler. Calling the image-change
            # handler first populates the foreground/mask state for this exact
            # Client session; Gradio automatically transports that state.
            preflight = client.predict(handle_file(str(original)), 0.85, api_name=preprocess)
            print("SF3D preprocessing completed; public result type:", type(preflight).__name__, flush=True)
            # The PUBLIC Gradio endpoint exposes 5 inputs and 2 outputs.
            # Its internal web handler has 7 arguments, but Gradio State
            # parameters must NOT be supplied through Client.predict().
            # Verified against the actual November 14 GitHub Actions log:
            # predict(input_image, foreground_ratio, remesh_option,
            #         vertex_count, texture_size, api_name="/run_button")
            # This submits exactly one free model job.
            result = client.predict(
                handle_file(str(original)),
                0.85,
                "None",
                -1,
                1024,
                api_name=generate,
            )
        except Exception as error:
            print("FREE STABLE FAST 3D UNAVAILABLE:", str(error)[:1500], file=sys.stderr)
            print("No paid generation, repeated call or placeholder GLB.", file=sys.stderr)
            return 3

        meshes = extract_glbs(result)
        if not meshes:
            print("Generation finished without a downloadable GLB file.", file=sys.stderr)
            return 4
        raw_model = meshes[0]
        shutil.copyfile(raw_model, args.output)
        report = check_glb(args.output)
        metadata = {
            "approved": False,
            "reviewed_by": "",
            "source": SPACE + " public free ZeroGPU demo, input: " + str(args.source),
            "license": "Stable Fast 3D Community License — human rights review required",
            "notes": (
                "UNREVIEWED image-to-3D initial mesh: must inspect from all sides, "
                "retopologize, rig, correct costume/hair, improve textures and animation. "
                "Not suitable for a final Godot heroine without those steps."
            ),
            **report,
        }
        path = args.output.with_suffix(".review.json")
        path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print("Generated:", args.output)
        print("Report:", path)
        print("Geometry:", json.dumps(report, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
