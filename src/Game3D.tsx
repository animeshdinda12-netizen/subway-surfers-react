import { useRef, useEffect, useState, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

const LANE_WIDTH = 3.2;
const LANES = [-LANE_WIDTH, 0, LANE_WIDTH];
const TRACK_LENGTH = 110;
const PLAYER_SPEED = 26;
const JUMP_FORCE = 15.8;
const GRAVITY = -35;

interface GameState {
  score: number;
  coins: number;
  distance: number;
  highScore: number;
  isRunning: boolean;
  isPaused: boolean;
  isGameOver: boolean;
  grayscale: boolean;
  multiplier: number;
  streak: number;
}

// ==================== AUDIO ====================
function useGameAudio() {
  const audioCtxRef = useRef<AudioContext | null>(null);
  const getAudioContext = () => {
    if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    return audioCtxRef.current;
  };

  const playSound = (type: string) => {
    try {
      const ctx = getAudioContext(); if (!ctx) return;
      const osc = ctx.createOscillator(); const gain = ctx.createGain(); const filter = ctx.createBiquadFilter();

      switch (type) {
        case 'jump': osc.type = 'sawtooth'; osc.frequency.value = 380; gain.gain.value = 0.18;
          setTimeout(() => osc.frequency.linearRampToValueAtTime(620, ctx.currentTime + 0.18), 10);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28); break;
        case 'coin': osc.type = 'square'; osc.frequency.value = 920; gain.gain.value = 0.28;
          setTimeout(() => osc.frequency.value = 1380, 70); setTimeout(() => osc.frequency.value = 1720, 140);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.38); break;
        case 'crash':
          osc.type = 'sawtooth'; osc.frequency.value = 95; gain.gain.value = 0.45; filter.type = 'lowpass'; filter.frequency.value = 380;
          const noise = ctx.createBufferSource(); const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.7, ctx.sampleRate);
          const data = buffer.getChannelData(0); for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
          noise.buffer = buffer; const nGain = ctx.createGain(); nGain.gain.value = 0.4;
          const nF = ctx.createBiquadFilter(); nF.type = 'lowpass'; nF.frequency.value = 650;
          noise.connect(nF); nF.connect(nGain); nGain.connect(ctx.destination); noise.start(); break;
        case 'jetpack': osc.type = 'triangle'; osc.frequency.value = 680; gain.gain.value = 0.2;
          setTimeout(() => osc.frequency.value = 1250, 120); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.55); break;
        case 'boost': osc.type = 'sine'; osc.frequency.value = 520; gain.gain.value = 0.25;
          setTimeout(() => osc.frequency.value = 880, 80); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45); break;
        case 'mystery': osc.type = 'triangle'; osc.frequency.value = 450; gain.gain.value = 0.3;
          setTimeout(() => osc.frequency.value = 720, 100); setTimeout(() => osc.frequency.value = 1100, 220);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.65); break;
        case 'slide': osc.type = 'sine'; osc.frequency.value = 165; gain.gain.value = 0.15; break;
        case 'lane': osc.type = 'square'; osc.frequency.value = 720; gain.gain.value = 0.12; break;
        case 'ramp': osc.type = 'sawtooth'; osc.frequency.value = 290; gain.gain.value = 0.22;
          setTimeout(() => osc.frequency.value = 580, 60);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.42); break;
      }
      osc.connect(filter); filter.connect(gain); gain.connect(ctx.destination); osc.start();
      setTimeout(() => { try { osc.stop(); } catch {} }, 1200);
    } catch {}
  };
  return { playSound };
}

// ==================== PARTICLES ====================
function ParticleBurst({ position, color, count = 8 }: any) {
  const group = useRef<THREE.Group>(null!);
  const parts = useRef<any[]>([]);

  useEffect(() => {
    if (!group.current) return;
    parts.current = [];
    group.current.clear();
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.17), new THREE.MeshBasicMaterial({ color }));
      m.position.set((Math.random()-0.5)*1.4, (Math.random()-0.5)*1.2, (Math.random()-0.5)*1.2);
      const p = { mesh: m, vx: (Math.random()-0.5)*7, vy: Math.random()*6+2, vz: (Math.random()-0.5)*5, life: 24 + Math.random()*9 };
      group.current.add(m); parts.current.push(p);
    }
  }, []);

  useFrame(() => {
    if (!group.current) return;
    parts.current.forEach(p => {
      if (p.life <= 0) return;
      p.mesh.position.x += p.vx * 0.016;
      p.mesh.position.y += p.vy * 0.016;
      p.mesh.position.z += p.vz * 0.016;
      p.vy -= 0.22; p.life--;
      (p.mesh.material as any).opacity = p.life / 30;
    });
  });

  return <group ref={group} position={position} />;
}

