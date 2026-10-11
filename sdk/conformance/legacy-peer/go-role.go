package main

import (
 "context"
 "fmt"
 "os"
 "time"
 truyn "github.com/inn-media/truyn/sdk/go"
)
func main(){
 if len(os.Args)!=5 { panic("usage: role <version> <role> <relay> <capability>") }
 mode, role, relay, capability := os.Args[1],os.Args[2],os.Args[3],os.Args[4]
 ctx,cancel:=context.WithTimeout(context.Background(),30*time.Second)
 defer cancel()
 peer,err:=truyn.Connect(ctx,truyn.ClientConfig{BaseURL:relay},"compat-"+mode+"-"+role)
 if err!=nil { panic(err) }
 if role=="provider"{
  if _,err=peer.Offer(ctx,capability,map[string]any{"mode":mode});err!=nil {panic(err)}
  fmt.Println("READY")
  need,err:=peer.NextNeed(ctx);if err!=nil {panic(err)}
  if need.Capability!=capability {panic("wrong capability")}
  if _,err=peer.SendResult(ctx,need.NeedID,map[string]any{"ok":true,"producedBy":mode},nil);err!=nil {panic(err)}
  fmt.Println("PASS provider")
 }else{
  receipt,err:=peer.Need(ctx,capability,map[string]any{"payload":"legacy-new-wire"},nil);if err!=nil {panic(err)}
  result,err:=peer.WaitForResult(ctx,receipt.NeedID);if err!=nil {panic(err)}
  if !result.Verification.Ok {panic("signed result invalid")}
  fmt.Println("PASS requester")
 }
}
