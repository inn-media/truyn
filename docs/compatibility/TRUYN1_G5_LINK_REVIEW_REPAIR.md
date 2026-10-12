# G5 fixed-read test link: CodeQL review correction

PR #1068 / issue #990. This is test-source hardening, not cloud launch or G5 admission.

The old test-local link constructed an HTTPS target from the inbound request URL and forwarded its method/headers. It is replaced by a fixed-host, fixed-port, fixed-document GET-only link. The allowed Cosmos document path is derived from the preconfigured database, container and immutable logical NEED ID; no inbound URL or Host header chooses an upstream target. Non-GET methods, other documents, absolute URLs, query strings and request bodies are rejected before an HTTPS request. Only selected Cosmos authentication/session headers can be forwarded.

Four executable regression groups use real loopback TCP sockets and explicitly mocked HTTPS. They prove request rejection, header filtering, and real local socket cut/heal. They make no Azure call, no provider request and no accounting change. Existing signed-envelope, verified child SIGKILL, replay and durable ACK tests remain intact. The worker still has no deployment workflow; the earlier blocked provisioning operation is not recreated.

Hosted exact-SHA full qualification, five-SDK conformance, DCO/security and CodeQL must complete before source acceptance. No analyzer suppression or admission downgrade is introduced. Actual independent Azure hosts, VNet/region failure and paid provider/settlement evidence remain separate unexecuted gates.
