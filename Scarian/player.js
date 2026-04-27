'use strict';
// ═══════════════════════════════════════════════════════════════
//  PLAYER.JS — Jugador de 2 bloques de alto + físicas completas
// ═══════════════════════════════════════════════════════════════

// ── Estado del jugador ──────────────────────────────────────────
let velY          = 0;
let onGround      = false;
let isRunning     = false;
let spectatorMode = false;
let flySpeed      = 14;
const FLY_SPEEDS  = [8, 14, 22, 40];
let flySpeedIdx   = 1;

// 2 bloques de alto: ojos a 1.62 sobre los pies, pies = cámara - 1.62
const PLAYER_HEIGHT = 1.62;   // distancia de pies a ojos (≈ Minecraft)
const PLAYER_HALF_W = 0.29;   // medio ancho del colisionador (0.58 de ancho total)

const WALK_SPEED    = 4.3;
const RUN_SPEED     = 9.0;
const JUMP_FORCE    = 8.0;
const GRAVITY       = -24;
const WATER_GRAVITY = -4;
const WATER_JUMP    = 5.5;
const SWIM_SPEED    = 3.0;
const SNOW_SPEED    = 2.8;

// ── Durabilidad de bloques ─────────────────────────────────────
const BLOCK_HARDNESS = {
  1: 2.0,  // GRASS
  2: 1.5,  // DIRT
  3: 7.5,  // STONE
  4: 4.0,  // WOOD
  5: 0.8,  // LEAVES
  6: 1.5,  // SAND
  7: 0.5,  // SNOW
  8: 0,    // WATER
  9: 6.0,  // SNOW_STONE
  10: 1.8, // GRAVEL
  11: 1.5, // RED_DIRT
  12: 2.0, // DRY_GRASS
  13: 4.0, // TROP_WOOD
  14: 0.8, // TROP_LEAVES
  15: 0.8, // CLOUD_LEAVES
  16: 1.5, // MUD_DIRT
  17: 0.8, // MANGROVE_LEAVES
  18: 0,   // SWAMP_WATER
  19: 4.0, // ACACIA_WOOD
  20: 2.0, // SAVANNA_GRASS
  21: 0.8, // ACACIA_LEAVES
};

// ── Constantes de IDs (para no depender de globals opcionales) ─
const _AIR     = 0;
const _WATER   = 8;
const _SWWATER = 18;
const _SNOW    = 7;

// IDs que NO son sólidos para el colisionador del jugador
const NON_SOLID_IDS = new Set([_AIR, _WATER, _SWWATER, _SNOW, 5, 14, 15, 17, 21]);

function isSolidForPlayer(b) {
  return !NON_SOLID_IDS.has(b);
}

// ── Sistema de rotura ──────────────────────────────────────────
let breakTarget      = null;
let breakProgress    = 0;
let breakStage       = -1;
let breakOverlayMesh = null;
const BREAK_STAGES   = 10;
const destroyTextures = [];

