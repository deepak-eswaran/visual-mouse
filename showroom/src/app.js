import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const $ = (id) => document.getElementById(id);
const viewport = $('viewport');
const canvas = $('threeCanvas');
const loadState = $('loadState');
const modelError = $('modelError');
const modelTitle = $('modelTitle');
const modelSubtitle = $('modelSubtitle');
const selectedModelStat = $('selectedModelStat');
const controlModeLabel = $('controlMode');
const toast = $('toast');

const ASSETS = {
  hammer: {
    title:'Stormforged Hammer', subtitle:'Norse-inspired forged artefact · Original concept',
    category:'MYTHIC ARTEFACT / 01', glyph:'⚒', format:'ORIGINAL PROCEDURAL MODEL',
    description:'A custom Norse-inspired storm hammer with a forged steel head, etched bands, leather-wrapped haft and a restrained electric core.',
    url:null, source:'Original procedural design'
  },
  car: {
    title:'Concept GT', subtitle:'Mid-engine performance coupe · CC0 model',
    category:'AUTOMOTIVE / 02', glyph:'▰', format:'GLB / PBR MATERIALS',
    description:'A generic mid-engine supercar concept with aerodynamic bodywork, glass canopy and detailed mechanical surfaces.',
    url:'https://files.innerscene.com/library/generic-mid-engine-supercar-73f252c5/b41b620d8a8890b1b70/generic-mid-engine-supercar.glb',
    source:'https://www.innerscene.com/tools/library/3d-parts/generic-mid-engine-supercar-73f252c5'
  },
  bike: {
    title:'Roadline', subtitle:'Unbranded sport motorcycle · CC0 model',
    category:'MOTORCYCLE / 03', glyph:'⌁', format:'GLB / PBR MATERIALS',
    description:'An unbranded road motorcycle with modeled frame, engine exterior, front fork, swingarm, shocks and lamps.',
    url:'https://files.innerscene.com/library/sport-motorcycle-e21e8303/625e0c0f4d03a83504cf/sport-motorcycle.glb',
    source:'https://www.innerscene.com/tools/library/3d-parts/sport-motorcycle-e21e8303'
  },
  drone: {
    title:'Skyframe', subtitle:'Quadcopter with flight electronics · CC0 model',
    category:'AERIAL SYSTEM / 04', glyph:'✣', format:'GLB / PBR MATERIALS',
    description:'A quadcopter concept with four motor arms, rotor assemblies, landing skids and camera equipment.',
    url:'https://files.innerscene.com/library/quadcopter-with-flight-electronics-a25968c1/7bbe389047145edeb575/quadcopter-original.glb',
    source:'https://www.innerscene.com/tools/library/3d-parts/quadcopter-with-flight-electronics-a25968c1'
  },
  watch: {
    title:'Meridian', subtitle:'Classic analog wristwatch · CC0 model',
    category:'TIMEPIECE / 05', glyph:'◷', format:'GLB / PBR MATERIALS',
    description:'A generic stainless-steel dress watch with a sapphire-style crystal, applied dial markers, blue hands and a leather strap.',
    url:'https://files.innerscene.com/library/analog-dress-wristwatch-6ee689f8/363292a4f175c57c7c1a/analog-dress-wristwatch.glb',
    source:'https://www.innerscene.com/tools/library/3d-parts/analog-dress-wristwatch-6ee689f8'
  },
  sneaker: {
    title:'Aero Runner', subtitle:'Engineered performance footwear · CC0 model',
    category:'FOOTWEAR / 06', glyph:'◒', format:'GLB / PBR MATERIALS',
    description:'A pair of generic running sneakers with engineered mesh uppers, layered panels, laces and sculpted foam midsoles.',
    url:'https://files.innerscene.com/library/running-sneaker-c7a5a7eb/f22ff647c308a66ab8c3/running-sneaker.glb',
    source:'https://www.innerscene.com/tools/library/3d-parts/running-sneaker-c7a5a7eb'
  }
};

