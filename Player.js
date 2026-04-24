// ═══════════════════════════════════════════════════════
//  PLAYER.JS — Controles completos del jugador
//  Usa las variables globales definidas en el mundo:
//  camera, scene, getBlock, setBlock, hotbar, hotbarSel,
//  inventory, addItem, removeItem, hasItem, BLOCK_NAMES,
//  AIR, WATER, STONE, GRASS, DIRT, WOOD, LEAVES, SAND,
//  SNOW, selblockEl, waterOverlay, lavOverlay,
//  showMsg, renderHotbar, renderInv, blocker, invpanel,
//  hitBlock, hitFace, castRay
// ═══════════════════════════════════════════════════════

// ── Estado del jugador ──────────────────────────────────
let velY        = 0;
let onGround    = false;
let isRunning   = false;
let spectatorMode = false;   // expuesto globalmente (lo lee el HUD)
let flySpeed    = 12;        // velocidad en modo espectador

const PLAYER_HEIGHT  = 1.65;
const WALK_SPEED     = 5.5;
const RUN_SPEED      = 10.5;
const JUMP_FORCE     = 8.0;
const GRAVITY        = -24;
const WATER_GRAVITY  = -4;
const WATER_JUMP     = 3.2;
const SWIM_SPEED     = 3.5;
const SNOW_SPEED     = 2.8;   // ralentiza al caminar sobre nieve
const FLY_SPEEDS     = [8, 14, 22, 40];
let   flySpeedIdx    = 1;

// ── Input ───────────────────────────────────────────────
const keys = {};
let   pitchDelta = 0, yawDelta = 0;
let   pointerLocked = false;

document.addEventListener('keydown', e => {
  keys[e.code] = true;

  // Inventario
  if (e.code === 'KeyE') {
    if (!pointerLocked) return;
    const open = invpanel.style.display === 'block';
    invpanel.style.display = open ? 'none' : 'block';
    if (!open) renderInv();
  }

  // Modo espectador / vuelo
  if (e.code === 'KeyF') {
    spectatorMode = !spectatorMode;
    velY = 0;
    showMsg(spectatorMode ? '👁 Modo Espectador activado' : '🧍 Modo Jugador activado');
  }

  // Cambiar velocidad de vuelo con R
  if (e.code === 'KeyR' && spectatorMode) {
    flySpeedIdx = (flySpeedIdx + 1) % FLY_SPEEDS.length;
    flySpeed    = FLY_SPEEDS[flySpeedIdx];
    showMsg(`✈ Velocidad vuelo: ${flySpeed}`);
  }

  // Slots de hotbar (1–8)
  if (e.code >= 'Digit1' && e.code <= 'Digit8') {
    hotbarSel = parseInt(e.code[5]) - 1;
    const t   = hotbar[hotbarSel];
    selblockEl.textContent = t ? 'Bloque: ' + BLOCK_NAMES[t] : 'Sin bloque';
    renderHotbar();
  }
});
document.addEventListener('keyup',  e => { keys[e.code] = false; });

// ── Pointer Lock ────────────────────────────────────────
blocker.addEventListener('click', () => {
  document.getElementById('wrap').requestPointerLock();
});
document.getElementById('invclose').addEventListener('click', () => {
  invpanel.style.display = 'none';
});

document.addEventListener('pointerlockchange', () => {
  pointerLocked = !!document.pointerLockElement;
  blocker.style.display = pointerLocked ? 'none' : 'flex';
  if (!pointerLocked) invpanel.style.display = 'none';
});

document.addEventListener('mousemove', e => {
  if (!pointerLocked) return;
  yawDelta   -= e.movementX * 0.002;
  pitchDelta -= e.movementY * 0.002;
});

// ── Scroll — cambiar bloque / velocidad vuelo ───────────
document.addEventListener('wheel', e => {
  if (!pointerLocked) return;
  if (spectatorMode) {
    flySpeedIdx = (flySpeedIdx + (e.deltaY > 0 ? 1 : -1) + FLY_SPEEDS.length) % FLY_SPEEDS.length;
    flySpeed    = FLY_SPEEDS[flySpeedIdx];
    showMsg(`✈ Velocidad vuelo: ${flySpeed}`);
    return;
  }
  hotbarSel = (hotbarSel + (e.deltaY > 0 ? 1 : -1) + 8) % 8;
  const t   = hotbar[hotbarSel];
  selblockEl.textContent = t ? 'Bloque: ' + BLOCK_NAMES[t] : 'Sin bloque';
  renderHotbar();
}, { passive: true });

