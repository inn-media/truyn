package truyn
import (
 "context"
 "os"
 "strconv"
 "testing"
 "time"
 "strings"
)
func TestNativeQuicDHTConformance(t *testing.T){
 host:=os.Getenv("TRUYN_NATIVE_QUIC_HOST")
 if host=="" {t.Skip("live native UDP/QUIC server fixture required")}
 port,err:=strconv.Atoi(os.Getenv("TRUYN_NATIVE_QUIC_PORT"));if err!=nil{t.Fatal(err)}
 ca,err:=os.ReadFile(os.Getenv("TRUYN_NATIVE_QUIC_CA"));if err!=nil{t.Fatal(err)}
 expected:=os.Getenv("TRUYN_NATIVE_QUIC_PEER")
 ctx,cancel:=context.WithTimeout(context.Background(),40*time.Second);defer cancel()
 client,err:=ConnectNativeQuicDHT(ctx,host,port,ca,expected)
 if err!=nil{t.Fatal(err)}
 defer client.Close()
 ping,err:=client.Ping(ctx);if err!=nil||!ping{t.Fatalf("QUIC PING: %v",err)}
 peers,err:=client.FindNode(ctx,expected);if err!=nil{t.Fatal(err)}
 foundPeer:=false;for _,p:=range peers{if p["nodeId"]==expected{foundPeer=true}}
 if !foundPeer{t.Fatal("QUIC FIND_NODE did not verify peer")}
 rec,err:=client.Announce(ctx,[]string{"quic://127.0.0.1:4433"},1)
 if err!=nil||rec["accepted"]!=true{t.Fatalf("QUIC ANNOUNCE %v",err)}
 receipt,err:=client.Store(ctx,"go-native","five-quic-rpc",map[string]any{"language":"go","count":5},1)
 if err!=nil||receipt["stored"]!=true{t.Fatalf("QUIC STORE %v",err)}
 records,err:=client.FindValue(ctx,"go-native","five-quic-rpc")
 if err!=nil{t.Fatal(err)}
 foundRecord:=false;for _,r:=range records{if r["recordId"]==receipt["recordId"]{foundRecord=true}}
 if !foundRecord{t.Fatal("QUIC FIND_VALUE missing signed record")}
 for _,r:=range records {
   fake:=make(map[string]any);for k,v:=range r{fake[k]=v};fake["value"]=map[string]any{"tampered":true}
   if err:=verifyNativeQuicRecord(fake,false);err==nil{t.Fatal("tampered DHT record accepted")}
 }
 wrong,err:=ConnectNativeQuicDHT(ctx,host,port,ca,"truyn:node:"+strings.Repeat("0",64))
 if wrong!=nil{wrong.Close()}
 if err==nil||!strings.Contains(err.Error(),"quic_unexpected_peer_identity"){t.Fatalf("foreign QUIC Node ID accepted: %v",err)}
 t.Log("TRUYN_NATIVE_GO_QUIC_DHT_PASS five_methods=5 signed_identity=PASS tampered_value=DENY")
}
