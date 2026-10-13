using System.Text.Json;
using Truyn.Sdk;
if(args.Length!=2)throw new ArgumentException("mode relay");
var peers=new Dictionary<string,TruynClient>();
string? line;
while((line=Console.ReadLine()) is not null){
 using var doc=JsonDocument.Parse(line);var m=doc.RootElement;var a=m.GetProperty("args");var id=m.GetProperty("id").GetInt32();
 string S(string key)=>a.GetProperty(key).GetString()!;
 object? value=null;
 try{
  peers.TryGetValue(S("actor"),out var p);
  dynamic native=p!; // Calls public optional SDK methods, never private fields.
  switch(m.GetProperty("action").GetString()){
   case "connect":
    var protocols=a.TryGetProperty("protocols",out var ps)?ps.EnumerateArray().Select(x=>x.GetString()!).ToArray():new[]{"TRUYN/1"};
    p=await TruynClient.ConnectAsync(new TruynClientOptions(new Uri(args[1]),SupportedProtocols:protocols),S("actor"));peers[S("actor")]=p;
    var methods=typeof(TruynClient).GetMethods().Select(x=>x.Name).ToHashSet();
    value=new{nodeId=p.NodeId,cancel=true,withdraw=true,partial=new[]{"PartialAsync","CompactNeedAsync","CompactResultAsync","PollCompactAsync"}.All(methods.Contains),surface="client-api"};break;
   case "offer":
    var meta=new Dictionary<string,object>();if(a.TryGetProperty("metadata",out var metadata))foreach(var v in metadata.EnumerateObject())meta[v.Name]=v.Value.Clone();
    value=await p!.OfferAsync(S("capability"),meta);break;
   case "need": var n=await p!.NeedAsync(S("capability"),new{probe=true});value=new{needId=n.NeedId,provider=n.Provider};break;
   case "result": value=await p!.SendResultAsync(S("needId"),new{answer=42});break;
   case "nextNeed": var r=await p!.NextNeedAsync(TimeSpan.FromSeconds(3));value=new{needId=r.NeedId,verified=true};break;
   case "waitResult": var s=await p!.WaitForResultAsync(S("needId"),TimeSpan.FromSeconds(3));value=new{needId=s.NeedId,verified=true};break;
   case "cancel": await p!.CancelNeedAsync(S("needId"),"test_cancel");break;
   case "withdraw": await p!.RevokeOfferAsync(S("offerId"));break;
   case "poll": value=(await p!.PollAsync()).Select(x=>new{kind=x.Kind,verified=x.Verified}).ToArray();break;
   case "compactNeed": value=await native.CompactNeedAsync(S("capability"),(object)new Dictionary<string,object>{{"probe",true}});break;
   case "partial": value=await native.PartialAsync(S("needId"),a.GetProperty("sequence").GetInt64(),(object)a.GetProperty("delta").Clone());break;
   case "compactResult": value=await native.CompactResultAsync(S("needId"),(object)new Dictionary<string,object>{{"answer",42}});break;
   case "pollCompact":
    var rows=new List<Dictionary<string,object>>();
    foreach(object raw in (System.Collections.IEnumerable)(await native.PollCompactAsync())){
     dynamic x=raw;JsonElement payload=x.Payload;
     var row=new Dictionary<string,object>{{"kind",(string)x.Kind},{"verified",(bool)x.Verified}};
     if(payload.TryGetProperty("sequence",out var sequence))row["sequence"]=sequence.GetInt64();rows.Add(row);
    }value=rows;break;
   default: throw new InvalidOperationException("unsupported_action");
  }
  Console.WriteLine(JsonSerializer.Serialize(new{id,ok=true,value}));
 }catch(Exception e){Console.WriteLine(JsonSerializer.Serialize(new{id,ok=false,error=e.Message[..Math.Min(150,e.Message.Length)]}));}
}
foreach(var p in peers.Values)await p.DisposeAsync();
