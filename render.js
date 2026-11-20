// Original browser renderer. Skull geometry credits are in atlas/credits.html.
const vert=`#version 300 es
precision highp float;
layout(location=0) in vec3 aP;
layout(location=1) in vec3 aN;
uniform mat3 uRot;
uniform vec2 uScale,uCenter;
uniform float uJaw;
out vec3 vP,vN,vR;
void main(){
  vec3 p=aP,n=aN;
  vec3 pivot=vec3(0.0,-.245,-.020);
  float c=cos(uJaw),s=sin(uJaw);
  mat3 j=mat3(1.,0.,0.,0.,c,s,0.,-s,c);
  vec3 r=uRot*(j*(p-pivot)+pivot);
  float w=1.-r.z*.11;
  gl_Position=vec4(r.xy*uScale+uCenter*w,-r.z*.34,w);
  vR=r;vP=p;vN=uRot*j*n;
}`;
const frag=`#version 300 es
precision highp float;
in vec3 vP,vN,vR;
uniform vec3 uColor;
uniform float uAlpha,uCut,uType;
out vec4 outputColor;
float hash(vec3 p){p=fract(p*.3183099+vec3(.1,.2,.3));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
}
void main(){
  // Expose one hemisphere from the top down.
  float plane=vP.x+vP.y*.34+vP.z*.13;
  if(uCut<9.&&plane>uCut)discard;
  vec3 N=normalize(vN),V=normalize(vec3(0.,0.,5.)-vR);
  if(dot(N,V)<0.)N=-N;
  vec3 K=normalize(vec3(-.58,.90,1.05));
  vec3 F=normalize(vec3(.95,.10,.2));
  vec3 R=normalize(vec3(.65,.75,-.72));
  float key=max(dot(N,K),0.),fill=max(dot(N,F),0.),rim=max(dot(N,R),0.);
  float face=clamp(dot(N,V),0.,1.);
  float g=noise(vP*50.)*.50+noise(vP*126.)*.30+noise(vP*9.)*.20;
  float diffuse=.17+.72*pow(key,1.23)+.16*fill;
  float sheen=pow(max(dot(N,normalize(K+V)),0.),uType==1.?28.:57.);
  float edge=pow(1.-face,2.4);
  vec3 col=uColor*diffuse*(.74+g*.34)+vec3(.38,.50,.69)*rim*(.20+edge*.42)+sheen*.13;
  if(uType==0.){
    col*=.73+.27*smoothstep(-.57,.52,vP.y);
    col+=vec3(.06,.052,.038)*noise(vP*22.);
  }
  if(uType==1.)col+=vec3(.09,.030,.027)*sheen;
  if(uType==2.){
    float fib=sin(vP.x*245.+vP.z*85.+sin(vP.y*23.)*2.)*.5+.5;
    col*=.82+.18*fib;
  }
  if(uCut<9.)col+=vec3(.12,.47,.63)*(.87*exp(-abs(plane-uCut)*208.));
  outputColor=vec4(col,uAlpha);
}`;

const mix=(a,b,t)=>a+(b-a)*t;
const unit=([x,y,z])=>{const l=Math.hypot(x,y,z)||1;return [x/l,y/l,z/l];};
const minus=(a,b)=>a.map((v,i)=>v-b[i]);
const cross=([a,b,c],[d,e,f])=>[b*f-c*e,c*d-a*f,a*e-b*d];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const bez=(a,b,c,d,t)=>a.map((v,i)=>(1-t)**3*v+3*(1-t)**2*t*b[i]+3*(1-t)*t*t*c[i]+t**3*d[i]);