let renderer, scene, camera, controls, activeRoot, activeObjectId = 'hammer';
let loader, autoRotate = false, animationFrame = 0, environmentTarget;
let handLandmarker = null, cameraStream = null, handModeOn = false;
let lastVideoTime = -1, handFrame = 0, lastGesture = 'WAITING FOR HAND';
let pinchActive = false, pinchMode = null, pinchTarget = null, lastPinchPoint = null;
let lastTwoFingerY = null, lastPalmX = null, lastSwipeAt = 0;
let pointerX = innerWidth / 2, pointerY = innerHeight / 2, pointerEl = null;
let lastToastAt = 0;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => toast.classList.remove('show'), 1900);
}
function setHandStatus(message, active = handModeOn) {
  $('handStatus').textContent = message;
  $('handStatus').parentElement.classList.toggle('active', active);
  $('handStatusDot').style.background = active ? '#80d4a9' : '#687780';
  controlModeLabel.textContent = active ? 'BROWSER HAND TRACKING' : 'MOUSE / TOUCH READY';
}
function mat(color, metalness=.3, roughness=.32, extra={}) {
  return new THREE.MeshStandardMaterial({color,metalness,roughness,...extra});
}
function addMesh(parent, geometry, material, position=[0,0,0], rotation=[0,0,0], scale=[1,1,1]) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position); mesh.rotation.set(...rotation); mesh.scale.set(...scale);
  mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
}
function addTube(parent, points, radius, material, segments=72) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, segments, radius, 10, false), material);
  mesh.castShadow = true; parent.add(mesh); return mesh;
}
function createStormHammer() {
  const g = new THREE.Group();
  const steel = mat(0x65717a,.88,.27);
  const edge = mat(0xb4c0c4,.8,.23);
  const darkSteel = mat(0x202a31,.88,.28);
  const bronze = mat(0xb18b55,.78,.27);
  const leather = mat(0x392b25,.05,.88);
  const leatherLight = mat(0x76503a,.08,.72);
  const core = new THREE.MeshStandardMaterial({color:0x82dbe0,metalness:.25,roughness:.2,emissive:0x2d9d9f,emissiveIntensity:.7});

  // Forged, chamfered rectangular hammer head.
  addMesh(g,new RoundedBoxGeometry(2.05,.78,.78,8,.13),steel,[0,1.12,0]);
  addMesh(g,new RoundedBoxGeometry(1.86,.61,.84,8,.09),darkSteel,[0,1.12,0]);
  addMesh(g,new RoundedBoxGeometry(1.61,.46,.88,8,.08),steel,[0,1.12,0]);

  // Forged end plates and brushed-metal rings.
  for (const sign of [-1,1]) {
    addMesh(g,new THREE.CylinderGeometry(.39,.39,.13,12),edge,[sign*1.04,1.12,0],[0,0,Math.PI/2]);
    addMesh(g,new THREE.CylinderGeometry(.29,.29,.045,12),darkSteel,[sign*1.115,1.12,0],[0,0,Math.PI/2]);
    addMesh(g,new THREE.CylinderGeometry(.18,.18,.055,12),bronze,[sign*1.145,1.12,0],[0,0,Math.PI/2]);
    addMesh(g,new THREE.TorusGeometry(.30,.018,8,48),bronze,[sign*1.145,1.12,0],[0,Math.PI/2,0]);
  }

  // Neck, long haft and grip.
  addMesh(g,new THREE.CylinderGeometry(.16,.13,.39,20),bronze,[0,.62,0]);
  addMesh(g,new THREE.CylinderGeometry(.115,.145,1.72,24),leather,[0,-.43,0]);
  addMesh(g,new THREE.CylinderGeometry(.135,.115,.72,24),darkSteel,[0,-1.62,0]);
  addMesh(g,new THREE.CylinderGeometry(.16,.16,.12,24),bronze,[0,-2.02,0]);
  addMesh(g,new THREE.SphereGeometry(.18,24,18),steel,[0,-2.16,0],[0,0,0],[1,.7,1]);

  // Spiral leather binding, ferrules and metal studs.
  for(let i=0;i<18;i++){
    const y=.30-i*.078;
    const a=i*.65;
    const pts=[];
    for(let j=0;j<=12;j++){
      const t=j/12*Math.PI*2;
      pts.push([Math.cos(t)*(.116+(j/12)*.003),y-(j/12)*.075,Math.sin(t)*(.116+(j/12)*.003)]);
    }
    addTube(g,pts,.012,leatherLight,18);
  }
  for(const y of [.49,.40,-1.32,-1.42]){
    addMesh(g,new THREE.TorusGeometry(.13,.022,8,32),bronze,[0,y,0],[Math.PI/2,0,0]);
  }

  // Central inset medallion with an abstract lightning mark.
  addMesh(g,new THREE.CylinderGeometry(.22,.22,.04,48),bronze,[0,1.12,.45],[Math.PI/2,0,0]);
  addMesh(g,new THREE.CylinderGeometry(.17,.17,.045,48),darkSteel,[0,1.12,.48],[Math.PI/2,0,0]);
  addTube(g,[[-.07,1.25,.515],[.035,1.14,.52],[-.035,1.09,.52],[.08,.98,.515]],.025,core,40);

  // Engraved parallel fillets across the face.
  for(let x=-.68;x<=.681;x+=.17){
    addTube(g,[[x,1.36,.455],[x+.035,1.28,.465],[x,1.18,.468]],.009,edge,16);
  }
  // Top ridge and subtle inlaid side details.
  addMesh(g,new RoundedBoxGeometry(1.25,.035,.09,4,.018),bronze,[0,1.53,0]);
  addTube(g,[[-.75,.89,.405],[-.45,.82,.43],[0,.80,.44],[.45,.82,.43],[.75,.89,.405]],.012,bronze,60);
  g.rotation.z=-.04;
  return g;
}

