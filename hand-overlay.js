/* Illustrative joint segments, interpolated from detected optical landmarks. */
const bones=[[0,1],[1,2],[2,3],[3,4],[0,5],[0,9],[0,13],[0,17],[5,6],[6,7],[7,8],[9,10],[10,11],[11,12],[13,14],[14,15],[15,16],[17,18],[18,19],[19,20]];
export function paintHands(ctx,points,w,h,dpr,opacity){
  const cv=ctx.canvas, pw=Math.max(1,Math.round(w*dpr)),ph=Math.max(1,Math.round(h*dpr));
  if(cv.width!==pw||cv.height!==ph){cv.width=pw;cv.height=ph}
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
  if(!points?.length||!opacity)return;
  ctx.save();ctx.globalAlpha=Math.min(.94,opacity);
  for(const hand of points){
    if(hand.length!==21)continue;
    const p=hand.map(v=>[v[0]*w,v[1]*h]);
    const palm=Math.hypot(p[9][0]-p[0][0],p[9][1]-p[0][1]);if(palm<4)continue;
    for(const [a,b] of bones){
      const dx=p[b][0]-p[a][0],dy=p[b][1]-p[a][1],r=Math.hypot(dx,dy);if(r<2)continue;
      const thick=Math.max(1.5, Math.min(16,Math.min(r*.2,palm*(a===0?.069:.053))));
      const ux=dx/r,uy=dy/r;
      ctx.save();ctx.transform(ux,uy,-uy,ux,p[a][0],p[a][1]);
      let g=ctx.createLinearGradient(0,-thick,0,thick);g.addColorStop(0,'#9e8266');g.addColorStop(.3,'#fff1d6');g.addColorStop(.6,'#d6cab2');g.addColorStop(1,'#685e55');ctx.fillStyle=g;
      ctx.beginPath();ctx.moveTo(1,-thick*.86);
      ctx.bezierCurveTo(r*.22,-thick*1.35,r*.19,-thick*.48,r*.53,-thick*.55);
      ctx.bezierCurveTo(r*.85,-thick*.5,r*.83,-thick*1.3,r-1,-thick*.9);
      ctx.quadraticCurveTo(r+1,0,r-1,thick*.9);
      ctx.bezierCurveTo(r*.8,thick*1.2,r*.81,thick*.49,r*.52,thick*.52);
      ctx.bezierCurveTo(r*.23,thick*.47,r*.17,thick*1.3,1,thick*.86);ctx.quadraticCurveTo(-1,0,1,-thick*.86);
      ctx.fill();ctx.restore();
    }
  }
  ctx.restore();
}
