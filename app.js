import {createRenderer} from './render.js';
import {createTracker} from './tracking.js';
import {paintHands} from './hand-overlay.js';
import {effects,readElements,demoSource,paintElements} from './elements.js';
const $=id=>document.getElementById(id), clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const set=(id,text)=>{const el=$(id);if(el&&el.textContent!==String(text))el.textContent=text};
const cv=$('atlas'),vp=$('viewport'),vid=$('feed');
const hand=document.createElement('canvas');hand.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:2';hand.setAttribute('aria-hidden','true');vp.insertBefore(hand,cv.nextSibling);const hc=hand.getContext('2d');
const home={yaw:-.31,pitch:.015,roll:0,center:[.5,.5],scale:1,zoom:1,jaw:0};
let s={...home,layers:{bone:true,brain:false,muscle:false},opacity:1,cut:0,live:false};
let phase='off',face=null,hands=[],pinch=null,motion=false,renderer,dirty=true,raf=0,prev=0,frameTimes=[],renderError='',fitScale=1,fitOffset=0,handState=null;
const reduced=matchMedia('(prefers-reduced-motion:reduce)');
const fc=$('field').getContext('2d');
let studio='atlas',chosen='plasma',demoPos=null,playField=false,fieldClock=2300,fieldPrev=0,effectSources=[],lastMessage='';
const isField=()=>studio==='field';
const activity=()=>isField()&&(phase==='live'?effectSources.length>0:playField&&phase!=='loading')&&!reduced.matches;
const sourceLabel=()=>effectSources.length?effectSources.map(s=>effects[s.type].name).join(' + '):'Awaiting gesture';
function studioUI(){
  const f=isField(),live=phase==='live',loading=phase==='loading';
  vp.dataset.studio=studio;document.documentElement?.setAttribute('data-studio',studio);
  document.documentElement?.setAttribute('data-session',phase);
  $('atlas-mode').setAttribute('aria-pressed',String(!f));$('field-mode').setAttribute('aria-pressed',String(f));
  for(const id of ['layers-panel','display-panel','orientation','atlas-tools'])$(id).hidden=f;
  $('field').hidden=$('field-panel').hidden=!f;$('demo-tools').hidden=!f||live||loading;
  $('fit').hidden=f||!live;$('recovery').hidden=phase!=='error'&&!(f&&live&&handState===false);
  $('camera').disabled=false;$('play-field').setAttribute('aria-pressed',String(playField&&!reduced.matches));
  $('play-field').disabled=!!reduced.matches;set('play-field',reduced.matches?'Reduced motion':playField?'Pause motion':'Play motion');
  set('mode',live?'Camera live':loading?'Connecting':'Camera off');set('kicker',live?'Live mirror':loading?'Connecting':f?'Camera-off demo':'Camera-off atlas');
  set('camera-label',phase==='error'?'Try camera again':'Enable camera');
  set('guide-mode',live?'Live':'Demo');set('guide-copy',live?'Hold a gesture in view to activate its effect.':'Choose a gesture, then tap the viewfinder to place its effect.');
  for(const id in effects){
    const el=$('fx-'+id);el.disabled=live||loading;el.setAttribute('aria-pressed',String(!live&&chosen===id));el.dataset.active=String(live&&effectSources.some(s=>s.type===id));
  }
  if(f)set('anatomy-name',live?sourceLabel():effects[chosen].name);
  else {const names={bone:'Cranial skeleton',brain:'Cerebral hemispheres',muscle:'Facial musculature'},on=Object.keys(s.layers).filter(l=>s.layers[l]);set('anatomy-name',on.length===1?names[on[0]]:on.length?'Composite anatomy':'No layers selected')}
  const instructions=f?(live?'Show a palm to bloom, pinch for silk, or open your mouth.':'Tap to place the effect · Arrow keys to move'):(live?'Face the camera. Pinch and move sideways to change the section.':'Drag to rotate · Scroll or pinch to zoom');
  const shown=!f&&!renderer?'Static reference · Elemental remains available.':instructions;
  set('instructions',shown);vp.setAttribute('aria-label',(f?'Interactive effects viewport. ':'Anatomy viewport. ')+shown);
  const status=phase==='error'||loading?lastMessage:!f&&renderError?renderError:live?(f?(handState===false?'Hand model unavailable or loading. Open your mouth for Stellar breath.':hands.length||face?'Tracking locally.':'Step into view. Show a hand or open your mouth.'):(face?'Face locked':'Looking for a face')+(handState===false?' · hands unavailable or loading':' · tracking locally')):(f?'Demo gestures · Camera is off':'Reference atlas · Camera is off');
  set('status',status);
}
function failRender(e){renderer=null;$('poster').hidden=false;for(const id of ['bone','brain','muscle','cut','opacity','reset','motion','zoom-in','zoom-out'])$(id).disabled=true;renderError='Showing a static reference. 3D rendering is unavailable. Enable camera to use Elemental, or enable WebGL and reload for the 3D atlas.';set('status',renderError);$('camera').disabled=false;cv.dataset.error='true';console.warn('Atlas unavailable:',e?.message)}
try{renderer=createRenderer(cv)}catch(e){failRender(e)}
const maybeRender=()=>{dirty=true;if(!raf&&!document.hidden)raf=requestAnimationFrame(paint)};
function paint(t){
  raf=0;const active=phase==='live'||motion||activity();
  const dt=prev?Math.min(80,t-prev):0;prev=t;
  if(motion&&phase!=='live')s.yaw+=dt*.00025;
  if(dirty||motion||activity()){
    if(isField()){
      if(activity()&&fieldPrev)fieldClock+=Math.min(70,t-fieldPrev);
      fieldPrev=activity()?t:0;
      if(fc)paintElements(fc,{width:vp.clientWidth,height:vp.clientHeight,dpr:devicePixelRatio||1,time:fieldClock,reduced:!!reduced.matches,sources:phase==='live'?effectSources:phase==='loading'?[]:demoSource(chosen,demoPos)});
      frameTimes.push(t);
    }
    if(renderer&&!isField()){
      frameTimes.push(t);
      const anchor=phase==='live'&&face?{...face,scale:face.scale*fitScale,center:[face.center[0],face.center[1]+face.scale*.68*fitOffset]}:null;
      const render={...s,...(anchor||{}),zoom:s.zoom,live:phase==='live',layers:phase==='live'&&!anchor?{bone:false,brain:false,muscle:false}:s.layers};
      try{renderer.draw(render)}catch(e){failRender(e)}
    }
    if(hc&&!isField())paintHands(hc,!isField()&&phase==='live'&&s.layers.bone?hands:[],vp.clientWidth,vp.clientHeight,Math.min(2,devicePixelRatio||1),s.opacity);
    set('angle',Math.round(((((phase==='live'&&face?face.yaw:s.yaw)*180/Math.PI+180)%360+360)%360)-180)+'°');
    dirty=false;
  }
  if(active){while(frameTimes.length&&frameTimes[0]<t-1000)frameTimes.shift();if(t-(paint.last||0)>500){set('fps',frameTimes.length+' fps');paint.last=t}raf=requestAnimationFrame(paint)}
  else{frameTimes=[];prev=0;set('fps','Idle')}
}
function updateMotion(active){motion=active;const el=$('motion');el.setAttribute('aria-pressed',String(active));el.title=active?'Pause automatic rotation':'Start automatic rotation';set('motion',active?'Pause orbit':'Orbit');maybeRender()}
function sync(){
  for(const l of ['bone','brain','muscle'])$(l).setAttribute('aria-pressed',String(s.layers[l]));
  $('opacity').value=Math.round(s.opacity*100);$('cut').value=Math.round(s.cut*100);
  set('opacity-value',Math.round(s.opacity*100)+'%');set('cut-value',Math.round(s.cut*100)+'%');
  const on=Object.keys(s.layers).filter(l=>s.layers[l]);
  const names={bone:'Cranial skeleton',brain:'Cerebral hemispheres',muscle:'Facial musculature'};
  if(!isField())set('anatomy-name',on.length===1?names[on[0]]:on.length?'Composite anatomy':'No layers selected');
  maybeRender();
}
function onState({phase:p,message,handTracking}){
  const focused=document.activeElement?.id;lastMessage=message||'';handState=p==='live'?handTracking:null;
  phase=p;s.live=p==='live';$('fit').hidden=p!=='live';vp.dataset.mode=p;vp.dataset.live=String(p==='live');$('camera').hidden=p==='loading'||p==='live';$('stop').hidden=!$('camera').hidden;
  $('motion').disabled=!renderer||p==='live'||p==='loading';
  if(p==='live'||p==='loading')updateMotion(false);
  if(p!=='live'){face=null;hands=[];pinch=null;effectSources=[];set('hands','—');set('tracking-rate','—')}
  studioUI();
  if((focused==='camera'&&$('camera').hidden)||(focused==='stop'&&$('stop').hidden)){
    ($('camera').hidden?$('stop'):$('camera')).focus?.({preventScroll:true});
  }
  maybeRender()
}
function onFrame(f){
  face=f.face||null;hands=f.handPoints||[];
  if(face)face={...face,jaw:f.jaw??face.jaw??0};
  const point=f.pinchCenter??f.pinchPoint;
  if(!isField()&&f.pinch!=null&&f.pinch>.75&&point){
    if(!pinch)pinch={x:point[0],cut:s.cut};
    else {s.cut=clamp(pinch.cut+(point[0]-pinch.x)*1.6,0,1);sync()}
  }else if(f.pinch==null||f.pinch<.45||!point)pinch=null;
  set('hands',f.hands??hands.length);if(Number.isFinite(f.inferenceHz))set('tracking-rate',Math.round(f.inferenceHz)+' Hz');
  if(phase==='live'){
    const before=sourceLabel(),sawFace=vp.dataset.face,sawHands=vp.dataset.hands;
    effectSources=readElements(hands,face,vp.clientWidth/Math.max(1,vp.clientHeight));
    vp.dataset.face=String(!!face);vp.dataset.hands=String(!!hands.length);
    if(sourceLabel()!==before||vp.dataset.face!==sawFace||vp.dataset.hands!==sawHands)studioUI();
  }
  maybeRender();
}
const tracker=createTracker({video:vid,viewport:vp,onState,onFrame,fit:'adaptive'});
$('camera').onclick=async()=>{if(!renderer&&!isField())changeStudio('field');try{await tracker.start()}catch(e){onState({phase:'error',message:e.message||'Camera could not start. Try again or use the atlas.'})}};
$('stop').onclick=()=>tracker.stop();
$('fit-size').oninput=e=>{fitScale=+e.target.value/100;set('fit-size-val',e.target.value+'%');maybeRender()};
$('fit-height').oninput=e=>{fitOffset=+e.target.value/100;set('fit-height-val',e.target.value+'%');maybeRender()};
for(const l of ['bone','brain','muscle'])$(l).onclick=()=>{s.layers[l]=!s.layers[l];if(l==='brain'&&s.layers.brain&&s.layers.bone&&s.cut===0)s.cut=.5;sync()};
$('opacity').oninput=e=>{s.opacity=+e.target.value/100;sync()};
$('cut').oninput=e=>{s.cut=+e.target.value/100;sync()};
$('reset').onclick=()=>{fitScale=1;fitOffset=0;$('fit-size').value=100;$('fit-height').value=0;set('fit-size-val','100%');set('fit-height-val','0%');Object.assign(s,home,{layers:{bone:true,brain:false,muscle:false},cut:0,opacity:1});updateMotion(false);sync()};
$('motion').onclick=()=>updateMotion(!motion);
function zoom(v){s.zoom=clamp(s.zoom*v,.45,2.25);maybeRender()}
if($('zoom-in'))$('zoom-in').onclick=()=>zoom(1.1);
if($('zoom-out'))$('zoom-out').onclick=()=>zoom(1/1.1);
function changeStudio(next){
  if(next===studio)return;
  studio=next;if(next==='field'&&hc)paintHands(hc,[],vp.clientWidth,vp.clientHeight,1,1);pinch=null;fieldPrev=0;pointers.clear();fieldPointer=null;
  updateMotion(false);studioUI();maybeRender();
}
$('atlas-mode').onclick=()=>changeStudio('atlas');$('field-mode').onclick=()=>changeStudio('field');
for(const id in effects)$('fx-'+id).onclick=()=>{if(phase==='live'||phase==='loading')return;chosen=id;demoPos=null;studioUI();maybeRender()};
$('play-field').onclick=()=>{playField=!playField;fieldPrev=0;studioUI();maybeRender()};
$('center-field').onclick=()=>{demoPos=null;maybeRender()};
let fieldPointer=null;
function aim(e){const b=vp.getBoundingClientRect();if(b.width&&b.height)demoPos=[clamp((e.clientX-b.left)/b.width,.05,.95),clamp((e.clientY-b.top)/b.height,.09,.91)];maybeRender()}
const pointers=new Map();let span=null;
const pspan=()=>{let [a,b]=[...pointers.values()];return Math.hypot(a.x-b.x,a.y-b.y)};
const controlTarget=t=>t.closest('button,input,label,select,a');
vp.addEventListener('pointerdown',e=>{if(phase==='live'||controlTarget(e.target)||phase==='loading'||e.button!==0)return;if(isField()){fieldPointer=e.pointerId;vp.setPointerCapture(e.pointerId);aim(e);return}updateMotion(false);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});vp.setPointerCapture(e.pointerId);if(pointers.size===2)span=pspan()});
vp.addEventListener('pointermove',e=>{if(isField()){if(fieldPointer===e.pointerId)aim(e);return}let a=pointers.get(e.pointerId);if(!a)return;const dx=e.clientX-a.x,dy=e.clientY-a.y;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size===2){const n=pspan();if(span>0&&n>0)zoom(n/span);span=n}else{s.yaw+=dx*.009;s.pitch=clamp(s.pitch+dy*.006,-1.1,1.1);maybeRender()}});
for(const ev of ['pointerup','pointercancel','lostpointercapture'])vp.addEventListener(ev,e=>{if(fieldPointer===e.pointerId)fieldPointer=null;pointers.delete(e.pointerId);span=null});
vp.addEventListener('wheel',e=>{if(isField()||phase==='live'||controlTarget(e.target))return;e.preventDefault();zoom(Math.exp(-clamp(e.deltaY,-200,200)*.0015))},{passive:false});
vp.addEventListener('keydown',e=>{if(controlTarget(e.target)||phase==='live')return;const k=e.key;if(isField()){if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home'].includes(k))return;e.preventDefault();if(k==='Home')demoPos=null;else{const v=demoSource(chosen,demoPos)[0];demoPos=[clamp(v.x+(k==='ArrowLeft'?-.04:k==='ArrowRight'?.04:0),.05,.95),clamp(v.y+(k==='ArrowUp'?-.04:k==='ArrowDown'?.04:0),.09,.91)]}maybeRender();return}if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-','Home'].includes(k))return;e.preventDefault();updateMotion(false);if(k==='Home')$('reset').click();else if(k==='+'||k==='=')zoom(1.1);else if(k==='-')zoom(1/1.1);else if(k==='ArrowLeft')s.yaw-=.1;else if(k==='ArrowRight')s.yaw+=.1;else s.pitch=clamp(s.pitch+(k==='ArrowUp'?-.08:.08),-1.1,1.1);maybeRender()});
cv.addEventListener('atlasready',()=>{$('poster').hidden=true;maybeRender()});cv.addEventListener('atlaserror',e=>{set('status', e.detail?.message || 'One atlas layer could not load. Reload to retry.');maybeRender()});
new ResizeObserver(maybeRender).observe(vp);cv.addEventListener('webglcontextlost',e=>{e.preventDefault();if(!isField())tracker.stop();failRender(new Error('graphics context lost'));studioUI()});
cv.addEventListener('webglcontextrestored',()=>{try{renderer=createRenderer(cv);renderError='';for(const id of ['bone','brain','muscle','cut','opacity','reset','motion','zoom-in','zoom-out'])$(id).disabled=false;delete cv.dataset.error;$('camera').disabled=false;studioUI();sync()}catch(e){failRender(e)}});
document.addEventListener('visibilitychange',()=>{if(document.hidden){if(phase==='live'||phase==='loading')tracker.stop();if(raf)cancelAnimationFrame(raf);raf=0;prev=0;frameTimes=[]}else maybeRender()});
window.addEventListener('pagehide',()=>{tracker.stop();updateMotion(false)});
reduced.addEventListener?.('change',e=>{if(e.matches){playField=false;updateMotion(false)}studioUI();maybeRender()});
onState({phase:'off'});sync();
