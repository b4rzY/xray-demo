const VISION = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21';
const MODELS = 'https://storage.googleapis.com/mediapipe-models';
const empty = () => ({face: null, hands: 0, pinch: null, pinchPoint: null, pinchCenter: null, handPoints: [], inferenceHz: null});
const clamp = (x, min, max) => Math.max(min, Math.min(max, x));
const mix = (a, b, t) => a + (b - a) * t;
const angleMix = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;

export function adaptiveFit(sourceWidth,sourceHeight,width,height){
  const ratio=sourceWidth*height/(sourceHeight*width);
  return ratio>1.28||ratio<1/1.28?'contain':'cover';
}
export function containMapping(sourceWidth, sourceHeight, width, height, mode='contain') {
  if (![sourceWidth, sourceHeight, width, height].every(v => Number.isFinite(v) && v > 0)) return null;
  const fit = (mode==='cover'?Math.max:Math.min)(width / sourceWidth, height / sourceHeight);
  const fx = sourceWidth * fit / width, fy = sourceHeight * fit / height;
  return {fx, fy, aspect: sourceWidth / sourceHeight,
    map: p => [0.5 + (0.5 - p.x) * fx, 0.5 + (p.y - 0.5) * fy]};
}

export function mirroredAngles(matrix) {
  const m = matrix?.data;
  if (!m || m.length !== 16 || !Array.from(m).every(Number.isFinite)) return null;
  // Face Geometry normally packs column-major. Accept row-major matrix data also,
  // using the affine translation vs. the zero last row to distinguish (unless identity).
  const rowMajor = Math.hypot(m[3], m[7], m[11]) > Math.hypot(m[12], m[13], m[14]);
  const get = rowMajor ? (r, c) => m[r * 4 + c] : (r, c) => m[c * 4 + r];
  const sx = Math.hypot(get(0, 0), get(1, 0), get(2, 0));
  if (sx < 0.001) return null;
  // Renderer model is +X screen right, +Y up, +Z toward camera; mirror is X reflection.
  return {yaw: -Math.asin(clamp(-get(2, 0) / sx, -1, 1)),
    pitch: Math.atan2(get(2, 1), get(2, 2)),
    roll: -Math.atan2(get(1, 0), get(0, 0))};
}

export function frameFace(result, mapping) {
  const lm = result?.faceLandmarks?.[0];
  if (!mapping || !lm?.[152] || !lm?.[10] || !lm?.[234] || !lm?.[454]) return null;
  const top = mapping.map(lm[10]), chin = mapping.map(lm[152]);
  const left = mapping.map(lm[234]), right = mapping.map(lm[454]);
  // Use actual face length (not bbox height, which shrinks when the head rolls).
  const pixelAspect = mapping.aspect * mapping.fy / mapping.fx;
  const faceHeight = Math.hypot((top[0] - chin[0]) * pixelAspect, top[1] - chin[1]);
  if (!(faceHeight > .018)) return null;
  const p = mirroredAngles(result.facialTransformationMatrixes?.[0]) ??
    {yaw: 0, pitch: 0, roll: Math.atan2((chin[0] - top[0]) * pixelAspect, chin[1] - top[1])};
  const trackHeight = faceHeight / Math.max(.65, Math.cos(p.pitch));
  // Landmark #10 is the central forehead; atlas extends above the tracked facial oval.
  const skullCenter = [
    mix(top[0], chin[0], .42),
    mix(top[1], chin[1], .42)
  ];
  const jaw = result.faceBlendshapes?.[0]?.categories?.find(v => v.categoryName === 'jawOpen')?.score;
  return {center: skullCenter, scale: clamp(trackHeight * 1.16 / .68, .09, 2.3),
    mouth: lm[13] && lm[14] ? mapping.map({x:(lm[13].x+lm[14].x)/2,y:(lm[13].y+lm[14].y)/2}) : null,
    yaw: p.yaw, pitch: p.pitch, roll: p.roll, jaw: Number.isFinite(jaw) ? jaw : 0,
    bounds: {left: Math.min(left[0], right[0]), right: Math.max(left[0], right[0]), top: top[1], bottom: chin[1]}};
}
const xyDistance = (a, b, aspect) => Math.hypot((a.x - b.x) * aspect, a.y - b.y);
const xyzDistance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

