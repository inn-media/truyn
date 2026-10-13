package main
import("bufio";"context";"encoding/json";"fmt";"os";"reflect";"time"; truyn "github.com/inn-media/truyn/sdk/go")
func main(){
 var peer *truyn.Client
 scan:=bufio.NewScanner(os.Stdin); scan.Buffer(make([]byte,4096),1024*1024)
 for scan.Scan(){
  var a map[string]any; if e:=json.Unmarshal(scan.Bytes(),&a); e!=nil{panic(e)}
  s:=func(k string)string{v,_:=a[k].(string);return v}
  ctx,cancel:=context.WithTimeout(context.Background(),5*time.Second)
  var value any; var err error
  switch s("op"){
  case "init":
   protocols:=[]string{"TRUYN/1"};if x,ok:=a["protocols"].([]any);ok{protocols=nil;for _,p:=range x{protocols=append(protocols,p.(string))}}
   peer,err=truyn.Connect(ctx,truyn.ClientConfig{BaseURL:s("url"),SupportedProtocols:protocols},"lifecycle-fixture")
   if err==nil{_,p:=reflect.TypeOf(peer).MethodByName("Partial");_,n:=reflect.TypeOf(peer).MethodByName("CompactNeed");_,q:=reflect.TypeOf(peer).MethodByName("PollCompact");value=map[string]any{"nodeId":peer.NodeID(),"cancelSurface":"public-CancelNeed","compactApi":p&&n&&q}}
  case "offer":value,err=peer.Offer(ctx,s("capability"),nil)
  case "need":value,err=peer.Need(ctx,s("capability"),map[string]any{"fixture":true},nil)
  case "result":value,err=peer.SendResult(ctx,s("id"),map[string]any{"answer":42},nil)
  case "cancel":err=peer.CancelNeed(ctx,s("id"),"fixture")
  case "withdraw":err=peer.RevokeOffer(ctx,s("id"))
  case "next":var e *truyn.NeedEvent;e,err=peer.NextNeed(ctx);if err==nil{value=map[string]any{"needId":e.NeedID,"verified":e.Verification.Ok}}
  case "wait":var e *truyn.ResultEvent;e,err=peer.WaitForResult(ctx,s("id"));if err==nil{value=map[string]any{"needId":e.NeedID,"verified":e.Verification.Ok}}
  case "close":cancel();fmt.Println(`{"ok":true,"value":null}`);return
  default:err=fmt.Errorf("unsupported_fixture_operation")
  }
  cancel(); out:=map[string]any{"ok":err==nil,"value":value};if err!=nil{out["message"]=err.Error()}
  b,e:=json.Marshal(out);if e!=nil{panic(e)};fmt.Println(string(b))
 }
 if err:=scan.Err();err!=nil{panic(err)}
}
