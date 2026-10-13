package truyn

import (
    "encoding/base64"
    "errors"
    "crypto/ed25519"
    "regexp"
    "strings"
    "time"
)

const EnvelopeExtSemantic = "truyn.envelope.ext/1"
type EnvelopeOptions struct { NegotiatedSemantics []string; Now time.Time }
type EnvelopeCheck struct { OK bool `json:"ok"`; Reason string `json:"reason,omitempty"`; Detail string `json:"detail,omitempty"` }
var extName = regexp.MustCompile(`^[A-Za-z][A-Za-z0-9]{0,31}$`)
var extValue = regexp.MustCompile(`^[A-Za-z0-9._:;=/+\-]{1,128}$`)
var extTrace = regexp.MustCompile(`^[0-9a-f]{32}$`)
var extTime = regexp.MustCompile(`^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$`)
var extContent = regexp.MustCompile(`^application/json(;profile=[a-z0-9][a-z0-9._/\-]{0,95})?$`)
func extEnabled(options EnvelopeOptions) bool { for _, s := range options.NegotiatedSemantics { if s == EnvelopeExtSemantic { return true } }; return false }
func extFail(reason, detail string) EnvelopeCheck { return EnvelopeCheck{Reason:reason, Detail:detail} }
// VerifyEnvelopeWithOptions uses the same native signature verifier as live polling.
// NegotiatedSemantics must come from the authenticated peer agreement, never the envelope.
func VerifyEnvelopeWithOptions(envelope map[string]any, options EnvelopeOptions) EnvelopeCheck {
    ok, reason := VerifyEnvelope(envelope); if !ok { return EnvelopeCheck{Reason:reason} }
    return ValidateEnvelopeExt(envelope, options)
}
func ValidateEnvelopeExt(envelope map[string]any, options EnvelopeOptions) EnvelopeCheck {
    raw, present := envelope["ext"]
    if !present || !extEnabled(options) { return EnvelopeCheck{OK:true} }
    ext, ok := raw.(map[string]any)
    if !ok || ext == nil || len(ext)>16 { return extFail("invalid_argument","invalid_ext") }
    crit := []string{}
    for key, value := range ext {
        if !extName.MatchString(key) { return extFail("invalid_argument","invalid_ext") }
        if key == "crit" {
            items, ok := value.([]any)
            if typed, is := value.([]string); is { items = make([]any,len(typed)); for i,v := range typed { items[i]=v }; ok=true }
            if !ok || len(items)>16 { return extFail("invalid_argument","invalid_ext:crit") }
            seen := map[string]bool{}
            for _, item := range items {
                k, ok := item.(string); _, exists := ext[k]
                if !ok || !extName.MatchString(k) || k=="crit" || !exists || seen[k] { return extFail("invalid_argument","invalid_ext:crit") }
                seen[k]=true; crit=append(crit,k)
            }
        } else { v,ok := value.(string); if !ok || !extValue.MatchString(v) { return extFail("invalid_argument","invalid_ext:"+key) } }
    }
    data,err:=canonicalJSON(ext); if err!=nil || len(data)>1024 { return extFail("invalid_argument","invalid_ext") }
    if v,has:=ext["traceId"]; has { s:=v.(string); if !extTrace.MatchString(s)||s==strings.Repeat("0",32) { return extFail("invalid_argument","invalid_ext:traceId") } }
    var expires time.Time
    if v,has:=ext["expiresAt"]; has {
        s:=v.(string); var err error; expires,err=time.Parse("2006-01-02T15:04:05.000Z",s)
        created,ce:=time.Parse(time.RFC3339Nano,fmtString(envelope["createdAt"]))
        if !extTime.MatchString(s)||err!=nil||ce!=nil||!expires.After(created) { return extFail("invalid_argument","invalid_ext:expiresAt") }
    }
    if v,has:=ext["priority"]; has && v!="normal" && v!="background" && v!="critical" { return extFail("invalid_argument","invalid_ext:priority") }
    if v,has:=ext["contentType"]; has && !extContent.MatchString(v.(string)) { return extFail("invalid_argument","invalid_ext:contentType") }
    known:=map[string]bool{"traceId":true,"expiresAt":true,"priority":true,"contentType":true,"crit":true}
    for _,k:=range crit { if !known[k] { return extFail("version_mismatch","required_semantic_unavailable:"+k) } }
    now:=options.Now; if now.IsZero() { now=time.Now() }
    if !expires.IsZero() && now.After(expires.Add(30*time.Second)) { return extFail("deadline_exceeded","envelope_expired") }
    if v,has:=ext["contentType"]; has && v!="application/json" && v!="application/json;profile=truyn."+strings.ToLower(fmtString(envelope["type"]))+"/1" { return extFail("unimplemented","unsupported_content_type") }
    return EnvelopeCheck{OK:true}
}
func fmtString(v any) string { s,_:=v.(string); return s }
// EnvelopeWithExt emits only after explicit authenticated negotiation.
func (i *LocalIdentity) EnvelopeWithExt(kind string,payload map[string]any,to *string,ext map[string]any,options EnvelopeOptions)(map[string]any,error){
    if !extEnabled(options) { return nil, errors.New("version_mismatch: ext emission requires negotiated support") }
    env,err:=i.envelope(kind,payload,to); if err!=nil{return nil,err}; delete(env,"signature"); env["ext"]=ext
    check:=ValidateEnvelopeExt(env,options);if !check.OK{return nil,errors.New(check.Reason+":"+check.Detail)}
    bytes,err:=canonicalJSON(env);if err!=nil{return nil,err}
    env["signature"]=base64.StdEncoding.EncodeToString(ed25519.Sign(i.privateKey,bytes));return env,nil
}