export function frameHands(result, mapping) {
  const hands = result?.landmarks || [];
  let best = null;
  for (let j = 0; j < hands.length; j++) {
    const h = hands[j];
    if (!h?.[0] || !h[4] || !h[8] || !h[9]) continue;
    const w = result.worldLandmarks?.[j];
    let ratio = xyDistance(h[4], h[8], mapping.aspect) / Math.max(.005, xyDistance(h[0], h[9], mapping.aspect));
    if (w?.[0] && w[4] && w[8] && w[9]) {
      const palm = xyzDistance(w[0], w[9]);
      const sep = xyzDistance(w[4], w[8]);
      if (Number.isFinite(sep / palm) && palm >= .015) ratio = sep / palm;
    }
    if (!Number.isFinite(ratio)) continue;
    const pinch = 1 - clamp((ratio - .18) / .60, 0, 1);
    const point = mapping.map({x: (h[4].x + h[8].x) / 2, y: (h[4].y + h[8].y) / 2});
    if (!best || pinch > best.pinch) best = {pinch, pinchPoint: point};
  }
  return {hands: hands.length, pinch: best?.pinch ?? null, pinchPoint: best?.pinchPoint ?? null,
    pinchCenter: best?.pinchPoint ?? null,
    handPoints: mapping ? hands.filter(h => h.length === 21).map(h => h.map(mapping.map)) : []};
}

async function loadRuntime() {
  const mod = await import(`${VISION}/vision_bundle.mjs`);
  const files = await mod.FilesetResolver.forVisionTasks(`${VISION}/wasm`);
  return {face: delegate => mod.FaceLandmarker.createFromOptions(files, {
    baseOptions: {modelAssetPath: `${MODELS}/face_landmarker/face_landmarker/float16/1/face_landmarker.task`, delegate},
    runningMode: 'VIDEO', numFaces: 1, minFaceDetectionConfidence: .53,
    minFacePresenceConfidence: .55, minTrackingConfidence: .60,
    outputFacialTransformationMatrixes: true, outputFaceBlendshapes: true
  }), hands: delegate => mod.HandLandmarker.createFromOptions(files, {
    baseOptions: {modelAssetPath: `${MODELS}/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`, delegate},
    runningMode: 'VIDEO', numHands: 2, minHandDetectionConfidence: .60,
    minHandPresenceConfidence: .55, minTrackingConfidence: .55
  })};
}
const close = instance => { try { instance?.close(); } catch {} };
const stopStream = stream => stream?.getTracks().forEach(track => track.stop());
function bounded(promise, ms, late) {
  let expired = false, timer;
  const work = Promise.resolve(promise).then(value => {
    if (expired) late?.(value);
    return value;
  });
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => { expired = true; reject(new Error('Tracking engine timed out. Check your connection and try again.')); }, ms);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}
function userError(err) {
  switch (err?.name) {
    case 'NotAllowedError': return 'Camera access was blocked. Allow it in your browser, then try again.';
    case 'NotFoundError': return 'No camera was found. You can still explore the 3D atlas.';
    case 'NotReadableError': return 'Camera is in use or unavailable. Close the other camera app and try again.';
    case 'SecurityError': return 'Camera access is blocked by this browser or preview.';
    default: return 'Could not start tracking. Check your connection and camera permissions, or keep exploring without the camera.';
  }
}

