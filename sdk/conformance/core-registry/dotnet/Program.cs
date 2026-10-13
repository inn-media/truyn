using Truyn.Sdk;
foreach(var code in args)
{
    var e=CoreRegistry.Lookup(code);
    if(e is null){Console.WriteLine(code+"|UNKNOWN");continue;}
    bool allowed;
    try{CoreRegistry.RequireExecutable(code);allowed=true;}catch(InvalidOperationException){allowed=false;}
    Console.WriteLine(string.Join("|",e.Code,e.ShortAlias,e.Name,e.ClassName,e.Form,e.Admission,e.Wire,allowed?"true":"false"));
}
