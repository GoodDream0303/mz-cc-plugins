import {PassThrough} from 'node:stream';
import {emitKeypressEvents} from 'node:readline';
interface Key {name?:string;ctrl?:boolean;sequence?:string}
/** Decode mouse and keyboard input in wire order, including split SGR reports. */
export class HudInput {
 private keyboard=new PassThrough();private buffer='';private escapeTimer?:ReturnType<typeof setTimeout>;
 constructor(private mouse:(data:string)=>void,private key:(value:unknown,key:Key)=>void){
  emitKeypressEvents(this.keyboard);this.keyboard.on('keypress',key);
 }
 feed(value:Buffer|string):void {
  for(const char of value.toString()){
   if(this.escapeTimer){clearTimeout(this.escapeTimer);this.escapeTimer=undefined;}
   if(this.buffer==='\x1b'&&char==='\x1b'){this.buffer='';this.key(undefined,{name:'escape'});}
   if(!this.buffer&&char!=='\x1b'){this.keyboard.write(char);continue;}
   this.buffer+=char;
   if(/^\x1b\[<\d+;\d+;\d+[Mm]$/.test(this.buffer)){const event=this.buffer;this.buffer='';this.mouse(event);continue;}
   if(this.buffer.length<=64&&('\x1b[<'.startsWith(this.buffer)||/^\x1b\[<\d*(?:;\d*){0,2}$/.test(this.buffer))){
    // Only a bare Escape is ambiguous with a key. Once CSI has begun, retain
    // the prefix without letting readline interpret it as a standalone Escape.
    if(this.buffer==='\x1b'){this.escapeTimer=setTimeout(()=>{this.buffer='';this.escapeTimer=undefined;this.key(undefined,{name:'escape'});},500);this.escapeTimer.unref();}
    continue;
   }
   this.keyboard.write(this.buffer);this.buffer='';
  }
 }
 close():void{if(this.escapeTimer)clearTimeout(this.escapeTimer);this.buffer='';this.keyboard.destroy();}
}
