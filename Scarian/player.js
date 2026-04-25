'use strict';
// ═══════════════════════════════════════════════════════════════
//  PLAYER.JS — Controles completos + HUD + block breaking +
//              item drops con física y atracción + hotbar GUI
// ═══════════════════════════════════════════════════════════════

// ── Estado del jugador ──────────────────────────────────────────
let velY          = 0;
let onGround      = false;
let isRunning     = false;
let spectatorMode = false;
let flySpeed      = 12;
const FLY_SPEEDS  = [8, 14, 22, 40];
let flySpeedIdx   = 1;

const PLAYER_HEIGHT = 1.65;
const WALK_SPEED    = 5.5;
const RUN_SPEED     = 10.5;
const JUMP_FORCE    = 8.0;
const GRAVITY       = -24;
const WATER_GRAVITY = -4;
const WATER_JUMP    = 3.2;
const SWIM_SPEED    = 3.5;
const SNOW_SPEED    = 2.8;

// ── Durabilidad de bloques (ticks para romper) ─────────────────
const BLOCK_HARDNESS = {
  [window.GRASS]:    2.0,
  [window.DIRT]:     1.5,
  [window.STONE]:    7.5,
  [window.WOOD]:     4.0,
  [window.LEAVES]:   0.8,
  [window.SAND]:     1.5,
  [window.SNOW]:     0.5,
  [window.WATER]:    0,
  [window.SNOW_STONE||9]: 6.0,
  [window.GRAVEL||10]:    1.8,
  [window.RED_DIRT||11]:  1.5,
  [12]: 2.0,  // DRY_GRASS
  [13]: 4.0,  // TROP_WOOD
  [14]: 0.8,  // TROP_LEAVES
  [15]: 0.8,  // CLOUD_LEAVES
  [16]: 1.5,  // MUD_DIRT
  [17]: 0.8,  // MANGROVE_LEAVES
  [18]: 0,    // SWAMP_WATER
  [19]: 4.0,  // ACACIA_WOOD
  [20]: 2.0,  // SAVANNA_GRASS
  [21]: 0.8,  // ACACIA_LEAVES
};

// ── Sistema de rotura de bloques ──────────────────────────────
let breakTarget      = null;
let breakProgress    = 0;
let breakStage       = -1;
let breakOverlayMesh = null;
const BREAK_STAGES   = 10;
const destroyTextures = [];

(function loadDestroyTextures(){
  for(let i = 0; i < 10; i++){
    const t = new THREE.TextureLoader().load('destroy_stage_' + i + '.png');
    t.magFilter = t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    destroyTextures.push(t);
  }
})();

function getBreakDuration(block){
  return (BLOCK_HARDNESS[block] !== undefined ? BLOCK_HARDNESS[block] : 3.0);
}

