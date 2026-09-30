const DIAGNOSTICS = Object.freeze({
  IPV4_UNREACHABLE: 'OPEN1_IPV4_UNREACHABLE',
  IPV6_UNREACHABLE: 'OPEN1_IPV6_UNREACHABLE',
  NAT_NO_TRAVERSAL: 'OPEN1_NAT_NO_TRAVERSAL',
  CGNAT_RELAY_REQUIRED: 'OPEN1_CGNAT_RELAY_REQUIRED',
  NETWORK_CHANGE_REDISCOVERY_REQUIRED: 'OPEN1_NETWORK_CHANGE_REDISCOVERY_REQUIRED'
});

function path(kind, transport = 'quic') {
  return Object.freeze({ status: 'path', path: kind, transport });
}

function diagnostic(code) {
  return Object.freeze({ status: 'diagnostic', code });
}

export function selectConnectivityPolicy({ connectivityClass, directQuic = false, traversal = false, relay = false, rediscovered = false } = {}) {
  switch (connectivityClass) {
    case 'ipv4':
      return directQuic ? path('direct-ipv4') : diagnostic(DIAGNOSTICS.IPV4_UNREACHABLE);
    case 'ipv6':
      return directQuic ? path('direct-ipv6') : diagnostic(DIAGNOSTICS.IPV6_UNREACHABLE);
    case 'nat':
      if (directQuic) return path('direct-nat');
      if (traversal) return path('nat-traversal');
      return diagnostic(DIAGNOSTICS.NAT_NO_TRAVERSAL);
    case 'cgnat':
      if (directQuic) return path('direct-cgnat');
      if (relay) return path('authenticated-relay');
      return diagnostic(DIAGNOSTICS.CGNAT_RELAY_REQUIRED);
    case 'network-change':
      if (rediscovered && directQuic) return path('rediscovered-direct');
      if (rediscovered && relay) return path('rediscovered-relay');
      return diagnostic(DIAGNOSTICS.NETWORK_CHANGE_REDISCOVERY_REQUIRED);
    default:
      throw new Error(`unsupported connectivity class: ${connectivityClass ?? 'missing'}`);
  }
}

export { DIAGNOSTICS as CONNECTIVITY_DIAGNOSTICS };