// ── Clicks — romper / colocar ────────────────────────────
document.addEventListener('mousedown', e => {
  if (!pointerLocked || invpanel.style.display === 'block') return;

  // Botón izquierdo — romper
  if (e.button === 0 && hitBlock) {
    const { x, y, z } = hitBlock;
    const b = getBlock(x, y, z);
    addItem(b, 1);
    setBlock(x, y, z, AIR);
    showMsg('+ ' + BLOCK_NAMES[b]);
    renderHotbar();
    castRay();
  }

  // Botón derecho — colocar
  if (e.button === 2 && hitBlock && hitFace) {
    const t = hotbar[hotbarSel];
    if (t == null) { showMsg('Sin bloque seleccionado'); return; }
    if (!hasItem(t)) { showMsg('Sin ' + BLOCK_NAMES[t]); return; }
    const px = hitBlock.x + hitFace.x;
    const py = hitBlock.y + hitFace.y;
    const pz = hitBlock.z + hitFace.z;
    // No colocar dentro del jugador
    const cx = Math.floor(camera.position.x), cy = Math.floor(camera.position.y), cz = Math.floor(camera.position.z);
    if ((px === cx || px === cx) && (py === cy || py === cy - 1) && (pz === cz)) return;
    setBlock(px, py, pz, t);
    removeItem(t, 1);
    renderHotbar();
    castRay();
  }
});
document.addEventListener('contextmenu', e => e.preventDefault());

// ── Spawn seguro ─────────────────────────────────────────
function findSafeSpawn() {
  for (let r = 0; r < 60; r += 4) {
    for (let angle = 0; angle < Math.PI * 2; angle += 0.5) {
      const sx = Math.round(Math.cos(angle) * r);
      const sz = Math.round(Math.sin(angle) * r);
      const surf = getSurface(sx, sz);  // función global del mundo
      const biome = getBiome(sx, sz);
      // Evitar generar en océano o agua
      if (biome === 5 || biome === 6) continue;
      if (surf < 1) continue;
      return { x: sx + 0.5, y: surf + PLAYER_HEIGHT + 0.5, z: sz + 0.5 };
    }
  }
  return { x: 0.5, y: 15, z: 0.5 };
}

// ── Colisión ─────────────────────────────────────────────
const COLLIDER_W   = 0.3;
const COLLIDER_H   = PLAYER_HEIGHT;

function collidesAt(px, py, pz) {
  const x0 = Math.floor(px - COLLIDER_W), x1 = Math.floor(px + COLLIDER_W);
  const y0 = Math.floor(py - COLLIDER_H), y1 = Math.floor(py + 0.1);
  const z0 = Math.floor(pz - COLLIDER_W), z1 = Math.floor(pz + COLLIDER_W);
  for (let x = x0; x <= x1; x++)
  for (let y = y0; y <= y1; y++)
  for (let z = z0; z <= z1; z++) {
    const b = getBlock(x, y, z);
    // SNOW es traspasable — no colisiona
    if (b !== AIR && b !== WATER && b !== SNOW && b !== 5 /* LEAVES */) return true;
  }
  return false;
}

function isInWater() {
  const ey = Math.floor(camera.position.y - 0.2);
  return getBlock(Math.floor(camera.position.x), ey, Math.floor(camera.position.z)) === WATER;
}

// Detecta si el jugador está parado sobre o dentro de nieve
function isOnSnow() {
  const fx = Math.floor(camera.position.x);
  const fz = Math.floor(camera.position.z);
  const fy = Math.floor(camera.position.y - PLAYER_HEIGHT + 0.1);
  return getBlock(fx, fy, fz) === SNOW || getBlock(fx, fy - 1, fz) === SNOW;
}

