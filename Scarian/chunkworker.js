'use strict';
// ═══════════════════════════════════════════════════════════════
//  CHUNK WORKER — generación de chunks en segundo plano
//  Recibe: { type: 'generate', cx, cz, seed, SEA_LEVEL }
//  Devuelve: { type: 'chunk', cx, cz, data: Uint8Array }
// ═══════════════════════════════════════════════════════════════

let WORLD_SEED = 0;
const CHUNK_SIZE   = 16;
const CHUNK_HEIGHT = 128;
let SEA_LEVEL = 52;

// ── Block IDs (deben coincidir con main) ──
const AIR=0,GRASS=1,DIRT=2,STONE=3,WOOD=4,LEAVES=5,SAND=6,SNOW=7,WATER=8,
      SNOW_STONE=9,GRAVEL=10,
      RED_DIRT=11,DRY_GRASS=12,TROP_WOOD=13,TROP_LEAVES=14,
      CLOUD_LEAVES=15,MUD_DIRT=16,MANGROVE_LEAVES=17,SWAMP_WATER=18,
      ACACIA_WOOD=19,SAVANNA_GRASS=20,ACACIA_LEAVES=21;

// ── Biome IDs ──
const BIOME={
  PLAINS:10,DESERT:0,TUNDRA:1,MOUNTAINS:-20,FOREST:4,
  OCEAN:1,DEEP_OCEAN:1,SWAMP:10,SAVANNA:10,TAIGA:3,
  DRY_TROPICAL:10,WET_TROPICAL:2,CLOUD_FOREST:2,MANGROVE:2,GRASSLAND:10,
};

// ── Noise ──
function hash2(x,z,seed){
  let h=((x*1619+z*31337+seed*1013904223)|0);
  h=Math.imul(h^(h>>>16),0x45d9f3b);
  h=Math.imul(h^(h>>>16),0x45d9f3b);
  return(h^(h>>>16))>>>0;
}
function smoothstep(t){return t*t*(3-2*t);}
function lerp(a,b,t){return a+(b-a)*t;}
function grad2(h,x,z){const v=h&3;return v===0?x+z:v===1?-x+z:v===2?x-z:-x-z;}
function perlin2(x,z,seed){
  const xi=Math.floor(x)|0,zi=Math.floor(z)|0;
  const xf=x-xi,zf=z-zi;
  const u=smoothstep(xf),v=smoothstep(zf);
  const h00=hash2(xi,zi,seed)&255,h10=hash2(xi+1,zi,seed)&255;
  const h01=hash2(xi,zi+1,seed)&255,h11=hash2(xi+1,zi+1,seed)&255;
  return lerp(lerp(grad2(h00,xf,zf),grad2(h10,xf-1,zf),u),
              lerp(grad2(h01,xf,zf-1),grad2(h11,xf-1,zf-1),u),v);
}
function fbm2(x,z,octs,sc,seed){
  let v=0,a=1,f=1,mx=0;
  for(let i=0;i<octs;i++){v+=perlin2(x*f/sc,z*f/sc,seed+i*997)*a;mx+=a;a*=0.5;f*=2;}
  return v/mx;
}
function ridgedFbm(x,z,octs,sc,seed){
  let v=0,a=1,f=1,mx=0,prev=1;
  for(let i=0;i<octs;i++){
    let n=Math.abs(perlin2(x*f/sc,z*f/sc,seed+i*997));
    n=1-n;n=n*n*prev;prev=n;v+=n*a;mx+=a;a*=0.5;f*=2;
  }
  return v/mx;
}

// ── Caches locales del worker ──
const biomeCache=new Map();
const surfCache=new Map();

