package truyn

import (
 "context"
 "crypto/ed25519"
 "crypto/rand"
 "crypto/x509"
 "encoding/base64"
 "encoding/pem"
 "fmt"
 "math"
 "net/http"
 "net/url"
 "strings"
)

// The direct compact profile signs exactly TCJ1([code, requestID, payload]).
// It does not add a sixth JSON envelope type or permit unsigned cancellation.
func (c *Client) compactFrame(code, id string, payload map[string]any) (map[string]any, error) {
 if id == "" || len(id)>4070 || (code!="N" && code!="R" && code!="T" && code!="C" && code!="P" && code!="D") {
  return nil, NewError(InvalidArgument,"invalid compact request identity or kind",false)
 }
 if err:=c.identity.ensurePrivateKey(); err!=nil {return nil,err}
 expected,err:=nodeIDFromPublicKeyPEM(c.identity.PublicKeyPEM)
 if err!=nil || expected!=c.identity.NodeID {return nil,NewError(InvalidArgument,"compact identity key mismatch",false)}
 message,err:=canonicalJSON([]any{code,id,payload}); if err!=nil {return nil,err}
 return map[string]any{"t":code,"i":id,"s":base64.RawURLEncoding.EncodeToString(ed25519.Sign(c.identity.privateKey,message))},nil
}

func (c *Client) sendCompact(ctx context.Context,path,code,id string,payload map[string]any)(map[string]any,error){
 frame,err:=c.compactFrame(code,id,payload);if err!=nil{return nil,err}
 var result map[string]any
 err=c.requestJSON(ctx,http.MethodPost,path,map[string]any{"frame":frame,"payload":payload},true,&result)
 return result,err
}

// CompactNeed admits once and returns immediately; use PollCompact for output.
// No timeout, reconnect or provider failure is automatically retried.
func (c *Client) CompactNeed(ctx context.Context,capability string,input any,policy map[string]any)(map[string]any,error){
 if capability=="" {return nil,NewError(InvalidArgument,"capability is required",false)}
 idBytes:=make([]byte,12);if _,err:=rand.Read(idBytes);err!=nil{return nil,err}
 id:=base64.RawURLEncoding.EncodeToString(idBytes);if policy==nil{policy=map[string]any{}}
 r,err:=c.sendCompact(ctx,"/v1/fast/needs?waitMs=0","N",id,map[string]any{"capability":map[string]any{"name":capability},"input":input,"policy":policy})
 if err!=nil{return nil,err}
 if r["ok"]!=true || r["needId"]!=id {return nil,NewError(InvalidResponse,"invalid compact NEED receipt",false)}
 return r,nil
}

// Partial leaves sequence allocation with the caller. A 429 never advances it.
func (c *Client) Partial(ctx context.Context,id string,sequence int64,delta any,metadata map[string]any)(map[string]any,error){
 if sequence<0 || sequence>9007199254740991 {return nil,NewError(InvalidArgument,"sequence must be a non-negative safe integer",false)}
 if metadata==nil{metadata=map[string]any{}}
 return c.sendCompact(ctx,"/v1/fast/partials","T",id,map[string]any{"sequence":sequence,"delta":delta,"metadata":metadata})
}
func (c *Client) CompactResult(ctx context.Context,id string,output any,metadata map[string]any)(map[string]any,error){
 if metadata==nil{metadata=map[string]any{}}
 return c.sendCompact(ctx,"/v1/fast/results","R",id,map[string]any{"output":output,"metadata":metadata})
}

