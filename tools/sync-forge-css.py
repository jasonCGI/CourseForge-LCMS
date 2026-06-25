#!/usr/bin/env python3
"""Single-source the Forge CSS core across mirror trees.

Canonical source:  static/css/{forge-tokens,forge-motion,forge-components}.css
Mirror targets:     forgeclip/static, forgegui/static, forgepack/static,
                    isd-tool/static, client/src/styles

forge-bootstrap.css is intentionally canonical-only (it is the optional
Bootstrap bridge, used only on the demo) and is NOT synced.
forge-3d/electron/src/ is an intentional divergent variant and is NOT touched.

Usage:
    python tools/sync-forge-css.py          # copy canonical -> all mirrors
    python tools/sync-forge-css.py --check  # exit 1 if any mirror has drifted (CI)
"""
from __future__ import annotations

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
CANONICAL_DIR = REPO_ROOT / "static" / "css"

# Core files that are mirrored (forge-bootstrap.css is excluded on purpose).
CORE_FILES = (
    "forge-tokens.css",
    "forge-motion.css",
    "forge-components.css",
)

MIRROR_DIRS = (
    "forgeclip/static",
    "forgegui/static",
    "forgepack/static",
    "isd-tool/static",
    "client/src/styles",
)


def iter_pairs():
    """Yield (canonical_path, mirror_path) for every file that must match."""
    for mirror in MIRROR_DIRS:
        mirror_dir = REPO_ROOT / mirror
        for name in CORE_FILES:
            yield CANONICAL_DIR / name, mirror_dir / name


def check() -> int:
    drifted: list[str] = []
    missing: list[str] = []
    for src, dst in iter_pairs():
        if not src.exists():
            print(f"ERROR: canonical file missing: {src}", file=sys.stderr)
            return 2
        if not dst.exists():
            missing.append(str(dst.relative_to(REPO_ROOT)))
            continue
        if src.read_bytes() != dst.read_bytes():
            drifted.append(str(dst.relative_to(REPO_ROOT)))

    if drifted or missing:
        for path in missing:
            print(f"MISSING: {path}")
        for path in drifted:
            print(f"DRIFTED: {path}")
        print(
            f"\n{len(drifted) + len(missing)} mirror file(s) out of sync with "
            f"canonical static/css/. Run: python tools/sync-forge-css.py",
            file=sys.stderr,
        )
        return 1

    print("OK: all mirror CSS files are byte-identical to canonical.")
    return 0


def sync() -> int:
    rewritten = 0
    for src, dst in iter_pairs():
        if not src.exists():
            print(f"ERROR: canonical file missing: {src}", file=sys.stderr)
            return 2
        data = src.read_bytes()
        if not dst.exists() or dst.read_bytes() != data:
            dst.parent.mkdir(parents=True, exist_ok=True)
            dst.write_bytes(data)
            print(f"synced: {dst.relative_to(REPO_ROOT)}")
            rewritten += 1
    print(f"\nDone. {rewritten} mirror file(s) rewritten.")
    return 0


def main(argv: list[str]) -> int:
    if "--check" in argv:
        return check()
    return sync()


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
