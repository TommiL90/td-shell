"""Content-addressed feature evidence for committed, dirty and untracked files.

state.json is explicit input: {"base": "<git ref>", "files": ["src/x", "test/x"]}.
Generated proof/verification outputs are never inputs. Missing files remain represented as
absent, so deletions, executable modes and symlink targets participate in the identity.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess

GENERATED = {"proofs.md", "proof-state.json", "verification.md", "implementation-report.md",
             "screens.md", "screen-state.json", "handoff.md"}


def git(root, *args):
    p = subprocess.run(["git", "-C", str(root), *args], capture_output=True)
    if p.returncode:
        raise ValueError("git " + " ".join(args) + ": " + p.stderr.decode(errors="replace").strip())
    return p.stdout.decode(errors="surrogateescape").strip()


def project_root(fdir):
    return str(Path(fdir).absolute().parents[3])


def normalized(root, rel):
    p = Path(rel)
    if p.is_absolute() or not p.parts or ".." in p.parts or p.parts[0] == ".git":
        raise ValueError("state files must be repository-relative paths: " + str(rel))
    return p.as_posix()


def generated(rel):
    p = Path(rel)
    return p.name in GENERATED and p.parts[:3] == (".agents", "designs", "features")


def entry(root, rel):
    path = Path(root) / rel
    # Do not follow a parent symlink out of the repository when hashing a regular file.
    try:
        path.parent.resolve().relative_to(Path(root).resolve())
    except ValueError:
        raise ValueError("state path escapes repository via parent symlink: " + rel)
    try:
        info = path.lstat()
    except FileNotFoundError:
        return {"path": rel, "kind": "absent"}
    mode = stat.S_IMODE(info.st_mode)
    if stat.S_ISLNK(info.st_mode):
        resolved = path.resolve()
        try:
            resolved.relative_to(Path(root).resolve())
        except ValueError:
            raise ValueError("scoped symlink resolves outside repository: " + rel)
        target = {"path": rel, "kind": "symlink", "mode": mode, "target": os.readlink(path)}
        if resolved.is_file():
            target["target_sha256"] = hashlib.sha256(resolved.read_bytes()).hexdigest()
            target["target_mode"] = stat.S_IMODE(resolved.stat().st_mode)
        elif resolved.exists():
            raise ValueError("scoped symlink must resolve to a file: " + rel)
        else:
            target["target_absent"] = True
        return target
    if not stat.S_ISREG(info.st_mode):
        raise ValueError("state files must name files or symlinks, not directories: " + rel)
    return {"path": rel, "kind": "file", "mode": mode, "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}


def external_image(path):
    """Fingerprint an explicitly cited absolute image without importing it into Git scope."""
    p = Path(path)
    if not p.exists():
        return {"path": str(p), "kind": "absent"}
    if not p.is_file():
        raise ValueError("cited image must be a file: " + str(p))
    return {"path": str(p), "kind": "file", "mode": stat.S_IMODE(p.stat().st_mode),
            "sha256": hashlib.sha256(p.read_bytes()).hexdigest()}


def snapshot(root, fdir):
    scope = Path(fdir) / "state.json"
    try:
        data = json.loads(scope.read_text())
    except (OSError, ValueError) as exc:
        raise ValueError("write state.json with explicit base and production/test/config files: " + str(exc))
    if not isinstance(data, dict) or not isinstance(data.get("files"), list) or not data["files"]:
        raise ValueError("state.json files must be a nonempty explicit list")
    if not isinstance(data.get("base"), str) or not data["base"].strip():
        raise ValueError("state.json must name the feature base ref")
    if data.get("risk", "bounded") not in {"bounded", "sensitive"}:
        raise ValueError("risk must be bounded or sensitive")
    authors = data.get("implementers", [])
    if not isinstance(authors, list) or not authors or any(not isinstance(x, str) or not x.strip() for x in authors):
        raise ValueError("implementers must be a nonempty list of actual IDs")
    if not isinstance(data.get("context", ""), str):
        raise ValueError("context must be a string")
    files = sorted({normalized(root, p) for p in data["files"] if isinstance(p, str)})
    if len(files) != len(data["files"]) or any(generated(p) for p in files):
        raise ValueError("state.json has duplicate/non-string files or generated evidence outputs")
    head = git(root, "rev-parse", "HEAD")
    base = git(root, "rev-parse", data["base"] + "^{commit}")
    # Evidence artifacts that describe obligations/probes affect proof validity. Reports do not.
    controls = [p.relative_to(Path(root)).as_posix() for p in Path(fdir).rglob("*")
                if (p.is_file() or p.is_symlink()) and not generated(p.relative_to(Path(root)).as_posix())]
    # Cited reference images can live elsewhere in the repository, outside the
    # feature folder. Bind those bytes and their adjacent running twin as well.
    external = []
    for name in ("plan.md", "checks.md"):
        document = Path(fdir) / name
        if not document.exists():
            continue
        text = document.read_text()
        cited_images = re.findall(r"`([^`\s]+\.(?:png|jpe?g|webp|gif))`", text, re.IGNORECASE)
        cited_images += re.findall(r"!\[[^]]*\]\(([^)\s]+\.(?:png|jpe?g|webp|gif))\)", text, re.IGNORECASE)
        for cited in cited_images:
            if "://" in cited:
                continue  # A remote URL is not evidence of local image bytes.
            if Path(cited).is_absolute():
                external.append(external_image(cited))
                twin = Path(cited).with_name(Path(cited).stem + ".running.png")
                if not cited.endswith(".running.png") and twin.is_file():
                    external.append(external_image(twin))
                continue
            rel = normalized(root, cited)
            path = Path(root) / rel
            if path.exists() or path.is_symlink():
                controls.append(rel)
                twin = path.with_name(path.stem + ".running.png")
                if not path.name.endswith(".running.png") and (twin.exists() or twin.is_symlink()):
                    controls.append(twin.relative_to(Path(root)).as_posix())
    payload = {"version": 1, "head": head, "base": base,
               "risk": data.get("risk", "bounded"),
               "implementers": data.get("implementers", []),
               "context": data.get("context", ""),
               "files": [entry(root, p) for p in sorted(set(files + controls))]}
    if external:
        payload["external_images"] = sorted(external, key=lambda e: e["path"])
    digest = hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    return dict(payload, identity=digest)


def write_snapshot(root, fdir):
    data = snapshot(root, fdir)
    (Path(fdir) / "proof-state.json").write_text(json.dumps(data, indent=2, sort_keys=True) + "\n")
    return data


def validate_snapshot(root, fdir):
    try:
        recorded = json.loads((Path(fdir) / "proof-state.json").read_text())
        current = snapshot(root, fdir)
    except (OSError, ValueError) as exc:
        return ["state evidence unavailable: " + str(exc)]
    if recorded != current:
        return ["stale state evidence: production/test/config, obligations, probes, HEAD or base changed; rerun check_proofs.py"]
    return []


def main():
    import argparse
    ap = argparse.ArgumentParser(description="Declare the explicit feature evidence scope; never stages or commits files")
    ap.add_argument("feature")
    ap.add_argument("--root", default=".")
    ap.add_argument("--base", required=True)
    ap.add_argument("--file", action="append", required=True, dest="files")
    ap.add_argument("--risk", choices=["bounded", "sensitive"], default="bounded")
    ap.add_argument("--implementer", action="append", required=True)
    ap.add_argument("--context", default="")
    args = ap.parse_args()
    root = Path(args.root).resolve()
    if Path(args.feature).name != args.feature or args.feature in {".", ".."}:
        ap.error("feature must be one directory name")
    fdir = root / ".agents/designs/features" / args.feature
    fdir.mkdir(parents=True, exist_ok=True)
    data = {"base": args.base, "files": sorted(set(normalized(root, p) for p in args.files)),
            "risk": args.risk, "implementers": args.implementer, "context": args.context}
    git(root, "rev-parse", args.base + "^{commit}")
    (fdir / "state.json").write_text(json.dumps(data, indent=2) + "\n")
    print(json.dumps({"scope": str(fdir / "state.json"), "files": len(data["files"])}))


if __name__ == "__main__":
    main()