export function createTracker({video, viewport, onState = () => {}, onFrame = () => {}, runtimeLoader = loadRuntime, fit = 'contain',
  getMedia = constraints => navigator.mediaDevices.getUserMedia(constraints)}) {
  let epoch = 0, active = false, stream = null, faceModel = null, handModel = null;
  let tickId = null, watchdog = null, frameScheduler = false;
  let lastFrameAt = 0, lastFaceAt = -Infinity, lastHandAt = -Infinity, handPeriod = 75, facePeriod = 33;
  let lastMediaTime = -1, previousHz = null, face = null, gesture = frameHands(null, null);
  let faceSeen = -Infinity, gestureSeen = -Infinity, lastReported = 0, gestureDirty = false;
  const visibility = () => { if (document.hidden) stop(); };
  const phase = (phase, message, extra = {}) => onState({phase, message, ...extra});
  function release() {
    if (tickId != null) {
      if (frameScheduler) video.cancelVideoFrameCallback?.(tickId);
      else cancelAnimationFrame(tickId);
    }
    clearInterval(watchdog);
    tickId = watchdog = null;
    document.removeEventListener('visibilitychange', visibility);
    stopStream(stream);
    stream = null;
    video.pause();
    video.srcObject = null;
    close(faceModel); close(handModel);
    faceModel = handModel = null;
    lastFaceAt = lastHandAt = faceSeen = gestureSeen = -Infinity;
    lastMediaTime = -1; lastReported = 0; lastFrameAt = 0; previousHz = null;
    handPeriod = 75; facePeriod = 33; gestureDirty = false;
    face = null; gesture = frameHands(null, null);
    onFrame(empty());
  }
  function stop() {
    if (!active) return;
    active = false; ++epoch; release(); phase('off', 'Camera off');
  }
  function fail(message) {
    active = false; ++epoch; release(); phase('error', message);
  }
  function requestNext(cb) {
    frameScheduler = typeof video.requestVideoFrameCallback === 'function' &&
      typeof video.cancelVideoFrameCallback === 'function';
    tickId = frameScheduler ? video.requestVideoFrameCallback(cb) : requestAnimationFrame(cb);
  }

  async function start() {
    if (active) return;
    const id = ++epoch;
    active = true;
    const stale = () => !active || id !== epoch;
    if (!globalThis.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      fail('Your browser needs HTTPS or localhost to use the camera.'); return;
    }
    phase('loading', 'Waiting for camera permission…');
    if (stale()) return;
    document.addEventListener('visibilitychange', visibility);
    try {
      const portrait=viewport.clientHeight>viewport.clientWidth;
      const media = await getMedia({audio: false, video: {facingMode: 'user', width: {ideal: portrait?540:960},
        height: {ideal: portrait?960:540}, frameRate: {ideal: 30, max: 30}}});
      if (stale()) { stopStream(media); return; }
      stream = media;
      const ended = () => { if (!stale()) fail('Camera disconnected. Try reconnecting it.'); };
      media.getVideoTracks().forEach(track => track.addEventListener('ended', ended, {once: true}));
      video.setAttribute('playsinline', '');
      video.muted = true;
      video.srcObject = media;
      await bounded(video.play(), 8000);
      if (stale()) return;
      phase('loading', 'Loading face and hand tracking models…');
      if (stale()) return;
      const runtime = await bounded(runtimeLoader(), 25000);
      if (stale()) return;
      let selectedDelegate = 'GPU';
      async function build(kind) {
        try { return await bounded(runtime[kind](selectedDelegate), 35000, close); }
        catch (e) {
          if (stale() || selectedDelegate === 'CPU') throw e;
          const model = await bounded(runtime[kind]('CPU'), 35000, close);
          selectedDelegate = 'CPU';
          return model;
        }
      }
      const f = await build('face');
      if (stale()) { close(f); return; }
      faceModel = f;
      phase('live', 'Face tracking running. Loading hand tracking…', {handTracking: false});
      if (stale()) return;
      lastFrameAt = performance.now();
      watchdog = setInterval(() => {
        if (!stale() && performance.now() - lastFrameAt > 400 && (face || gesture.hands)) {
          face = null; gesture = frameHands(null, null); onFrame(empty());
        }
      }, 200);
      const tick = (ts, metadata) => {
        tickId = null;
        if (stale()) return;
        const mediaTime = metadata?.mediaTime ?? video.currentTime;
        const w=viewport.clientWidth,h=viewport.clientHeight;
        const actualFit=fit==='adaptive'?adaptiveFit(video.videoWidth,video.videoHeight,w,h):fit;
        if(video.style&&video.style.objectFit!==actualFit)video.style.objectFit=actualFit;
        const mapping = containMapping(video.videoWidth, video.videoHeight, w, h, actualFit);
        if (video.readyState >= 2 && mapping && mediaTime !== lastMediaTime) {
          lastMediaTime = mediaTime;
          lastFrameAt = ts;
          try {
            const doFace = ts - lastFaceAt >= facePeriod;
            const doHands = handModel && ts - lastHandAt >= handPeriod;
            // Never stack two synchronous inference calls on one browser frame if the previous pass was slow.
            if (doHands && (!doFace || (Number.isFinite(lastFaceAt) && ts - lastHandAt >= handPeriod * 1.3))) {
              const begin = performance.now();
              let next;
              try { next = frameHands(handModel.detectForVideo(video, ts), mapping); }
              catch {
                close(handModel); handModel = null;
                gesture = frameHands(null, null); gestureDirty = true;
                phase('live', 'Face tracking running. Hand tracking stopped.', {handTracking: false});
                if (stale()) return;
              }
              const duration = performance.now() - begin;
              lastHandAt = ts;
              handPeriod = clamp(mix(handPeriod, Math.max(75, duration * 3), .22), 75, 250);
              if (next?.hands) {
                gestureSeen = ts;
                if (next.pinch !== null && gesture.pinch !== null) {
                  next.pinch = mix(gesture.pinch, next.pinch, .58);
                }
                gesture = next; gestureDirty = true;
              }
            } else if (doFace) {
              const begin = performance.now();
              const next = frameFace(faceModel.detectForVideo(video, ts), mapping);
              const duration = performance.now() - begin;
              if (Number.isFinite(lastFaceAt)) {
                const hz = 1000 / (ts - lastFaceAt);
                previousHz = previousHz == null ? hz : mix(previousHz, hz, .16);
              }
              lastFaceAt = ts;
              facePeriod = clamp(mix(facePeriod, Math.max(28, duration * 1.6), .18), 28, 160);
              if (next) {
                const delta = ts - faceSeen;
                const dist = face ? Math.hypot(...next.center.map((v, i) => v - face.center[i])) : 1;
                const weight = clamp(1 - Math.exp(-delta / (dist > .05 ? 23 : 62)), .12, 1);
                face = !face ? next : {...next, center: next.center.map((v, i) => mix(face.center[i], v, weight)),
                  yaw: angleMix(face.yaw, next.yaw, weight), pitch: angleMix(face.pitch, next.pitch, weight),
                  roll: angleMix(face.roll, next.roll, weight), jaw: mix(face.jaw, next.jaw, .64),
                  scale: mix(face.scale, next.scale, weight)};
                faceSeen = ts;
              }
            }
            if (face && ts - faceSeen > Math.max(160, facePeriod * 1.5)) face = null;
            if (gesture.hands && ts - gestureSeen > Math.max(210, handPeriod * 1.5)) {
              gesture = frameHands(null, null); gestureDirty = true;
            }
            if (lastReported !== lastFaceAt || gestureDirty) {
              lastReported = lastFaceAt; gestureDirty = false;
              onFrame({face, ...gesture, inferenceHz: previousHz});
            }
          } catch {
            fail('Tracking stopped unexpectedly. Restart the camera or use the 3D atlas.'); return;
          }
        }
        if (!stale()) requestNext(tick);
      };
      requestNext(tick);
      try {
        const h = await build('hands');
        if (stale()) { close(h); return; }
        handModel = h;
        phase('live', 'Face and hand tracking running.', {handTracking: true});
      } catch {
        if (!stale()) phase('live', 'Face tracking running. Hand tracking could not load.', {handTracking: false});
      }
    } catch (err) {
      if (!stale()) fail(userError(err));
    }
  }
  return {start, stop};
}
