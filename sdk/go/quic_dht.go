package truyn

// Native QUIC/UDP TRUYN/1 five-method DHT control client.
// Uses quic-go, TLS 1.3, signed Ed25519 HELLO/ACCEPT and strict record checking.
// No HTTP tunnel, external subprocess, implicit write retry, or unsafe TLS bypass.

import (
 "context"
 "crypto/ed25519"
 "crypto/rand"
 "crypto/sha256"
 "crypto/tls"
 "crypto/x509"
 "encoding/base64"
 "encoding/hex"
 "encoding/json"
 "encoding/pem"
 "errors"
 "fmt"
 "io"
 "math"
 "net"
 "sort"
 "strings"
 "time"

 quic "github.com/quic-go/quic-go"
)

const nativeQuicMaxMessage = 1_048_576
const nativeQuicSessionProtocol = "truyn-peer-session-v1"

type QuicDHTClient struct {
 identity *LocalIdentity
 conn quic.Connection
 sessionID string
 remoteNodeID string
}
func (c *QuicDHTClient) NodeID() string {return c.identity.NodeID}
func (c *QuicDHTClient) RemoteNodeID() string {return c.remoteNodeID}
func (c *QuicDHTClient) Close() error { return c.conn.CloseWithError(0,"") }

func quicDigest(value any) (string,error){
 bytes,e:=canonicalJSON(value);if e!=nil{return "",e}
 sum:=sha256.Sum256(bytes);return hex.EncodeToString(sum[:]),nil
}
func rawHash(bytes []byte)string {sum:=sha256.Sum256(bytes);return hex.EncodeToString(sum[:])}
func signedValue(id *LocalIdentity,value map[string]any)(string,error){
 if e:=id.ensurePrivateKey();e!=nil{return "",e}
 bytes,e:=canonicalJSON(value);if e!=nil{return "",e}
 return base64.StdEncoding.EncodeToString(ed25519.Sign(id.privateKey,bytes)),nil
}
func asString(v any) string {s,_:=v.(string);return s}
func withoutKeys(m map[string]any,keys ...string)map[string]any{
 deny:=make(map[string]bool,len(keys));for _,k:=range keys {deny[k]=true}
 result:=make(map[string]any,len(m));for k,v:=range m{if !deny[k]{result[k]=v}}
 return result
}
func verifyNativeSigned(nodeID,pemString,sig string,body map[string]any)error{
 derived,e:=nodeIDFromPublicKeyPEM(pemString)
 if e!=nil||derived!=nodeID{return errors.New("quic_signed_identity_mismatch")}
 block,_:=pem.Decode([]byte(pemString));if block==nil{return errors.New("quic_public_key_pem_invalid")}
 key,e:=x509.ParsePKIXPublicKey(block.Bytes);if e!=nil{return e}
 pub,ok:=key.(ed25519.PublicKey);if !ok{return errors.New("quic_signer_not_ed25519")}
 signature,e:=base64.StdEncoding.DecodeString(sig);if e!=nil||len(signature)!=ed25519.SignatureSize{return errors.New("quic_signature_encoding_invalid")}
 bytes,e:=canonicalJSON(body);if e!=nil{return e}
 if !ed25519.Verify(pub,bytes,signature){return errors.New("quic_signed_signature_invalid")}
 return nil
}
func issueQuicTime()string{return time.Now().UTC().Format("2006-01-02T15:04:05.000Z")}
func validQuicTimestamp(s string)bool{
 t,e:=time.Parse(time.RFC3339Nano,s);return e==nil&&math.Abs(time.Since(t).Seconds())<=30
}
func nativeQuicRoundTrip(ctx context.Context,conn quic.Connection,payload any)(map[string]any,error){
 body,e:=json.Marshal(payload);if e!=nil{return nil,e}
 if len(body)>nativeQuicMaxMessage{return nil,errors.New("quic_request_too_large")}
 stream,e:=conn.OpenStreamSync(ctx);if e!=nil{return nil,e}
 defer stream.CancelRead(0)
 if _,e=stream.Write(body);e!=nil{return nil,e}
 if e=stream.Close();e!=nil{return nil,e}
 data,e:=io.ReadAll(io.LimitReader(stream,nativeQuicMaxMessage+1));if e!=nil{return nil,e}
 if len(data)==0||len(data)>nativeQuicMaxMessage{return nil,errors.New("quic_response_size_invalid")}
 var result map[string]any
 if e=json.Unmarshal(data,&result);e!=nil{return nil,e}
 if result==nil{return nil,errors.New("quic_response_not_object")}
 return result,nil
}