// ==================== PLAYER ====================
function Player({ position, isJumping, isSliding, laneIndex, isFlying, isDead }: any) {
  const group = useRef<THREE.Group>(null!);
  const leftArm = useRef<THREE.Group>(null!);
  const rightArm = useRef<THREE.Group>(null!);
  const leftLeg = useRef<THREE.Group>(null!);
  const rightLeg = useRef<THREE.Group>(null!);

  useFrame((state) => {
    if (!group.current) return;

    const bob = Math.sin(state.clock.elapsedTime * 15) * (isJumping || isFlying ? 0 : 0.13);
    group.current.position.y = position[1] + bob;

    group.current.rotation.z = (LANES[laneIndex] - position[0]) * 0.5;

    if (isDead) {
      group.current.rotation.x = -1.2 + Math.sin(state.clock.elapsedTime * 6) * 0.3;
      group.current.rotation.z = 1.4;
      return;
    }

    group.current.rotation.x = isSliding ? -0.85 : (isFlying ? -0.25 : 0);

    if (!isJumping && !isSliding && !isFlying) {
      const swing = Math.sin(state.clock.elapsedTime * 15) * 0.85;
      if (leftArm.current) leftArm.current.rotation.x = swing * 0.7;
      if (rightArm.current) rightArm.current.rotation.x = -swing * 0.7;
      if (leftLeg.current) leftLeg.current.rotation.x = swing * 1.1;
      if (rightLeg.current) rightLeg.current.rotation.x = -swing * 1.1;
    }
  });

  return (
    <group ref={group} position={position}>
      <mesh position={[0, 1.3, 0]}><capsuleGeometry args={[0.58, 1.1]} /><meshLambertMaterial color="#1e4ac7" /></mesh>
      <mesh position={[0, 2.5, 0]}><sphereGeometry args={[0.55]} /><meshLambertMaterial color="#f4d1a1" /></mesh>
      <mesh position={[0, 2.95, -0.1]}><sphereGeometry args={[0.52]} /><meshLambertMaterial color="#1a1a1a" /></mesh>
      <mesh position={[0, 1.75, -0.95]} rotation={[0.3, 0, 0]}><boxGeometry args={[0.92, 1.15, 0.65]} /><meshLambertMaterial color="#ffcc22" /></mesh>

      <group ref={leftArm} position={[-0.95, 1.65, 0]}><mesh rotation={[0.6, 0, -1.3]}><capsuleGeometry args={[0.18, 0.72]} /><meshLambertMaterial color="#f4d1a1" /></mesh></group>
      <group ref={rightArm} position={[0.95, 1.65, 0]}><mesh rotation={[0.6, 0, 1.3]}><capsuleGeometry args={[0.18, 0.72]} /><meshLambertMaterial color="#f4d1a1" /></mesh></group>

      <group ref={leftLeg} position={[-0.38, 0.55, 0]}><mesh><capsuleGeometry args={[0.24, 0.9]} /><meshLambertMaterial color="#162f6e" /></mesh></group>
      <group ref={rightLeg} position={[0.38, 0.55, 0]}><mesh><capsuleGeometry args={[0.24, 0.9]} /><meshLambertMaterial color="#162f6e" /></mesh></group>

      <mesh position={[-0.38, 0.12, 0.12]}><boxGeometry args={[0.52, 0.28, 0.85]} /><meshLambertMaterial color="#111" /></mesh>
      <mesh position={[0.38, 0.12, 0.12]}><boxGeometry args={[0.52, 0.28, 0.85]} /><meshLambertMaterial color="#111" /></mesh>

      {isFlying && <group position={[0, 0.85, -1.35]}><mesh><coneGeometry args={[0.28, 1.4, 8]} /><meshLambertMaterial color="#ff5500" emissive="#ff2200" /></mesh></group>}
    </group>
  );
}

// ==================== TRACK ====================
function TrackSegment({ position }: { position: number }) {
  return (
    <group position={[0, 0, position]}>
      <mesh position={[0, -0.2, 0]} receiveShadow><boxGeometry args={[13.5, 0.45, TRACK_LENGTH]} /><meshLambertMaterial color="#2c3e50" /></mesh>
      {[-1, 0, 1].map(l => <mesh key={l} position={[l * LANE_WIDTH, 0.1, 0]}><boxGeometry args={[0.12, 0.04, TRACK_LENGTH - 3]} /><meshLambertMaterial color="#f1c40f" /></mesh>)}
      {[-4.8, 4.8].map((x, i) => <mesh key={i} position={[x, 0.1, 0]}><boxGeometry args={[0.45, 0.22, TRACK_LENGTH]} /><meshLambertMaterial color="#444" /></mesh>)}
      {Array.from({ length: 8 }).map((_, i) => <mesh key={i} position={[0, 0.02, -42 + i * 13]}><boxGeometry args={[12.8, 0.26, 1.35]} /><meshLambertMaterial color="#3d2b1f" /></mesh>)}
      <mesh position={[-10.2, 6, 0]}><boxGeometry args={[1.6, 13, TRACK_LENGTH]} /><meshLambertMaterial color="#1a2634" /></mesh>
      <mesh position={[10.2, 6, 0]}><boxGeometry args={[1.6, 13, TRACK_LENGTH]} /><meshLambertMaterial color="#1a2634" /></mesh>
      <mesh position={[0, 12.5, 0]}><boxGeometry args={[21, 1.1, TRACK_LENGTH]} /><meshLambertMaterial color="#16213e" /></mesh>
    </group>
  );
}

