// Gestures and procedural artwork are original to this studio. No effect images or video.
export const effects={
  plasma:{name:'Solar bloom',gesture:'Open palm',color:'#ffad67'},
  prism:{name:'Glacier crown',gesture:'Closed fist',color:'#a4d7ff'},
  tide:{name:'Tidal silk',gesture:'Pinch',color:'#72e7d2'},
  arc:{name:'Arc bridge',gesture:'Two open palms',color:'#cbb0ff'},
  nova:{name:'Stellar breath',gesture:'Open mouth',color:'#ffc286'}
};
const tau=Math.PI*2,clamp=(n,a,b)=>Math.min(b,Math.max(a,n)),mix=(a,b,f)=>a+(b-a)*f;
const point=p=>Array.isArray(p)&&p.length>=2&&p.every(Number.isFinite);
export function gestureOf(h,aspect=1){
  if(h?.length!==21||!h.every(point))return null;
  const dist=(a,b)=>Math.hypot((h[a][0]-h[b][0])*aspect,h[a][1]-h[b][1]);
  const palm=dist(0,9);if(palm<.012)return null;
  let open=0,folded=0;
  for(const [base,joint,tip] of [[5,6,8],[9,10,12],[13,14,16],[17,18,20]]){
    const ratio=dist(0,tip)/Math.max(.001,dist(0,joint));
    if(ratio>1.14&&dist(base,tip)>palm*.5)open++;
    else if(ratio<1.05)folded++;
  }
  const center=[0,5,9,13,17].reduce(([x,y],i)=>[x+h[i][0]/5,y+h[i][1]/5],[0,0]);
  const pinch=dist(4,8)/palm;
  const type=folded>=4?'prism':pinch<.34?'tide':open>=3?'plasma':null;
  if(!type)return null;
  const [x,y]=type==='tide'?[mix(h[4][0],h[8][0],.5),mix(h[4][1],h[8][1],.5)]:center;
  return {type,x,y,power:clamp(palm*2.5,.4,1)};
}
export function readElements(hands,face,aspect=1){
  const out=(hands||[]).slice(0,2).map(h=>gestureOf(h,aspect)).filter(Boolean);
  if(out.length===2&&out.every(s=>s.type==='plasma')&&Math.hypot((out[0].x-out[1].x)*aspect,out[0].y-out[1].y)>.14){
    out.splice(0,2,{...out[0],type:'arc',target:[out[1].x,out[1].y]});
  }
  if(face?.jaw>.43&&point(face.mouth))out.push({type:'nova',x:face.mouth[0],y:face.mouth[1],yaw:face.yaw||0,power:clamp(face.jaw,.45,1)});
  return out;
}
export function demoSource(type,pos){
  return [{type,x:pos?.[0]??(type==='arc'?.3:.5),y:pos?.[1]??.55,power:.92,
    ...(type==='arc'?{target:[pos?clamp(1-pos[0],.12,.88):.71,pos?clamp(1-pos[1],.18,.82):.45]}:{})}];
}
const sin=Math.sin, cos=Math.cos;
function noise(i){const n=sin(i*195.374+15.61)*21735.57;return n-Math.floor(n)}
function path(c,points,color,w,close=false,fill=false){
  c.beginPath();c.moveTo(...points[0]);for(let i=1;i<points.length;i++)c.lineTo(...points[i]);
  if(close)c.closePath();if(fill){c.fillStyle=color;c.fill()}else{c.lineWidth=w;c.strokeStyle=color;c.stroke()}
}
function dot(c,x,y,r,color){c.fillStyle=color;c.beginPath();c.arc(x,y,r,0,tau);c.fill()}
function glow(c,x,y,r,stops){const g=c.createRadialGradient(x,y,0,x,y,r);for(const [p,v] of stops)g.addColorStop(p,v);c.fillStyle=g;c.fillRect(x-r,y-r,r*2,r*2)}
function solar(c,r,t){
  glow(c,0,0,r*1.55,[[0,'#fff0b475'],[.32,'#ff9a5938'],[.68,'#f055321b'],[1,'#e5463700']]);
  // Parametric magnetic loops surround an incandescent core.
  for(let j=0;j<28;j++){
    let a=j*tau/28+sin(j)*.08+t*.095, len=r*(.53+noise(j)*.5), wide=r*(.07+.14*noise(j+11));
    let p=[];for(let k=0;k<=32;k++){let u=k/32,v=sin(Math.PI*u),h=len*(.24+v*.8),b=(u-.5)*wide*2+v*v*r*.23*sin(t*.43+j*.7);p.push([cos(a)*h-sin(a)*b,sin(a)*h+cos(a)*b]);}
    path(c,p,j%4===0?'#ffe6aab8':j%2?'#ff865f9e':'#e74b4670',j%4===0?1.6:1);
  }
  glow(c,0,0,r*.47,[[0,'#fff2c7'],[.18,'#ffcf85'],[.43,'#ff9356db'],[.66,'#ff614480'],[1,'#eb543300']]);
  for(let j=0;j<40;j++){let a=j*2.4, u=(noise(j+35)+t*.105)%1, d=r*(.44+.78*u);dot(c,cos(a+u*.16)*d,sin(a+u*.16)*d,r*(.004+.009*(1-u)),`rgba(255,193,131,${1-u})`)}
}
function crown(c,r,t){
  glow(c,0,0,r*1.22,[[0,'#92d9ff6e'],[.52,'#5b9af333'],[1,'#3553b600']]);
  for(let j=0;j<19;j++){
    let a=j*2.39996+t*.025, len=r*(.45+.62*noise(j+7)),wide=r*(.045+.11*noise(j+16)),bx=cos(a)*r*.09,by=sin(a)*r*.09;
    const P=(x,y)=>[bx+x*cos(a)-y*sin(a),by+x*sin(a)+y*cos(a)];
    const tip=P(len,0),root=P(-.07*r,0),p=P(len*.48,wide),q=P(len*.62,-wide*.75);
    path(c,[root,p,tip],j%2?'#759ce88f':'#76bee9ac',0,true,true);path(c,[root,q,tip],'#bbf4ff6e',0,true,true);
    path(c,[root,p,tip,q,root],'#9cdfffbd',1.15);path(c,[root,tip],'#e2fbffdf',1);
  }
}
function silk(c,r,t){
  glow(c,0,0,r*1.45,[[0,'#5ae2c459'],[.56,'#37b9be1f'],[1,'#128fb300']]);
  for(let j=0;j<36;j++){
    const p=[],s=j/35;
    for(let k=0;k<=64;k++){let u=k/64,a=u*tau*1.1+t*.22+s*.72,rad=r*(.68+.2*sin(2*a+t*.32));p.push([cos(a)*rad+sin(a*2+t*.22)*r*.32,(sin(a*2)*.37+cos(a)*.30+(s-.5)*.44*sin(a)) *r]);}
    path(c,p,j%7===0?'#c3fff2bf':j%3===0?'#88edfa84':'#3decc86b',r*(j%7===0?.012:.007)+.32)
  }
  for(let j=0;j<18;j++){let a=t*.5+j*2.4;dot(c,cos(a)*r*(.8+.45*noise(j)),sin(a)*r*.55,1.1,'#c5fff0b0')}
}
function bridge(c,r,t,dx,dy){
  for(let j=0;j<5;j++){let p=[];for(let k=0;k<=38;k++){let u=k/38,w=sin(u*Math.PI),v=(sin(k*1.42+t*1.66+j)*.31+sin(k*.65+t+j)*.52+sin(u*tau+j)*.65)*r*.31*w;let len=Math.max(1,Math.hypot(dx,dy));p.push([u*dx-dy/len*v,u*dy+dx/len*v]);}
    path(c,p,'#9f69ff28',j===0?12:6);path(c,p,j===0?'#efe7ff':'#be99ffb0',j===0?2.4:1);}
  for(const [x,y] of [[0,0],[dx,dy]])glow(c,x,y,r*.50,[[0,'#fff6ff'],[.1,'#d6b4ff'],[.35,'#be91ff79'],[1,'#765ac300']]);
}
function breath(c,r,t,yaw){
  let sign=yaw<0?-1:1;c.scale(sign,1); c.rotate(-.26);
  for(let j=0;j<38;j++){let u=(noise(j)+t*.23)%1, dx=r*2.0*u,dy=(sin(noise(j+11)*tau+u*3)*u*.46-sin(u*Math.PI)*.17)*r;
    let s=r*(.026+.09*sin(Math.PI*u));glow(c,dx,dy,s*2,[[0,`rgba(255,235,172,${.9*(1-u)})`],[.48,`rgba(254,134,85,${.58*(1-u)})`],[1,'#fc592d00']]);}
}
export function paintElements(c,{width:w,height:h,dpr=1,time=0,sources=[],reduced=false}){
  if(!c||w<=0||h<=0)return;
  dpr=clamp(dpr,1,1.65);const W=Math.round(w*dpr),H=Math.round(h*dpr);
  if(c.canvas.width!==W||c.canvas.height!==H){c.canvas.width=W;c.canvas.height=H}
  c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,w,h);let t=reduced?2.3:time*.001;
  c.save();c.lineCap='round';c.lineJoin='round';c.globalCompositeOperation='screen';
  for(const s of sources.slice(0,3)){
    if(!effects[s.type]||!Number.isFinite(s.x+s.y))continue;
    c.save();c.translate(s.x*w,s.y*h);let r=Math.min(w,h)*(.12+.14*(s.power??.7));
    if(s.type==='plasma')solar(c,r,t);else if(s.type==='prism')crown(c,r,t);else if(s.type==='tide')silk(c,r,t);
    else if(s.type==='arc'&&point(s.target))bridge(c,r,t,(s.target[0]-s.x)*w,(s.target[1]-s.y)*h);else if(s.type==='nova')breath(c,r,t,s.yaw||0);c.restore();
  }
  c.restore();
}
