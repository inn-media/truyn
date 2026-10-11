using Truyn.Sdk;

if(args.Length != 4) throw new ArgumentException("version role relay capability");
var mode=args[0];var role=args[1];var relay=new Uri(args[2]);var capability=args[3];
await using var peer=await TruynClient.ConnectAsync(new TruynClientOptions(relay),"legacy-matrix-"+mode+"-"+role);
if(role=="provider"){
    await peer.OfferAsync(capability,new Dictionary<string,object>{{"mode",mode}});
    Console.WriteLine("READY");
    Console.Out.Flush();
    var need=await peer.NextNeedAsync(TimeSpan.FromSeconds(15));
    if(need.Capability!=capability) throw new InvalidOperationException("Wrong NEED capability");
    await peer.SendResultAsync(need.NeedId,new Dictionary<string,object>{{"ok",true},{"producedBy",mode}});
    Console.WriteLine("PASS provider");
}else{
    var receipt=await peer.NeedAsync(capability,new Dictionary<string,object>{{"payload","legacy-new-wire"}});
    var result=await peer.WaitForResultAsync(receipt.NeedId,TimeSpan.FromSeconds(15));
    if(result.Provider is null) throw new InvalidOperationException("Missing RESULT");
    Console.WriteLine("PASS requester");
}