function getBiome(wx,wz){
  const k=wx+'_'+wz;if(biomeCache.has(k))return biomeCache.get(k);
  const temp=fbm2(wx+1000,wz+1000,3,280,WORLD_SEED);
  const humid=fbm2(wx+3000,wz+3000,3,300,WORLD_SEED+777);
  const cont=fbm2(wx+5000,wz+5000,2,500,WORLD_SEED+1234);
  const tropical=fbm2(wx+7000,wz+7000,2,400,WORLD_SEED+2222);
  let b;
  if(cont<-0.38)b=BIOME.DEEP_OCEAN;
  else if(cont<-0.14)b=BIOME.OCEAN;
  else if(cont<-0.04&&tropical>0.2&&humid>0.1)b=BIOME.MANGROVE;
  else if(temp>0.35&&humid<-0.12)b=BIOME.DESERT;
  else if(tropical>0.28&&temp>0.25&&humid>-0.2&&humid<0.1)b=BIOME.DRY_TROPICAL;
  else if(tropical>0.22&&temp>0.20&&humid>0.22)b=BIOME.WET_TROPICAL;
  else if(temp>0.05&&temp<0.30&&humid>0.28&&cont>0.05)b=BIOME.CLOUD_FOREST;
  else if(temp>0.32&&humid>=-0.12)b=BIOME.SAVANNA;
  else if(temp>0.10&&temp<0.32&&humid>0.10&&humid<0.28)b=BIOME.GRASSLAND;
  else if(temp<-0.30&&humid>0)b=BIOME.TUNDRA;
  else if(temp<-0.12&&humid>0.1)b=BIOME.TAIGA;
  else if(humid>0.32)b=BIOME.SWAMP;
  else if(humid>0.16)b=BIOME.FOREST;
  else{const elev=fbm2(wx+8000,wz+8000,2,180,WORLD_SEED+5555);b=elev>0.28?BIOME.MOUNTAINS:BIOME.PLAINS;}
  biomeCache.set(k,b);if(biomeCache.size>60000)biomeCache.clear();
  return b;
}

function getSurface(wx,wz){
  const k=wx+'|'+wz;if(surfCache.has(k))return surfCache.get(k);
  const h=calcSurface(wx,wz);surfCache.set(k,h);
  if(surfCache.size>80000)surfCache.clear();
  return h;
}

function calcSurface(wx,wz){
  const biome=getBiome(wx,wz);
  const continental=fbm2(wx+200,wz+200,4,600,WORLD_SEED+10)*12;
  const regional=fbm2(wx+400,wz+400,5,160,WORLD_SEED+20)*10;
  const local=fbm2(wx+600,wz+600,4,50,WORLD_SEED+30)*5;
  const detail=fbm2(wx+800,wz+800,3,18,WORLD_SEED+40)*2;
  const mountRaw=ridgedFbm(wx+1200,wz+1200,5,200,WORLD_SEED+50);
  const mountMask=Math.max(0,fbm2(wx+2000,wz+2000,3,400,WORLD_SEED+60));
  const mountains=mountRaw*mountMask*50;
  const erosion=Math.max(0,fbm2(wx+3000,wz+3000,2,300,WORLD_SEED+70));
  const erosionFactor=lerp(1.0,0.55,erosion*erosion);
  let base;
  const B=BIOME;
  switch(biome){
    case B.DEEP_OCEAN:base=SEA_LEVEL-22+continental*0.08+local*0.4;break;
    case B.OCEAN:base=SEA_LEVEL-6+continental*0.12+local*0.5;break;
    case B.MANGROVE:base=SEA_LEVEL+1+continental*0.05+local*0.2;break;
    case B.PLAINS:base=SEA_LEVEL+5+continental*0.28+regional*0.22+local*0.5+detail;break;
    case B.DESERT:{const dune=fbm2(wx+500,wz+500,3,40,WORLD_SEED+80)*6;base=SEA_LEVEL+4+continental*0.30+regional*0.20+dune+detail;break;}
    case B.DRY_TROPICAL:base=SEA_LEVEL+7+continental*0.30+regional*0.25+local*0.6+detail;break;
    case B.WET_TROPICAL:base=SEA_LEVEL+9+continental*0.32+regional*0.30+local*0.8+detail;break;
    case B.CLOUD_FOREST:base=SEA_LEVEL+22+continental*0.40+regional*0.35+local*1.0+detail;break;
    case B.GRASSLAND:base=SEA_LEVEL+6+continental*0.22+regional*0.20+local*0.5+detail;break;
    case B.SAVANNA:base=SEA_LEVEL+6+continental*0.28+regional*0.24+local*0.6+detail;break;
    case B.SWAMP:base=SEA_LEVEL-1+continental*0.08+local*0.3;break;
    case B.FOREST:base=SEA_LEVEL+8+continental*0.35+regional*0.28+local*0.7+detail;break;
    case B.TAIGA:base=SEA_LEVEL+10+continental*0.38+regional*0.30+local*0.8+detail;break;
    case B.TUNDRA:base=SEA_LEVEL+6+continental*0.25+regional*0.18+local*0.5;break;
    case B.MOUNTAINS:base=SEA_LEVEL+18+mountains*erosionFactor+continental*0.4+regional*0.35+local;break;
    default:base=SEA_LEVEL+5+continental*0.28+regional*0.20+local*0.5;
  }
  return Math.round(Math.max(4,Math.min(CHUNK_HEIGHT-4,base)));
}