// ==================== RAMP ====================
function Ramp({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* main ramp platform */}
      <mesh rotation={[0.35, 0, 0]} position={[0, 0.55, 0]}>
        <boxGeometry args={[3.35, 0.38, 4.8]} />
        <meshLambertMaterial color="#555" />
      </mesh>
      {/* support structure */}
      <mesh position={[0, 0.05, -1.9]}><boxGeometry args={[3.5, 0.4, 0.9]} /><meshLambertMaterial color="#333" /></mesh>
      <mesh position={[-1.6, 0.9, 0]}><boxGeometry args={[0.3, 1.9, 4.2]} /><meshLambertMaterial color="#444" /></mesh>
      <mesh position={[1.6, 0.9, 0]}><boxGeometry args={[0.3, 1.9, 4.2]} /><meshLambertMaterial color="#444" /></mesh>
      {/* yellow markings */}
      <mesh rotation={[0.35, 0, 0]} position={[0, 0.78, 0.6]}><boxGeometry args={[3.2, 0.08, 4.1]} /><meshLambertMaterial color="#f1c40f" /></mesh>
    </group>
  );
}

// ==================== OBSTACLES ====================
function Obstacle({ position, type }: { position: [number, number, number]; type: string }) {
  if (type === 'train') return <group position={position}><mesh><boxGeometry args={[3.1, 3.6, 10]} /><meshLambertMaterial color="#1a1a1a" /></mesh><mesh position={[0, 1.6, 0]}><boxGeometry args={[2.85, 0.9, 9.6]} /><meshLambertMaterial color="#ffcc22" /></mesh></group>;
  if (type === 'barrier') return <group position={position}><mesh><boxGeometry args={[2.6, 1.8, 1.5]} /><meshLambertMaterial color="#c0392b" /></mesh><mesh position={[0, 0.9, 0]}><boxGeometry args={[2.4, 0.45, 1.3]} /><meshLambertMaterial color="#f1c40f" /></mesh></group>;
  if (type === 'barrel') return <group position={position}><mesh><cylinderGeometry args={[1.05, 1.05, 2.1, 16]} /><meshLambertMaterial color="#555" /></mesh></group>;
  return <group position={position}><mesh position={[0, 3.8, 0]}><boxGeometry args={[3.9, 1.15, 1.1]} /><meshLambertMaterial color="#f1c40f" /></mesh></group>;
}

// ==================== COIN ====================
function Coin({ position, collected }: any) {
  const ref = useRef<THREE.Mesh>(null!);
  useFrame((state) => {
    if (ref.current && !collected) {
      ref.current.rotation.y = state.clock.elapsedTime * 5.8;
      ref.current.position.y = position[1] + Math.sin(state.clock.elapsedTime * 4.5) * 0.35;
    }
  });
  if (collected) return null;
  return <mesh ref={ref} position={position}><cylinderGeometry args={[0.72, 0.72, 0.22, 26]} /><meshLambertMaterial color="#f1c40f" emissive="#ffaa00" emissiveIntensity={0.45} /></mesh>;
}

// ==================== POWERUPS & ENEMIES ====================
function PoliceDog({ position }: { position: [number, number, number] }) {
  return <group position={position}><mesh position={[0, 1.15, 0]}><capsuleGeometry args={[0.52, 1.35]} /><meshLambertMaterial color="#3a2f1f" /></mesh><mesh position={[0, 1.85, 1.15]}><sphereGeometry args={[0.48]} /><meshLambertMaterial color="#3a2f1f" /></mesh></group>;
}

function Jetpack({ position }: { position: [number, number, number] }) {
  const g = useRef<THREE.Group>(null!);
  useFrame(s => { if (g.current) g.current.rotation.y = s.clock.elapsedTime * 2.5; });
  return <group ref={g} position={position}><mesh><cylinderGeometry args={[0.5, 0.5, 1.5]} /><meshLambertMaterial color="#ff6600" emissive="#ff3300" /></mesh></group>;
}

function SpeedBoost({ position }: { position: [number, number, number] }) {
  const g = useRef<THREE.Group>(null!);
  useFrame(s => { if (g.current) g.current.rotation.y = s.clock.elapsedTime * 3; });
  return <group ref={g} position={position}><mesh><boxGeometry args={[1.1, 1.1, 1.1]} /><meshLambertMaterial color="#00ffaa" emissive="#00cc88" emissiveIntensity={0.6} /></mesh></group>;
}

