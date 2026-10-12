package org.truyn.sdk;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
public final class DescriptorInterfaceConformance {
  public static void main(String[] args) throws Exception {
    var suite = Json.object(Json.parse(Files.readString(Path.of(System.getenv("TRUYN_DESCRIPTOR_CASES_FILE")))));
    var rows = new ArrayList<Map<String,Object>>();
    for (Object entry : (List<?>)suite.get("cases")) {
      var item = Json.object(entry);
      try {
        var value = AgentDescriptors.fetch(URI.create((String)item.get("url")), (String)suite.get("publicKeyPem"), List.of("TRUYN/1"), ((List<?>)suite.get("supportedInterfaces")).stream().map(String.class::cast).toList());
        var selected = value.selection().interfaceValue();
        var model = value.descriptor().interfaces().get(0);
        if (!java.util.Objects.equals(model.type(), selected.get("type")) || !java.util.Objects.equals(model.url(), selected.get("endpoint")))
          throw new IllegalStateException("typed Descriptor interface projection lost a validated field");
        rows.add(Map.of("id",item.get("id"),"ok",true,"identity",value.descriptor().identity(),"protocol",value.selection().protocol(),"interface",value.selection().interfaceValue(),"keyBinding",value.signer().keyBinding()));
      } catch (TruynException error) { rows.add(Map.of("id",item.get("id"),"ok",false,"message",error.getMessage())); }
    }
    Files.writeString(Path.of(System.getenv("TRUYN_DESCRIPTOR_RESULT_FILE")),Json.stringify(rows));
  }
}
