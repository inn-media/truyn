package main

import (
 "bufio"
 "context"
 "encoding/json"
 "fmt"
 "os"
 "time"
 truyn "github.com/inn-media/truyn/sdk/go"
)

// Public optional API interface compiles against old immutable and successor
// SDKs. It never reflects private keys or replaces a native signing operation.
type compactAPI interface {
 CompactNeed(context.Context,string,any,map[string]any)(map[string]any,error)
 Partial(context.Context,string,int64,any,map[string]any)(map[string]any,error)
 CompactResult(context.Context,string,any,map[string]any)(map[string]any,error)
 PollCompact(context.Context)([]map[string]any,error)
}
func main(){
 if len(os.Args)!=3 {panic("mode relay required")}
 peers:=map[string]*truyn.Client{}
 scanner:=bufio.NewScanner(os.Stdin);scanner.Buffer(make([]byte,4096),1048576)
 for scanner.Scan(){
  var m struct{ID int `json:"id"`; Action string `json:"action"`;Args map[string]json.RawMessage `json:"args"`}
  if err:=json.Unmarshal(scanner.Bytes(),&m);err!=nil{panic(err)}
  str:=func(k string)string{var v string;json.Unmarshal(m.Args[k],&v);return v}
  ctx,cancel:=context.WithTimeout(context.Background(),5*time.Second)
  var value any;var err error;p:=peers[str("actor")]
  native,hasCompact:=any(p).(compactAPI)
  switch m.Action {
  case "connect":
   protocols:=[]string{"TRUYN/1"};if raw:=m.Args["protocols"];raw!=nil{json.Unmarshal(raw,&protocols)}
   p,err=truyn.Connect(ctx,truyn.ClientConfig{BaseURL:os.Args[2],SupportedProtocols:protocols},str("actor"))
   if err==nil{peers[str("actor")]=p;_,partial:=any(p).(compactAPI);value=map[string]any{"nodeId":p.NodeID(),"cancel":true,"withdraw":true,"partial":partial,"surface":"client-api"}}
  case "offer":
   meta:=map[string]any{};if m.Args["metadata"]!=nil{json.Unmarshal(m.Args["metadata"],&meta)};value,err=p.Offer(ctx,str("capability"),meta)
  case "need": value,err=p.Need(ctx,str("capability"),map[string]any{"probe":true},nil)
  case "result": value,err=p.SendResult(ctx,str("needId"),map[string]any{"answer":42},nil)
  case "nextNeed":
   var r *truyn.NeedEvent;r,err=p.NextNeed(ctx);if err==nil{value=map[string]any{"needId":r.NeedID,"verified":r.Verification.Ok}}
  case "waitResult":
   var r *truyn.ResultEvent;r,err=p.WaitForResult(ctx,str("needId"));if err==nil{value=map[string]any{"needId":r.NeedID,"verified":r.Verification.Ok}}
  case "cancel": value,err=p.Revoke(ctx,str("needId"),"need","test_cancel")
  case "withdraw": value,err=p.Revoke(ctx,str("offerId"),"offer","test_withdraw")
  case "poll":
   var r []truyn.Event;r,err=p.Poll(ctx);if err==nil{rows:=[]any{};for _,v:=range r{rows=append(rows,map[string]any{"kind":v.Kind,"verified":v.Verification.Ok})};value=rows}
  case "compactNeed":
   if !hasCompact{err=fmt.Errorf("unsupported_compact_api");break};value,err=native.CompactNeed(ctx,str("capability"),map[string]any{"probe":true},nil)
  case "partial":
   if !hasCompact{err=fmt.Errorf("unsupported_compact_api");break};var sequence int64;var delta any
   if err=json.Unmarshal(m.Args["sequence"],&sequence);err!=nil{break};if err=json.Unmarshal(m.Args["delta"],&delta);err!=nil{break}
   value,err=native.Partial(ctx,str("needId"),sequence,delta,nil)
  case "compactResult":
   if !hasCompact{err=fmt.Errorf("unsupported_compact_api");break};value,err=native.CompactResult(ctx,str("needId"),map[string]any{"answer":42},nil)
  case "pollCompact":
   if !hasCompact{err=fmt.Errorf("unsupported_compact_api");break};var events []map[string]any;events,err=native.PollCompact(ctx)
   if err==nil{rows:=[]any{};for _,event:=range events{v,_:=event["verification"].(map[string]any);row:=map[string]any{"kind":event["kind"],"verified":v["ok"]==true};if payload,ok:=event["payload"].(map[string]any);ok{if seq,ok:=payload["sequence"];ok{row["sequence"]=seq}};rows=append(rows,row)};value=rows}
  default: err=fmt.Errorf("unsupported_action")
  }
  cancel();out:=map[string]any{"id":m.ID,"ok":err==nil,"value":value};if err!=nil{out["error"]=err.Error()};data,_:=json.Marshal(out);fmt.Println(string(data))
 }
 if scanner.Err()!=nil{panic(scanner.Err())}
}
