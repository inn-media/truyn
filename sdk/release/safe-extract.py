#!/usr/bin/env python3
"""Safely extract SDK release archives into a caller-provided empty directory."""

from __future__ import annotations

import gzip
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
_CREDENTIAL_PATTERNS = (
    ("aws-access-key", re.compile(rb"\b(?:AKIA|ASIA)[A-Z0-9]{16}\b")),
    ("github-token", re.compile(rb"\b(?:gh[pousr]_[A-Za-z0-9]{20,255}|github_pat_[A-Za-z0-9_]{20,255})\b")),
    ("slack-token", re.compile(rb"\bxox[baprs]-[A-Za-z0-9-]{10,255}\b")),
    ("google-api-key", re.compile(rb"\bAIza[0-9A-Za-z_-]{35}\b")),
    ("stripe-secret-key", re.compile(rb"\bsk_(?:live|test)_[0-9A-Za-z]{16,255}\b")),
    (
        "credential-assignment",
        re.compile(
            rb"(?i)\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|password)"
            rb"\s*[:=]\s*[\"']?[A-Za-z0-9_./+=:-]{20,256}"
        ),
    ),
)
_PRIVATE_CLOUD_PATTERNS = (
    (
        "azure-arm-resource-id",
        re.compile(
            rb"(?i)/subscriptions/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
            rb"/resourcegroups/[A-Za-z0-9._()\-]{1,90}/providers/[A-Za-z0-9.]+/[A-Za-z0-9._\-]+/[A-Za-z0-9._()\-]+"
        ),
    ),
    (
        "azure-identity-assignment",
        re.compile(
            rb"(?i)\b(?:azure[_-]?)?(?:subscription|tenant|client)[_-]?id\s*[:=]\s*[\"']?"
            rb"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b"
        ),
    ),
    ("azure-key-vault-endpoint", re.compile(rb"(?i)https://[a-z0-9-]{3,63}\.vault\.azure\.net\b")),
    ("azure-cosmos-endpoint", re.compile(rb"(?i)https://[a-z0-9-]{3,63}\.documents\.azure\.com\b")),
    (
        "azure-storage-endpoint",
        re.compile(rb"(?i)https://[a-z0-9]{3,24}\.(?:blob|queue|table|file)\.core\.windows\.net\b"),
    ),
    (
        "gcp-wif-resource",
        re.compile(
            rb"\bprojects/[0-9]{6,19}/locations/global/workloadIdentityPools/"
            rb"[A-Za-z0-9_-]{4,32}/providers/[A-Za-z0-9_-]{4,32}\b"
        ),
    ),
    (
        "gcp-service-account",
        re.compile(
            rb"\b[A-Za-z0-9][A-Za-z0-9._-]{2,62}@[a-z][a-z0-9-]{4,28}\.iam\.gserviceaccount\.com\b"
        ),
    ),
    (
        "gcp-project-assignment",
        re.compile(
            rb"(?i)\b(?:gcp_project_(?:id|number)|google_cloud_project)\s*[:=]\s*[\"']?"
            rb"(?:[0-9]{6,19}|[a-z][a-z0-9-]{4,28}[a-z0-9])\b"
        ),
    ),
)
_SCAN_OVERLAP = 1024
_SCAN_CHUNK_BYTES = 64 * 1024
_TAR_BLOCK_BYTES = 512
_MAX_ARCHIVE_BYTES = 96 * 1024 * 1024
_MAX_ARCHIVE_MEMBERS = 4096
_MAX_MEMBER_UNCOMPRESSED_BYTES = 32 * 1024 * 1024
_MAX_TOTAL_UNCOMPRESSED_BYTES = 64 * 1024 * 1024
_MAX_TAR_EXTENSION_BYTES = 1024 * 1024
_ALLOWED_TAR_TYPES = {b"\0", b"0", b"5", b"x", b"g", b"L", b"K"}
_ALLOWED_ZIP_METHODS = {zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED}


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


def _read_exact(source, amount: int, *, label: str) -> bytes:
    chunks = bytearray()
    remaining = amount
    while remaining:
        chunk = source.read(min(remaining, _SCAN_CHUNK_BYTES))
        if not chunk:
            raise ValueError(f"truncated tar {label}")
        chunks.extend(chunk)
        remaining -= len(chunk)
    return bytes(chunks)


def _discard_exact(source, amount: int, *, label: str) -> None:
    remaining = amount
    while remaining:
        chunk = source.read(min(remaining, _SCAN_CHUNK_BYTES))
        if not chunk:
            raise ValueError(f"truncated tar {label}")
        remaining -= len(chunk)