function surface(fn,nu,nv){
  const a=new Float32Array((nu+1)*(nv+1)*6),ix=new Uint32Array(nu*nv*6);
  let k=0,f=0;
  for(let j=0;j<=nv;j++)for(let i=0;i<=nu;i++){
    const u=i/nu,v=j/nv,p=fn(u,v);
    const n=unit(cross(minus(fn(u+.0004,v),fn(u-.0004,v)),minus(fn(u,v+.0004),fn(u,v-.0004))));
    a.set(p,k);a.set(n,k+3);k+=6;
    if(i<nu&&j<nv){const q=j*(nu+1)+i;
      ix.set([q,q+1,q+nu+1,q+1,q+nu+2,q+nu+1],f);f+=6;}
  }
  return {a,ix};
}
function brain(side) {
  return surface((u,v)=>{
    const t=u*2*Math.PI,p=clamp(v,.001,.999)*Math.PI;
    const X=Math.cos(t)*Math.sin(p),Y=Math.cos(p),Z=Math.sin(t)*Math.sin(p);
    const w1=Math.sin(X*18+Y*8+3*Math.sin(Z*4+X*3)+.6*Math.sin(Y*9));
    const w2=Math.cos(Z*16-Y*12+3*Math.sin(X*6-Y*2)+.8*Math.sin(Z*11));
    const w3=Math.cos(Y*32+Z*9+Math.sin(X*20+Z*10)*.55);
    const pattern=Math.max(Math.abs(w1)*.87,Math.abs(w2)*.78) + .12*w3;
    const folds=.91+.087*(1-Math.exp(-Math.max(0,pattern-.24)*6))-.018*Math.sin(Z*14-Y*8);
    return [side*(.31+.317*X*folds),.372+.511*Y*folds+.063*Z,.011+.831*Z*folds];
  },146,104);
}
function muscleRibbon(a,b,c,d,width,depth,basis){
  return surface((u,v)=>{
    const t=clamp(u,0,1), at=bez(a,b,c,d,t),tan=unit(minus(bez(a,b,c,d,t+.0003),bez(a,b,c,d,t-.0003)));
    const w=unit(cross(tan,basis)), h=unit(cross(tan,w));
    const f=.035+.965*Math.sin(t*Math.PI)**.62, theta=v*2*Math.PI;
    const ribs=1.+.08*Math.cos(theta*10.+t*2.5)*Math.sin(t*Math.PI);
    return at.map((z,i)=>z+w[i]*width*f*ribs*Math.cos(theta)+h[i]*depth*f*ribs*Math.sin(theta));
  },38,40);
}
function muscles(){
  const pieces=[];
  const add=(side,a,b,c,d,w,h,basis=[0,0,1])=>{
    const flip=p=>[p[0]*side,p[1],p[2]];
    pieces.push(muscleRibbon(flip(a),flip(b),flip(c),flip(d),w,h,flip(basis)));
  };
  for(const s of [-1,1]){
    // Temporalis, masseter, zygomaticus, levator and corrugator.
    for(let i=0;i<8;i++){
      const f=i/7;
      add(s,[mix(.48,.66,f),mix(.74,.64,f),mix(.45,-.46,f)],[mix(.65,.74,f),.52,mix(.49,-.44,f)],[.71,.21,mix(.51,-.26,f)],[.52,-.30,.36],.041,.029,[1,0,0]);
    }
    for(let i=0;i<8;i++){
      const f=i/7;
      add(s,[mix(.647,.699,f),mix(-.22,-.14,f),mix(.54,.09,f)],[mix(.709,.732,f),-.35,mix(.46,.03,f)],[mix(.645,.678,f),-.59,mix(.43,.02,f)],[mix(.49,.51,f),mix(-.79,-.65,f),mix(.45,.08,f)],.038,.030,[1,0,0]);
    }
    add(s,[.58,-.244,.601],[.431,-.332,.706],[.33,-.517,.835],[.215,-.65,.918],.075,.041);
    add(s,[.46,-.304,.66],[.395,-.408,.748],[.318,-.559,.837],[.21,-.654,.927],.041,.028);
    add(s,[.148,-.19,.773],[.207,-.341,.839],[.228,-.485,.919],[.153,-.634,.973],.048,.022);
    add(s,[.074,.182,.891],[.177,.226,.89],[.287,.23,.828],[.44,.18,.719],.045,.025);
    for(let i=0;i<4;i++){
      const f=i/3;
      add(s,[mix(.06,.38,f),.58,mix(.78,.706,f)],[mix(.067,.406,f),.47,mix(.845,.75,f)],[mix(.07,.422,f),.34,mix(.894,.788,f)],[mix(.072,.43,f),.265,mix(.89,.769,f)],.036,.022);
    }
  }
  return combine(pieces);
}
function combine(parts){
  const a=new Float32Array(parts.reduce((t,m)=>t+m.a.length,0));
  const ix=new Uint32Array(parts.reduce((t,m)=>t+m.ix.length,0));
  let v=0,p=0;
  for(const m of parts){a.set(m.a,v);for(let i=0;i<m.ix.length;i++)ix[p++]=m.ix[i]+v/6;v+=m.a.length;}
  return {a,ix};
}
function rotation(y,p,r){
 const a=Math.cos(y),b=Math.sin(y),c=Math.cos(p),d=Math.sin(p),e=Math.cos(r),f=Math.sin(r);
 // Rz * Rx * Ry, column major
 return [e*a-f*d*b,f*a+e*d*b,-c*b,-f*c,e*c,d,e*b+f*d*a,f*b-e*d*a,c*a];
}
const asset=(name)=>new URL(`./atlas/${name}.xrm`,import.meta.url);
const colors={skull:[.86,.773,.643],teeth:[.97,.911,.765],brain:[.74,.338,.398],muscle:[.73,.21,.215]};
export function createRenderer(canvas){
  const gl=canvas.getContext('webgl2',{alpha:true,antialias:true,depth:true,premultipliedAlpha:false,powerPreference:'high-performance',preserveDrawingBuffer:false});
  if(!gl)throw new Error('WebGL 2 is unavailable. Enable hardware acceleration or try another browser.');
  let destroyed=false,last,bufferSet={};
  const shader=(code,type)=>{
    const s=gl.createShader(type);gl.shaderSource(s,code);gl.compileShader(s);
    if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const p=gl.createProgram(), vs=shader(vert,gl.VERTEX_SHADER),fs=shader(frag,gl.FRAGMENT_SHADER);
  gl.attachShader(p,vs);gl.attachShader(p,fs);gl.linkProgram(p);gl.deleteShader(vs);gl.deleteShader(fs);
  if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p));
  const u=Object.fromEntries(['Rot','Scale','Center','Jaw','Color','Alpha','Cut','Type'].map(k=>[k,gl.getUniformLocation(p,'u'+k)]));
  const bind=({a,ix})=>{
    const vao=gl.createVertexArray(),vbo=gl.createBuffer(),ibo=gl.createBuffer();
    gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,vbo);gl.bufferData(gl.ARRAY_BUFFER,a,gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,24,0);
    gl.enableVertexAttribArray(1);gl.vertexAttribPointer(1,3,gl.FLOAT,false,24,12);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ibo);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,ix,gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    return {vao,vbo,ibo,n:ix.length};
  };
  const abort=new AbortController();
  const ready=Promise.all(['skull','mandible','teeth','lower-teeth'].map(async(name)=>{
    const r=await fetch(asset(name),{signal:abort.signal});
    if(!r.ok)throw new Error('Could not load the anatomy atlas.');
    const bytes=await r.arrayBuffer(), view=new DataView(bytes), n=view.getUint32(0,true), m=view.getUint32(4,true);
    if(m%3!==0 || bytes.byteLength!==8+n*24+m*4)throw new Error('Invalid anatomy geometry.');
    if(!destroyed)bufferSet[name]=bind({a:new Float32Array(bytes,8,n*6),ix:new Uint32Array(bytes,8+n*24,m)});
  })).then(()=>{if(destroyed)return; if(last)draw(last); canvas.dispatchEvent(new Event('atlasready'));}).catch(e=>{if(!destroyed)canvas.dispatchEvent(new CustomEvent('atlaserror',{detail:{message:e.message}}));});
  const jobs=[];
  function draw({yaw=0,pitch=0,roll=0,jaw=0,zoom=1,layers={bone:true},opacity=1,center=[.5,.5],scale=1,cut=0,live=false,split=1}={}){
    if(destroyed||gl.isContextLost())return;
    last={yaw,pitch,roll,jaw,zoom,layers,opacity,center,scale,cut,live,split};
    const dpr=Math.min(devicePixelRatio||1,1.85);
    const w=Math.max(1,Math.round(canvas.clientWidth*dpr)),h=Math.max(1,Math.round(canvas.clientHeight*dpr));
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
    gl.viewport(0,0,w,h);gl.disable(gl.SCISSOR_TEST);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(p);
    if(split<1){
      // Clear the full surface first so moving the divider never leaves stale pixels.
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(0,0,Math.round(w*clamp(split,0,1)),h);
    }
    gl.enable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);
    const s=.675*zoom*scale*Math.min(1,(w/h)/.75);
    gl.uniform2f(u.Scale,s*h/w,s);
    gl.uniform2f(u.Center,center[0]*2-1,1-center[1]*2);
    gl.uniformMatrix3fv(u.Rot,false,rotation(yaw,pitch,roll));
    jobs.length=0;
    let clip=cut>0?mix(1.08,-.87,clamp(cut,0,1)):10;

    if(layers.brain&&!bufferSet.brain)bufferSet.brain=bind(combine([brain(1),brain(-1)]));
    if(layers.muscle&&!bufferSet.muscle)bufferSet.muscle=bind(muscles());
    if(layers.brain)jobs.push(['brain',colors.brain,1,0,layers.bone?10:clip]);
    if(layers.bone)jobs.push(['skull',colors.skull,0,0,clip],['mandible',colors.skull,0,jaw*.45,clip],['teeth',colors.teeth,0,0,clip],['lower-teeth',colors.teeth,0,jaw*.45,clip]);
    if(layers.muscle)jobs.push(['muscle',colors.muscle,2,0,clip]);
    const renderPass=()=>{
      for(const [name,color,type,j,plane] of jobs){
        const m=bufferSet[name];if(!m)continue;
        gl.uniform1f(u.Jaw,j);gl.uniform1f(u.Cut,plane);gl.uniform1f(u.Type,type);
        gl.uniform3fv(u.Color,color);gl.bindVertexArray(m.vao);gl.drawElements(gl.TRIANGLES,m.n,gl.UNSIGNED_INT,0);
      }
    };
    gl.disable(gl.BLEND);gl.depthMask(true);gl.depthFunc(gl.LESS);gl.uniform1f(u.Alpha,clamp(opacity,0,1));
    if(opacity>=.999)renderPass();
    else{
      // Color only the nearest covered surface. No doubled alpha on back faces.
      gl.colorMask(false,false,false,false);renderPass();gl.colorMask(true,true,true,true);
      gl.depthMask(false);gl.depthFunc(gl.EQUAL);renderPass();gl.depthMask(true);
    }
    gl.bindVertexArray(null);gl.disable(gl.SCISSOR_TEST);
  }
  return {ready,draw,destroy(){destroyed=true;abort.abort();for(const {vao,vbo,ibo} of Object.values(bufferSet)){
    gl.deleteVertexArray(vao);gl.deleteBuffer(vbo);gl.deleteBuffer(ibo);}
    bufferSet={};gl.deleteProgram(p);
  }};
}
