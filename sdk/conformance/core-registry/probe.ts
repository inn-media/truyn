import {lookupCoreCode,requireExecutableCoreCode} from '../../typescript/src/core-registry.ts';
for(const code of process.argv.slice(2)){
 const e=lookupCoreCode(code);if(!e){console.log(code+'|UNKNOWN');continue;}
 let allowed=false;try{allowed=requireExecutableCoreCode(code).code===code;}catch{}
 console.log([e.code,e.short??'',e.name,e.className,e.form,e.admission,e.wire,String(allowed)].join('|'));
}
