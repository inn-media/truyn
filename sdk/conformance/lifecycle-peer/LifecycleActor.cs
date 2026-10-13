using System.Text.Json;
using Truyn.Sdk;
TruynClient? peer=null;
var options=new JsonSerializerOptions { PropertyNamingPolicy=JsonNamingPolicy.CamelCase };
string? line;
while((line=Console.ReadLine()) is not null){
 try{
  using var input=JsonDocument.Parse(line);var a=input.RootElement;
  string S(string k)=>a.TryGetProperty(k,out var p)?p.GetString()??"":"";
  object? value=null;
  switch(S("op")){
   case "init":
    var protocols=a.TryGetProperty("protocols",out var ps)?ps.EnumerateArray().Select(x=>x.GetString()!).ToArray():new[]{"TRUYN/1"};
    peer=await TruynClient.ConnectAsync(new TruynClientOptions(new Uri(S("url")),SupportedProtocols:protocols),"lifecycle-fixture");
    var names=typeof(TruynClient).GetMethods().Select(x=>x.Name).ToHashSet();
    value=new{nodeId=peer.NodeId,cancelSurface="public-CancelNeedAsync",compactApi=new[]{"CompactNeedAsync","PartialAsync","PollCompactAsync"}.All(names.Contains)};break;
   case "offer":value=await peer!.OfferAsync(S("capability"));break;
   case "need":value=await peer!.NeedAsync(S("capability"),new{fixture=true});break;
   case "result":value=await peer!.SendResultAsync(S("id"),new{answer=42});break;
   case "cancel":await peer!.CancelNeedAsync(S("id"),"fixture");break;
   case "withdraw":await peer!.RevokeOfferAsync(S("id"));break;
   case "next":{var r=await peer!.NextNeedAsync(TimeSpan.FromSeconds(3));value=new{needId=r.NeedId,verified=true};break;}
   case "wait":{var r=await peer!.WaitForResultAsync(S("id"),TimeSpan.FromSeconds(3));value=new{needId=r.NeedId,verified=true};break;}
   case "close":if(peer is not null)await peer.DisposeAsync();Console.WriteLine("{\"ok\":true,\"value\":null}");return;
   default:throw new InvalidOperationException("unsupported_fixture_operation");
  }
  Console.WriteLine(JsonSerializer.Serialize(new{ok=true,value},options));
 }catch(Exception e){Console.WriteLine(JsonSerializer.Serialize(new{ok=false,message=e.GetBaseException().Message},options));}
}
