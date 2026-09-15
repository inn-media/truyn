#!/usr/bin/env python3
"""Safely extract SDK release archives into a caller-provided empty directory."""

from __future__ import annotations

import os
import re
import shutil
import stat
import sys
import tarfile
import zipfile
from pathlib import Path, PurePosixPath


_DRIVE_PREFIX = re.compile(r"^[A-Za-z]:")
_PRIVATE_KEY_MARKERS = (
    b"-----BEGIN PRIVATE KEY-----",
    b"-----BEGIN ENCRYPTED PRIVATE KEY-----",
    b"-----BEGIN RSA PRIVATE KEY-----",
    b"-----BEGIN DSA PRIVATE KEY-----",
    b"-----BEGIN EC PRIVATE KEY-----",
    b"-----BEGIN OPENSSH PRIVATE KEY-----",
    b"-----BEGIN PGP PRIVATE KEY BLOCK-----",
)
_PRIVATE_KEY_OVERLAP = max(len(marker) for marker in _PRIVATE_KEY_MARKERS) - 1
_SCAN_CHUNK_BYTES = 64 * 1024


def _safe_parts(raw_name: str) -> tuple[str, ...]:
    if not raw_name or "\x00" in raw_name:
        raise ValueError("empty/NUL archive member path")
    normalized = raw_name.replace("\\", "/")
    if normalized.startswith("/") or normalized.startswith("//") or _DRIVE_PREFIX.match(normalized):
        raise ValueError(f"absolute archive member path: {raw_name}")
    parts = PurePosixPath(normalized).parts
    if not parts or any(part in ("", ".", "..") for part in parts):
        raise ValueError(f"path traversal archive member: {raw_name}")
    return tuple(parts)


def _destination(root: Path, raw_name: str) -> Path:
    parts = _safe_parts(raw_name)
    target = root.joinpath(*parts)
    root_resolved = root.resolve()
    target_resolved = target.resolve(strict=False)
    if os.path.commonpath((str(root_resolved), str(target_resolved))) != str(root_resolved):
        raise ValueError(f"archive member escapes extraction root: {raw_name}")
    return target


def _scan_private_key_material(source, member_name: str) -> None:
    carry = b""
    while True:
        chunk = source.read(_SCAN_CHUNK_BYTES)
        if not chunk:
            break
        window = carry + chunk
        if any(marker in window for marker in _PRIVATE_KEY_MARKERS):
            raise ValueError(f"private key material in archive member: {member_name}")
        carry = window[-_PRIVATE_KEY_OVERLAP:] if _PRIVATE_KEY_OVERLAP else b""


def _extract_tar(archive: Path, root: Path) -> None:
    with tarfile.open(archive, mode="r:*") as tf:
        members = tf.getmembers()
        for member in members:
            _destination(root, member.name)
            if member.issym() or member.islnk():
                # Release packages do not require links. Rejecting them entirely is
                # stronger and simpler than allowing a link that could redirect a
                # later archive member outside the temporary extraction root.
                raise ValueError(f"symlink/hardlink archive member: {member.name} -> {member.linkname}")
            if not (member.isdir() or member.isfile()):
                raise ValueError(f"special archive member type: {member.name}")

        # Scan every regular member before writing any archive bytes to disk.
        for member in members:
            if member.isdir():
                continue
            source = tf.extractfile(member)
            if source is None:
                raise ValueError(f"unreadable tar member: {member.name}")
            with source:
                _scan_private_key_material(source, member.name)

        for member in members:
            target = _destination(root, member.name)
            if member.isdir():
                target.mkdir(parents=True, exist_ok=True)
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            source = tf.extractfile(member)
            if source is None:
                raise ValueError(f"unreadable tar member: {member.name}")
            with source, target.open("wb") as output:
                shutil.copyfileobj(source, output)


def _zip_is_symlink(info: zipfile.ZipInfo) -> bool:
    return stat.S_ISLNK((info.external_attr >> 16) & 0xFFFF)


def _extract_zip(archive: Path, root: Path) -> None:
    with zipfile.ZipFile(archive) as zf:
        infos = zf.infolist()
        for info in infos:
            _destination(root, info.filename)
            if _zip_is_symlink(info):
                raise ValueError(f"symlink archive member: {info.filename}")

        # Scan every regular member before writing any archive bytes to disk.
        for info in infos:
            if info.is_dir():
                continue
            with zf.open(info, "r") as source:
                _scan_private_key_material(source, info.filename)

        for info in infos:
            target = _destination(root, info.filename)
            if info.is_dir():
                target.mkdir(parents=True, exist_ok=True)
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            with zf.open(info, "r") as source, target.open("wb") as output:
                shutil.copyfileobj(source, output)


def safe_extract(archive: Path, destination: Path) -> None:
    destination.mkdir(parents=True, exist_ok=True)
    suffix = archive.name.lower()
    if suffix.endswith((".tgz", ".tar.gz")):
        _extract_tar(archive, destination)
    elif suffix.endswith((".jar", ".whl", ".nupkg")):
        _extract_zip(archive, destination)
    else:
        raise ValueError(f"unsupported package archive format: {archive.name}")


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: safe-extract.py <archive> <destination>", file=sys.stderr)
        return 64
    archive = Path(sys.argv[1]).resolve()
    destination = Path(sys.argv[2]).resolve()
    try:
        safe_extract(archive, destination)
    except Exception as exc:  # fail closed at the CLI boundary
        print(f"DENIED {exc}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