// PollCompact verifies locally before exposing any event. Public-key identity,
// frame kind and signed bytes are checked independently of relay proof flags.
// CHAIN and semantic translations are deliberately not accepted by this API.
func (c *Client) PollCompact(ctx context.Context)([]map[string]any,error){
 var body struct{Events []map[string]any `json:"events"`}
 if err:=c.requestJSON(ctx,http.MethodGet,"/v1/fast/events?nodeId="+url.QueryEscape(c.NodeID())+"&waitMs=0",nil,true,&body);err!=nil{return nil,err}
 if body.Events==nil || len(body.Events)>1024{return nil,NewError(InvalidResponse,"invalid compact events",false)}
 for _,event:=range body.Events {
  kind,_:=event["kind"].(string)
  if env,exists:=event["envelope"];exists {
   envelope,ok:=env.(map[string]any)
   if !ok || envelope["type"]!=kind {return nil,NewError(InvalidResponse,"compact envelope kind mismatch",false)}
   valid,_:=VerifyEnvelope(envelope);if !valid{return nil,NewError(InvalidResponse,"invalid signed lifecycle envelope",false)}
   event["verification"]=map[string]any{"ok":true};continue
  }
  code:=map[string]string{"NEED":"N","RESULT":"R","PARTIAL":"T"}[kind]
  frame,ok:=event["frame"].(map[string]any);payload,payloadOK:=event["payload"].(map[string]any)
  from,_:=event["from"].(string)
  if code=="" || !ok || !payloadOK || from=="" || frame["t"]!=code {return nil,NewError(InvalidResponse,"invalid direct compact event",false)}
  if signed,exists:=event["signedType"];exists && signed!=kind{return nil,NewError(InvalidResponse,"unsupported compact translation",false)}
  if _,exists:=event["priorResult"];exists{return nil,NewError(InvalidResponse,"CHAIN is outside direct compact profile",false)}
  id,_:=frame["i"].(string);sigText,_:=frame["s"].(string)
  signature,err:=base64.RawURLEncoding.Strict().DecodeString(sigText)
  if id=="" || len(id)>4070 || err!=nil || len(signature)!=ed25519.SignatureSize || base64.RawURLEncoding.EncodeToString(signature)!=sigText{return nil,NewError(InvalidResponse,"invalid compact signature encoding",false)}
  var identity map[string]any
  if err=c.requestJSON(ctx,http.MethodGet,"/v1/nodes/"+url.PathEscape(from),nil,true,&identity);err!=nil{return nil,err}
  keyPEM,_:=identity["publicKey"].(string);nodeID,err:=nodeIDFromPublicKeyPEM(keyPEM)
  if err!=nil || nodeID!=from || identity["nodeId"]!=from{return nil,NewError(InvalidResponse,"compact signer identity mismatch",false)}
  block,_:=pem.Decode([]byte(keyPEM));key,err:=x509.ParsePKIXPublicKey(block.Bytes)
  if err!=nil{return nil,NewError(InvalidResponse,"invalid compact public key",false)}
  publicKey,ok:=key.(ed25519.PublicKey);if !ok{return nil,NewError(InvalidResponse,"compact signer is not Ed25519",false)}
  message,err:=canonicalJSON([]any{code,id,payload});if err!=nil || !ed25519.Verify(publicKey,message,signature){return nil,NewError(InvalidResponse,"compact signature verification failed",false)}
  if kind=="PARTIAL" {
   seq,ok:=payload["sequence"].(float64)
   if !ok || math.IsNaN(seq) || math.IsInf(seq,0) || seq<0 || seq>9007199254740991 || math.Trunc(seq)!=seq{return nil,NewError(InvalidResponse,"invalid signed PARTIAL sequence",false)}
   if _,ok:=payload["delta"];!ok{return nil,NewError(InvalidResponse,"missing signed PARTIAL delta",false)}
  }
  event["verification"]=map[string]any{"ok":true,"type":kind}
 }
 return body.Events,nil
}

// Keep errors in the SDK's normalized error family rather than raw transport
// or provider exception strings. fmt is used by conformance assertion callers.
var _ = fmt.Sprintf

func compactNewID() (string,error){
 b:=make([]byte,12);if _,err:=rand.Read(b);err!=nil{return "",err}
 return base64.RawURLEncoding.EncodeToString(b),nil
}

// CompactChain is a signed C frame. No implicit retry: a timeout is ambiguous.
func (c *Client) CompactChain(ctx context.Context,stages []map[string]any)(map[string]any,error){
 if len(stages)<2||len(stages)>8{return nil,NewError(InvalidArgument,"invalid_chain_stages",false)}
 id,err:=compactNewID();if err!=nil{return nil,err}
 return c.sendCompact(ctx,"/v1/fast/chains","C",id,map[string]any{"stages":stages})
}

// PutContext signs P with this SDK's Ed25519 identity, not a relay-supplied signer.
func (c *Client) PutContext(ctx context.Context,blocks []map[string]any,readers []string,metadata map[string]any)(map[string]any,error){
 if len(blocks)==0{return nil,NewError(InvalidArgument,"context_blocks_required",false)}
 if readers==nil{readers=[]string{}};if metadata==nil{metadata=map[string]any{}}
 id,err:=compactNewID();if err!=nil{return nil,err}
 r,err:=c.sendCompact(ctx,"/v1/contexts","P",id,map[string]any{"blocks":blocks,"readers":readers,"metadata":metadata})
 if err!=nil{return nil,err}
 if r["ok"]!=true||r["cid"]==nil{return nil,NewError(InvalidResponse,"invalid context PUT receipt",false)}
 return r,nil
}

// DeltaContext creates immutable successor CID; caller owns commit/retry policy.
func (c *Client) DeltaContext(ctx context.Context,baseCID string,ops []map[string]any,readers []string,metadata map[string]any)(map[string]any,error){
 if strings.TrimSpace(baseCID)==""||len(ops)==0{return nil,NewError(InvalidArgument,"invalid context delta",false)}
 if readers==nil{readers=[]string{}};if metadata==nil{metadata=map[string]any{}}
 id,err:=compactNewID();if err!=nil{return nil,err}
 r,err:=c.sendCompact(ctx,"/v1/contexts/"+url.PathEscape(baseCID)+"/delta","D",id,
    map[string]any{"baseCid":baseCID,"ops":ops,"readers":readers,"metadata":metadata})
 if err!=nil{return nil,err}
 if r["ok"]!=true||r["baseCid"]!=baseCID||r["cid"]==nil{return nil,NewError(InvalidResponse,"invalid context DELTA receipt",false)}
 return r,nil
}
