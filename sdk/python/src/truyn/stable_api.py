from __future__ import annotations

import base64
from dataclasses import dataclass, field
from typing import Any, Iterable, Iterator, Literal, Mapping

from .errors import TruynError, normalize_error

ArtifactPayloadKind = Literal['uri', 'inline', 'bytes']
StreamEventType = Literal['started', 'delta', 'artifact', 'result', 'error', 'completed', 'cancelled']


@dataclass(frozen=True)
class ArtifactPayload:
    kind: ArtifactPayloadKind
    content_type: str
    name: str | None = None
    uri: str | None = None
    data: str | None = None
    size_bytes: int | None = None
    digest: str | None = None
    metadata: Mapping[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class StableRequestOptions:
    deadline_ms: int | None = None
    metadata: Mapping[str, Any] = field(default_factory=dict)
    cancellation_token: 'CancellationToken | None' = None


@dataclass(frozen=True)
class NeedRequest:
    capability: str
    input: Any
    artifacts: tuple[ArtifactPayload, ...] = ()
    metadata: Mapping[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class ResultResponse:
    request_id: str
    output: Any | None = None
    artifacts: tuple[ArtifactPayload, ...] = ()
    completed_at: str | None = None
    metadata: Mapping[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class StreamEvent:
    type: StreamEventType
    request_id: str | None = None
    sequence: int | None = None
    delta: Any | None = None
    artifact: ArtifactPayload | None = None
    result: ResultResponse | None = None
    error: Any | None = None
    metadata: Mapping[str, Any] = field(default_factory=dict)


class CancellationToken:
    def __init__(self):
        self._cancelled = False
        self._reason: str | None = None

    @property
    def cancelled(self) -> bool:
        return self._cancelled

    @property
    def reason(self) -> str | None:
        return self._reason

    def cancel(self, reason: str | None = None) -> None:
        self._cancelled = True
        self._reason = reason


def _assert_content_type(content_type: str) -> None:
    if not isinstance(content_type, str) or '/' not in content_type:
        raise TruynError({'code': 'validation_error', 'message': 'artifact content_type must be a MIME type', 'retryable': False})


def artifact_from_uri(uri: str, content_type: str, **kwargs: Any) -> ArtifactPayload:
    if not isinstance(uri, str) or not uri:
        raise TruynError({'code': 'validation_error', 'message': 'artifact uri is required', 'retryable': False})
    _assert_content_type(content_type)
    return ArtifactPayload(kind='uri', uri=uri, content_type=content_type, **kwargs)


def artifact_from_text(text: str, content_type: str = 'text/plain', **kwargs: Any) -> ArtifactPayload:
    _assert_content_type(content_type)
    encoded = base64.b64encode(text.encode('utf-8')).decode('ascii')
    return ArtifactPayload(kind='inline', data=encoded, content_type=content_type, size_bytes=len(text.encode('utf-8')), **kwargs)


def assert_not_cancelled(options: StableRequestOptions | None = None) -> None:
    token = options.cancellation_token if options else None
    if token and token.cancelled:
        raise TruynError(normalize_error(client_kind='cancelled', message=token.reason or 'Request cancelled'))


def stream_events(events: Iterable[StreamEvent], options: StableRequestOptions | None = None) -> Iterator[StreamEvent]:
    for event in events:
        assert_not_cancelled(options)
        yield event
        if event.type == 'cancelled':
            raise TruynError(normalize_error(client_kind='cancelled', message='Stream cancelled by relay'))