// Deliberately restrained local fallbacks for external GLB failures.
function createFallback(id) {
  const g=new THREE.Group();
  const paint=mat(id==='car'?0x8a3038:id==='bike'?0x273b50:id==='drone'?0x555d61:id==='watch'?0x8a795f:0x5d7185,.65,.25);
  const rubber=mat(0x111519,.05,.91), metal=mat(0x909b9d,.9,.27), glass=new THREE.MeshPhysicalMaterial({color:0x9bc6cf,metalness:.35,roughness:.12,transparent:true,opacity:.65});
  if(id==='car'){
    addMesh(g,new RoundedBoxGeometry(3.2,.48,1.35,8,.18),paint,[0,-.05,0]);
    addMesh(g,new RoundedBoxGeometry(1.65,.55,1.12,8,.18),glass,[.05,.40,0]);
    for(const x of [-1.05,1.05]) for(const z of [-.72,.72]) {
      addMesh(g,new THREE.CylinderGeometry(.39,.39,.18,32),rubber,[x,-.39,z],[Math.PI/2,0,0]);
      addMesh(g,new THREE.CylinderGeometry(.22,.22,.19,24),metal,[x,-.39,z],[Math.PI/2,0,0]);
    }
  } else if(id==='bike'){
    for(const x of [-.92,.92]) addMesh(g,new THREE.TorusGeometry(.46,.09,14,40),rubber,[x,-.30,0],[Math.PI/2,0,0]);
    addTube(g,[[-.92,-.3,0],[-.25,.2,0],[.48,-.3,0],[.92,-.3,0]],.055,metal);
    addMesh(g,new THREE.SphereGeometry(.32,24,18),paint,[-.12,.10,0],[0,0,0],[.55,.48,.45]);
    addMesh(g,new RoundedBoxGeometry(.78,.23,.42,6,.07),paint,[.22,.38,0]);
    addTube(g,[[.7,.35,0],[.92,-.12,0],[.94,-.3,0]],.045,metal);
    addMesh(g,new THREE.CylinderGeometry(.055,.055,.72,16),metal,[.98,.02,0],[0,0,-.32]);
    addMesh(g,new RoundedBoxGeometry(.55,.15,.38,5,.06),rubber,[-.38,.64,0]);
    addTube(g,[[-.38,.7,0],[-.25,.92,0],[.05,.91,0]],.035,metal);
  } else if(id==='drone'){
    addMesh(g,new RoundedBoxGeometry(.62,.18,.62,6,.06),paint);
    for(const [x,z] of [[-1,-1],[1,-1],[-1,1],[1,1]]){
      addTube(g,[[x*.18,0,z*.18],[x*.72,.02,z*.72]],.055,metal);
      addMesh(g,new THREE.CylinderGeometry(.21,.21,.08,24),metal,[x*.78,.10,z*.78]);
      addMesh(g,new THREE.BoxGeometry(.78,.018,.055),rubber,[x*.78,.16,z*.78]);
      addMesh(g,new THREE.CylinderGeometry(.07,.07,.24,16),paint,[x*.78,-.14,z*.78]);
    }
    addMesh(g,new THREE.SphereGeometry(.18,20,16),glass,[0,-.18,.3]);
  } else if(id==='watch'){
    addMesh(g,new RoundedBoxGeometry(.52,.8,.18,8,.08),paint,[0,0,0]);
    addMesh(g,new THREE.CylinderGeometry(.32,.32,.12,48),metal,[0,0,.12],[Math.PI/2,0,0]);
    addMesh(g,new THREE.CylinderGeometry(.27,.27,.13,48),glass,[0,0,.20],[Math.PI/2,0,0]);
    for(let i=0;i<12;i++){const a=i*Math.PI/6;addMesh(g,new THREE.BoxGeometry(.025,.09,.012),metal,[Math.sin(a)*.22,Math.cos(a)*.22,.28],[0,0,-a]);}
    addMesh(g,new THREE.BoxGeometry(.025,.17,.018),paint,[0,.04,.29]);
    addMesh(g,new THREE.BoxGeometry(.022,.13,.02),metal,[.05,-.02,.30],[0,0,-.7]);
    addMesh(g,new THREE.CylinderGeometry(.035,.035,.12,16),metal,[.34,0,.10],[0,0,Math.PI/2]);
    addMesh(g,new THREE.BoxGeometry(.2,.82,.09),rubber,[0,.56,-.01]);
    addMesh(g,new THREE.BoxGeometry(.2,.82,.09),rubber,[0,-.56,-.01]);
  } else if(id==='sneaker'){
    addMesh(g,new THREE.SphereGeometry(1,32,24),rubber,[0,-.42,0],[0,0,0],[1.7,.20,.62]);
    addMesh(g,new THREE.SphereGeometry(1,32,24),paint,[.0,-.05,0],[0,0,-.05],[1.45,.52,.57]);
    addMesh(g,new THREE.SphereGeometry(1,24,18),glass,[.85,-.12,0],[0,0,.10],[.60,.42,.52]);
    for(let i=0;i<5;i++) addTube(g,[[.38-i*.18,.38,-.32],[.28-i*.18,.44,0],[.38-i*.18,.38,.32]],.018,metal,24);
  }
  return g;
}