function startBreaking(x, y, z){
  if(breakTarget && breakTarget.x === x && breakTarget.y === y && breakTarget.z === z) return;
  stopBreaking();
  breakTarget   = {x, y, z};
  breakProgress = 0;
  breakStage    = -1;
  const geo = new THREE.BoxGeometry(1.02, 1.02, 1.02);
  const mat = new THREE.MeshBasicMaterial({
    map: destroyTextures[0],
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  breakOverlayMesh = new THREE.Mesh(geo, mat);
  breakOverlayMesh.position.set(x + 0.5, y + 0.5, z + 0.5);
  scene.add(breakOverlayMesh);
}

function stopBreaking(){
  if(breakOverlayMesh){
    scene.remove(breakOverlayMesh);
    breakOverlayMesh.geometry.dispose();
    breakOverlayMesh = null;
  }
  breakTarget   = null;
  breakProgress = 0;
  breakStage    = -1;
}

function updateBreaking(dt){
  if(!mouseButtons[0] || !window.hitBlock || spectatorMode){
    stopBreaking();
    return;
  }
  const {x, y, z} = window.hitBlock;
  startBreaking(x, y, z);
  const b   = getBlock(x, y, z);
  const dur = getBreakDuration(b);
  if(dur <= 0){ finishBreaking(x, y, z, b); stopBreaking(); return; }

  breakProgress += dt / dur;
  const stage = Math.floor(breakProgress * BREAK_STAGES);

  if(stage !== breakStage && stage < BREAK_STAGES){
    breakStage = stage;
    if(breakOverlayMesh) breakOverlayMesh.material.map = destroyTextures[Math.min(stage, 9)];
  }

  if(breakProgress >= 1.0){
    finishBreaking(x, y, z, b);
    stopBreaking();
  }
}

function finishBreaking(x, y, z, b){
  addItem(b, 1);
  setBlock(x, y, z, window.AIR);
  showMsg('+ ' + (window.BLOCK_NAMES[b] || 'Bloque'));
  renderHotbar();
  spawnItemDrop(x, y, z, b);
  castRay();
}

// ── Sistema de items flotantes ─────────────────────────────────
const itemDrops = [];

function makeItemIcon(type){
  const c   = document.createElement('canvas');
  c.width   = c.height = 16;
  const ctx = c.getContext('2d');
  const tex = window.BLOCK_ICON ? window.BLOCK_ICON[type] : null;
  if(tex && tex.image){ ctx.drawImage(tex.image, 0, 0, 16, 16); }
  else{ ctx.fillStyle = '#888'; ctx.fillRect(0, 0, 16, 16); }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  return t;
}

function spawnItemDrop(bx, by, bz, type){
  const tex  = makeItemIcon(type);
  const geo  = new THREE.PlaneGeometry(0.45, 0.45);
  const mat  = new THREE.MeshBasicMaterial({map: tex, transparent: true, alphaTest: 0.1, depthWrite: false, side: THREE.DoubleSide});
  const mesh = new THREE.Mesh(geo, mat);

  const ox = (Math.random() - 0.5) * 0.5;
  const oz = (Math.random() - 0.5) * 0.5;
  mesh.position.set(bx + 0.5 + ox, by + 0.7, bz + 0.5 + oz);
  scene.add(mesh);

  itemDrops.push({
    mesh, type,
    vy: 2 + Math.random() * 1.5,
    vx: (Math.random() - 0.5) * 2,
    vz: (Math.random() - 0.5) * 2,
    bobTime: Math.random() * Math.PI * 2,
    age: 0,
    collected: false,
    attracted: false,
  });
}

const ITEM_PICKUP_RANGE  = 1.4;
const ITEM_ATTRACT_RANGE = 3.5;
const ITEM_GRAVITY       = -9;
const ITEM_BOB_SPEED     = 2.2;
const ITEM_BOB_AMP       = 0.08;
const ITEM_ATTRACT_SPEED = 8;
const ITEM_LIFETIME      = 300;

function updateItemDrops(dt){
  const px = camera.position.x, py = camera.position.y - 0.8, pz = camera.position.z;
  const toRemove = [];

  for(let i = 0; i < itemDrops.length; i++){
    const item = itemDrops[i];
    if(item.collected){ toRemove.push(i); continue; }
    item.age += dt;
    if(item.age > ITEM_LIFETIME){
      toRemove.push(i);
      scene.remove(item.mesh);
      item.mesh.geometry.dispose();
      continue;
    }

    const dx   = px - item.mesh.position.x;
    const dy   = py - item.mesh.position.y;
    const dz   = pz - item.mesh.position.z;
    const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);

    if(dist < ITEM_PICKUP_RANGE){
      addItem(item.type, 1);
      renderHotbar();
      scene.remove(item.mesh);
      item.mesh.geometry.dispose();
      item.collected = true;
      showMsg('+ ' + (window.BLOCK_NAMES[item.type] || 'Item'));
      toRemove.push(i);
      continue;
    }

    if(dist < ITEM_ATTRACT_RANGE){
      item.attracted = true;
      const spd = ITEM_ATTRACT_SPEED * (1 - dist / ITEM_ATTRACT_RANGE + 0.3);
      item.mesh.position.x += (dx / dist) * spd * dt;
      item.mesh.position.y += (dy / dist) * spd * dt;
      item.mesh.position.z += (dz / dist) * spd * dt;
    } else {
      item.attracted = false;
      item.vy += ITEM_GRAVITY * dt;
      item.vx *= Math.pow(0.85, dt * 60);
      item.vz *= Math.pow(0.85, dt * 60);

      item.mesh.position.x += item.vx * dt;
      item.mesh.position.z += item.vz * dt;
      item.mesh.position.y += item.vy * dt;

      const bx    = Math.floor(item.mesh.position.x);
      const by    = Math.floor(item.mesh.position.y - 0.05);
      const bz    = Math.floor(item.mesh.position.z);
      const below = getBlock(bx, by, bz);
      if(below !== window.AIR && below !== window.WATER && below !== 8 && below !== 18){
        item.mesh.position.y = by + 1 + 0.3;
        item.vy = 0; item.vx = 0; item.vz = 0;
      }

      item.bobTime += ITEM_BOB_SPEED * dt;
      item.mesh.position.y += Math.sin(item.bobTime) * ITEM_BOB_AMP * dt * 30;
    }

    item.mesh.lookAt(camera.position);
  }

  for(let i = toRemove.length - 1; i >= 0; i--) itemDrops.splice(toRemove[i], 1);
}

// ── Input ───────────────────────────────────────────────────────
const keys         = {};
const mouseButtons = {};
let pitchDelta   = 0, yawDelta = 0;
let pointerLocked  = false;

document.addEventListener('keydown', e => {
  keys[e.code] = true;

  if(e.code === 'KeyE'){
    if(!pointerLocked) return;
    const open = invpanel.style.display === 'block';
    invpanel.style.display = open ? 'none' : 'block';
    if(!open) renderInv();
  }
  if(e.code === 'KeyF'){
    spectatorMode = !spectatorMode;
    velY = 0;
    stopBreaking();
    showMsg(spectatorMode ? '👁 Modo Espectador' : '🧍 Modo Jugador');
  }
  if(e.code === 'KeyR' && spectatorMode){
    flySpeedIdx = (flySpeedIdx + 1) % FLY_SPEEDS.length;
    flySpeed    = FLY_SPEEDS[flySpeedIdx];
    showMsg('✈ Velocidad: ' + flySpeed);
  }
  if(e.code >= 'Digit1' && e.code <= 'Digit8'){
    window.hotbarSel = parseInt(e.code[5]) - 1;
    const t = window.hotbar[window.hotbarSel];
    selblockEl.textContent = t ? 'Bloque: ' + BLOCK_NAMES[t] : 'Sin bloque';
    renderHotbar();
  }
});
document.addEventListener('keyup', e => { keys[e.code] = false; });

blocker.addEventListener('click', () => { document.getElementById('wrap').requestPointerLock(); });
document.getElementById('invclose').addEventListener('click', () => { invpanel.style.display = 'none'; });

document.addEventListener('pointerlockchange', () => {
  pointerLocked = !!document.pointerLockElement;
  blocker.style.display = pointerLocked ? 'none' : 'flex';
  if(!pointerLocked){ invpanel.style.display = 'none'; stopBreaking(); }
});

document.addEventListener('mousemove', e => {
  if(!pointerLocked) return;
  yawDelta   -= e.movementX * 0.002;
  pitchDelta -= e.movementY * 0.002;
});

document.addEventListener('mousedown', e => {
  mouseButtons[e.button] = true;
  if(!pointerLocked || invpanel.style.display === 'block') return;

  if(e.button === 2 && window.hitBlock && window.hitFace){
    const t = window.hotbar[window.hotbarSel];
    if(t == null){ showMsg('Sin bloque seleccionado'); return; }
    if(!hasItem(t)){ showMsg('Sin ' + BLOCK_NAMES[t]); return; }
    const px = window.hitBlock.x + window.hitFace.x;
    const py = window.hitBlock.y + window.hitFace.y;
    const pz = window.hitBlock.z + window.hitFace.z;
    const cx = Math.floor(camera.position.x);
    const cy = Math.floor(camera.position.y);
    const cz = Math.floor(camera.position.z);
    if(px === cx && (py === cy || py === cy - 1) && pz === cz) return;
    setBlock(px, py, pz, t);
    removeItem(t, 1);
    renderHotbar();
    castRay();
  }
});
document.addEventListener('mouseup',      e => { mouseButtons[e.button] = false; if(e.button === 0) stopBreaking(); });
document.addEventListener('contextmenu',  e => e.preventDefault());

document.addEventListener('wheel', e => {
  if(!pointerLocked) return;
  if(spectatorMode){
    flySpeedIdx = (flySpeedIdx + (e.deltaY > 0 ? 1 : -1) + FLY_SPEEDS.length) % FLY_SPEEDS.length;
    flySpeed    = FLY_SPEEDS[flySpeedIdx];
    showMsg('✈ Velocidad: ' + flySpeed);
    return;
  }
  window.hotbarSel = (window.hotbarSel + (e.deltaY > 0 ? 1 : -1) + 8) % 8;
  const t = window.hotbar[window.hotbarSel];
  selblockEl.textContent = t ? 'Bloque: ' + BLOCK_NAMES[t] : 'Sin bloque';
  renderHotbar();
}, {passive: true});

// ── Colisión ────────────────────────────────────────────────────
const COLLIDER_W = 0.3;

function collidesAt(px, py, pz){
  const x0 = Math.floor(px - COLLIDER_W), x1 = Math.floor(px + COLLIDER_W);
  const y0 = Math.floor(py - PLAYER_HEIGHT), y1 = Math.floor(py + 0.1);
  const z0 = Math.floor(pz - COLLIDER_W), z1 = Math.floor(pz + COLLIDER_W);
  for(let x = x0; x <= x1; x++)
  for(let y = y0; y <= y1; y++)
  for(let z = z0; z <= z1; z++){
    const b = getBlock(x, y, z);
    if(b !== window.AIR && b !== window.WATER && b !== window.SNOW &&
       b !== 5 && b !== 14 && b !== 15 && b !== 17 && b !== 21 && b !== 18) return true;
  }
  return false;
}

function isInWater(){
  const ey = Math.floor(camera.position.y - 0.2);
  const b  = getBlock(Math.floor(camera.position.x), ey, Math.floor(camera.position.z));
  return b === window.WATER || b === 18;
}

function isOnSnow(){
  const fx = Math.floor(camera.position.x), fz = Math.floor(camera.position.z);
  const fy = Math.floor(camera.position.y - PLAYER_HEIGHT + 0.1);
  return getBlock(fx, fy, fz) === window.SNOW || getBlock(fx, fy - 1, fz) === window.SNOW;
}

// ── updatePlayer — llamado cada frame ──────────────────────────
function updatePlayer(dt){
  camera.rotation.y += yawDelta;
  camera.rotation.x  = Math.max(-Math.PI/2 + 0.01, Math.min(Math.PI/2 - 0.01, camera.rotation.x + pitchDelta));
  yawDelta = 0; pitchDelta = 0;

  castRay();
  updateBreaking(dt);
  updateItemDrops(dt);

  // Modo espectador
  if(spectatorMode){
    const fwd   = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(0, camera.rotation.y, 0));
    const right = new THREE.Vector3(1, 0,  0).applyEuler(new THREE.Euler(0, camera.rotation.y, 0));
    const move  = new THREE.Vector3();
    if(keys['KeyW']    || keys['ArrowUp'])    move.addScaledVector(fwd,   1);
    if(keys['KeyS']    || keys['ArrowDown'])  move.addScaledVector(fwd,  -1);
    if(keys['KeyA']    || keys['ArrowLeft'])  move.addScaledVector(right,-1);
    if(keys['KeyD']    || keys['ArrowRight']) move.addScaledVector(right, 1);
    if(keys['Space'])      move.y += 1;
    if(keys['ShiftLeft'])  move.y -= 1;
    if(move.lengthSq() > 0) move.normalize();
    camera.position.addScaledVector(move, flySpeed * dt);
    waterOverlay.style.display = 'none';
    lavOverlay.style.display   = 'none';
    return;
  }

  // Física
  const inWater = isInWater();
  const onSnow  = !inWater && isOnSnow();
  isRunning     = keys['ShiftLeft'] && !inWater && !onSnow;
  const speed   = inWater ? SWIM_SPEED : onSnow ? SNOW_SPEED : isRunning ? RUN_SPEED : WALK_SPEED;

  const fwd   = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(0, camera.rotation.y, 0));
  const right = new THREE.Vector3(1, 0,  0).applyEuler(new THREE.Euler(0, camera.rotation.y, 0));
  const move  = new THREE.Vector3();
  if(keys['KeyW']    || keys['ArrowUp'])    move.addScaledVector(fwd,   1);
  if(keys['KeyS']    || keys['ArrowDown'])  move.addScaledVector(fwd,  -1);
  if(keys['KeyA']    || keys['ArrowLeft'])  move.addScaledVector(right,-1);
  if(keys['KeyD']    || keys['ArrowRight']) move.addScaledVector(right, 1);
  if(move.lengthSq() > 0.001){ move.y = 0; move.normalize(); }

  if(keys['Space']){
    if(onGround){ velY = JUMP_FORCE; onGround = false; }
    else if(inWater) velY = WATER_JUMP;
  }

  velY += (inWater ? WATER_GRAVITY : GRAVITY) * dt;
  velY  = Math.max(velY, inWater ? -4 : -50);

  const pos = camera.position;
  const dx  = move.x * speed * dt;
  if(Math.abs(dx) > 0.0001){ pos.x += dx; if(collidesAt(pos.x, pos.y, pos.z)) pos.x -= dx; }
  const dz  = move.z * speed * dt;
  if(Math.abs(dz) > 0.0001){ pos.z += dz; if(collidesAt(pos.x, pos.y, pos.z)) pos.z -= dz; }
  const dy  = velY * dt;
  pos.y += dy;
  if(collidesAt(pos.x, pos.y, pos.z)){
    onGround = dy < 0;
    pos.y -= dy; velY = 0;
  } else { onGround = false; }

  if(pos.y < -195 + PLAYER_HEIGHT){ pos.y = -195 + PLAYER_HEIGHT; velY = 0; onGround = true; }
  if(pos.y > 195) pos.y = 195;

  waterOverlay.style.display = inWater ? 'block' : 'none';
  lavOverlay.style.display   = 'none';
}