def _tar_number(field: bytes) -> int:
    if not field:
        raise ValueError("invalid tar size field")
    if field[0] in (0x80, 0xFF):
        value = 0
        for byte in field[1:]:
            value = (value << 8) + byte
        if field[0] == 0xFF:
            value = -(256 ** (len(field) - 1) - value)
    else:
        raw = field.rstrip(b"\0 ").lstrip(b" ")
        if not raw:
            return 0
        if not re.fullmatch(rb"[0-7]+", raw):
            raise ValueError("invalid tar octal size field")
        value = int(raw, 8)
    if value < 0:
        raise ValueError("invalid negative tar member size")
    return value


def _tar_header_name(header: bytes) -> str:
    name = header[0:100].split(b"\0", 1)[0]
    prefix = header[345:500].split(b"\0", 1)[0]
    raw = (prefix + (b"/" if prefix and name else b"") + name)[:1024]
    return raw.decode("utf-8", "replace") or "<unnamed>"


def _validate_pax_payload(payload: bytes) -> None:
    offset = 0
    while offset < len(payload):
        space = payload.find(b" ", offset)
        if space < 0:
            raise ValueError("malformed tar PAX extension header")
        length_raw = payload[offset:space]
        if not length_raw.isdigit():
            raise ValueError("malformed tar PAX record length")
        length = int(length_raw)
        if length <= 0 or offset + length > len(payload):
            raise ValueError("malformed tar PAX record bounds")
        record = payload[space + 1:offset + length]
        if not record.endswith(b"\n") or b"=" not in record:
            raise ValueError("malformed tar PAX record")
        key, _sep, _value = record[:-1].partition(b"=")
        lowered = key.lower()
        if lowered == b"size" or b"sparse" in lowered or lowered.endswith(b"realsize"):
            raise ValueError("tar PAX size/sparse override is not allowed")
        offset += length
    if offset != len(payload):
        raise ValueError("malformed tar PAX payload")


