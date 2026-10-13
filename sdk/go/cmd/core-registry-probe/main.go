package main
import("fmt";"os";"strings";truyn "github.com/inn-media/truyn/sdk/go")
func main(){
 for _,code:=range os.Args[1:]{
  e,ok:=truyn.LookupCoreCode(code);if !ok {fmt.Println(code+"|UNKNOWN");continue}
  _,err:=truyn.RequireExecutableCoreCode(code)
  fmt.Println(strings.Join([]string{e.Code,e.Short,e.Name,e.ClassName,e.Form,e.Admission,e.Wire,fmt.Sprint(err==nil)},"|"))
 }
}
