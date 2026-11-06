(function(root){
  'use strict';
  const qa=new URLSearchParams(location.search).get('qa'),key=qa?'forest.adventure.qa.'+qa+'.weather':(root.AdventureRuntime?.storagePrefix||'forest.adventure.')+'weather.v1',modes=['auto','clear','breeze','dusk','off'],labels={auto:'每次不同',clear:'暖阳',breeze:'轻风云影',dusk:'暮色',off:'关闭'};
  let mode='auto';
  const session=['clear','breeze','dusk'][Math.floor(Math.random()*3)];
  root.AdventureAtmosphere={get mode(){return mode;},get label(){return labels[mode]+(mode==='auto'?' · '+labels[session]:'');},cycle(){mode=modes[(modes.indexOf(mode)+1)%modes.length];try{localStorage.setItem(key,mode);}catch{}return mode;},draw(ctx,w,h,time,region,reduced){const active=mode==='auto'?session:mode;if(active==='off')return;ctx.save();if(active==='dusk'){ctx.fillStyle=region==='sea'?'#36579818':'#aa684016';ctx.fillRect(0,0,w,h);}else if(active==='clear'){const g=ctx.createLinearGradient(0,0,w*.7,h);g.addColorStop(0,region==='sea'?'#c5ffff16':'#fff0ae1c');g.addColorStop(1,'#fff0ae00');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);}else{const phase=reduced?0:time*6;for(let i=0;i<3;i++){const x=((i*w*.54+phase)%(w*1.7))-w*.3,y=h*(.15+i*.26),g=ctx.createRadialGradient(x,y,0,x,y,w*.4);g.addColorStop(0,'#263a4a12');g.addColorStop(1,'#263a4a00');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);}}ctx.restore();}};
})(window);