// ConnectNativeQuicDHT requires CA PEM trust and hostname verification.
func ConnectNativeQuicDHT(ctx context.Context,host string,port int,caPEM []byte,expectedNodeID string)(*QuicDHTClient,error){
 if host==""||port<1||port>65535||len(caPEM)==0{return nil,errors.New("quic_verified_tls_required")}
 roots:=x509.NewCertPool();if !roots.AppendCertsFromPEM(caPEM){return nil,errors.New("quic_untrusted_ca")}
 conn,e:=quic.DialAddr(ctx,net.JoinHostPort(host,fmt.Sprint(port)),&tls.Config{
  RootCAs:roots,ServerName:host,MinVersion:tls.VersionTLS13,NextProtos:[]string{"truyn/1"},
 },nil);if e!=nil{return nil,e}
 var ok bool
 defer func(){if !ok{_ = conn.CloseWithError(1,"authentication_failed")}}()
 id,e:=CreateLocalIdentity();if e!=nil{return nil,e}
 nonceBytes:=make([]byte,24);if _,e=rand.Read(nonceBytes);e!=nil{return nil,e}
 nonce:=base64.RawURLEncoding.EncodeToString(nonceBytes)
 body:=map[string]any{
  "protocol":nativeQuicSessionProtocol,"kind":"HELLO","nodeId":id.NodeID,
  "transport":"quic","endpoints":[]string{},"nonce":nonce,"issuedAt":issueQuicTime(),
  "protocols":[]string{"TRUYN/1"},"semantics":[]string{},"requiredSemantics":[]string{},
 }
 sig,e:=signedValue(id,body);if e!=nil{return nil,e}
 hello:=withoutKeys(body)
 hello["publicKey"]=id.PublicKeyPEM;hello["signature"]=sig
 response,e:=nativeQuicRoundTrip(ctx,conn,map[string]any{"kind":"session-hello","hello":hello})
 if e!=nil{return nil,e}
 if response["ok"]!=true{return nil,fmt.Errorf("quic_handshake_rejected:%v",response["error"])}
 accept,okType:=response["accept"].(map[string]any);if !okType{return nil,errors.New("quic_accept_missing")}
 peerID,publicPEM,signature:=asString(accept["nodeId"]),asString(accept["publicKey"]),asString(accept["signature"])
 if e=verifyNativeSigned(peerID,publicPEM,signature,withoutKeys(accept,"publicKey","signature"));e!=nil{return nil,e}
 unsignedHello:=withoutKeys(hello,"signature")
 helloDigest,e:=quicDigest(unsignedHello);if e!=nil{return nil,e}
 binding:="quic:hello:"+helloDigest
 protos,okP:=accept["supportedProtocols"].([]any)
 supported:=false;if okP{for _,p:=range protos{if p=="TRUYN/1"{supported=true}}}
 selected,okS:=accept["negotiatedSemantics"].([]any)
 if accept["protocol"]!=nativeQuicSessionProtocol||accept["kind"]!="ACCEPT"||
    accept["peerNodeId"]!=id.NodeID||accept["helloNonce"]!=nonce||
    accept["helloDigest"]!=helloDigest||accept["transportBinding"]!=binding||
    accept["transport"]!="quic"||accept["negotiatedProtocol"]!="TRUYN/1"||
    !supported||!okS||len(selected)!=0||!validQuicTimestamp(asString(accept["issuedAt"])){
  return nil,errors.New("quic_signed_accept_binding_mismatch")
 }
 if expectedNodeID!=""&&peerID!=expectedNodeID{return nil,errors.New("quic_unexpected_peer_identity")}
 sidBody:=map[string]any{"helloNodeId":id.NodeID,"acceptNodeId":peerID,
  "helloNonce":nonce,"acceptNonce":accept["nonce"],"transportBinding":binding}
 sidDigest,e:=quicDigest(sidBody);if e!=nil{return nil,e}
 sid:="truyn:session:"+sidDigest
 if response["sessionId"]!=sid{return nil,errors.New("quic_session_id_mismatch")}
 ok=true
 return &QuicDHTClient{identity:id,conn:conn,sessionID:sid,remoteNodeID:peerID},nil
}
func (c *QuicDHTClient) rpc(ctx context.Context,method string,payload any)(map[string]any,error){
 switch method{case "dht.ping","dht.find-node","peer.announce","dht.store","dht.find-value":
 default:return nil,errors.New("unsupported_quic_dht_method")}
 reply,e:=nativeQuicRoundTrip(ctx,c.conn,map[string]any{
  "kind":"control","sessionId":c.sessionID,"method":method,"payload":payload,
 })
 if e!=nil{return nil,e}
 if reply["ok"]!=true{return nil,fmt.Errorf("quic_rpc_denied:%v",reply["error"])}
 result,ok:=reply["result"].(map[string]any);if !ok{return nil,errors.New("quic_reply_invalid")}
 return result,nil
}
func verifyNativeQuicRecord(record map[string]any,peer bool)error{
 kind,idField,prefix:="truyn-kademlia-v1","publisherNodeId","truyn:dht:"
 if peer{kind,idField,prefix="truyn-peer-record-v1","nodeId","truyn:peer:"}
 if record["protocol"]!=kind{return errors.New("invalid_quic_record_protocol")}
 signed:=withoutKeys(record,"publicKey","signature")
 body:=withoutKeys(signed,"recordId")
 digest,e:=quicDigest(body);if e!=nil{return e}
 if record["recordId"]!=prefix+digest{return errors.New("invalid_quic_record_id")}
 if e=verifyNativeSigned(asString(record[idField]),asString(record["publicKey"]),asString(record["signature"]),signed);e!=nil{return e}
 expires,e:=time.Parse(time.RFC3339Nano,asString(record["expiresAt"]))
 if e!=nil||!expires.After(time.Now()){return errors.New("quic_record_expired")}
 if peer {
  endpoints,ok:=record["endpoints"].([]any)
  if !ok||len(endpoints)==0||record["dhtId"]!=rawHash([]byte(asString(record["nodeId"]))){
   return errors.New("quic_peer_record_invalid")
  }
 }else{
  namespace,key:=asString(record["namespace"]),asString(record["key"])
  d,e:=quicDigest(record["value"]);if e!=nil{return e}
  if record["keyHash"]!=rawHash([]byte(namespace+":"+key))||record["valueDigest"]!="sha256:"+d{
   return errors.New("quic_dht_digest_mismatch")
  }
 }
 return nil
}
func (c *QuicDHTClient) Ping(ctx context.Context)(bool,error){
 result,e:=c.rpc(ctx,"dht.ping",nil);if e!=nil{return false,e}
 if result["pong"]!=true||result["nodeId"]!=c.remoteNodeID{return false,errors.New("quic_ping_wrong_peer")}
 if peer,ok:=result["peerRecord"].(map[string]any);ok{if e=verifyNativeQuicRecord(peer,true);e!=nil{return false,e}}
 return true,nil
}
func (c *QuicDHTClient) FindNode(ctx context.Context,target string)([]map[string]any,error){
 if target==""{return nil,errors.New("quic_target_required")}
 result,e:=c.rpc(ctx,"dht.find-node",map[string]any{"targetNodeId":target});if e!=nil{return nil,e}
 raw,ok:=result["records"].([]any);if !ok||len(raw)>256{return nil,errors.New("quic_peer_set_invalid")}
 records:=make([]map[string]any,0,len(raw))
 for _,item:=range raw{
  record,ok:=item.(map[string]any);if !ok{return nil,errors.New("quic_peer_record_invalid")}
  if e=verifyNativeQuicRecord(record,true);e!=nil{return nil,e}
  records=append(records,record)
 }
 return records,nil
}
func (c *QuicDHTClient) Announce(ctx context.Context,endpoints []string,sequence int64)(map[string]any,error){
 if len(endpoints)==0||sequence<1{return nil,errors.New("invalid_quic_announcement")}
 sort.Strings(endpoints);issued:=time.Now().UTC();fmtTime:=func(t time.Time)string{return t.Format("2006-01-02T15:04:05.000Z")}
 body:=map[string]any{"protocol":"truyn-peer-record-v1","nodeId":c.NodeID(),
  "dhtId":rawHash([]byte(c.NodeID())),"endpoints":endpoints,
  "capabilities":[]string{},"nat":nil,"sequence":sequence,
  "issuedAt":fmtTime(issued),"expiresAt":fmtTime(issued.Add(5*time.Minute))}
 d,e:=quicDigest(body);if e!=nil{return nil,e}
 signed:=withoutKeys(body);signed["recordId"]="truyn:peer:"+d
 signature,e:=signedValue(c.identity,signed);if e!=nil{return nil,e}
 record:=withoutKeys(signed);record["publicKey"]=c.identity.PublicKeyPEM;record["signature"]=signature
 result,e:=c.rpc(ctx,"peer.announce",map[string]any{"record":record});if e!=nil{return nil,e}
 if result["accepted"]!=true||result["nodeId"]!=c.NodeID(){return nil,errors.New("invalid_quic_announce_receipt")}
 return result,nil
}
func (c *QuicDHTClient) Store(ctx context.Context,namespace,key string,value any,sequence int64)(map[string]any,error){
 if strings.TrimSpace(namespace)==""||strings.TrimSpace(key)==""||sequence<1{return nil,errors.New("invalid_quic_store")}
 issued:=time.Now().UTC();fmtTime:=func(t time.Time)string{return t.Format("2006-01-02T15:04:05.000Z")}
 vd,e:=quicDigest(value);if e!=nil{return nil,e}
 body:=map[string]any{"protocol":"truyn-kademlia-v1","namespace":namespace,"key":key,
  "keyHash":rawHash([]byte(namespace+":"+key)),"value":value,"valueDigest":"sha256:"+vd,
  "publisherNodeId":c.NodeID(),"sequence":sequence,
  "issuedAt":fmtTime(issued),"expiresAt":fmtTime(issued.Add(5*time.Minute))}
 id,e:=quicDigest(body);if e!=nil{return nil,e}
 signed:=withoutKeys(body);signed["recordId"]="truyn:dht:"+id
 sig,e:=signedValue(c.identity,signed);if e!=nil{return nil,e}
 record:=withoutKeys(signed);record["publicKey"]=c.identity.PublicKeyPEM;record["signature"]=sig
 reply,e:=c.rpc(ctx,"dht.store",map[string]any{"record":record});if e!=nil{return nil,e}
 if reply["stored"]!=true||reply["recordId"]!=signed["recordId"]{return nil,errors.New("invalid_quic_store_receipt")}
 return reply,nil
}
func (c *QuicDHTClient) FindValue(ctx context.Context,namespace,key string)([]map[string]any,error){
 if namespace==""||key==""{return nil,errors.New("invalid_quic_find_value")}
 reply,e:=c.rpc(ctx,"dht.find-value",map[string]any{"namespace":namespace,"key":key});if e!=nil{return nil,e}
 rows,ok:=reply["records"].([]any);if !ok||len(rows)>256{return nil,errors.New("invalid_quic_dht_records")}
 out:=make([]map[string]any,0,len(rows))
 for _,v:=range rows{
  record,ok:=v.(map[string]any);if !ok{return nil,errors.New("invalid_quic_dht_row")}
  if e=verifyNativeQuicRecord(record,false);e!=nil{return nil,e}
  out=append(out,record)
 }
 return out,nil
}
