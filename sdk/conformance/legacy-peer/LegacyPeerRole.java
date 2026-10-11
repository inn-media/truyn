import org.truyn.sdk.TruynClient;
import java.net.URI;
import java.time.Duration;
import java.util.Map;

public final class LegacyPeerRole {
 public static void main(String[] args) {
   if(args.length!=4) throw new IllegalArgumentException("version role relay capability");
   String mode=args[0],role=args[1],capability=args[3];
   TruynClient peer=TruynClient.connect(URI.create(args[2]),"legacy-matrix-"+mode+"-"+role);
   if(role.equals("provider")){
     peer.offer(capability,Map.of("mode",mode)).join();
     System.out.println("READY");
     System.out.flush();
     var need=peer.nextNeed(Duration.ofSeconds(15)).join();
     if(!capability.equals(need.capability())) throw new AssertionError("wrong NEED");
     peer.sendResult(need.needId(),Map.of("ok",true,"producedBy",mode),Map.of()).join();
     System.out.println("PASS provider");
   }else{
     var receipt=peer.need(capability,Map.of("payload","legacy-new-wire"),Map.of()).join();
     var result=peer.waitForResult(receipt.needId(),Duration.ofSeconds(15)).join();
     if(result==null || result.provider()==null) throw new AssertionError("missing RESULT");
     System.out.println("PASS requester");
   }
 }
}