function MysteryBox({ position }: { position: [number, number, number] }) {
  const g = useRef<THREE.Group>(null!);
  useFrame(s => { if (g.current) g.current.rotation.y = s.clock.elapsedTime * 1.5; });
  return (
    <group ref={g} position={position}>
      <mesh><boxGeometry args={[1.3, 1.3, 1.3]} /><meshLambertMaterial color="#ff44aa" emissive="#aa2266" /></mesh>
    </group>
  );
}

function MovingTrain({ position, direction }: { position: [number, number, number]; direction: number }) {
  const ref = useRef<THREE.Group>(null!);
  useFrame(() => { if (ref.current) ref.current.position.x += direction * 0.22; });
  return <group ref={ref} position={position}><mesh><boxGeometry args={[3.2, 3.4, 11]} /><meshLambertMaterial color="#222" /></mesh></group>;
}

function Inspector({ position }: { position: [number, number, number] }) {
  return <group position={position}><mesh position={[0, 1.6, 0]}><capsuleGeometry args={[0.45, 1.1]} /><meshLambertMaterial color="#2c2c2c" /></mesh><mesh position={[0, 2.5, 0]}><sphereGeometry args={[0.4]} /><meshLambertMaterial color="#f4d1a1" /></mesh></group>;
}

// ==================== SCENE ====================
function GameScene({ playerPos, obstacles, coins, powerUps, trackOffset, dogPosition, isFlying, movingTrains, inspectorPos, ramps, grayscale, isDead }: any) {
  const { camera, scene } = useThree();

  useFrame(() => {
    camera.position.x = THREE.MathUtils.lerp(camera.position.x, playerPos[0] * 0.72, 0.09);
    camera.position.z = playerPos[2] + 19.5;
    camera.position.y = playerPos[1] + 9.2 + (isFlying ? 4.5 : 0);
    camera.lookAt(playerPos[0] * 0.35, playerPos[1] + (isFlying ? 3 : 5), playerPos[2] - 7);
  });

  useEffect(() => {
    scene.fog = new THREE.Fog(grayscale ? '#111' : '#0c1629', grayscale ? 40 : 52, grayscale ? 120 : 160);
  }, [grayscale, scene]);

  const segments = [];
  for (let i = -2; i < 6; i++) segments.push(<TrackSegment key={i} position={trackOffset + i * TRACK_LENGTH} />);

  return (
    <>
      <ambientLight intensity={grayscale ? 0.38 : 0.68} />
      <directionalLight position={[18, 42, -12]} intensity={grayscale ? 0.7 : 1.25} castShadow />

      {segments}

      <Player position={playerPos} isJumping={playerPos[1] > 2.1} isSliding={playerPos[1] < 1.35} laneIndex={Math.round((playerPos[0] + LANE_WIDTH) / LANE_WIDTH)} isFlying={isFlying} isDead={isDead} />

      {obstacles.map((o: any, i: number) => <Obstacle key={i} position={o.position} type={o.type} />)}
      {coins.map((c: any, i: number) => <Coin key={i} position={c.position} collected={c.collected} />)}
      {powerUps.map((p: any, i: number) => {
        if (p.collected) return null;
        if (p.type === 'speed') return <SpeedBoost key={i} position={p.position} />;
        if (p.type === 'mystery') return <MysteryBox key={i} position={p.position} />;
        return <Jetpack key={i} position={p.position} />;
      })}
      {ramps.map((r: any, i: number) => <Ramp key={i} position={r.position} />)}
      {dogPosition && <PoliceDog position={dogPosition} />}
      {movingTrains.map((t: any, idx: number) => <MovingTrain key={idx} position={t.position} direction={t.direction} />)}
      {inspectorPos && <Inspector position={inspectorPos} />}

      <fog attach="fog" args={[grayscale ? '#111' : '#0c1629', grayscale ? 40 : 52, grayscale ? 120 : 160]} />
    </>
  );
}

