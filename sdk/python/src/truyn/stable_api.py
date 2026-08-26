from __future__ import annotations

from dataclasses import dataclass
from threading import Event
from typing import Any, AsyncIterable, AsyncIterator, Dict, Generic, Mapping, Optional, TypeVar
import re

TRUYN_SDK_STABLE_API_VERSION = "1"

T = TypeVar("T")


class TruynCancelledError(RuntimeError):
    pass


class CancellationToken:
    def __init__(self) -> None:
        self._event = Event()
        self._reason: Optional[str] = None

    @property
    def cancelled(self) -> bool:
        return self._event.is_set()

    @property
    def reason(self) -> Optional[str]:
        return self._reason

    def cancel(self, reason: str = "TRUYN SDK operation cancelled") -> None:
        self._reason = reason
        self._event.set()

    def raise_if_cancelled(self) -> None:
        if self.cancelled:
            raise TruynCancelledError(self._reason or "TRUYN SDK operation cancelled")


@dataclass(frozen=True)
class StreamItem(Generic[T]):
    sequence: int
    item: T


async def stream_items(
    source: AsyncIterable[T],
    cancellation: Optional[CancellationToken] = None,
) -> AsyncIterator[StreamItem[T]]:
    sequence = 0
    if cancellation:
        cancellation.raise_if_cancelled()
    async for item in source:
        if cancellation:
            cancellation.raise_if_cancelled()
        yield StreamItem(sequence=sequence, item=item)
        sequence += 1
    if cancellation:
        cancellation.raise_if_cancelled()


def object_payload(value: Any, metadata: Optional[Mapping[str, Any]] = None) -> Dict[str, Any]:
    result: Dict[str, Any] = {"kind": "object", "value": value}
    if metadata is not None:
        result["metadata"] = dict(metadata)
    return result


def artifact_payload(
    *,
    ref: str,
    media_type: str,
    bytes: Optional[int] = None,
    sha256: Optional[str] = None,
    metadata: Optional[Mapping[str, Any]] = None,
) -> Dict[str, Any]:
    if not isinstance(ref, str) or not ref.strip():
        raise ValueError("ref must be a non-empty string")
    if not isinstance(media_type, str) or not media_type.strip():
        raise ValueError("media_type must be a non-empty string")
    if bytes is not None and (not isinstance(bytes, int) or isinstance(bytes, bool) or bytes < 0):
        raise ValueError("bytes must be a non-negative integer")
    if sha256 is not None and not re.fullmatch(r"[0-9a-fA-F]{64}", sha256):
        raise ValueError("sha256 must be a 64-character hexadecimal digest")

    result: Dict[str, Any] = {
        "kind": "artifact",
        "ref": ref,
        "mediaType": media_type,
    }
    if bytes is not None:
        result["bytes"] = bytes
    if sha256 is not None:
        result["sha256"] = sha256.lower()
    if metadata is not None:
        result["metadata"] = dict(metadata)
    return result