function makeHammerRoot() {
  const root=new THREE.Group();root.add(createStormHammer());return root;
}
function clearActive() {
  if(!activeRoot)return;
  scene.remove(activeRoot);
  activeRoot.traverse(o=>{
    if(o.geometry)o.geometry.dispose();
    if(o.material){
      const materials=Array.isArray(o.material)?o.material:[o.material];
      materials.forEach(m=>m.dispose());
    }
  });
  activeRoot=null;
}
function fitModel(model) {
  model.updateMatrixWorld(true);
  const box=new THREE.Box3().setFromObject(model);
  const size=box.getSize(new THREE.Vector3());
  const center=box.getCenter(new THREE.Vector3());
  const maxDim=Math.max(size.x,size.y,size.z);
  if(!Number.isFinite(maxDim)||maxDim<=0)throw new Error('The model has invalid dimensions.');
  model.position.sub(center);
  const scale=3.15/maxDim;
  model.scale.setScalar(scale);
  const normalizedHeight=size.y*scale;
  const root=new THREE.Group();
  root.add(model);
  root.position.y=-1.06+normalizedHeight/2;
  root.rotation.y=-.42;
  return root;
}
async function selectModel(id, announce=true) {
  const info=ASSETS[id];if(!info)return;
  activeObjectId=id;
  document.querySelectorAll('.model-card').forEach(b=>b.classList.toggle('active',b.dataset.model===id));
  modelTitle.textContent=info.title;modelSubtitle.textContent=info.subtitle;
  selectedModelStat.textContent=info.title.toUpperCase();
  $('detailGlyph').textContent=info.glyph;$('detailName').textContent=info.title;
  $('detailCategory').textContent=info.category;$('detailDescription').textContent=info.description;
  $('modelFormat').textContent=info.format;
  $('assetLabel').textContent=info.url?'CC0 GLB ASSET':'ORIGINAL 3D MODEL';
  modelError.classList.add('hidden');
  loadState.classList.remove('hidden');
  loadState.querySelector('span:last-child').textContent=`Loading ${info.title}…`;
  clearActive();
  try {
    let root;
    if(info.url){
      const gltf=await loader.loadAsync(info.url);
      const model=gltf.scene;
      model.traverse(o=>{
        if(o.isMesh){o.castShadow=true;o.receiveShadow=true;
          if(o.material){const mats=Array.isArray(o.material)?o.material:[o.material];mats.forEach(m=>{if(m.map)m.map.colorSpace=THREE.SRGBColorSpace;});}
        }
      });
      root=fitModel(model);
    } else {
      root=makeHammerRoot();
      // Rest the handle end close to the studio plinth while keeping the tall hammer centered.
      root.position.y=1.02;
      root.rotation.y=-.42;
    }
    if(activeObjectId!==id){disposeDetached(root);return;}
    activeRoot=root;scene.add(activeRoot);
    const target=activeRoot;
    target.scale.setScalar(.92);
    const start=performance.now();
    const grow=()=>{if(activeRoot!==target)return;const t=Math.min(1,(performance.now()-start)/360);target.scale.setScalar(.92+.08*(1-Math.pow(1-t,3)));if(t<1)requestAnimationFrame(grow);};
    grow();
    resetCamera();
    loadState.classList.add('hidden');
    if(announce)showToast(`${info.title} loaded`);
  } catch(error) {
    console.warn(`Could not load ${id} GLB. Using local fallback:`,error);
    if(activeObjectId!==id)return;
    activeRoot=id==='hammer'?makeHammerRoot():createFallback(id);
    const infoBox=new THREE.Box3().setFromObject(activeRoot);
    const size=infoBox.getSize(new THREE.Vector3());
    const maxDim=Math.max(size.x,size.y,size.z)||1;
    activeRoot.scale.setScalar(3.1/maxDim);
    activeRoot.position.y=-.2;
    scene.add(activeRoot);
    loadState.classList.add('hidden');
    modelError.textContent='The hosted 3D asset could not be reached. A local preview model is shown instead. Check your connection to load the detailed asset.';
    modelError.classList.remove('hidden');
  }
}
function disposeDetached(root){root.traverse(o=>{if(o.geometry)o.geometry.dispose();});}
function resetCamera(){
  camera.position.set(4.2,2.35,6.3);
  controls.target.set(0,activeObjectId==='hammer' ? 0.48 : -0.20,0);
  controls.update();
}
function zoomBy(factor){
  const offset=camera.position.clone().sub(controls.target);
  offset.multiplyScalar(factor);
  offset.clampLength(3.0,10.5);
  camera.position.copy(controls.target).add(offset);
}
function resizeRenderer(){
  if(!renderer||!camera)return;
  const w=viewport.clientWidth,h=viewport.clientHeight;if(!w||!h)return;
  renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();
}

