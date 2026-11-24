#!/usr/bin/env python3
import argparse
import base64
import os
from pathlib import Path

from openai import OpenAI


def load_env_file() -> None:
    """Load ~/.content-skills/.env without overriding variables already set."""
    home = Path(os.environ.get("CONTENT_SKILLS_HOME", Path.home() / ".content-skills"))
    env_file = home / ".env"
    if not env_file.exists():
        return
    for line in env_file.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.removeprefix("export ").partition("=")
        key, value = key.strip(), value.strip().strip("'\"")
        if value and not os.environ.get(key):
            os.environ[key] = value


load_env_file()
DEFAULT_MODEL = os.environ.get("OPENAI_IMAGE_MODEL") or "gpt-image-2.6-sunburst"

# GPT Image 2.6 size rules (OpenAI image generation guide)
SIZE_MULTIPLE = 16
MAX_EDGE = 3840
MIN_PIXELS = 655_360
MAX_PIXELS = 8_294_400
MAX_ASPECT = 3.0


def save_b64_image(b64_data: str, path: Path) -> None:
    image_bytes = base64.b64decode(b64_data)
    path.write_bytes(image_bytes)


def parse_size(value: str) -> str:
    if value == "auto":
        return value

    try:
        width, height = (int(part) for part in value.lower().split("x"))
    except ValueError:
        raise argparse.ArgumentTypeError("size must be 'auto' or WIDTHxHEIGHT, e.g. 3840x2160")

    if width % SIZE_MULTIPLE or height % SIZE_MULTIPLE:
        raise argparse.ArgumentTypeError(f"width and height must be multiples of {SIZE_MULTIPLE}")
    if max(width, height) > MAX_EDGE:
        raise argparse.ArgumentTypeError(f"neither edge may exceed {MAX_EDGE} pixels")
    if not MIN_PIXELS <= width * height <= MAX_PIXELS:
        raise argparse.ArgumentTypeError(
            f"total pixels must be between {MIN_PIXELS:,} and {MAX_PIXELS:,}"
        )
    if max(width, height) / min(width, height) > MAX_ASPECT:
        raise argparse.ArgumentTypeError("aspect ratio must be between 1:3 and 3:1")

    return f"{width}x{height}"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate images with GPT Image 2.6")
    parser.add_argument("--prompt", required=True, help="Text prompt for image generation")
    parser.add_argument(
        "--model",
        default=DEFAULT_MODEL,
        help="Image model (default from OPENAI_IMAGE_MODEL, else gpt-image-2.6-sunburst; gpt-image-2.6-flare = fast drafts)",
    )
    parser.add_argument(
        "--size",
        default="2880x2880",
        type=parse_size,
        help="'auto' or WIDTHxHEIGHT (multiples of 16, max 3840 per edge, max 8,294,400 pixels)",
    )
    parser.add_argument(
        "--quality",
        default="max",
        choices=["low", "medium", "high", "xhigh", "max", "auto"],
        help="Image quality",
    )
    parser.add_argument(
        "--complexity",
        default="high",
        choices=["low", "medium", "high"],
        help="Computation spent planning the image",
    )
    parser.add_argument(
        "--format",
        dest="output_format",
        default="png",
        choices=["png", "webp", "jpeg"],
        help="Output image format",
    )
    parser.add_argument(
        "--background",
        default="opaque",
        choices=["opaque", "transparent", "auto"],
        help="Background mode",
    )
    parser.add_argument(
        "--n",
        type=int,
        default=1,
        help="Number of images to generate",
    )
    parser.add_argument(
        "--reference",
        action="append",
        default=[],
        help="Reference image path (repeatable, up to 16). Uses the edit endpoint to match style/location/assets",
    )
    parser.add_argument(
        "--output-dir",
        default="outputs",
        help="Directory to save generated files",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    if not os.environ.get("OPENAI_API_KEY"):
        raise RuntimeError("OPENAI_API_KEY is not set")

    client = OpenAI()

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    common = dict(
        model=args.model,
        prompt=args.prompt,
        size=args.size,
        quality=args.quality,
        output_format=args.output_format,
        background=args.background,
        n=args.n,
        extra_body={"complexity": args.complexity},
    )

    if args.reference:
        if len(args.reference) > 16:
            raise SystemExit("At most 16 reference images")
        files = []
        try:
            for ref in args.reference:
                if not Path(ref).is_file():
                    raise SystemExit(f"Reference image not found: {ref}")
                files.append(open(ref, "rb"))
            result = client.images.edit(image=files, **common)
        finally:
            for f in files:
                f.close()
    else:
        result = client.images.generate(**common)

    saved_files = []
    for i, item in enumerate(result.data, start=1):
        if not getattr(item, "b64_json", None):
            raise RuntimeError("API response did not include b64_json image data")
        filename = output_dir / f"generated_{i}.{args.output_format}"
        save_b64_image(item.b64_json, filename)
        saved_files.append(str(filename))

    print("Generated files:")
    for path in saved_files:
        print(f"- {path}")


if __name__ == "__main__":
    main()
