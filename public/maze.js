(function(root){
  'use strict';
  const COLS=35,ROWS=19,CELL=44,X=66,Y=52;
  function create(index){
    const grid=Array.from({length:ROWS},()=>Array(COLS).fill(0));
    for(const r of [1,3,5,7])for(let y=r;y<ROWS-r;y++)for(let x=r;x<COLS-r;x++)if(x===r||x===COLS-r-1||y===r||y===ROWS-r-1)grid[y][x]=1;
    // Calibrated to the five finished illustrations, not inferred from the
    // generation guides: several painted junctions moved during generation.
    const layouts=[
      {bridges:[[2,29],[14,5],[6,25],[10,9]],cuts:[[17,4],[3,8],[13,20],[7,12]]},
      {bridges:[[2,23],[14,13],[6,17],[10,17]],cuts:[[17,7],[3,11],[13,16],[7,16]]},
      {bridges:[[2,21],[14,13],[6,17],[10,17]],cuts:[[17,7],[3,11],[13,16],[7,16]]},
      {bridges:[[2,21],[14,13],[6,17],[10,17]],cuts:[[17,8],[3,11],[13,16],[7,16]]},
      {bridges:[[2,21],[14,13],[6,17],[10,17]],cuts:[[17,7],[17,8],[3,11],[13,16],[7,16]]}
    ];
    const {bridges,cuts}=layouts[index];
    bridges.forEach(([y,x])=>grid[y][x]=1);
    for(let x=9;x<=25;x++)grid[9][x]=1;
    grid[18][17]=1;grid[9][34]=1;
    // One break in each ring turns it into a winding passage, while both
    // junctions and the five discoveries remain in its connected component.
    cuts.forEach(([y,x])=>grid[y][x]=0);
    const itemCells=[[1,5+index*2],[31,15-index],[7+index*2,5],[27,11],[25,9]];
    const point=([x,y])=>({x:X+(x+.5)*CELL,y:Y+(y+.5)*CELL});
    const items=itemCells.map(point),exit=point([34,9]),entry={x:X+17.5*CELL,y:919};
    const mask=root.AdventureMazeMasks?.[['forest','castle','beach','valley','sea'][index]];
    return{cols:COLS,rows:ROWS,cell:CELL,x:X,y:Y,grid,rings:4,items,exit,entry,painted:true,mask};
  }
  function walkable(m,x,y){
    const open=(px,py)=>{if(m.mask){const x=Math.floor(px/m.mask.step),row=m.mask.rows[Math.floor(py/m.mask.step)];if(!row||x<0||x>=m.mask.width)return false;for(let i=0;i<row.length;i+=2)if(x>=row[i]&&x<=row[i+1])return true;return false;}const col=Math.floor((px-m.x)/m.cell),row=Math.floor((py-m.y)/m.cell);if(row>=m.rows&&py<=941&&col===17)return true;return!!m.grid[row]?.[col];};
    // Small foot radius keeps the rabbit off painted roots and wall edges.
    return open(x,y)&&open(x-4,y)&&open(x+4,y)&&open(x,y-4)&&open(x,y+4);
  }
  function clearLine(m,a,b){
    if(!m.mask)return false;
    const s=m.mask.step,dx=b.x-a.x,dy=b.y-a.y,sx=Math.sign(dx),sy=Math.sign(dy);
    let x=Math.floor(a.x/s),y=Math.floor(a.y/s),endX=Math.floor(b.x/s),endY=Math.floor(b.y/s);
    const safe=(x,y)=>walkable(m,(x+.5)*s,(y+.5)*s),tx=dx?s/Math.abs(dx):Infinity,ty=dy?s/Math.abs(dy):Infinity;
    let nx=dx?((x+(sx>0?1:0))*s-a.x)/dx:Infinity,ny=dy?((y+(sy>0?1:0))*s-a.y)/dy:Infinity;
    // Visit every crossed mask cell, including both neighbours at a corner.
    // Fixed-distance samples could miss a 2 px corner that actual motion hit.
    for(let i=0;i<m.mask.width+m.mask.height+4;i++){
      if(!safe(x,y))return false;if(x===endX&&y===endY)return true;
      if(Math.min(nx,ny)>=1-1e-10)return walkable(m,b.x,b.y);
      if(Math.abs(nx-ny)<1e-10){if(!safe(x+sx,y)||!safe(x,y+sy))return false;x+=sx;y+=sy;nx+=tx;ny+=ty;}
      else if(nx<ny){x+=sx;nx+=tx;}else{y+=sy;ny+=ty;}
    }return false;
  }
  root.AdventureMaze={create,walkable,clearLine};if(typeof module!=='undefined')module.exports=root.AdventureMaze;
})(typeof window!=='undefined'?window:globalThis);
