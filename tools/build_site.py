#!/usr/bin/env python3
"""Build a cache-friendly static site for GitHub Pages."""

from __future__ import annotations

import argparse
import hashlib
import re
import shutil
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ASSETS_DIR = ROOT / "assets"


def fingerprint(path: Path, content: bytes | None = None) -> Path:
    """Return a sibling path with a deterministic content hash in its name."""
    digest = hashlib.blake2b(content if content is not None else path.read_bytes(), digest_size=6)
    return path.with_name(f"{path.stem}.{digest.hexdigest()}{path.suffix}")


def rewrite_references(content: str, mappings: dict[str, str]) -> str:
    """Replace local asset paths and discard their legacy query-string versions."""
    for source, target in sorted(mappings.items(), key=lambda item: len(item[0]), reverse=True):
        content = content.replace(source, target)

    for target in mappings.values():
        content = re.sub(rf"{re.escape(target)}\?[^\"'\)\s]+", target, content)

    return content


def build(output_dir: Path) -> None:
    if output_dir.exists():
        shutil.rmtree(output_dir)
    output_dir.mkdir(parents=True)

    asset_mappings: dict[str, str] = {}
    asset_files = [path for path in ASSETS_DIR.rglob("*") if path.is_file()]

    for source in asset_files:
        relative_path = source.relative_to(ROOT)
        target_relative_path = fingerprint(relative_path, source.read_bytes())
        target = output_dir / target_relative_path
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
        asset_mappings[relative_path.as_posix()] = target_relative_path.as_posix()

    source_styles = sorted(ROOT.glob("*.css"))
    style_mappings: dict[str, str] = {}
    built_styles: list[tuple[Path, Path, str]] = []

    for source in source_styles:
        content = rewrite_references(source.read_text(encoding="utf-8"), asset_mappings)
        target_relative_path = fingerprint(Path(source.name), content.encode("utf-8"))
        style_mappings[source.name] = target_relative_path.as_posix()
        built_styles.append((source, target_relative_path, content))

    for _, target_relative_path, content in built_styles:
        (output_dir / target_relative_path).write_text(content, encoding="utf-8")

    source_scripts = sorted(ROOT.glob("*.js"))
    script_mappings: dict[str, str] = {}
    for source in source_scripts:
        target_relative_path = fingerprint(Path(source.name), source.read_bytes())
        script_mappings[source.name] = target_relative_path.as_posix()
        shutil.copy2(source, output_dir / target_relative_path)

    all_mappings = asset_mappings | style_mappings | script_mappings
    source_pages = sorted(ROOT.glob("*.html"))
    for source in source_pages:
        content = rewrite_references(source.read_text(encoding="utf-8"), all_mappings)
        (output_dir / source.name).write_text(content, encoding="utf-8")

    print(
        f"Built {len(source_pages)} pages, {len(asset_files)} assets, "
        f"{len(source_styles)} stylesheets, and {len(source_scripts)} scripts in {output_dir}."
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Build the static site with fingerprinted assets.")
    parser.add_argument("--output", type=Path, default=ROOT / "dist", help="Build directory")
    args = parser.parse_args()
    build(args.output.resolve())


if __name__ == "__main__":
    main()
