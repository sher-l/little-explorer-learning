(function(root){
  'use strict';
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),ease=t=>t*t*(3-2*t);
  class Wildlife {
    constructor({points,pool,valid,line,origin,random=Math.random,count=3}){
      this.points=points;this.pool=pool;this.valid=valid;this.line=line;this.origin=origin;this.random=random;this.serial=0;this.animals=[];
      for(let i=0;i<count;i++){const c=this.spawn(i);if(c)this.animals.push(c);}
    }
    pick(list){return list[Math.floor(this.random()*list.length)];}
    spawn(slot,previous){
      const occupied=this.animals.filter(c=>!c.absent&&c.slot!==slot);
      const separated=this.points.filter(p=>occupied.every(c=>distance(p,c)>145)&&(!previous||distance(p,previous)>150));
      const nearby=slot===0&&!previous&&this.origin?separated.filter(p=>distance(p,this.origin)>105&&distance(p,this.origin)<340):[];
      const fallback=this.points.filter(p=>occupied.every(c=>distance(p,c)>80)&&(!previous||distance(p,previous)>150));
      const point=this.pick(nearby.length?nearby:separated.length?separated:fallback);
      if(!point)return null;
      return{...point,slot,instance:++this.serial,species:this.pick(this.pool),from:{...point},to:{...point},phase:0,duration:1,wait:this.random()*1.8,absent:false,respawn:0};
    }
    chooseDestination(c){
      const candidates=this.points.filter(p=>distance(p,c)>45&&distance(p,c)<210&&this.line(c,p));
      const to=this.pick(candidates);if(!to){c.wait=.8;return;}
      c.from={x:c.x,y:c.y};c.to={...to};c.phase=0;c.duration=Math.max(3.2,distance(c,to)/(15+this.random()*7));c.wait=0;
    }
    update(dt,animate=true){
      for(let i=0;i<this.animals.length;i++){
        const c=this.animals[i];
        if(c.absent){c.respawn-=dt;if(c.respawn<=0){const next=this.spawn(c.slot,c);if(next)this.animals[i]=next;else c.respawn=2;}continue;}
        if(!animate)continue;
        if(c.wait>0){c.wait-=dt;if(c.wait<=0)this.chooseDestination(c);continue;}
        c.phase=Math.min(1,c.phase+dt/c.duration);const t=ease(c.phase),x=c.from.x+(c.to.x-c.from.x)*t,y=c.from.y+(c.to.y-c.from.y)*t;
        if(this.valid(x,y)){c.x=x;c.y=y;}else{c.phase=1;}
        if(c.phase===1)c.wait=.5+this.random()*1.6;
      }
    }
    visible(){return this.animals.filter(c=>!c.absent).map(c=>({instance:c.instance,species:c.species,x:c.x,y:c.y-40,foot:{x:c.x,y:c.y},heading:c.to.x-c.from.x}));}
    capture(instance){const c=this.animals.find(c=>c.instance===instance&&!c.absent);if(!c)return false;c.absent=true;c.respawn=16+this.random()*8;return true;}
  }
  if(typeof module!=='undefined')module.exports={Wildlife};else root.AdventureWildlife=Wildlife;
})(typeof window!=='undefined'?window:globalThis);