function initThree(){
  renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.12;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  scene=new THREE.Scene();scene.background=new THREE.Color(0x111820);scene.fog=new THREE.Fog(0x111820,13,28);
  camera=new THREE.PerspectiveCamera(36,1,.1,100);
  // OrbitControls is required by resetCamera(), zoomBy(), and the render loop.
  // Keep mouse/touch as an accessible fallback alongside browser hand gestures.
  controls=new OrbitControls(camera,renderer.domElement);
  controls.enableDamping=true;
  controls.dampingFactor=.065;
  controls.minDistance=3.0;
  controls.maxDistance=10.5;
  controls.target.set(0,-.20,0);
  scene.add(new THREE.HemisphereLight(0xe4f0ef,0x171c22,2.0));
  const key=new THREE.DirectionalLight(0xffead3,4.0);key.position.set(4,7,5);key.castShadow=true;key.shadow.mapSize.set(2048,2048);scene.add(key);
  const fill=new THREE.DirectionalLight(0xb7d8dc,2.0);fill.position.set(-5,2,3);scene.add(fill);
  const rim=new THREE.PointLight(0x74b9bb,24,13);rim.position.set(0,3,-4);scene.add(rim);
  const warm=new THREE.PointLight(0xb18b62,9,10);warm.position.set(4,1,4);scene.add(warm);
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(200,200),mat(0x151c22,.75,.18));
  floor.rotation.x=-Math.PI/2;floor.position.y=-1.13;floor.receiveShadow=true;scene.add(floor);
  const platform=new THREE.Mesh(new THREE.CylinderGeometry(2.25,2.32,.12,96),mat(0x252e34,.7,.42));
  platform.position.y=-1.08;platform.receiveShadow=true;platform.castShadow=true;scene.add(platform);
  const platformEdge=new THREE.Mesh(new THREE.TorusGeometry(2.25,.018,8,100),new THREE.MeshStandardMaterial({color:0x8aa7a2,metalness:.8,roughness:.28,emissive:0x203331,emissiveIntensity:.2}));
  platformEdge.rotation.x=Math.PI/2;platformEdge.position.y=-1.015;scene.add(platformEdge);
  // Subtle studio environment for proper metallic reflections on GLB materials.
  const pmrem=new THREE.PMREMGenerator(renderer);
  environmentTarget=pmrem.fromScene(new RoomEnvironment(),.04);
  scene.environment=environmentTarget.texture;
  pmrem.dispose();
  loader=new GLTFLoader();loader.setCrossOrigin('anonymous');
  resizeRenderer();new ResizeObserver(resizeRenderer).observe(viewport);
  selectModel('hammer',false);
  $('stateText').textContent='3D STUDIO ONLINE';
  $('stateDot').classList.add('active');
  animate();
}
function animate(){
  animationFrame=requestAnimationFrame(animate);
  if(controls){controls.autoRotate=false;controls.update();}
  if(activeRoot&&autoRotate&&pinchMode!=='rotate')activeRoot.rotation.y+=.0018;
  renderer.render(scene,camera);
}