(function loadDestroyTextures(){
  for(let i = 0; i < 10; i++){
    const t = new THREE.TextureLoader().load('textures/destroy_stage_' + i + '.png');
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
    if(breakOverlayMesh.geometry) breakOverlayMesh.geometry.dispose();
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
    if(breakOverlayMesh && destroyTextures[stage])
      breakOverlayMesh.material.map = destroyTextures[Math.min(stage, 9)];
  }

  if(breakProgress >= 1.0){
    finishBreaking(x, y, z, b);
    stopBreaking();
  }
}

function finishBreaking(x, y, z, b){
  addItem(b, 1);
  setBlock(x, y, z, _AIR);
  showMsg('+ ' + (window.BLOCK_NAMES[b] || 'Bloque'));
  renderHotbar();
  spawnItemDrop(x, y, z, b);
  castRay();
}

// ── Items flotantes ────────────────────────────────────────────
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
  const mat  = new THREE.MeshBasicMaterial({
    map: tex, transparent: true, alphaTest: 0.1,
    depthWrite: false, side: THREE.DoubleSide
  });
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
  const px = camera.position.x;
  const py = camera.position.y - PLAYER_HEIGHT * 0.5;
  const pz = camera.position.z;
  const toRemove = [];

  for(let i = 0; i < itemDrops.length; i++){
    const item = itemDrops[i];
    if(item.collected){ toRemove.push(i); continue; }
    item.age += dt;
    if(item.age > ITEM_LIFETIME){
      toRemove.push(i);
      scene.remove(item.mesh);
      if(item.mesh.geometry) item.mesh.geometry.dispose();
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
      if(item.mesh.geometry) item.mesh.geometry.dispose();
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

      const ibx   = Math.floor(item.mesh.position.x);
      const iby   = Math.floor(item.mesh.position.y - 0.05);
      const ibz   = Math.floor(item.mesh.position.z);
      const below = getBlock(ibx, iby, ibz);
      if(isSolidForPlayer(below)){
        item.mesh.position.y = iby + 1 + 0.3;
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
window.hotbarSel   = window.hotbarSel || 0;

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
    selblockEl.textContent = t ? 'Bloque: ' + (window.BLOCK_NAMES[t] || t) : 'Sin bloque';
    renderHotbar();
  }
});
document.addEventListener('keyup', e => { keys[e.code] = false; });

document.getElementById('invclose').addEventListener('click', () => {
  invpanel.style.display = 'none';
});

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
    if(!hasItem(t)){ showMsg('Sin ' + (window.BLOCK_NAMES[t] || t)); return; }
    const px = window.hitBlock.x + window.hitFace.x;
    const py = window.hitBlock.y + window.hitFace.y;
    const pz = window.hitBlock.z + window.hitFace.z;

    // No colocar dentro del jugador (ocupamos 2 bloques de alto)
    const feetY   = Math.floor(camera.position.y - PLAYER_HEIGHT);
    const eyeY    = Math.floor(camera.position.y);
    const headY   = Math.floor(camera.position.y + 0.1);
    const bodyX   = Math.floor(camera.position.x);
    const bodyZ   = Math.floor(camera.position.z);
    const inBody  = (px === bodyX && pz === bodyZ) &&
                    (py === feetY || py === feetY + 1 || py === eyeY || py === headY);
    if(inBody) return;

    setBlock(px, py, pz, t);
    removeItem(t, 1);
    renderHotbar();
    castRay();
  }
});
document.addEventListener('mouseup',     e => { mouseButtons[e.button] = false; if(e.button === 0) stopBreaking(); });
document.addEventListener('contextmenu', e => e.preventDefault());

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
  selblockEl.textContent = t ? 'Bloque: ' + (window.BLOCK_NAMES[t] || t) : 'Sin bloque';
  renderHotbar();
}, {passive: true});

// ── Ray casting ────────────────────────────────────────────────
const RAY_REACH = 5.0;
const RAY_STEP  = 0.05;

function castRay(){
  const dir = new THREE.Vector3(0, 0, -1).applyEuler(camera.rotation);
  let cx = camera.position.x;
  let cy = camera.position.y;
  let cz = camera.position.z;
  let lastBx = Math.floor(cx);
  let lastBy = Math.floor(cy);
  let lastBz = Math.floor(cz);

  for(let d = 0; d < RAY_REACH; d += RAY_STEP){
    const bx = Math.floor(cx + dir.x * d);
    const by = Math.floor(cy + dir.y * d);
    const bz = Math.floor(cz + dir.z * d);
    const b  = getBlock(bx, by, bz);
    if(b !== _AIR && b !== _WATER && b !== _SWWATER){
      window.hitBlock = {x: bx, y: by, z: bz};
      window.hitFace  = {
        x: lastBx - bx,
        y: lastBy - by,
        z: lastBz - bz,
      };
      return;
    }
    lastBx = bx; lastBy = by; lastBz = bz;
  }
  window.hitBlock = null;
  window.hitFace  = null;
}

// ── Colisión — jugador de 2 bloques ───────────────────────────
// La cámara está a la altura de los ojos (PLAYER_HEIGHT sobre los pies).
// Pies = camera.y - PLAYER_HEIGHT
// Cabeza = camera.y + 0.18  (un poco más arriba de los ojos)
// Ancho: ±PLAYER_HALF_W en X y Z

function collidesAt(px, py, pz){
  const feetY = py - PLAYER_HEIGHT;   // Y base de los pies
  const headY = py + 0.18;            // Y tope de la cabeza

  // Bloques que cubren el colisionador horizontal
  const x0 = Math.floor(px - PLAYER_HALF_W);
  const x1 = Math.floor(px + PLAYER_HALF_W);
  const z0 = Math.floor(pz - PLAYER_HALF_W);
  const z1 = Math.floor(pz + PLAYER_HALF_W);

  // Bloques verticales: pies, torso, cabeza (hasta 2 bloques)
  const y0 = Math.floor(feetY + 0.001);  // bloque de los pies
  const y1 = Math.floor(headY - 0.001);  // bloque de la cabeza

  for(let x = x0; x <= x1; x++)
  for(let y = y0; y <= y1; y++)
  for(let z = z0; z <= z1; z++){
    if(isSolidForPlayer(getBlock(x, y, z))) return true;
  }
  return false;
}

