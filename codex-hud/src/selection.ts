import {displayWidth,sanitize} from './terminal-text.js';
interface Point {x:number;y:number}
/** Only the already visible HUD frame is retained while selecting. */
export class HudSelection {
 private lines:string[]=[];private width=1;private height=1;private anchor?:Point;private end?:Point;private dragged=false;private buffer='';
 get active():boolean{return !!this.anchor;}
 frame(lines:string[],width:number,height:number):void {
  if(width!==this.width||height!==this.height)this.clear();
  this.width=width;this.height=height;if(!this.active)this.lines=lines.map(sanitize);
 }
 clear():void{this.anchor=undefined;this.end=undefined;this.dragged=false;}
 feed(value:Buffer|string):boolean {
  this.buffer+=value.toString();let changed=false,match:RegExpExecArray|null;
  const event=/\x1b\[<(\d+);(\d+);(\d+)([Mm])/;
  while((match=event.exec(this.buffer))){
   this.buffer=this.buffer.slice(match.index+match[0].length);const button=Number(match[1]);if(button&64||((button&3)!==0&&!(match[4]==='m'&&(button&3)===3)))continue;
   const p={x:Math.max(0,Math.min(this.width-1,Number(match[2])-1)),y:Math.max(0,Math.min(this.height-1,Number(match[3])-1))};
   if(match[4]==='m'){if(this.anchor){this.end=p;this.dragged=this.dragged||p.x!==this.anchor.x||p.y!==this.anchor.y;if(!this.dragged)this.clear();}changed=true;}
   else if(button&32){if(this.anchor){this.end=p;this.dragged=this.dragged||p.x!==this.anchor.x||p.y!==this.anchor.y;changed=true;}}
   else{this.clear();this.anchor=p;this.end=p;changed=true;}
  }
  const partial=this.buffer.lastIndexOf('\x1b'),suffix=partial>=0?this.buffer.slice(partial):'';
  this.buffer=suffix.length<=64&&('\x1b[<'.startsWith(suffix)||/^\x1b\[<\d*(?:;\d*){0,2}$/.test(suffix))?suffix:'';
  return changed;
 }
 private bounds():[Point,Point]|undefined {
  if(!this.anchor||!this.end||!this.dragged)return;
  return this.anchor.y<this.end.y||this.anchor.y===this.end.y&&this.anchor.x<=this.end.x?[this.anchor,this.end]:[this.end,this.anchor];
 }
 private row(index:number,paint:boolean):string {
  const range=this.bounds(),line=this.lines[index]??'';let column=0,result='',highlight=false;
  for(const item of new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(line)){
   const glyph=item.segment,w=displayWidth(glyph),selected=!!range&&index>=range[0].y&&index<=range[1].y&&column+w>(index===range[0].y?range[0].x:0)&&column<=(index===range[1].y?range[1].x:this.width-1);
   if(paint){if(selected!==highlight){result+=selected?'\x1b[7m':'\x1b[27m';highlight=selected;}result+=glyph;}else if(selected)result+=glyph;
   column+=w;
  }
  return result+(paint&&highlight?'\x1b[27m':'');
 }
 text():string{const b=this.bounds();return b?Array.from({length:b[1].y-b[0].y+1},(_,i)=>this.row(b[0].y+i,false).trimEnd()).join('\n'):'';}
 paint():string[]{return this.lines.map((_,i)=>this.row(i,true));}
}
