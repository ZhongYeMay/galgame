#!/usr/bin/env python3
"""True open-source image-to-3D reconstruction with the TripoSR model on CPU.

Requires actual MIT-licensed stabilityai/TripoSR weights (1.68 GB).
Creates GLB only after inference, never fabricates geometry or art approval.

This runner is used both locally and by .github/workflows/triposr-cpu.yml.
The original portrait must have transparency. Image-based reconstruction alone
does NOT produce accurate backs, a character rig, animations or production art.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import struct
import sys
import types

import numpy as np
from PIL import Image


WEIGHTS_SHA256 = "429e2c6b22a0923967459de24d67f05962b235f79cde6b032aa7ed2ffcd970ee"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(2 * 1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def prepare_portrait(source: Path, target: Path, side: int = 512) -> dict:
    """Crop original transparent character; composite at 85% over gray.

    The model expects a single segmented, centered subject. Reject opaque
    backgrounds instead of inferring a fake silhouette from a scene image.
    """
    with Image.open(source) as image:
        original = image.convert("RGBA")
    alpha = original.getchannel("A")
    lowest, highest = alpha.getextrema()
    if lowest > 235 or highest < 25:
        raise ValueError(
            "Source artwork lacks a usable transparent cutout. "
            "Provide an isolated character image; no fake 2D background removal."
        )
    mask = alpha.point(lambda x: 255 if x > 10 else 0)
    bounds = mask.getbbox()
    if bounds is None:
        raise ValueError("Transparent original has no visible character")
    crop = original.crop(bounds)
    scale = (side * 0.85) / max(crop.size)
    target_size = (max(1, round(crop.width * scale)),
                   max(1, round(crop.height * scale)))
    crop = crop.resize(target_size, Image.Resampling.LANCZOS)
    background = Image.new("RGBA", (side, side), (127, 127, 127, 255))
    x = (side - crop.width) // 2
    y = (side - crop.height) // 2
    background.alpha_composite(crop, (x, y))
    target.parent.mkdir(parents=True, exist_ok=True)
    background.convert("RGB").save(target, format="PNG", optimize=True)
    return {
        "original_size": list(original.size),
        "visible_bbox": list(bounds),
        "prepared_size": [side, side],
        "input_sha256": sha256(source),
    }


def use_skimage_marching_cubes() -> None:
    """CPU-only alternative to TripoSR's CUDA-dependent torchmcubes.

    The upstream MarchingCubeHelper imports torchmcubes; supplying an equivalent
    implementation backed by skimage avoids downloading/compiling GPU extensions.
    This does not alter learned weights or fake a mesh.
    """
    import torch
    from skimage.measure import marching_cubes as skimage_mc

    module = types.ModuleType("torchmcubes")

    def marching_cubes(level: torch.Tensor, threshold: float):
        density = level.detach().to("cpu").numpy().astype(np.float32)
        vertices, faces, _normals, _values = skimage_mc(
            density, level=float(threshold), allow_degenerate=False
        )
        return (
            torch.from_numpy(vertices.copy()),
            torch.from_numpy(faces.astype(np.int64, copy=False).copy()),
        )

    module.marching_cubes = marching_cubes
    sys.modules["torchmcubes"] = module

    # TripoSR's tsr.utils imports rembg solely for its optional segmentation
    # helper. Our caller already supplies the original transparent cutout.
    # Avoid installing its ONNX image-segmentation model on a CPU-only runner.
    if "rembg" not in sys.modules:
        unused_segmentation = types.ModuleType("rembg")
        sys.modules["rembg"] = unused_segmentation


def inspect_glb(file: Path) -> dict:
    raw = file.read_bytes()
    if len(raw) < 10_000 or raw[:4] != b"glTF":
        raise ValueError("No genuine GLB data generated")
    version, declared = struct.unpack_from("<II", raw, 4)
    if version != 2 or declared != len(raw):
        raise ValueError("Invalid glTF binary header/length")
    chunk_length, chunk_kind = struct.unpack_from("<I4s", raw, 12)
    if chunk_kind != b"JSON" or chunk_length > len(raw) - 20:
        raise ValueError("Invalid GLB JSON chunk")
    data = json.loads(raw[20:20 + chunk_length].decode("utf-8"))
    meshes = data.get("meshes", [])
    if not meshes:
        raise ValueError("Generated GLB contains no triangle meshes")
    return {
        "bytes": len(raw),
        "sha256": sha256(file),
        "mesh_count": len(meshes),
        "materials": len(data.get("materials", [])),
        "skins": len(data.get("skins", [])),
        "animations": len(data.get("animations", [])),
    }


def reconstruct(args: argparse.Namespace) -> dict:
    import torch
    from huggingface_hub import hf_hub_download

    if args.source is None or not args.source.is_file():
        raise FileNotFoundError("Original sprite not found")
    prepared = args.output.parent / "triposr_input.png"
    prep = prepare_portrait(args.source, prepared)
    print("Prepared original artwork:", prep, flush=True)
    if args.preprocess_only:
        return prep

    if not args.repo_dir.is_dir():
        raise FileNotFoundError(
            "Upstream TripoSR source is missing. Clone VAST-AI-Research/TripoSR."
        )
    sys.path.insert(0, str(args.repo_dir.resolve()))
    use_skimage_marching_cubes()
    from tsr.system import TSR

    torch.set_num_threads(min(4, os.cpu_count() or 2))
    torch.set_num_interop_threads(1)
    print("Downloading/verifying original MIT TripoSR weights (1.68 GB)...", flush=True)
    model_path = Path(hf_hub_download(
        repo_id="stabilityai/TripoSR", filename="model.ckpt",
        local_dir=str(args.weights_dir),
    ))
    actual = sha256(model_path)
    if actual != WEIGHTS_SHA256:
        raise ValueError("Pretrained model SHA256 mismatch; refusing inference")
    config = Path(hf_hub_download(
        repo_id="stabilityai/TripoSR", filename="config.yaml",
        local_dir=str(args.weights_dir),
    ))
    if not config.is_file():
        raise ValueError("Pretrained model config missing")
    print("Loading the verified TripoSR model on CPU...", flush=True)
    model = TSR.from_pretrained(str(args.weights_dir), "config.yaml", "model.ckpt")
    model.renderer.set_chunk_size(args.chunk_size)
    model.to("cpu").eval()

    image = Image.open(prepared).convert("RGB")
    print("Reconstructing 3D scene codes on CPU...", flush=True)
    with torch.inference_mode():
        code = model([image], device="cpu")
        print(
            f"Extracting actual isosurface at resolution {args.resolution}...",
            flush=True,
        )
        mesh_list = model.extract_mesh(
            code, has_vertex_color=True, resolution=args.resolution
        )
    mesh = mesh_list[0]
    if len(mesh.vertices) < 100 or len(mesh.faces) < 100:
        raise ValueError("Generated model contains too little geometry")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    mesh.export(str(args.output))
    result = inspect_glb(args.output)
    if result["mesh_count"] < 1:
        raise ValueError("GLB inspection failed")
    meta = {
        "approved": False,
        "reviewed_by": "",
        "asset_type": args.subject,
        "source": "Original project sprite + MIT-licensed stabilityai/TripoSR CPU inference",
        "license": "MIT — upstream model license and original project art",
        "original_sprite": str(args.source),
        "model_weights_sha256": actual,
        "mc_resolution": args.resolution,
        "vertex_count": int(len(mesh.vertices)),
        "triangle_count": int(len(mesh.faces)),
        "notes": (
            "UNREVIEWED TRUE 3D MESH: no skeleton or animations; back and "
            "clothing must be checked and manually remodeled, then rigged. "
            "NEVER publish directly as an original-quality 3D heroine."
        ),
        "preprocessing": prep,
        **result,
    }
    report = args.output.with_suffix(".review.json")
    report.write_text(
        json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print("3D inference successful:", args.output, flush=True)
    print("Saved model validation:", report, flush=True)
    print(json.dumps(result, ensure_ascii=False), flush=True)
    return meta


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--subject", choices=("mio", "nagi", "shiori"),
                        default="nagi")
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--repo-dir", type=Path, default=Path("external/TripoSR"))
    parser.add_argument("--weights-dir", type=Path, default=Path("external/weights"))
    parser.add_argument("--resolution", type=int, choices=(96, 128, 160, 192),
                        default=128)
    parser.add_argument("--chunk-size", type=int, default=4096)
    parser.add_argument("--preprocess-only", action="store_true")
    args = parser.parse_args()
    try:
        reconstruct(args)
    except Exception as error:
        print(f"CPU 3D INFERENCE FAILED: {type(error).__name__}: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