function surfaceBlock(biome,surfH){
  const B=BIOME;
  switch(biome){
    case B.DESERT:case B.OCEAN:case B.DEEP_OCEAN:return SAND;
    case B.TUNDRA:case B.TAIGA:return SNOW;
    case B.MANGROVE:return MUD_DIRT;
    case B.DRY_TROPICAL:return DRY_GRASS;
    case B.WET_TROPICAL:return GRASS;
    case B.CLOUD_FOREST:return GRASS;
    case B.GRASSLAND:case B.SAVANNA:return SAVANNA_GRASS;
    case B.MOUNTAINS:
      if(surfH>SEA_LEVEL+55)return SNOW;
      if(surfH>SEA_LEVEL+30)return SNOW_STONE;
      return GRASS;
    default:return GRASS;
  }
}
function subBlock(biome,surfH,depth){
  const B=BIOME;
  switch(biome){
    case B.DESERT:case B.OCEAN:case B.DEEP_OCEAN:return depth<=5?SAND:STONE;
    case B.TUNDRA:case B.TAIGA:return depth<=1?DIRT:STONE;
    case B.MANGROVE:case B.WET_TROPICAL:return depth<=4?MUD_DIRT:STONE;
    case B.DRY_TROPICAL:case B.SAVANNA:case B.GRASSLAND:return depth<=3?RED_DIRT:STONE;
    case B.CLOUD_FOREST:return depth<=3?DIRT:STONE;
    default:
      if(depth<=3)return DIRT;
      if(depth===4&&(hash2(surfH,biome,WORLD_SEED+90)%6===0))return GRAVEL;
      return STONE;
  }
}

function isWaterLike(b){return b===WATER||b===SWAMP_WATER;}

// ── Árbol simplificado para el worker ──
const treeInfoCache=new Map();
function getTreeInfo(wx,wz){
  const k=wx+'_'+wz;if(treeInfoCache.has(k))return treeInfoCache.get(k);
  const info=calcTreeInfo(wx,wz);treeInfoCache.set(k,info);
  if(treeInfoCache.size>60000)treeInfoCache.clear();
  return info;
}
function calcTreeInfo(wx,wz){
  const biome=getBiome(wx,wz);
  const B=BIOME;
  const prob=biome===B.FOREST?0.032:biome===B.PLAINS?0.008:biome===B.TAIGA?0.025:
    biome===B.SWAMP?0.014:biome===B.DRY_TROPICAL?0.018:biome===B.WET_TROPICAL?0.045:
    biome===B.CLOUD_FOREST?0.028:biome===B.MANGROVE?0.022:
    biome===B.GRASSLAND?0.005:biome===B.SAVANNA?0.010:0;
  if(!prob)return null;
  const surfH=getSurface(wx,wz);
  if(surfH<=SEA_LEVEL+1)return null;
  const topBlock=surfaceBlock(biome,surfH);
  if(topBlock!==GRASS&&topBlock!==DIRT&&topBlock!==DRY_GRASS&&topBlock!==MUD_DIRT&&topBlock!==SAVANNA_GRASS)return null;
  const h=hash2(wx,wz,WORLD_SEED+42);
  const r=(h&0xFFFF)/0xFFFF;
  if(r>prob)return null;
  const excR=6;
  for(let dx=-excR;dx<=excR;dx++){
    for(let dz=-excR;dz<=excR;dz++){
      if(dx===0&&dz===0)continue;
      if(dx*dx+dz*dz>excR*excR)continue;
      const nx=wx+dx,nz=wz+dz;
      const nb=getBiome(nx,nz);
      const np=nb===B.FOREST?0.032:nb===B.PLAINS?0.008:nb===B.TAIGA?0.025:
        nb===B.SWAMP?0.014:nb===B.DRY_TROPICAL?0.018:nb===B.WET_TROPICAL?0.045:
        nb===B.CLOUD_FOREST?0.028:nb===B.MANGROVE?0.022:
        nb===B.GRASSLAND?0.005:nb===B.SAVANNA?0.010:0;
      if(!np)continue;
      const nh=hash2(nx,nz,WORLD_SEED+42);
      const nr=(nh&0xFFFF)/0xFFFF;
      if(nr<=np&&(nx<wx||(nx===wx&&nz<wz)))return null;
    }
  }
  const hv=(h>>16)&0xFF;
  const isPine=biome===B.TAIGA;
  const isTropical=biome===B.WET_TROPICAL;
  const isCloud=biome===B.CLOUD_FOREST;
  const isMangrove=biome===B.MANGROVE;
  const isDry=biome===B.DRY_TROPICAL;
  const isSavanna=biome===B.SAVANNA||biome===B.GRASSLAND;
  let treeType,trunkH,leafRad,trunkOffsets=[[0,0]];
  if(isPine){treeType='NORMAL';trunkH=7+(hv%5);leafRad=2;}
  else if(isMangrove){treeType='MANGROVE';trunkH=4+(hv%3);leafRad=3;trunkOffsets=hv<128?[[0,0],[1,0]]:[[0,0],[1,0],[0,1]];}
  else if(isTropical){
    treeType='TROPICAL';
    if(hv<80){trunkH=10+(hv%5);leafRad=4;}
    else if(hv<160){trunkH=13+(hv%5);leafRad=5;trunkOffsets=[[0,0],[1,0]];}
    else{trunkH=16+(hv%6);leafRad=5;trunkOffsets=[[0,0],[1,0],[0,1],[1,1]];}
  }else if(isCloud){treeType='CLOUD';trunkH=8+(hv%4);leafRad=4;if(hv<128)trunkOffsets=[[0,0],[1,0]];}
  else if(isDry){treeType='NORMAL';trunkH=4+(hv%4);leafRad=2;}
  else if(isSavanna){treeType='ACACIA';trunkH=4+(hv%3);leafRad=4;}
  else{
    if(hv<100){treeType='NORMAL';trunkH=4+(hv%3);leafRad=2;}
    else if(hv<160){treeType='TALL';trunkH=7+(hv%4);leafRad=3;}
    else if(hv<195){treeType='SUPER_TALL';trunkH=11+(hv%5);leafRad=4;}
    else if(hv<220){treeType='DOUBLE';trunkH=5+(hv%3);leafRad=3;trunkOffsets=[[0,0],[1,0]];}
    else if(hv<240){treeType='TRIPLE';trunkH=6+(hv%3);leafRad=3;trunkOffsets=[[0,0],[1,0],[0,1]];}
    else{treeType='QUAD';trunkH=6+(hv%3);leafRad=3;trunkOffsets=[[0,0],[1,0],[0,1],[1,1]];}
  }
  return{surfH,trunkH,leafRad,isPine,treeType,trunkOffsets,biome};
}