// ==================== MAIN GAME ====================
export default function True3DSubwaySurfers() {
  // 3D ONLY - DEPLOYED 2026-07-01 - NOT THE OLD 2D CANVAS VERSION
  const [gameState, setGameState] = useState<GameState>({
    score: 0, coins: 0, distance: 0, highScore: 0,
    isRunning: false, isPaused: false, isGameOver: false, grayscale: false, multiplier: 1, streak: 0
  });

  const [playerPos, setPlayerPos] = useState<[number,number,number]>([0, 1.65, 0]);
  const [currentLane, setCurrentLane] = useState(1);
  const [isJumping, setIsJumping] = useState(false);
  const [isSliding, setIsSliding] = useState(false);
  const [velocityY, setVelocityY] = useState(0);
  const [isFlying, setIsFlying] = useState(false);
  const [flyTime, setFlyTime] = useState(0);
  const [isDead, setIsDead] = useState(false);

  const [obstacles, setObstacles] = useState<any[]>([]);
  const [coins, setCoins] = useState<any[]>([]);
  const [powerUps, setPowerUps] = useState<any[]>([]);
  const [movingTrains, setMovingTrains] = useState<any[]>([]);
  const [ramps, setRamps] = useState<any[]>([]);
  const [trackOffset, setTrackOffset] = useState(0);
  const [dogPosition, setDogPosition] = useState<[number,number,number] | null>(null);
  const [inspectorPos, setInspectorPos] = useState<[number,number,number] | null>(null);

  const [particles, setParticles] = useState<any[]>([]);

  const keysRef = useRef(new Set<string>());
  const lastTimeRef = useRef(Date.now());
  const loopRef = useRef<number | null>(null);
  const distRef = useRef(0);
  const speedRef = useRef(PLAYER_SPEED);
  const lastSpawn = useRef(-25);
  const streakRef = useRef(0);
  const lastCoinTime = useRef(0);
  const lastRampTime = useRef(0);

  const { playSound } = useGameAudio();

  useEffect(() => {
    const hs = parseInt(localStorage.getItem('subway3dHighScore') || '0');
    setGameState(p => ({ ...p, highScore: hs }));
  }, []);

  const saveHighScore = (score: number) => {
    const hs = Math.max(gameState.highScore, score);
    localStorage.setItem('subway3dHighScore', hs.toString());
    setGameState(p => ({ ...p, highScore: hs }));
  };

  const spawnEntities = useCallback((z: number) => {
    if (Math.random() < 0.68) {
      const lane = Math.floor(Math.random() * 3);
      const r = Math.random();
      const type = r > 0.68 ? 'train' : r > 0.45 ? 'barrel' : r > 0.22 ? 'arch' : 'barrier';
      setObstacles(prev => [...prev, { position: [LANES[lane], type === 'train' ? 1.9 : 1.5, z], type }]);
    }
    if (Math.random() < 0.78) {
      const lane = Math.floor(Math.random() * 3);
      for (let i = 0; i < (Math.random() > 0.5 ? 4 : 3); i++) setCoins(prev => [...prev, { position: [LANES[lane], 3.5, z - i * 7.2], collected: false }]);
    }
    if (Math.random() < 0.13) {
      const lane = Math.floor(Math.random() * 3);
      const type = Math.random() > 0.5 ? 'jetpack' : (Math.random() > 0.5 ? 'speed' : 'mystery');
      setPowerUps(prev => [...prev, { position: [LANES[lane], 4.6, z - 15], collected: false, type }]);
    }
    if (Math.random() < 0.09) {
      const dir = Math.random() > 0.5 ? 1 : -1;
      setMovingTrains(prev => [...prev, { position: [dir > 0 ? -18 : 18, 1.8, z - 25], direction: dir }]);
    }
    if (Math.random() < 0.11) {
      const lane = Math.floor(Math.random() * 3);
      setRamps(prev => [...prev, { position: [LANES[lane], 0.1, z - 8] }]);
    }
  }, []);

  const resetGame = () => {
    setPlayerPos([0, 1.65, 0]); setCurrentLane(1);
    setIsJumping(false); setIsSliding(false); setVelocityY(0);
    setIsFlying(false); setFlyTime(0); setIsDead(false);
    setObstacles([]); setCoins([]); setPowerUps([]); setMovingTrains([]); setRamps([]);
    setTrackOffset(0); setDogPosition(null); setInspectorPos(null); setParticles([]);
    distRef.current = 0; speedRef.current = PLAYER_SPEED; lastSpawn.current = -25; streakRef.current = 0;
    lastCoinTime.current = 0;

    setGameState(p => ({
      ...p, score: 0, coins: 0, distance: 0, multiplier: 1, streak: 0,
      isRunning: true, isPaused: false, isGameOver: false, grayscale: false
    }));
    lastTimeRef.current = Date.now();
    for (let i = 20; i < 125; i += 32) spawnEntities(-i);
  };

  const handleInput = (action: string) => {
    const st = gameState;
    if (!st.isRunning || st.isPaused || st.isGameOver) {
      if (action === 'start' || action === 'restart') resetGame();
      if (action === 'pause' && st.isRunning) setGameState(p => ({ ...p, isPaused: !p.isPaused }));
      return;
    }
    if (action === 'pause') { setGameState(p => ({ ...p, isPaused: !p.isPaused })); return; }
    if (action === 'grayscale') { setGameState(p => ({ ...p, grayscale: !p.grayscale })); return; }

    if (action === 'left' && currentLane > 0) { const nl = currentLane - 1; setCurrentLane(nl); setPlayerPos(p => [LANES[nl], p[1], p[2]]); playSound('lane'); }
    if (action === 'right' && currentLane < 2) { const nl = currentLane + 1; setCurrentLane(nl); setPlayerPos(p => [LANES[nl], p[1], p[2]]); playSound('lane'); }

    if ((action === 'jump' || action === 'up') && !isJumping && !isSliding) { setIsJumping(true); setVelocityY(JUMP_FORCE); playSound('jump'); }
    if ((action === 'slide' || action === 'down') && !isJumping && !isSliding && !isFlying) { setIsSliding(true); playSound('slide'); setTimeout(() => setIsSliding(false), 580); }
  };

  const gameLoop = useCallback(() => {
    if (!gameState.isRunning || gameState.isPaused || gameState.isGameOver) { loopRef.current = requestAnimationFrame(gameLoop); return; }

    const now = Date.now();
    const dt = Math.min((now - lastTimeRef.current) / 1000, 0.055);
    lastTimeRef.current = now;

    const spd = speedRef.current;
    let nz = playerPos[2] - spd * dt * 0.9;
    let ny = playerPos[1];
    let nv = velocityY;
    let flying = isFlying;
    let ft = flyTime;

    if (flying) { ft -= dt; if (ft <= 0) { flying = false; setIsFlying(false); } else ny = Math.max(2.9, ny + dt * 0.8); }
    if (isJumping && !flying) { nv += GRAVITY * dt; ny += nv * dt; if (ny <= 1.65) { ny = 1.65; nv = 0; setIsJumping(false); } } else if (!flying) ny = 1.65;

    const npos: [number,number,number] = [LANES[currentLane], ny, nz];
    setPlayerPos(npos);
    setVelocityY(nv);
    setFlyTime(ft);
    setTrackOffset(nz);

    if (Math.floor(nz) < lastSpawn.current - 28) { lastSpawn.current = Math.floor(nz); spawnEntities(nz - 92); }

    const mf = spd * dt * 0.9;

    const obs = obstacles.filter(o => o.position[2] < 26).map(o => ({...o, position: [o.position[0], o.position[1], o.position[2] + mf]}));
    const cns = coins.filter(c => !c.collected && c.position[2] < 30).map(c => ({...c, position: [c.position[0], c.position[1], c.position[2] + mf]}));
    const pus = powerUps.filter(p => !p.collected && p.position[2] < 30).map(p => ({...p, position: [p.position[0], p.position[1], p.position[2] + mf]}));
    const mTrains = movingTrains.filter(t => Math.abs(t.position[0]) < 26).map(t => ({...t, position: [t.position[0] + t.direction * 0.22, t.position[1], t.position[2]]}));
    const rmps = ramps.filter(r => r.position[2] < 28).map(r => ({...r, position: [r.position[0], r.position[1], r.position[2] + mf]}));

    setObstacles(obs); setCoins(cns); setPowerUps(pus); setMovingTrains(mTrains); setRamps(rmps);

    if (distRef.current > 75) setInspectorPos([LANES[currentLane] * 0.6, 1.6, nz + 11]); else setInspectorPos(null);
    setDogPosition(distRef.current > 48 ? [LANES[currentLane] * 0.8, 1.05, nz + 13] : null);

    // Ramp physics - accurate Subway Surfers ramp boost
    for (const r of rmps) {
      const dx = Math.abs(npos[0] - r.position[0]);
      const dz = Math.abs(npos[2] - r.position[2]);
      if (dx < 1.75 && dz < 3.2 && !isFlying && !isJumping && ny < 2.4 && (now - lastRampTime.current > 380)) {
        nv = JUMP_FORCE * 1.6;
        ny = 2.3;
        setIsJumping(true);
        setVelocityY(nv);
        playSound('ramp');
        speedRef.current = Math.min(39, speedRef.current + 1.8);
        setParticles(prev => [...prev, { pos: [...npos], color: '#ffcc22', time: Date.now() }]);
        lastRampTime.current = now;
        break;
      }
    }

    let dead = false;
    for (const o of obs) {
      const dx = Math.abs(npos[0] - o.position[0]); const dz = Math.abs(npos[2] - o.position[2]); const dy = Math.abs(npos[1] - o.position[1]);
      const xh = dx < (o.type === 'train' ? 2.95 : 1.75); const zh = dz < (o.type === 'train' ? 5.9 : 1.7);
      if (xh && zh && dy < 4) { if (flying) continue; if (isJumping && o.type !== 'train') continue; if (isSliding && (o.type === 'barrier' || o.type === 'barrel')) continue; dead = true; break; }
    }
    for (const t of mTrains) if (Math.abs(npos[0] - t.position[0]) < 2.9 && Math.abs(npos[2] - t.position[2]) < 5.8) dead = true;
    if (dogPosition && Math.abs(npos[2] - dogPosition[2]) < 4.8 && Math.abs(npos[0] - dogPosition[0]) < 2.1) dead = true;
    if (inspectorPos && Math.abs(npos[2] - inspectorPos[2]) < 3.5 && Math.abs(npos[0] - inspectorPos[0]) < 2) dead = true;

    if (dead) {
      playSound('crash'); saveHighScore(gameState.score);
      setIsDead(true);
      setGameState(p => ({...p, isRunning: false, isGameOver: true}));
      setParticles(prev => [...prev, { pos: [...npos], color: '#ff6666', time: Date.now() }]);
      if (loopRef.current) cancelAnimationFrame(loopRef.current); return;
    }

    // Coin collection + streak
    let cc = 0;
    const nc = cns.map(c => {
      if (!c.collected && Math.abs(npos[0]-c.position[0]) < 1.6 && Math.abs(npos[2]-c.position[2]) < 2) {
        cc++;
        const now = Date.now();
        if (now - lastCoinTime.current < 650) {
          streakRef.current = Math.min(8, streakRef.current + 1);
        } else {
          streakRef.current = 1;
        }
        lastCoinTime.current = now;
        playSound('coin');
        setParticles(prev => [...prev, { pos: [...c.position], color: '#ffdd55', time: Date.now() }]);
        return {...c, collected: true};
      }
      return c;
    });
    if (cc > 0) setCoins(nc);

    // Power-ups
    let gotJet = false; let gotBoost = false; let gotMystery = false;
    const np = pus.map(p => {
      if (!p.collected && Math.abs(npos[0]-p.position[0]) < 1.7 && Math.abs(npos[2]-p.position[2]) < 2.6) {
        if (p.type === 'jetpack') gotJet = true;
        else if (p.type === 'speed') gotBoost = true;
        else gotMystery = true;
        return {...p, collected: true};
      }
      return p;
    });
    if (gotJet) { setPowerUps(np); setIsFlying(true); setFlyTime(9.8); setIsJumping(false); playSound('jetpack'); }
    if (gotBoost) { setPowerUps(np); speedRef.current = Math.min(42, speedRef.current + 7); playSound('boost'); setTimeout(() => { if (speedRef.current > PLAYER_SPEED + 2) speedRef.current -= 7; }, 4800); }
    if (gotMystery) {
      setPowerUps(np);
      playSound('mystery');
      if (Math.random() > 0.5) { setIsFlying(true); setFlyTime(8); } else { speedRef.current = Math.min(42, speedRef.current + 8); setTimeout(() => { speedRef.current = Math.max(PLAYER_SPEED, speedRef.current - 7); }, 4200); }
    }

    distRef.current += spd * dt * 0.6;
    const d = Math.floor(distRef.current);

    const currentMult = flying ? 2 : Math.max(1, Math.floor(streakRef.current / 2));

    if (d !== gameState.distance || cc > 0) {
      setGameState(p => ({
        ...p, distance: d, coins: p.coins + cc, multiplier: currentMult,
        score: Math.floor(d * 1.38 + (p.coins + cc) * 27 * currentMult)
      }));
    }

    if (d > 65 && speedRef.current < 38) speedRef.current += 0.009;

    setParticles(prev => prev.filter(p => Date.now() - p.time < 900));

    loopRef.current = requestAnimationFrame(gameLoop);
  }, [playerPos, currentLane, velocityY, isJumping, isSliding, isFlying, flyTime, gameState, obstacles, coins, powerUps, movingTrains, spawnEntities]);

  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      keysRef.current.add(e.key);
      const k = e.key.toLowerCase();
      if (['arrowleft', 'a'].includes(k)) handleInput('left');
      if (['arrowright', 'd'].includes(k)) handleInput('right');
      if (['arrowup', 'w', ' '].includes(k)) handleInput('jump');
      if (['arrowdown', 's'].includes(k)) handleInput('slide');
      if (k === 'p') handleInput('pause');
      if (k === 'g') handleInput('grayscale');
      if (['enter', ' '].includes(e.key) && (gameState.isGameOver || !gameState.isRunning)) handleInput('restart');
      e.preventDefault();
    };
    window.addEventListener('keydown', kd);
    return () => window.removeEventListener('keydown', kd);
  }, [gameState]);

  const start = () => {
    if (loopRef.current) cancelAnimationFrame(loopRef.current);
    resetGame();
    lastTimeRef.current = Date.now();
    loopRef.current = requestAnimationFrame(gameLoop);
  };

  useEffect(() => () => { if (loopRef.current) cancelAnimationFrame(loopRef.current); }, []);

  return (
    <div style={{ width: '100%', height: '100vh', position: 'relative', background: '#0a1428' }}>
      <Canvas camera={{ position: [0, 11, 23], fov: 55 }} style={{ background: '#0c1a35' }} shadows>
        <GameScene 
          playerPos={playerPos} obstacles={obstacles} coins={coins} powerUps={powerUps} 
          trackOffset={trackOffset} dogPosition={dogPosition} isFlying={isFlying} 
          movingTrains={movingTrains} inspectorPos={inspectorPos} ramps={ramps} grayscale={gameState.grayscale} 
          isDead={isDead}
        />
        {particles.map((p, i) => <ParticleBurst key={i} position={p.pos} color={p.color} />)}
      </Canvas>

      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', fontFamily: '"Press Start 2P", system-ui', zIndex: 10, color: '#fff' }}>
        <div style={{ position: 'absolute', top: 16, left: 16, background: 'rgba(0,0,0,0.7)', color: '#ffcc22', padding: '6px 16px', border: '3px solid #ffcc22', borderRadius: 3 }}>
          SCORE<br /><span style={{ fontSize: 20 }}>{gameState.score.toString().padStart(6, '0')}</span>
        </div>
        <div style={{ position: 'absolute', top: 16, right: 16, background: 'rgba(0,0,0,0.7)', color: '#ffcc22', padding: '6px 16px', border: '3px solid #ffcc22', borderRadius: 3 }}>
          COINS<br /><span style={{ fontSize: 20 }}>{gameState.coins}</span>
        </div>
        <div style={{ position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)', color: '#aaa', fontSize: 11 }}>{gameState.distance}m</div>

        {gameState.multiplier > 1 && (
          <div style={{ position: 'absolute', top: 52, left: '50%', transform: 'translateX(-50%)', color: '#ffdd22', fontSize: 15, fontWeight: 'bold' }}>
            x{gameState.multiplier} MULTIPLIER
          </div>
        )}

        {!gameState.isRunning && !gameState.isGameOver && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.88)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'all' }}>
            <h1 style={{ fontSize: 46, color: '#ffcc22', marginBottom: 4 }}>SUBWAY SURFERS</h1>
            <div style={{ color: '#00ff00', fontSize: 14, fontWeight: 'bold', margin: '4px 0 12px', letterSpacing: '3px', border: '1px solid #00ff00', padding: '2px 10px', display: 'inline-block' }}>
              ★ TRUE 3D VERSION (React + Three.js) ★
            </div>
            <p style={{ color: '#aaa', marginBottom: 20 }}>Ramps • Jetpack • Police Dog • Inspector • Moving Trains</p>
            <div style={{position:'absolute', top:6, right:6, fontSize:9, color:'#0f0', background:'#111', padding:'1px 5px', border: '1px solid #0f0'}}>3D ONLY</div>
            <div style={{ marginBottom: 32, fontSize: 12, textAlign: 'center', lineHeight: 1.7 }}>
              ← → Lanes &nbsp; SPACE Jump &nbsp; ↓ Slide<br />Jetpacks • Speed Boost • Mystery Boxes • G = Grayscale
            </div>
            <button onClick={start} style={{ background: '#ffcc22', color: '#111', border: 'none', padding: '14px 46px', fontSize: 15, fontFamily: 'inherit', fontWeight: 'bold', cursor: 'pointer' }}>START RUNNING</button>
            {gameState.highScore > 0 && <div style={{ marginTop: 18, color: '#888', fontSize: 11 }}>HIGH SCORE: {gameState.highScore}</div>}
          </div>
        )}

        {gameState.isGameOver && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.9)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'all' }}>
            <h1 style={{ color: '#ff4444', fontSize: 34 }}>GAME OVER</h1>
            <div style={{ fontSize: 22, color: '#ffcc22', margin: '8px 0' }}>{gameState.score.toString().padStart(6, '0')}</div>
            <div style={{ color: '#aaa', marginBottom: 22 }}>{gameState.coins} coins • {gameState.distance}m</div>
            <button onClick={start} style={{ background: '#ffcc22', color: '#111', padding: '12px 36px', fontSize: 14, fontFamily: 'inherit', border: 'none' }}>PLAY AGAIN</button>
          </div>
        )}

        {gameState.isPaused && <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, color: '#ffcc22' }}>PAUSED</div>}
      </div>

      {gameState.isRunning && !gameState.isPaused && (
        <div style={{ position: 'absolute', bottom: 18, left: 0, right: 0, display: 'flex', justifyContent: 'space-between', padding: '0 20px', zIndex: 30, pointerEvents: 'all' }}>
          <button onClick={() => handleInput('left')} style={{ width: 54, height: 54, borderRadius: '50%', border: '3px solid #ffcc22', background: 'rgba(255,204,34,0.12)', color: '#ffcc22', fontSize: 24 }}>←</button>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <button onClick={() => handleInput('jump')} style={{ width: 54, height: 54, borderRadius: '50%', border: '3px solid #ffcc22', background: 'rgba(255,204,34,0.12)', color: '#ffcc22', fontSize: 20 }}>↑</button>
            <button onClick={() => handleInput('slide')} style={{ width: 54, height: 54, borderRadius: '50%', border: '3px solid #ffcc22', background: 'rgba(255,204,34,0.12)', color: '#ffcc22', fontSize: 20 }}>↓</button>
          </div>
          <button onClick={() => handleInput('right')} style={{ width: 54, height: 54, borderRadius: '50%', border: '3px solid #ffcc22', background: 'rgba(255,204,34,0.12)', color: '#ffcc22', fontSize: 24 }}>→</button>
        </div>
      )}
    </div>
  );
}