def _preflight_tar(archive: Path) -> None:
    if archive.stat().st_size > _MAX_ARCHIVE_BYTES:
        raise ValueError("archive compressed size limit exceeded")

    member_count = 0
    total_uncompressed = 0
    zero_blocks = 0

    with gzip.open(archive, "rb") as source:
        while True:
            header = source.read(_TAR_BLOCK_BYTES)
            if not header:
                break
            if len(header) != _TAR_BLOCK_BYTES:
                raise ValueError("truncated tar header")
            if header == b"\0" * _TAR_BLOCK_BYTES:
                zero_blocks += 1
                if zero_blocks >= 2:
                    break
                continue
            zero_blocks = 0

            member_count += 1
            if member_count > _MAX_ARCHIVE_MEMBERS:
                raise ValueError(
                    f"archive member count limit exceeded: {member_count} > {_MAX_ARCHIVE_MEMBERS}"
                )

            size = _tar_number(header[124:136])
            typeflag = header[156:157] or b"\0"
            name = _tar_header_name(header)

            if typeflag not in _ALLOWED_TAR_TYPES:
                raise ValueError(f"unsupported/special tar member type: {name}")
            if typeflag == b"5" and size != 0:
                raise ValueError(f"non-empty tar directory entry: {name}")
            if typeflag in {b"x", b"g", b"L", b"K"} and size > _MAX_TAR_EXTENSION_BYTES:
                raise ValueError(f"tar extension header size limit exceeded: {name}")
            if size > _MAX_MEMBER_UNCOMPRESSED_BYTES:
                raise ValueError(f"archive member uncompressed size limit exceeded: {name}")

            total_uncompressed += size
            if total_uncompressed > _MAX_TOTAL_UNCOMPRESSED_BYTES:
                raise ValueError("archive total uncompressed size limit exceeded")

            padded = ((size + _TAR_BLOCK_BYTES - 1) // _TAR_BLOCK_BYTES) * _TAR_BLOCK_BYTES
            if typeflag in {b"x", b"g"}:
                payload = _read_exact(source, size, label=f"extension payload for {name}")
                _validate_pax_payload(payload)
                if padded > size:
                    _discard_exact(source, padded - size, label=f"extension padding for {name}")
            else:
                _discard_exact(source, padded, label=f"payload for {name}")


def _scan_forbidden_release_material(source, member_name: str) -> None:
    carry = b""
    total_read = 0
    while True:
        chunk = source.read(_SCAN_CHUNK_BYTES)
        if not chunk:
            break
        total_read += len(chunk)
        if total_read > _MAX_MEMBER_UNCOMPRESSED_BYTES:
            raise ValueError(f"archive member decompressed data exceeds limit: {member_name}")
        window = carry + chunk
        if any(marker in window for marker in _PRIVATE_KEY_MARKERS):
            raise ValueError(f"private key material in archive member: {member_name}")
        for pattern_name, pattern in _CREDENTIAL_PATTERNS:
            if pattern.search(window):
                raise ValueError(f"credential material ({pattern_name}) in archive member: {member_name}")
        for pattern_name, pattern in _PRIVATE_CLOUD_PATTERNS:
            if pattern.search(window):
                raise ValueError(f"private cloud topology ({pattern_name}) in archive member: {member_name}")
        carry = window[-_SCAN_OVERLAP:]


def _is_tar_root_directory(member: tarfile.TarInfo) -> bool:
    return member.isdir() and member.name in (".", "./") and member.size == 0


def _extract_tar(archive: Path, root: Path) -> None:
    # Bound physical headers/payloads before tarfile materializes TarInfo objects
    # or parses PAX/GNU extension headers.
    _preflight_tar(archive)

    with tarfile.open(archive, mode="r:*") as tf:
        members = tf.getmembers()
        if len(members) > _MAX_ARCHIVE_MEMBERS:
            raise ValueError(
                f"archive member count limit exceeded: {len(members)} > {_MAX_ARCHIVE_MEMBERS}"
            )

        total_uncompressed = 0
        for member in members:
            if member.isdir() and member.size != 0:
                raise ValueError(f"non-empty tar directory entry: {member.name}")
            if member.size < 0:
                raise ValueError(f"invalid negative archive member size: {member.name}")
            if member.size > _MAX_MEMBER_UNCOMPRESSED_BYTES:
                raise ValueError(f"archive member uncompressed size limit exceeded: {member.name}")
            if not member.isdir():
                total_uncompressed += member.size
                if total_uncompressed > _MAX_TOTAL_UNCOMPRESSED_BYTES:
                    raise ValueError("archive total uncompressed size limit exceeded")

            if _is_tar_root_directory(member):
                continue
            _destination(root, member.name)
            if member.issym() or member.islnk():
                raise ValueError(f"symlink/hardlink archive member: {member.name} -> {member.linkname}")
            if not (member.isdir() or member.isfile()):
                raise ValueError(f"special archive member type: {member.name}")

        for member in members:
            if member.isdir():
                continue
            source = tf.extractfile(member)
            if source is None:
                raise ValueError(f"unreadable tar member: {member.name}")
            with source:
                _scan_forbidden_release_material(source, member.name)

        for member in members:
            if _is_tar_root_directory(member):
                continue
            target = _destination(root, member.name)
            if member.isdir():
                target.mkdir(parents=True, exist_ok=True)
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            source = tf.extractfile(member)
            if source is None:
                raise ValueError(f"unreadable tar member: {member.name}")
            with source, target.open("wb") as output:
                shutil.copyfileobj(source, output, length=_SCAN_CHUNK_BYTES)


def _zip_is_symlink(info: zipfile.ZipInfo) -> bool:
    return stat.S_ISLNK((info.external_attr >> 16) & 0xFFFF)


def _extract_zip(archive: Path, root: Path) -> None:
    if archive.stat().st_size > _MAX_ARCHIVE_BYTES:
        raise ValueError("archive compressed size limit exceeded")

    with zipfile.ZipFile(archive) as zf:
        infos = zf.infolist()
        if len(infos) > _MAX_ARCHIVE_MEMBERS:
            raise ValueError(
                f"archive member count limit exceeded: {len(infos)} > {_MAX_ARCHIVE_MEMBERS}"
            )

        total_uncompressed = 0
        for info in infos:
            if info.compress_type not in _ALLOWED_ZIP_METHODS:
                raise ValueError(f"unsupported ZIP compression method: {info.filename}")
            if info.is_dir() and info.file_size != 0:
                raise ValueError(f"non-empty ZIP directory entry: {info.filename}")
            if info.file_size < 0:
                raise ValueError(f"invalid negative archive member size: {info.filename}")
            if info.file_size > _MAX_MEMBER_UNCOMPRESSED_BYTES:
                raise ValueError(f"archive member uncompressed size limit exceeded: {info.filename}")
            if not info.is_dir():
                total_uncompressed += info.file_size
                if total_uncompressed > _MAX_TOTAL_UNCOMPRESSED_BYTES:
                    raise ValueError("archive total uncompressed size limit exceeded")

            _destination(root, info.filename)
            if _zip_is_symlink(info):
                raise ValueError(f"symlink archive member: {info.filename}")

        for info in infos:
            if info.is_dir():
                continue
            with zf.open(info, "r") as source:
                _scan_forbidden_release_material(source, info.filename)

        for info in infos:
            target = _destination(root, info.filename)
            if info.is_dir():
                target.mkdir(parents=True, exist_ok=True)
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            with zf.open(info, "r") as source, target.open("wb") as output:
                shutil.copyfileobj(source, output, length=_SCAN_CHUNK_BYTES)


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
    except Exception as exc:
        print(f"DENIED {exc}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
