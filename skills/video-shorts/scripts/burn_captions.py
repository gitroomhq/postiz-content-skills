#!/usr/bin/env python3
"""Burn short, punchy captions into a video using Pillow + ffmpeg's core overlay filter.

Works with any ffmpeg build (no libass / freetype / drawtext needed).

  python burn_captions.py --video in.mp4 --srt talk.srt --out out.mp4 \
      --layout layout.json --keyword AI

--layout is optional JSON: [[start_sec, end_sec, "middle"|"bottom"|"none"], ...]
Times not covered use --default-position (bottom). Use "middle" for split-screen shots
(text sits between the two videos) and "none" to hide captions (e.g. on the author card).
"""
import argparse
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

FONT_CANDIDATES = [
    "/System/Library/Fonts/Supplemental/Arial Black.ttf",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/Library/Fonts/Arial Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
]


def parse_ts(ts: str) -> float:
    h, m, rest = ts.strip().replace(",", ".").split(":")
    return int(h) * 3600 + int(m) * 60 + float(rest)


def read_srt(path: Path):
    blocks = re.split(r"\n\s*\n", path.read_text(encoding="utf-8-sig").strip())
    cues = []
    for b in blocks:
        lines = [l for l in b.strip().splitlines() if l.strip()]
        for i, l in enumerate(lines):
            if "-->" in l:
                a, z = l.split("-->")
                text = " ".join(lines[i + 1:]).strip()
                text = re.sub(r"<[^>]+>", "", text)
                if text:
                    cues.append((parse_ts(a), parse_ts(z.split()[0]), text))
                break
    return cues


def chunk_cues(cues, max_words):
    """Split each cue into chunks of <= max_words, timing by character share."""
    out = []
    for start, end, text in cues:
        words = text.split()
        groups = [words[i:i + max_words] for i in range(0, len(words), max_words)]
        total = sum(len(" ".join(g)) for g in groups) or 1
        t = start
        for g in groups:
            dur = (end - start) * len(" ".join(g)) / total
            out.append((t, t + dur, " ".join(g)))
            t += dur
    return out


def fix_keyword(text, keyword):
    if not keyword:
        return text
    pat = re.compile(r"(?<![A-Za-z])" + r"\.?".join(map(re.escape, keyword)) + r"\.?(?![A-Za-z])", re.I)
    return pat.sub(keyword.upper(), text)


def position_at(t, layout, default):
    for a, z, pos in layout:
        if a <= t < z:
            return pos
    return default


def render_png(text, font, width, path, fill, stroke_fill, stroke):
    draw = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
    # wrap to fit 90% of the frame width
    words, lines, cur = text.split(), [], ""
    for w in words:
        trial = (cur + " " + w).strip()
        if draw.textlength(trial, font=font) > width * 0.9 and cur:
            lines.append(cur)
            cur = w
        else:
            cur = trial
    lines.append(cur)
    asc, desc = font.getmetrics()
    lh = asc + desc
    pad = stroke * 2 + 4
    w = int(max(draw.textlength(l, font=font) for l in lines)) + pad * 2
    h = lh * len(lines) + pad * 2
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for i, l in enumerate(lines):
        lw = d.textlength(l, font=font)
        d.text(((w - lw) / 2, pad + i * lh), l, font=font, fill=fill,
               stroke_width=stroke, stroke_fill=stroke_fill)
    img.save(path)


def probe(video):
    out = subprocess.check_output([
        "ffprobe", "-v", "error", "-select_streams", "v:0",
        "-show_entries", "stream=width,height", "-of", "json", video])
    s = json.loads(out)["streams"][0]
    return s["width"], s["height"]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--video", required=True)
    ap.add_argument("--srt", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--layout", help="JSON file: [[start, end, middle|bottom|none], ...]")
    ap.add_argument("--default-position", default="bottom", choices=["bottom", "middle", "none"])
    ap.add_argument("--max-words", type=int, default=4)
    ap.add_argument("--keyword", help="CTA keyword, forced to CAPS wherever it appears (A.I. / ai -> AI)")
    ap.add_argument("--uppercase", action="store_true", help="Render all captions in caps")
    ap.add_argument("--font", help="Path to a .ttf/.otf font (default: a bold system font)")
    ap.add_argument("--size", type=int, default=72, help="Font size in px for a 1080-wide video")
    ap.add_argument("--bottom-margin", type=int, default=380, help="px from the bottom edge (clears platform UI)")
    ap.add_argument("--color", default="#FFFFFF")
    ap.add_argument("--stroke-color", default="#000000")
    ap.add_argument("--stroke", type=int, default=7)
    ap.add_argument("--crf", type=int, default=18)
    a = ap.parse_args()

    font_path = a.font or next((f for f in FONT_CANDIDATES if Path(f).exists()), None)
    if not font_path:
        sys.exit("No bold font found. Pass --font /path/to/font.ttf")
    W, H = probe(a.video)
    font = ImageFont.truetype(font_path, round(a.size * W / 1080))
    layout = json.loads(Path(a.layout).read_text()) if a.layout else []

    chunks = chunk_cues(read_srt(Path(a.srt)), a.max_words)
    tmp = Path(tempfile.mkdtemp(prefix="captions-"))
    inputs, filters, last = [], [], "0:v"
    n = 0
    for start, end, text in chunks:
        pos = position_at((start + end) / 2, layout, a.default_position)
        if pos == "none" or end - start <= 0.01:
            continue
        text = fix_keyword(text, a.keyword)
        if a.uppercase:
            text = text.upper()
        png = tmp / f"c{n:03d}.png"
        render_png(text, font, W, png, a.color, a.stroke_color, round(a.stroke * W / 1080))
        inputs += ["-i", str(png)]
        y = "(H-h)/2" if pos == "middle" else f"H-h-{round(a.bottom_margin * H / 1920)}"
        out = f"v{n}"
        filters.append(f"[{last}][{n + 1}:v]overlay=x=(W-w)/2:y={y}:enable='between(t,{start:.3f},{end:.3f})'[{out}]")
        last = out
        n += 1

    if not n:
        sys.exit("No captions to burn")
    script = tmp / "filter.txt"
    script.write_text(";\n".join(filters))
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-i", a.video, *inputs,
           "-filter_complex_script", str(script), "-map", f"[{last}]", "-map", "0:a?",
           "-c:v", "libx264", "-crf", str(a.crf), "-preset", "slow", "-pix_fmt", "yuv420p",
           "-c:a", "copy", "-movflags", "+faststart", a.out]
    subprocess.run(cmd, check=True)
    print(json.dumps({"out": str(Path(a.out).resolve()), "captions": n, "font": font_path}))


if __name__ == "__main__":
    main()
