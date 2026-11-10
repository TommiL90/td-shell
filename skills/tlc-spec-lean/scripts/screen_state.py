#!/usr/bin/env python3
"""Bind a visual review to the exact scoped working tree and feature images."""
import argparse
import json
from pathlib import Path
import state_identity


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("phase", choices=["capture", "confirm"])
    parser.add_argument("feature", help="Single feature directory name")
    parser.add_argument("--root", default=".")
    args = parser.parse_args()
    if Path(args.feature).name != args.feature or args.feature in {".", ".."}:
        parser.error("feature must be one directory name")
    root = Path(args.root).resolve()
    fdir = root / ".agents/designs/features" / args.feature
    record = fdir / "screen-state.json"
    try:
        current = state_identity.snapshot(root, fdir)
        if args.phase == "capture":
            record.write_text(json.dumps({"before": current["identity"], "confirmed": None}, indent=2) + "\n")
        else:
            saved = json.loads(record.read_text())
            if saved.get("before") != current["identity"]:
                raise ValueError("visual review scope or captures changed; capture and review again")
            saved["confirmed"] = current["identity"]
            record.write_text(json.dumps(saved, indent=2) + "\n")
        print(current["identity"])
    except (OSError, ValueError) as exc:
        parser.exit(1, f"screen state: {exc}\n")


if __name__ == "__main__":
    main()