// ── updatePlayer — llamado cada frame ────────────────────
function updatePlayer(dt) {
  // ── Cámara ──
  camera.rotation.y += yawDelta;
  camera.rotation.x  = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, camera.rotation.x + pitchDelta));
  yawDelta = 0; pitchDelta = 0;

  // ── Raycast ──
  castRay();

  // ── Modo espectador (vuelo libre) ──
  if (spectatorMode) {
    const speed = flySpeed;
    const fwd   = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(0, camera.rotation.y, 0));
    const right = new THREE.Vector3(1, 0,  0).applyEuler(new THREE.Euler(0, camera.rotation.y, 0));
    const move  = new THREE.Vector3();
    if (keys['KeyW'] || keys['ArrowUp'])    move.addScaledVector(fwd,   1);
    if (keys['KeyS'] || keys['ArrowDown'])  move.addScaledVector(fwd,  -1);
    if (keys['KeyA'] || keys['ArrowLeft'])  move.addScaledVector(right,-1);
    if (keys['KeyD'] || keys['ArrowRight']) move.addScaledVector(right, 1);
    if (keys['Space'])                      move.y += 1;
    if (keys['ShiftLeft'])                  move.y -= 1;
    if (move.lengthSq() > 0) move.normalize();
    camera.position.addScaledVector(move, speed * dt);

    waterOverlay.style.display = 'none';
    lavOverlay.style.display   = 'none';
    return;
  }

  // ── Física de jugador ──
  const inWater  = isInWater();
  const onSnow   = !inWater && isOnSnow();
  isRunning      = keys['ShiftLeft'] && !inWater && !onSnow;

  // Velocidad según superficie
  const speed = inWater ? SWIM_SPEED
              : onSnow  ? SNOW_SPEED
              : isRunning ? RUN_SPEED
              : WALK_SPEED;

  // Dirección horizontal (yaw only)
  const fwd   = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(0, camera.rotation.y, 0));
  const right = new THREE.Vector3(1, 0,  0).applyEuler(new THREE.Euler(0, camera.rotation.y, 0));
  const move  = new THREE.Vector3();
  if (keys['KeyW'] || keys['ArrowUp'])    move.addScaledVector(fwd,   1);
  if (keys['KeyS'] || keys['ArrowDown'])  move.addScaledVector(fwd,  -1);
  if (keys['KeyA'] || keys['ArrowLeft'])  move.addScaledVector(right,-1);
  if (keys['KeyD'] || keys['ArrowRight']) move.addScaledVector(right, 1);
  if (move.lengthSq() > 0.001) { move.y = 0; move.normalize(); }

  // Salto
  if (keys['Space']) {
    if (onGround) { velY = JUMP_FORCE; onGround = false; }
    else if (inWater) { velY = WATER_JUMP; }
  }

  // Gravedad
  velY += (inWater ? WATER_GRAVITY : GRAVITY) * dt;
  velY  = Math.max(velY, inWater ? -4 : -50);

  // ── Mover X ──
  const pos = camera.position;
  const dx  = move.x * speed * dt;
  if (Math.abs(dx) > 0.0001) {
    pos.x += dx;
    if (collidesAt(pos.x, pos.y, pos.z)) pos.x -= dx;
  }

  // ── Mover Z ──
  const dz = move.z * speed * dt;
  if (Math.abs(dz) > 0.0001) {
    pos.z += dz;
    if (collidesAt(pos.x, pos.y, pos.z)) pos.z -= dz;
  }

  // ── Mover Y ──
  const dy = velY * dt;
  pos.y += dy;
  if (collidesAt(pos.x, pos.y, pos.z)) {
    if (dy < 0) { onGround = true; }
    else        { onGround = false; }
    pos.y -= dy;
    velY   = 0;
  } else {
    onGround = false;
  }

  // Límite mundo
  if (pos.y < -195 + PLAYER_HEIGHT) { pos.y = -195 + PLAYER_HEIGHT; velY = 0; onGround = true; }
  if (pos.y >  195)                   pos.y =  195;

  // ── Overlays ──
  waterOverlay.style.display = inWater ? 'block' : 'none';
  lavOverlay.style.display   = 'none';
}