function treeTrunkBlock(treeType,biome){
  const B=BIOME;
  if(biome===B.WET_TROPICAL||biome===B.DRY_TROPICAL||biome===B.MANGROVE)return TROP_WOOD;
  if(biome===B.SAVANNA||biome===B.GRASSLAND)return ACACIA_WOOD;
  return WOOD;
}
function treeLeavesBlock(treeType,biome){
  const B=BIOME;
  if(biome===B.WET_TROPICAL||biome===B.DRY_TROPICAL)return TROP_LEAVES;
  if(biome===B.CLOUD_FOREST)return CLOUD_LEAVES;
  if(biome===B.MANGROVE)return MANGROVE_LEAVES;
  if(biome===B.SAVANNA||biome===B.GRASSLAND)return ACACIA_LEAVES;
  return LEAVES;
}

function treeBlockAt(wx,worldY,wz){
  const SEARCH=6;
  for(let dx=-SEARCH;dx<=SEARCH;dx++){
    for(let dz=-SEARCH;dz<=SEARCH;dz++){
      const rx=wx+dx,rz=wz+dz;
      const info=getTreeInfo(rx,rz);
      if(!info)continue;
      const{surfH,trunkH,leafRad,isPine,treeType,trunkOffsets,biome}=info;
      const base=surfH,trunkTop=base+trunkH;
      const TRUNK_B=treeTrunkBlock(treeType,biome);
      const LEAF_B=treeLeavesBlock(treeType,biome);
      for(const[ox,oz] of trunkOffsets){if(dx===ox&&dz===oz&&worldY>base&&worldY<=trunkTop)return TRUNK_B;}
      if(treeType==='ACACIA'){
        const relY=worldY-trunkTop;if(relY<0||relY>2)continue;
        const rad=relY===0?leafRad:Math.max(1,leafRad-2);
        if(dx*dx+dz*dz<=rad*rad+0.7){
          let onT=false;for(const[ox,oz] of trunkOffsets){if(dx===ox&&dz===oz&&worldY>base&&worldY<=trunkTop){onT=true;break;}}
          if(!onT)return LEAF_B;
        }
      }else if(isPine){
        const copaStart=base+Math.floor(trunkH*0.45),copaTop=trunkTop+1,relY=worldY-copaStart;
        if(relY<0||relY>copaTop-copaStart)continue;
        const rad=Math.max(0,leafRad-Math.floor(relY*(leafRad/Math.max(1,copaTop-copaStart))));
        if(dx*dx+dz*dz<=rad*rad+0.7){
          let onT=false;for(const[ox,oz] of trunkOffsets){if(dx===ox&&dz===oz&&worldY>base&&worldY<=trunkTop){onT=true;break;}}
          if(!onT)return LEAF_B;
        }
      }else if(treeType==='MANGROVE'){
        const copaStart=trunkTop-1,copaTop=trunkTop+2,relY=worldY-copaStart;
        if(relY<0||relY>copaTop-copaStart)continue;
        let cx=0,cz=0;for(const[ox,oz] of trunkOffsets){cx+=ox;cz+=oz;}cx/=trunkOffsets.length;cz/=trunkOffsets.length;
        const cdx=dx-cx,cdz=dz-cz,r2=cdx*cdx+cdz*cdz;
        const rad=relY/(copaTop-copaStart)<0.5?leafRad:Math.max(1,leafRad-1);
        if(r2<=rad*rad+0.7){
          let onT=false;for(const[ox,oz] of trunkOffsets){if(dx===ox&&dz===oz&&worldY>base&&worldY<=trunkTop){onT=true;break;}}
          if(!onT)return LEAF_B;
        }
      }else{
        const copaOffset=(treeType==='SUPER_TALL'||treeType==='TALL'||treeType==='TROPICAL'||treeType==='CLOUD')?2:1;
        const copaStart=trunkTop-copaOffset,copaTop=trunkTop+2,relY=worldY-copaStart;
        if(relY<0||relY>copaTop-copaStart)continue;
        const totalH=copaTop-copaStart,norm=relY/Math.max(1,totalH);
        let rad;
        if(norm<0.25)rad=leafRad;else if(norm<0.55)rad=leafRad;
        else if(norm<0.80)rad=Math.max(1,leafRad-1);else rad=1;
        let cx=0,cz=0;for(const[ox,oz] of trunkOffsets){cx+=ox;cz+=oz;}cx/=trunkOffsets.length;cz/=trunkOffsets.length;
        const cdx=dx-cx,cdz=dz-cz,r2=cdx*cdx+cdz*cdz;
        if(r2<=rad*rad+0.6){
          let onT=false;for(const[ox,oz] of trunkOffsets){if(dx===ox&&dz===oz&&worldY>base&&worldY<=trunkTop){onT=true;break;}}
          if(!onT)return LEAF_B;
        }
      }
    }
  }
  return AIR;
}

