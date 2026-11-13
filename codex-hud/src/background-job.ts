type Completion<T>={value:T}|{error:unknown};

/** Latest owned work; cancellation invalidates results even if the OS call completes. */
export class BackgroundJob<T> {
 private generation=0;private key?:string;private controller?:AbortController;
 private completion?:{key:string;result:Completion<T>};
 constructor(private readonly wake:()=>void){}
 get busy():boolean{return this.controller!==undefined;}
 start(key:string,operation:(signal:AbortSignal)=>Promise<T>):boolean {
  if(this.busy&&this.key===key)return false;
  this.cancel();const generation=this.generation,controller=new AbortController();this.controller=controller;this.key=key;
  const finish=(result:Completion<T>)=>{
   if(generation!==this.generation)return;
   this.controller=undefined;this.completion={key,result};this.wake();
  };
  Promise.resolve().then(()=>{
   if(controller.signal.aborted)throw Object.assign(new Error('Background work cancelled'),{name:'AbortError'});
   return operation(controller.signal);
  }).then(value=>finish({value}),error=>finish({error}));
  return true;
 }
 take(key:string):Completion<T>|undefined {
  if(this.completion?.key!==key)return;
  const result=this.completion.result;this.completion=undefined;return result;
 }
 cancel():void {
  this.generation++;this.controller?.abort();this.controller=undefined;this.key=undefined;this.completion=undefined;
 }
}
