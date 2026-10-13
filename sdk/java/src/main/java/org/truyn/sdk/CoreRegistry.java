package org.truyn.sdk;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

/** A-I registry identifiers, not physical envelope kinds or permissions. */
public final class CoreRegistry {
  public record Entry(String code,String shortAlias,String name,String className,
                      String form,String admission,String wire) {}
  private static final String DATA = """
00000000||UNSPECIFIED|reserved|reserved|reject_when_code_encoded|none
10000000|A00|SESSION|A|semantic_family_or_surface|role_scoped_or_opt_in|semantic_family_not_new_wire_type
11000000|A1|HELLO|A|semantic_family_or_surface|role_scoped_or_opt_in|semantic_family_not_new_wire_type
12000000|A2|WELCOME|A|semantic_family_or_surface|role_scoped_or_opt_in|semantic_family_not_new_wire_type
13000000|A3|VERSION|A|reserved_unadmitted_semantic|role_scoped_or_opt_in|not_admitted
20000000|B00|CONTROL|B|semantic_family_or_surface|role_scoped_or_opt_in|semantic_family_not_new_wire_type
21000000|B1|PING|B|quic_control_method|existing_distinct_wire|quic_rpc:dht.ping
22000000|B2|FIND_NODE|B|quic_control_method|existing_distinct_wire|quic_rpc:dht.find-node
23000000|B3|ANNOUNCE|B|quic_control_method|existing_distinct_wire|quic_rpc:peer.announce
24000000|B4|STORE|B|quic_control_method|existing_distinct_wire|quic_rpc:dht.store
25000000|B5|FIND_VALUE|B|quic_control_method|existing_distinct_wire|quic_rpc:dht.find-value
26000000|B6|SYNC|B|reserved_unadmitted_semantic|role_scoped_or_opt_in|not_admitted
27000000|B7|ADVERTISE|B|semantic_family_or_surface|role_scoped_or_opt_in|semantic_family_not_new_wire_type
28000000|B8|DISCOVER|B|semantic_family_or_surface|role_scoped_or_opt_in|semantic_family_not_new_wire_type
30000000|C00|ENVELOPE|C|semantic_family_or_surface|role_scoped_or_opt_in|semantic_family_not_new_wire_type
31000000|C1|IDENTITY|C|signed_envelope_v1|baseline|signed_json_envelope:IDENTITY
32000000|C2|OFFER|C|signed_envelope_v1|baseline|signed_json_envelope:OFFER
33000000|C3|NEED|C|signed_envelope_v1|baseline|signed_json_envelope:NEED
34000000|C4|RESULT|C|signed_envelope_v1|baseline|signed_json_envelope:RESULT
35000000|C5|REVOKE|C|signed_envelope_v1|baseline|signed_json_envelope:REVOKE
36000000|C6|CAPABILITY|C|embedded_object_or_descriptor|role_scoped_or_opt_in|embedded_object_or_descriptor
37000000|C7|COMMITMENT|C|semantic_family_or_surface|role_scoped_or_opt_in|semantic_family_not_new_wire_type
37100000|C71|CONTRACT|C|reserved_unadmitted_semantic|role_scoped_or_opt_in|not_admitted
37200000|C72|ORDER|C|reserved_unadmitted_semantic|role_scoped_or_opt_in|not_admitted
37300000|C73|ACCEPT|C|reserved_unadmitted_semantic|role_scoped_or_opt_in|not_admitted
37400000|C74|REJECT|C|reserved_unadmitted_semantic|role_scoped_or_opt_in|not_admitted
37500000|C75|STATUS|C|reserved_unadmitted_semantic|role_scoped_or_opt_in|not_admitted
40000000|D00|COMPACT|D|semantic_family_or_surface|role_scoped_or_opt_in|semantic_family_not_new_wire_type
41000000|D1|C_NEED|D|compact_runtime|existing_distinct_wire|signed_compact:N
42000000|D2|C_RESULT|D|compact_runtime|existing_distinct_wire|signed_compact:R
43000000|D3|PARTIAL|D|compact_runtime|existing_distinct_wire|signed_compact:T
44000000|D4|CHAIN|D|compact_runtime|existing_distinct_wire|signed_compact:C
45000000|D5|CONTEXT_PUT|D|compact_runtime|existing_distinct_wire|signed_compact:P
46000000|D6|CONTEXT_DELTA|D|compact_runtime|existing_distinct_wire|signed_compact:D
50000000|E00|OUTCOME|E|outcome_semantics|role_scoped_or_opt_in|outcome_semantics
51000000|E1|SUCCESS|E|outcome_semantics|role_scoped_or_opt_in|outcome_semantics
51100000|E11|completed|E|outcome_semantics|role_scoped_or_opt_in|outcome_semantics
51200000|E12|queued|E|outcome_semantics|role_scoped_or_opt_in|outcome_semantics
51300000|E13|idempotent|E|outcome_semantics|role_scoped_or_opt_in|outcome_semantics
51400000|E14|degraded|E|outcome_semantics|role_scoped_or_opt_in|outcome_semantics
52000000|E2|ERROR|E|outcome_semantics|role_scoped_or_opt_in|outcome_semantics
52100000|E21|REQUEST|E|outcome_semantics|role_scoped_or_opt_in|outcome_semantics
52110000|E211|invalid_argument|E|outcome_semantics|role_scoped_or_opt_in|outcome_semantics
52120000|E212|not_found|E|outcome_semantics|role_scoped_or_opt_in|outcome_semantics
52130000|E213|already_exists|E|outcome_semantics|role_scoped_or_opt_in|outcome_semantics
52200000|E22|ACCESS|E|outcome_semantics|role_scoped_or_opt_in|outcome_semantics
52210000|E221|unauthenticated|E|outcome_semantics|role_scoped_or_opt_in|outcome_semantics
52220000|E222|permission_denied|E|outcome_semantics|role_scoped_or_opt_in|outcome_semantics
52300000|E23|COMPAT|E|outcome_semantics|role_scoped_or_opt_in|outcome_semantics
52310000|E231|version_mismatch|E|outcome_semantics|role_scoped_or_opt_in|outcome_semantics
52320000|E232|unimplemented|E|outcome_semantics|role_scoped_or_opt_in|outcome_semantics
52400000|E24|TEMPORARY|E|outcome_semantics|role_scoped_or_opt_in|outcome_semantics
52410000|E241|resource_exhausted|E|outcome_semantics|role_scoped_or_opt_in|outcome_semantics
52420000|E242|unavailable|E|outcome_semantics|role_scoped_or_opt_in|outcome_semantics
52500000|E25|UNKNOWN_OUTCOME|E|outcome_semantics|role_scoped_or_opt_in|outcome_semantics
52510000|E251|deadline_exceeded|E|outcome_semantics|role_scoped_or_opt_in|outcome_semantics
52520000|E252|transport_error|E|outcome_semantics|role_scoped_or_opt_in|outcome_semantics
52530000|E253|internal|E|outcome_semantics|role_scoped_or_opt_in|outcome_semantics
52600000|E26|TERMINAL|E|outcome_semantics|role_scoped_or_opt_in|outcome_semantics
52610000|E261|invalid_response|E|outcome_semantics|role_scoped_or_opt_in|outcome_semantics
52620000|E262|cancelled|E|outcome_semantics|role_scoped_or_opt_in|outcome_semantics
60000000|F00|TELEMETRY|F|semantic_family_or_surface|role_scoped_or_opt_in|semantic_family_not_new_wire_type
61000000|F1|METRICS|F|reserved_unadmitted_semantic|role_scoped_or_opt_in|not_admitted
62000000|F2|HEALTH|F|reserved_unadmitted_semantic|role_scoped_or_opt_in|not_admitted
63000000|F3|TRACE|F|reserved_unadmitted_semantic|role_scoped_or_opt_in|not_admitted
64000000|F4|HEARTBEAT|F|reserved_unadmitted_semantic|role_scoped_or_opt_in|not_admitted
70000000|G00|DATA|G|semantic_family_or_surface|role_scoped_or_opt_in|semantic_family_not_new_wire_type
71000000|G1|OBJECT|G|embedded_object_or_descriptor|role_scoped_or_opt_in|embedded_object_or_descriptor
72000000|G2|STATE|G|reserved_unadmitted_semantic|role_scoped_or_opt_in|not_admitted
73000000|G3|DELTA|G|reserved_unadmitted_semantic|role_scoped_or_opt_in|not_admitted
74000000|G4|SUBSCRIBE|G|reserved_unadmitted_semantic|role_scoped_or_opt_in|not_admitted
80000000|H00|TRUST|H|semantic_family_or_surface|role_scoped_or_opt_in|semantic_family_not_new_wire_type
81000000|H1|CLAIM|H|embedded_object_or_descriptor|role_scoped_or_opt_in|embedded_object_or_descriptor
82000000|H2|ATTEST|H|embedded_object_or_descriptor|role_scoped_or_opt_in|embedded_object_or_descriptor
83000000|H3|TRUST_RECEIPT|H|embedded_object_or_descriptor|role_scoped_or_opt_in|embedded_object_or_descriptor
84000000|H4|CHALLENGE|H|composed_behavior|role_scoped_or_opt_in|composed_behavior
85000000|H5|VERIFY|H|composed_behavior|role_scoped_or_opt_in|composed_behavior
86000000|H6|DISPUTE|H|composed_behavior|role_scoped_or_opt_in|composed_behavior
87000000|H7|PROOF|H|embedded_object_or_descriptor|role_scoped_or_opt_in|embedded_object_or_descriptor
90000000|I00|COMPUTE|I|reserved_unadmitted_semantic|role_scoped_or_opt_in|not_admitted
""";
  private static final Map<String,Entry> ENTRIES = create();
  private CoreRegistry() {}
  private static Map<String,Entry> create() {
    Map<String,Entry> result=new LinkedHashMap<>();
    for(String line:DATA.strip().split("\\R")) {
      String[] p=line.split("\\|",-1);
      if(p.length!=7)throw new IllegalStateException("invalid_core_registry_entry");
      Entry e=new Entry(p[0],p[1],p[2],p[3],p[4],p[5],p[6]);
      if(result.putIfAbsent(e.code(),e)!=null)throw new IllegalStateException("duplicate_core_code");
    }
    return Collections.unmodifiableMap(result);
  }
  public static Map<String,Entry> entries(){return ENTRIES;}
  public static Entry lookup(String code){
    return code!=null&&code.matches("[0-9]{8}")?ENTRIES.get(code):null;
  }
  public static Entry requireExecutable(String code){
    Entry e=lookup(code);
    if(e==null||!e.form().equals("signed_envelope_v1")||!e.admission().equals("baseline"))
      throw new IllegalArgumentException("core_semantic_not_admitted");
    return e;
  }
}