// ── Generador de chunk ──
function generateChunk(cx,cz){
  const data=new Uint8Array(CHUNK_SIZE*CHUNK_HEIGHT*CHUNK_SIZE);
  const ox=cx*CHUNK_SIZE,oz=cz*CHUNK_SIZE;
  function idx(lx,ly,lz){return(lx*CHUNK_HEIGHT+ly)*CHUNK_SIZE+lz;}
  for(let lx=0;lx<CHUNK_SIZE;lx++){
    for(let lz=0;lz<CHUNK_SIZE;lz++){
      const wx=ox+lx,wz=oz+lz;
      const biome=getBiome(wx,wz);
      const surfH=getSurface(wx,wz);
      for(let ly=0;ly<CHUNK_HEIGHT;ly++){
        let b;
        if(ly<=1)b=STONE;
        else if(ly<=surfH){
          const depth=surfH-ly;
          b=depth===0?surfaceBlock(biome,surfH):subBlock(biome,surfH,depth);
        }else if(biome===BIOME.MANGROVE&&ly<=SEA_LEVEL+1){b=SWAMP_WATER;}
        else if(ly<=SEA_LEVEL)b=WATER;
        else b=AIR;
        data[idx(lx,ly,lz)]=b;
      }
    }
  }
  // Árboles
  for(let lx=0;lx<CHUNK_SIZE;lx++){
    for(let lz=0;lz<CHUNK_SIZE;lz++){
      const wx=ox+lx,wz=oz+lz;
      const surfH=getSurface(wx,wz);
      const maxY=Math.min(surfH+24,CHUNK_HEIGHT-1);
      for(let worldY=surfH+1;worldY<=maxY;worldY++){
        if(data[idx(lx,worldY,lz)]===AIR){
          const tb=treeBlockAt(wx,worldY,wz);
          if(tb!==AIR)data[idx(lx,worldY,lz)]=tb;
        }
      }
    }
  }
  return data;
}

// ── Message handler ──
self.onmessage=function(e){
  const msg=e.data;
  if(msg.type==='init'){
    WORLD_SEED=msg.seed;
    SEA_LEVEL=msg.seaLevel||52;
  }else if(msg.type==='generate'){
    const{cx,cz,id}=msg;
    const data=generateChunk(cx,cz);
    self.postMessage({type:'chunk',cx,cz,id,data},[ data.buffer ]);
  }
};