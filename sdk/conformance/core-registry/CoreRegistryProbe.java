import org.truyn.sdk.CoreRegistry;
public final class CoreRegistryProbe {
 public static void main(String[] args){
  for(String code:args){
   var e=CoreRegistry.lookup(code);
   if(e==null){System.out.println(code+"|UNKNOWN");continue;}
   boolean allowed;
   try{CoreRegistry.requireExecutable(code);allowed=true;}catch(IllegalArgumentException ex){allowed=false;}
   System.out.println(String.join("|",e.code(),e.shortAlias(),e.name(),e.className(),e.form(),e.admission(),e.wire(),String.valueOf(allowed)));
  }
 }
}