// Mouse/touch OrbitControls are retained as an accessibility fallback; gesture input is primary.
function bindUI(){
  document.querySelectorAll('.model-card').forEach(btn=>btn.addEventListener('click',()=>selectModel(btn.dataset.model)));
  $('resetView').addEventListener('click',()=>{resetCamera();if(activeRoot)activeRoot.rotation.set(0,activeObjectId==='hammer'?-.04:0,-.42);});
  $('autoRotate').addEventListener('click',()=>{autoRotate=!autoRotate;$('autoRotate').querySelector('b').textContent=autoRotate?'Auto rotate: ON':'Auto rotate';});
  $('zoomIn').addEventListener('click',()=>zoomBy(.84));
  $('zoomOut').addEventListener('click',()=>zoomBy(1.19));
  $('enableHand').addEventListener('click',()=>handModeOn?stopHandMode():startHandMode());
  $('showCamera').addEventListener('click',()=>showCameraDock());
  $('cameraMinimize').addEventListener('click',()=>{$('cameraDock').classList.add('minimized');$('cameraRestore').classList.remove('hidden');});
  $('cameraRestore').addEventListener('click',()=>{$('cameraDock').classList.remove('minimized');$('cameraRestore').classList.add('hidden');});
  $('cameraMaximize').addEventListener('click',()=>{$('cameraDock').classList.toggle('maximized');$('cameraDock').classList.remove('minimized');$('cameraRestore').classList.add('hidden');});
  $('cameraStop').addEventListener('click',stopHandMode);
  $('hideCameraPreview').addEventListener('click',hideCameraDock);
  $('showGestureHelp').addEventListener('click',()=>$('gestureHelp').showModal());
  $('closeHelp').addEventListener('click',()=>$('gestureHelp').close());
  $('closeHelpBottom').addEventListener('click',()=>$('gestureHelp').close());
  canvas.addEventListener('pointerdown',()=>{});
  window.addEventListener('keydown',e=>{if(e.key.toLowerCase()==='r')resetCamera();});
}
function showCameraDock(){
  $('cameraDock').classList.remove('hidden','minimized');
  $('cameraRestore').classList.add('hidden');
  $('showCamera').classList.add('hidden');
}
function hideCameraDock(){
  $('cameraDock').classList.add('hidden');
  $('cameraRestore').classList.add('hidden');
  $('showCamera').classList.remove('hidden');
}
function drawLandmarks(ctx,lm,w,h){
  const chains=[[0,1,2,3,4],[0,5,6,7,8],[5,9,10,11,12],[9,13,14,15,16],[13,17,18,19,20],[0,17]];
  ctx.lineWidth=2.2;ctx.strokeStyle='#a5d8c8';ctx.fillStyle='#eaf7ee';ctx.shadowColor='#77c6b0';ctx.shadowBlur=7;
  for(const chain of chains){ctx.beginPath();chain.forEach((id,i)=>{const x=lm[id].x*w,y=lm[id].y*h;if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);});ctx.stroke();}
  for(const p of lm){ctx.beginPath();ctx.arc((1-p.x)*w,p.y*h,3.1,0,Math.PI*2);ctx.fill();}
  ctx.shadowBlur=0;
}
function fingerUp(lm,tip){return lm[tip].y<lm[tip-2].y;}
function setGesture(message){
  lastGesture=message;$('cameraGestureState').textContent=message;$('cameraHint').textContent=message;
  setHandStatus(message,true);
}
function closestControl(el){return el?.closest('button,[data-model]')||null;}
function onGestureFrame(landmarks){
  const lm=landmarks[0];
  const ix=lm[8],thumb=lm[4];
  const pinchDistance=Math.hypot(ix.x-thumb.x,ix.y-thumb.y);
  const isPinching=pinchActive?pinchDistance<.068:pinchDistance<.048;
  const twoFinger=fingerUp(lm,8)&&fingerUp(lm,12)&&!fingerUp(lm,16)&&!fingerUp(lm,20);
  const openPalm=[8,12,16,20].every(t=>fingerUp(lm,t));
  const rawX=(1-ix.x)*innerWidth,rawY=ix.y*innerHeight;
  pointerX+=(rawX-pointerX)*.48;pointerY+=(rawY-pointerY)*.48;
  $('gesturePointer').style.left=pointerX+'px';$('gesturePointer').style.top=pointerY+'px';
  $('gesturePointer').classList.remove('hidden');
  $('gesturePointer').classList.toggle('pinching',isPinching);
  const currentTarget=document.elementFromPoint(pointerX,pointerY);
  const actionable=closestControl(currentTarget);
  document.querySelectorAll('.gesture-hover').forEach(el=>el.classList.remove('gesture-hover'));
  if(actionable)actionable.classList.add('gesture-hover');

  if(isPinching&&!pinchActive){
    pinchActive=true;lastPinchPoint={x:ix.x,y:ix.y};
    if(currentTarget===canvas||currentTarget?.closest('#viewport')){pinchMode='rotate';pinchTarget=null;setGesture('PINCH · GRABBED MODEL');}
    else{pinchMode='click';pinchTarget=actionable;setGesture(pinchTarget?'PINCH · CONTROL SELECTED':'PINCH · READY');}
  } else if(isPinching&&pinchActive){
    if(pinchMode==='rotate'&&activeRoot&&lastPinchPoint){
      const dx=ix.x-lastPinchPoint.x,dy=ix.y-lastPinchPoint.y;
      activeRoot.rotation.y+=dx*Math.PI*3.6;
      activeRoot.rotation.x+=dy*Math.PI*2.2;
    }
    lastPinchPoint={x:ix.x,y:ix.y};
  } else if(!isPinching&&pinchActive){
    if(pinchMode==='click'&&pinchTarget&&pinchTarget.isConnected){
      pinchTarget.click();
      showToast('Selected');
    }
    pinchActive=false;pinchMode=null;pinchTarget=null;lastPinchPoint=null;
  }

  if(!pinchActive&&twoFinger){
    setGesture('TWO FINGERS · ZOOM');
    if(lastTwoFingerY!==null){
      const dy=ix.y-lastTwoFingerY;
      zoomBy(Math.exp(dy*4.0));
    }
    lastTwoFingerY=ix.y;
  } else if(!twoFinger)lastTwoFingerY=null;

  if(!pinchActive&&!twoFinger&&openPalm){
    setGesture('OPEN PALM · SWIPE TO SWITCH');
    const palmX=(lm[0].x+lm[5].x+lm[9].x+lm[13].x+lm[17].x)/5;
    if(lastPalmX===null)lastPalmX=palmX;
    else if(Math.abs(palmX-lastPalmX)>.18&&performance.now()-lastSwipeAt>1100){
      const direction=palmX-lastPalmX;
      const ids=Object.keys(ASSETS),index=ids.indexOf(activeObjectId);
      const next=(index+(direction>0?1:ids.length-1))%ids.length;
      selectModel(ids[next]);
      lastSwipeAt=performance.now();lastPalmX=palmX;
      showToast('Switched object');
    }
  } else if(!openPalm)lastPalmX=null;

  if(!pinchActive&&!twoFinger&&!openPalm)setGesture(actionable?'POINT · PINCH TO SELECT':'POINT · MOVE POINTER');
}
async function startHandMode(){
  const btn=$('enableHand');
  btn.disabled=true;btn.textContent='Preparing camera…';
  try{
    const vision=await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/+esm');
    const fileset=await vision.FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm');
    const modelOptions={
      baseOptions:{
        modelAssetPath:'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
        delegate:'GPU'
      },
      runningMode:'VIDEO',numHands:1
    };
    try {
      handLandmarker=await vision.HandLandmarker.createFromOptions(fileset,modelOptions);
    } catch (gpuError) {
      console.warn('GPU delegate unavailable; retrying with CPU.',gpuError);
      modelOptions.baseOptions.delegate='CPU';
      handLandmarker=await vision.HandLandmarker.createFromOptions(fileset,modelOptions);
    }
    cameraStream=await navigator.mediaDevices.getUserMedia({
      video:{facingMode:'user',width:{ideal:640},height:{ideal:480}},audio:false
    });
    const video=$('cameraVideo');video.srcObject=cameraStream;await video.play();
    handModeOn=true;showCameraDock();$('enableHand').textContent='Disable hand mode';$('enableHand').classList.add('enabled');$('enableHand').disabled=false;
    $('stateText').textContent='HAND MODE ACTIVE';$('stateDot').classList.add('active');
    $('handStatus').textContent='Camera active · Show your hand';$('cameraFps').textContent='LIVE';
    setHandStatus('Camera active · Show your hand',true);
    requestAnimationFrame(handLoop);
    showToast('Hand control enabled');
  }catch(err){
    console.error(err);
    $('enableHand').disabled=false;$('enableHand').textContent='Enable hand mode';
    if(handLandmarker){handLandmarker.close();handLandmarker=null;}
    const msg=err?.name==='NotAllowedError'?'Camera permission was denied. Allow camera access in your browser.':
      err?.name==='NotFoundError'?'No webcam was found on this device.':
      'Could not start hand tracking. Check your internet connection and camera permission.';
    showToast(msg);$('handStatus').textContent=msg;
  }
}
function handLoop(){
  if(!handModeOn)return;
  const video=$('cameraVideo'),overlay=$('cameraOverlay'),ctx=overlay.getContext('2d');
  if(video.readyState>=2&&video.currentTime!==lastVideoTime){
    lastVideoTime=video.currentTime;
    overlay.width=video.videoWidth;overlay.height=video.videoHeight;
    ctx.clearRect(0,0,overlay.width,overlay.height);
    try{
      const results=handLandmarker.detectForVideo(video,performance.now());
      if(results.landmarks?.length){
        drawLandmarks(ctx,results.landmarks[0],overlay.width,overlay.height);
        onGestureFrame(results.landmarks);
      }else{
        $('gesturePointer').classList.add('hidden');
        document.querySelectorAll('.gesture-hover').forEach(el=>el.classList.remove('gesture-hover'));
        pinchActive=false;pinchMode=null;pinchTarget=null;lastPinchPoint=null;lastTwoFingerY=null;lastPalmX=null;
        setGesture('SHOW ONE HAND TO CAMERA');
      }
    }catch(error){console.warn('Hand tracking frame error',error);}
  }
  requestAnimationFrame(handLoop);
}
function stopHandMode(){
  handModeOn=false;
  if(cameraStream){cameraStream.getTracks().forEach(track=>track.stop());cameraStream=null;}
  if(handLandmarker){handLandmarker.close();handLandmarker=null;}
  $('cameraVideo').srcObject=null;
  $('cameraDock').classList.add('hidden','minimized');
  $('cameraDock').classList.remove('maximized');
  $('cameraRestore').classList.add('hidden');
  $('showCamera').classList.add('hidden');
  $('gesturePointer').classList.add('hidden');
  document.querySelectorAll('.gesture-hover').forEach(el=>el.classList.remove('gesture-hover'));
  $('enableHand').textContent='Enable hand mode';$('enableHand').classList.remove('enabled');$('enableHand').disabled=false;
  $('stateText').textContent='3D STUDIO READY';$('stateDot').classList.remove('active');
  $('handStatus').textContent='Hand mode is off';$('cameraGestureState').textContent='Hand mode stopped';
  controlModeLabel.textContent='MOUSE / TOUCH READY';
  pinchActive=false;pinchMode=null;pinchTarget=null;lastTwoFingerY=null;lastPalmX=null;
  showToast('Hand control disabled');
}

// Start rendering immediately; camera is opt-in and is never opened in another tab.
try{
  initThree();bindUI();
}catch(error){
  console.error(error);loadState.classList.add('hidden');
  modelError.textContent='The 3D renderer could not start. Try Chrome or Edge with hardware acceleration enabled.';
  modelError.classList.remove('hidden');
  $('stateText').textContent='3D RENDER ERROR';
}
window.addEventListener('beforeunload',()=>{
  if(animationFrame)cancelAnimationFrame(animationFrame);
  if(cameraStream)cameraStream.getTracks().forEach(t=>t.stop());
});