function isInWater(){
  // Ojos del jugador
  const ey = Math.floor(camera.position.y);
  const b  = getBlock(Math.floor(camera.position.x), ey, Math.floor(camera.position.z));
  return b === _WATER || b === _SWWATER;
}

function isOnSnow(){
  const fx  = Math.floor(camera.position.x);
  const fz  = Math.floor(camera.position.z);
  // Bloque justo bajo los pies
  const fy  = Math.floor(camera.position.y - PLAYER_HEIGHT);
  return getBlock(fx, fy, fz) === _SNOW || getBlock(fx, fy - 1, fz) === _SNOW;
}

// ── updatePlayer ───────────────────────────────────────────────
function updatePlayer(dt){
  // Rotación cámara
  camera.rotation.y += yawDelta;
  camera.rotation.x  = Math.max(
    -Math.PI / 2 + 0.01,
    Math.min(Math.PI / 2 - 0.01, camera.rotation.x + pitchDelta)
  );
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
    if(keys['Space'])     move.y += 1;
    if(keys['ShiftLeft']) move.y -= 1;
    if(move.lengthSq() > 0) move.normalize();
    camera.position.addScaledVector(move, flySpeed * dt);
    if(waterOverlay) waterOverlay.style.display = 'none';
    return;
  }

  // Física normal
  const inWater = isInWater();
  const onSnow  = !inWater && isOnSnow();
  isRunning     = keys['ShiftLeft'] && !inWater && !onSnow;
  const speed   = inWater ? SWIM_SPEED : onSnow ? SNOW_SPEED : isRunning ? RUN_SPEED : WALK_SPEED;

  // Dirección de movimiento (horizontal)
  const fwd   = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(0, camera.rotation.y, 0));
  const right = new THREE.Vector3(1, 0,  0).applyEuler(new THREE.Euler(0, camera.rotation.y, 0));
  const move  = new THREE.Vector3();
  if(keys['KeyW']    || keys['ArrowUp'])    move.addScaledVector(fwd,   1);
  if(keys['KeyS']    || keys['ArrowDown'])  move.addScaledVector(fwd,  -1);
  if(keys['KeyA']    || keys['ArrowLeft'])  move.addScaledVector(right,-1);
  if(keys['KeyD']    || keys['ArrowRight']) move.addScaledVector(right, 1);
  if(move.lengthSq() > 0.001){ move.y = 0; move.normalize(); }

  // Salto
  if(keys['Space']){
    if(onGround){ velY = JUMP_FORCE; onGround = false; }
    else if(inWater){ velY = Math.min(velY + WATER_JUMP * dt * 12, WATER_JUMP); }
  }

  // Gravedad
  velY += (inWater ? WATER_GRAVITY : GRAVITY) * dt;
  velY  = Math.max(velY, inWater ? -4 : -50);

  const pos = camera.position;

  // Mover X
  const dx = move.x * speed * dt;
  if(Math.abs(dx) > 0.0001){
    pos.x += dx;
    if(collidesAt(pos.x, pos.y, pos.z)) pos.x -= dx;
  }

  // Mover Z
  const dz = move.z * speed * dt;
  if(Math.abs(dz) > 0.0001){
    pos.z += dz;
    if(collidesAt(pos.x, pos.y, pos.z)) pos.z -= dz;
  }

  // Mover Y
  const dy = velY * dt;
  pos.y += dy;
  if(collidesAt(pos.x, pos.y, pos.z)){
    onGround = dy < 0;
    pos.y   -= dy;
    velY     = 0;
  } else {
    onGround = false;
  }

  // Límites del mundo
  if(pos.y - PLAYER_HEIGHT < -190){
    pos.y    = -190 + PLAYER_HEIGHT;
    velY     = 0;
    onGround = true;
  }
  if(pos.y > 200) pos.y = 200;

  // Overlay de agua
  if(waterOverlay) waterOverlay.style.display = inWater ? 'block' : 'none';
}