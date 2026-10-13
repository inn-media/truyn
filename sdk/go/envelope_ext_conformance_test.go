package truyn
import("testing";"os";"encoding/json";"fmt";"crypto/sha256";"time")
func TestWireFreezeExtConformance(t *testing.T) {
  load:=func(name string)[]map[string]any {data,err:=os.ReadFile("../conformance/v1/"+name);if err!=nil{t.Fatal(err)};var corpus struct{Cases []map[string]any `json:"cases"`};if err=json.Unmarshal(data,&corpus);err!=nil{t.Fatal(err)};return corpus.Cases}
  results:=map[string]any{}
  for _,c:=range load("protocol-envelope-golden-fixtures.json") {env:=c["envelope"].(map[string]any);ok,reason:=VerifyEnvelope(env);unsigned:=map[string]any{};for k,v:=range env{if k!="signature"{unsigned[k]=v}};bytes,err:=canonicalJSON(unsigned);if err!=nil{t.Fatal(err)};result:=map[string]any{"ok":ok,"canonicalUnsignedSha256":fmt.Sprintf("%x",sha256.Sum256(bytes))};if !ok{result["reason"]=reason};results[c["id"].(string)]=result}
  for _,c:=range load("envelope-ext-fixtures.json") {semantics:=[]string{};for _,s:=range c["negotiatedSemantics"].([]any){semantics=append(semantics,s.(string))};result:=VerifyEnvelopeWithOptions(c["envelope"].(map[string]any),EnvelopeOptions{NegotiatedSemantics:semantics,Now:time.UnixMilli(int64(c["now"].(float64)))});results[c["id"].(string)]=result}
  identity,err:=CreateLocalIdentity();if err!=nil{t.Fatal(err)}
  payload:=map[string]any{"input":map[string]any{"query":"Bakı 🚀","topK":42,"threshold":0.5}};ext:=map[string]any{"priority":"normal"}
  _,blocked:=identity.EnvelopeWithExt("NEED",payload,nil,ext,EnvelopeOptions{})
  emitted,err:=identity.EnvelopeWithExt("NEED",payload,nil,ext,EnvelopeOptions{NegotiatedSemantics:[]string{EnvelopeExtSemantic}});if err!=nil{t.Fatal(err)}
  data,err:=json.Marshal(map[string]any{"language":"go","results":results,"emitted":emitted,"emissionBlocked":blocked!=nil});if err!=nil{t.Fatal(err)};fmt.Println("WIRE_FREEZE_RESULT "+string(data))
}
