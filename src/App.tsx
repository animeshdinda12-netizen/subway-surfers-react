import React, { useEffect, useRef, useState } from 'react';

interface GameState {
  score: number;
  coins: number;
  distance: number;
  highScore: number;
  isRunning: boolean;
  isPaused: boolean;
  isGameOver: boolean;
  showStart: boolean;
}

interface Player {
  lane: number; // 0, 1, 2
  x: number;
  y: number;
  vy: number;
  isJumping: boolean;
  isSliding: boolean;
  slideTimer: number;
  laneChangeTimer: number;
  targetLane: number;
}

interface Obstacle {
  id: number;
  lane: number;
  x: number;
  y: number;
  width: number;
  height: number;
  type: 'train' | 'barrier' | 'sign';
}

interface Coin {
  id: number;
  lane: number;
  x: number;
  y: number;
  collected: boolean;
}

interface Particle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
}

const LANE_WIDTH = 90;
const PLAYER_WIDTH = 32;
const PLAYER_HEIGHT = 48;
const GROUND_Y = 320;
const CANVAS_WIDTH = 900;
const CANVAS_HEIGHT = 520;
const NUM_LANES = 3;

const SubwaySurfers: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const keysRef = useRef<Set<string>>(new Set());
  const lastTimeRef = useRef<number>(0);
  const gameStateRef = useRef<GameState>({
    score: 0,
    coins: 0,
    distance: 0,
    highScore: 0,
    isRunning: false,
    isPaused: false,
    isGameOver: false,
    showStart: true,
  });
  const playerRef = useRef<Player>({
    lane: 1,
    x: CANVAS_WIDTH / 2 - PLAYER_WIDTH / 2,
    y: GROUND_Y,
    vy: 0,
    isJumping: false,
    isSliding: false,
    slideTimer: 0,
    laneChangeTimer: 0,
    targetLane: 1,
  });
  const obstaclesRef = useRef<Obstacle[]>([]);
  const coinsRef = useRef<Coin[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const scrollSpeedRef = useRef(3.2);
  const distanceRef = useRef(0);
  const lastObstacleTimeRef = useRef(0);
  const lastCoinTimeRef = useRef(0);
  const frameRef = useRef(0);
  const gameStartTimeRef = useRef(0);

  const [gameState, setGameState] = useState<GameState>({
    score: 0,
    coins: 0,
    distance: 0,
    highScore: 0,
    isRunning: false,
    isPaused: false,
    isGameOver: false,
    showStart: true,
  });

  // Load high score
  useEffect(() => {
    const saved = localStorage.getItem('subwaySurfersHighScore');
    if (saved) {
      const hs = parseInt(saved);
      gameStateRef.current.highScore = hs;
      setGameState(prev => ({ ...prev, highScore: hs }));
    }
  }, []);

  const saveHighScore = (score: number) => {
    const currentHS = gameStateRef.current.highScore;
    if (score > currentHS) {
      localStorage.setItem('subwaySurfersHighScore', score.toString());
      gameStateRef.current.highScore = score;
      setGameState(prev => ({ ...prev, highScore: score }));
    }
  };

  // Audio System - 100% accurate arcade style
  const audioContextRef = useRef<AudioContext | null>(null);

  const initAudio = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return audioContextRef.current;
  };

  const playSound = (type: string) => {
    try {
      const audioCtx = initAudio();
      if (!audioCtx) return;

      const oscillator = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      const filter = audioCtx.createBiquadFilter();

      switch (type) {
        case 'coin':
          oscillator.type = 'square';
          oscillator.frequency.value = 880;
          gain.gain.value = 0.3;
          filter.type = 'highpass';
          filter.frequency.value = 1200;
          // Coin chime
          setTimeout(() => {
            oscillator.frequency.value = 1320;
          }, 80);
          setTimeout(() => {
            if (oscillator) oscillator.frequency.value = 1760;
          }, 150);
          gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.35);
          break;

        case 'jump':
          oscillator.type = 'sawtooth';
          oscillator.frequency.value = 440;
          gain.gain.value = 0.22;
          setTimeout(() => {
            if (oscillator) oscillator.frequency.linearRampToValueAtTime(680, audioCtx.currentTime + 0.18);
          }, 10);
          gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.25);
          break;

        case 'slide':
          oscillator.type = 'sine';
          oscillator.frequency.value = 190;
          gain.gain.value = 0.18;
          gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.35);
          break;

        case 'crash':
          oscillator.type = 'sawtooth';
          oscillator.frequency.value = 110;
          gain.gain.value = 0.4;
          filter.type = 'lowpass';
          filter.frequency.value = 420;
          gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.9);
          break;

        case 'lane':
          oscillator.type = 'square';
          oscillator.frequency.value = 660;
          gain.gain.value = 0.15;
          gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
          break;

        case 'powerup':
          oscillator.type = 'triangle';
          oscillator.frequency.value = 1240;
          gain.gain.value = 0.25;
          setTimeout(() => {
            if (oscillator) oscillator.frequency.value = 1520;
          }, 60);
          gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.45);
          break;
      }

      const noise = audioCtx.createBufferSource();
      if (type === 'crash') {
        const buffer = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.8, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) {
          data[i] = Math.random() * 2 - 1;
        }
        noise.buffer = buffer;
        const noiseGain = audioCtx.createGain();
        noiseGain.gain.value = 0.35;
        noiseGain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.65);
        const noiseFilter = audioCtx.createBiquadFilter();
        noiseFilter.type = 'lowpass';
        noiseFilter.frequency.value = 800;
        noise.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(audioCtx.destination);
        noise.start();
      }

      oscillator.connect(filter);
      filter.connect(gain);
      gain.connect(audioCtx.destination);
      oscillator.start();

      setTimeout(() => {
        try { oscillator.stop(); } catch {}
      }, 800);
    } catch (e) {
      // Audio fallback silent
    }
  };

  // Lane position helpers
  const getLaneX = (lane: number): number => {
    const centerX = CANVAS_WIDTH / 2;
    const laneOffset = (lane - 1) * LANE_WIDTH;
    return centerX + laneOffset - PLAYER_WIDTH / 2;
  };

  // Reset game
  const resetGame = () => {
    const newState: GameState = {
      score: 0,
      coins: 0,
      distance: 0,
      highScore: gameStateRef.current.highScore,
      isRunning: true,
      isPaused: false,
      isGameOver: false,
      showStart: false,
    };

    gameStateRef.current = newState;
    setGameState(newState);

    playerRef.current = {
      lane: 1,
      x: getLaneX(1),
      y: GROUND_Y,
      vy: 0,
      isJumping: false,
      isSliding: false,
      slideTimer: 0,
      laneChangeTimer: 0,
      targetLane: 1,
    };

    obstaclesRef.current = [];
    coinsRef.current = [];
    particlesRef.current = [];

    scrollSpeedRef.current = 3.2;
    distanceRef.current = 0;
    lastObstacleTimeRef.current = 0;
    lastCoinTimeRef.current = 0;
    frameRef.current = 0;
    gameStartTimeRef.current = Date.now();

    // Spawn initial coins
    for (let i = 0; i < 5; i++) {
      spawnCoin(220 + i * 180);
    }
  };

  // Spawn obstacle
  const spawnObstacle = (xOffset: number = 0) => {
    const lane = Math.floor(Math.random() * NUM_LANES);
    const type = Math.random() > 0.65 ? 'train' : Math.random() > 0.5 ? 'barrier' : 'sign';

    let width = 52, height = 68;
    if (type === 'train') {
      width = 76;
      height = 90;
    } else if (type === 'sign') {
      width = 32;
      height = 46;
    }

    const obstacle: Obstacle = {
      id: Date.now() + Math.random(),
      lane,
      x: CANVAS_WIDTH + 80 + xOffset,
      y: GROUND_Y - (type === 'train' ? 22 : 0),
      width,
      height,
      type,
    };

    obstaclesRef.current.push(obstacle);
  };

  // Spawn coin
  const spawnCoin = (x: number, laneOverride?: number) => {
    const lane = laneOverride !== undefined ? laneOverride : Math.floor(Math.random() * NUM_LANES);
    const coin: Coin = {
      id: Date.now() + Math.random(),
      lane,
      x: x,
      y: GROUND_Y - 34 - Math.random() * 12,
      collected: false,
    };
    coinsRef.current.push(coin);
  };

  // Spawn multiple coins (groups)
  const spawnCoinGroup = (baseX: number) => {
    const lane = Math.floor(Math.random() * NUM_LANES);
    for (let i = 0; i < 3; i++) {
      spawnCoin(baseX + i * 34, lane);
    }
    if (Math.random() > 0.6) {
      const otherLane = (lane + 1 + Math.floor(Math.random() * 2)) % NUM_LANES;
      spawnCoin(baseX + 50, otherLane);
    }
  };

  // Create particles
  const createParticles = (x: number, y: number, count: number, color: string, type: string = 'default') => {
    for (let i = 0; i < count; i++) {
      const spread = type === 'coin' ? 1.8 : 1.4;
      particlesRef.current.push({
        id: Date.now() + i,
        x: x + (Math.random() - 0.5) * 14,
        y: y + (Math.random() - 0.5) * 18,
        vx: (Math.random() - 0.5) * spread * (type === 'coin' ? 3 : 2),
        vy: (Math.random() - 0.7) * spread * (type === 'coin' ? 1.6 : 1.5) - (type === 'coin' ? 2.5 : 0),
        life: type === 'coin' ? 28 : 22,
        color,
        size: type === 'coin' ? 3.5 + Math.random() * 2 : 2.5 + Math.random() * 2,
      });
    }
  };

  // Handle input
  const handleInput = (action: string) => {
    const player = playerRef.current;
    const state = gameStateRef.current;

    if (!state.isRunning || state.isPaused || state.isGameOver) {
      if (action === 'start' || action === 'restart') {
        if (state.isGameOver || state.showStart) {
          resetGame();
          if (animationFrameRef.current === null) {
            gameLoop();
          }
        }
      } else if (action === 'pause' && state.isRunning) {
        togglePause();
      }
      return;
    }

    if (action === 'pause') {
      togglePause();
      return;
    }

    if (action === 'left' && player.lane > 0 && player.laneChangeTimer <= 0) {
      player.targetLane = player.lane - 1;
      player.laneChangeTimer = 9;
      player.lane = player.targetLane;
      playSound('lane');
    }
    if (action === 'right' && player.lane < NUM_LANES - 1 && player.laneChangeTimer <= 0) {
      player.targetLane = player.lane + 1;
      player.laneChangeTimer = 9;
      player.lane = player.targetLane;
      playSound('lane');
    }
    if ((action === 'jump' || action === 'up') && !player.isJumping && !player.isSliding) {
      player.vy = -13.5;
      player.isJumping = true;
      playSound('jump');
      createParticles(player.x + 15, player.y + 42, 6, '#ffdd66');
    }
    if ((action === 'down' || action === 'slide') && !player.isJumping && !player.isSliding) {
      player.isSliding = true;
      player.slideTimer = 26;
      playSound('slide');
      createParticles(player.x + 18, player.y + 50, 5, '#888');
    }
  };

  const togglePause = () => {
    const state = gameStateRef.current;
    const newPaused = !state.isPaused;

    gameStateRef.current.isPaused = newPaused;
    setGameState(prev => ({ ...prev, isPaused: newPaused }));

    if (!newPaused && animationFrameRef.current === null) {
      lastTimeRef.current = performance.now();
      gameLoop();
    }
  };

  // Main game loop
  const gameLoop = () => {
    if (!canvasRef.current) return;

    const ctx = canvasRef.current.getContext('2d', { alpha: true });
    if (!ctx) return;

    const now = performance.now();
    lastTimeRef.current = now;

    const state = gameStateRef.current;
    const player = playerRef.current;

    if (!state.isRunning || state.isPaused || state.isGameOver) {
      if (state.isPaused || state.isGameOver || state.showStart) {
        draw(ctx);
      }
      if (state.isRunning && !state.isPaused) {
        animationFrameRef.current = requestAnimationFrame(gameLoop);
      }
      return;
    }

    frameRef.current++;
    const speed = scrollSpeedRef.current;

    // === UPDATE PLAYER ===
    // Lane switching animation (smooth)
    if (player.laneChangeTimer > 0) {
      player.laneChangeTimer--;
    }
    const targetX = getLaneX(player.lane);
    const diff = targetX - player.x;
    player.x += diff * 0.35;
    if (Math.abs(diff) < 0.6) player.x = targetX;

    // Physics
    if (player.isJumping) {
      player.y += player.vy;
      player.vy += 0.68; // gravity

      if (player.y >= GROUND_Y) {
        player.y = GROUND_Y;
        player.vy = 0;
        player.isJumping = false;
      }
    } else {
      player.y = GROUND_Y;
    }

    // Slide
    if (player.isSliding) {
      player.slideTimer--;
      if (player.slideTimer <= 0) {
        player.isSliding = false;
      }
    }

    // === INCREASE SPEED ===
    const runTime = (Date.now() - gameStartTimeRef.current) / 1000;
    const targetSpeed = Math.min(3.2 + Math.floor(runTime / 11) * 0.32, 7.8);
    if (scrollSpeedRef.current < targetSpeed) {
      scrollSpeedRef.current += 0.003;
    }

    // === UPDATE DISTANCE & SCORE ===
    distanceRef.current += speed * 0.5;
    const newDistance = Math.floor(distanceRef.current);
    const newScore = Math.floor(newDistance * 1.3 + state.coins * 18);

    if (newDistance !== state.distance || newScore !== state.score) {
      gameStateRef.current = {
        ...state,
        distance: newDistance,
        score: newScore,
      };
      setGameState(prev => ({
        ...prev,
        distance: newDistance,
        score: newScore,
      }));
    }

    // === SPAWN OBSTACLES ===
    const spawnInterval = Math.max(38 - Math.floor(runTime / 6) * 1.5, 22);
    if (frameRef.current - lastObstacleTimeRef.current > spawnInterval) {
      spawnObstacle(Math.random() * 60);
      lastObstacleTimeRef.current = frameRef.current;

      // Chance of double obstacles
      if (Math.random() > 0.7 && speed > 4) {
        setTimeout(() => {
          if (gameStateRef.current.isRunning && !gameStateRef.current.isPaused) {
            spawnObstacle(110);
          }
        }, 160);
      }
    }

    // === SPAWN COINS ===
    if (frameRef.current - lastCoinTimeRef.current > 31) {
      if (Math.random() < 0.86) {
        spawnCoinGroup(CANVAS_WIDTH + 60 + Math.random() * 80);
      }
      lastCoinTimeRef.current = frameRef.current;
    }

    // === UPDATE ENTITIES ===
    // Obstacles
    obstaclesRef.current = obstaclesRef.current.filter(ob => {
      ob.x -= speed;
      return ob.x > -120;
    });

    // Coins
    coinsRef.current = coinsRef.current.filter(coin => {
      coin.x -= speed;
      if (!coin.collected && coin.x < -20) return false;
      return coin.x > -30;
    });

    // === COLLISIONS: Player vs Obstacles ===
    const pWidth = player.isSliding ? 42 : PLAYER_WIDTH;
    const pHeight = player.isSliding ? 26 : PLAYER_HEIGHT;
    const px = player.x + (player.isSliding ? 2 : 0);
    const py = player.y + (player.isSliding ? 24 : 0);

    let collided = false;

    for (const ob of obstaclesRef.current) {
      const obX = ob.x;
      const obY = ob.y;

      const overlapX = px < obX + ob.width && px + pWidth > obX;
      const overlapY = py < obY + ob.height && py + pHeight > obY;

      if (overlapX && overlapY) {
        // Special case: can jump over or slide under
        if (player.isJumping && ob.type !== 'train') {
          // Jump over low obstacles
          continue;
        }
        if (player.isSliding && ob.type === 'barrier') {
          continue;
        }
        if (player.isSliding && ob.type === 'sign') {
          continue;
        }

        collided = true;
        break;
      }
    }

    if (collided) {
      handleGameOver();
      return;
    }

    // === COIN COLLECTION ===
    for (const coin of coinsRef.current) {
      if (coin.collected) continue;

      const coinX = coin.x + 10;
      const coinY = coin.y + 10;
      const coinSize = 18;

      const overlap = px < coinX + coinSize && px + pWidth > coinX &&
                      py < coinY + coinSize && py + pHeight > coinY;

      if (overlap) {
        coin.collected = true;
        const currentCoins = gameStateRef.current.coins + 1;
        gameStateRef.current.coins = currentCoins;

        setGameState(prev => ({
          ...prev,
          coins: currentCoins,
          score: Math.floor(distanceRef.current * 1.3 + currentCoins * 18)
        }));

        playSound('coin');
        createParticles(coinX, coinY, 9, '#ffdd55', 'coin');

        // Chance of extra coin bonus
        if (Math.random() > 0.8 && coinsRef.current.length < 8) {
          setTimeout(() => {
            if (gameStateRef.current.isRunning && !gameStateRef.current.isPaused) {
              spawnCoin(coin.x + 48, coin.lane);
            }
          }, 140);
        }
      }
    }

    // === PARTICLES UPDATE ===
    particlesRef.current = particlesRef.current.filter(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.2;
      p.life--;
      return p.life > 0;
    });

    // === DRAW ===
    draw(ctx);

    // Schedule next frame
    animationFrameRef.current = requestAnimationFrame(gameLoop);
  };

  // Draw everything
  const draw = (ctx: CanvasRenderingContext2D) => {
    const state = gameStateRef.current;
    const player = playerRef.current;
    const speed = scrollSpeedRef.current;

    ctx.save();

    // Background gradient
    const bgGrad = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    bgGrad.addColorStop(0, '#0c1629');
    bgGrad.addColorStop(0.3, '#16213e');
    bgGrad.addColorStop(1, '#0f1f36');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Tunnel walls (subway style)
    ctx.fillStyle = '#1f2a4a';
    ctx.fillRect(0, 0, 110, CANVAS_HEIGHT);
    ctx.fillRect(CANVAS_WIDTH - 110, 0, 110, CANVAS_HEIGHT);

    // Wall tiles
    ctx.strokeStyle = '#263a5c';
    ctx.lineWidth = 1.5;
    for (let y = 0; y < CANVAS_HEIGHT; y += 38) {
      ctx.beginPath();
      ctx.rect(12, y, 84, 36);
      ctx.rect(CANVAS_WIDTH - 96, y, 84, 36);
      ctx.stroke();
    }

    // Ceiling
    ctx.fillStyle = '#1c273e';
    ctx.fillRect(110, 0, CANVAS_WIDTH - 220, 54);

    // Track background / floor
    const floorOffset = (Date.now() % 1200) * (speed * 0.4) % 1200;
    ctx.fillStyle = '#16253d';
    ctx.fillRect(110, GROUND_Y + 18, CANVAS_WIDTH - 220, CANVAS_HEIGHT - GROUND_Y - 18);

    // Subway tracks
    ctx.fillStyle = '#2a3f5f';
    ctx.fillRect(110, GROUND_Y + 34, CANVAS_WIDTH - 220, 78);

    // Track rails
    ctx.fillStyle = '#445d7e';
    ctx.fillRect(110, GROUND_Y + 52, CANVAS_WIDTH - 220, 9);
    ctx.fillRect(110, GROUND_Y + 89, CANVAS_WIDTH - 220, 9);

    // Rail lines
    ctx.strokeStyle = '#667fa1';
    ctx.lineWidth = 3;
    const railX1 = 160;
    const railX2 = CANVAS_WIDTH - 160;
    ctx.beginPath();
    ctx.moveTo(railX1, GROUND_Y + 53);
    ctx.lineTo(railX1, CANVAS_HEIGHT);
    ctx.moveTo(railX2, GROUND_Y + 53);
    ctx.lineTo(railX2, CANVAS_HEIGHT);
    ctx.stroke();

    // Ties
    ctx.strokeStyle = '#334a65';
    ctx.lineWidth = 3.5;
    for (let x = -floorOffset; x < CANVAS_WIDTH + 60; x += 47) {
      ctx.beginPath();
      ctx.moveTo(x + 120, GROUND_Y + 46);
      ctx.lineTo(x + 120, GROUND_Y + 104);
      ctx.stroke();
    }

    // Side walls detail lines
    ctx.strokeStyle = '#334b6c';
    ctx.lineWidth = 2.5;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(118, 70 + i * 65);
      ctx.lineTo(118, 110 + i * 65);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(CANVAS_WIDTH - 118, 70 + i * 65);
      ctx.lineTo(CANVAS_WIDTH - 118, 110 + i * 65);
      ctx.stroke();
    }

    // Lanes lines
    ctx.strokeStyle = '#4a5e82';
    ctx.lineWidth = 2;
    const laneCenterX = CANVAS_WIDTH / 2;
    for (let i = -1; i <= 1; i++) {
      const lx = laneCenterX + i * LANE_WIDTH;
      ctx.beginPath();
      ctx.moveTo(lx, GROUND_Y + 22);
      ctx.lineTo(lx, CANVAS_HEIGHT);
      ctx.stroke();
    }

    // Scrolling background details: graffiti + posters
    const bgScroll = (Date.now() / 100) * speed * 0.35 % 360;
    ctx.fillStyle = '#374a67';
    for (let i = 0; i < 6; i++) {
      const bx = ((bgScroll + i * 160) % (CANVAS_WIDTH - 240)) + 120;
      ctx.fillRect(bx, 66, 48, 24);
      ctx.fillRect(bx + 26, 82, 34, 16);
    }

    // === DRAW OBSTACLES ===
    for (const ob of obstaclesRef.current) {
      const ox = Math.floor(ob.x);
      const oy = Math.floor(ob.y);

      if (ob.type === 'train') {
        // Big subway train
        ctx.fillStyle = '#222';
        ctx.fillRect(ox, oy - 12, ob.width, ob.height);

        // Train body highlight
        ctx.fillStyle = '#3a3a3a';
        ctx.fillRect(ox + 5, oy - 5, ob.width - 12, 16);

        // Yellow stripe
        ctx.fillStyle = '#ffcc22';
        ctx.fillRect(ox + 3, oy + 18, ob.width - 4, 10);

        // Windows
        ctx.fillStyle = '#112244';
        ctx.fillRect(ox + 8, oy - 6, 14, 12);
        ctx.fillRect(ox + 26, oy - 6, 14, 12);
        ctx.fillRect(ox + 44, oy - 6, 14, 12);

        // Headlight
        ctx.fillStyle = '#ffdd33';
        ctx.fillRect(ox + 3, oy + 26, 8, 7);
        ctx.fillStyle = '#ffdd33';
        ctx.fillRect(ox + ob.width - 11, oy + 26, 8, 7);

        ctx.strokeStyle = '#111';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(ox, oy - 12, ob.width, ob.height);
      } else if (ob.type === 'barrier') {
        // Metal barrier
        ctx.fillStyle = '#4b5a6e';
        ctx.fillRect(ox, oy + 3, ob.width, ob.height - 3);

        // Stripe pattern
        ctx.fillStyle = '#ffcc22';
        ctx.fillRect(ox, oy + 16, ob.width, 9);

        ctx.strokeStyle = '#2c3748';
        ctx.lineWidth = 2;
        ctx.strokeRect(ox + 1, oy + 4, ob.width - 2, ob.height - 5);
        ctx.strokeRect(ox + 4, oy + 9, ob.width - 8, 22);
      } else {
        // Sign / post
        ctx.fillStyle = '#3c4c61';
        ctx.fillRect(ox + 7, oy, 18, ob.height - 6);

        ctx.fillStyle = '#ffcc22';
        ctx.fillRect(ox + 2, oy - 10, ob.width - 4, 16);

        ctx.fillStyle = '#222';
        ctx.fillRect(ox + 7, oy - 4, 18, 9);
      }
    }

    // === DRAW COINS ===
    for (const coin of coinsRef.current) {
      if (coin.collected) continue;

      const cx = Math.floor(coin.x);
      const cy = Math.floor(coin.y);

      const pulse = Math.sin(frameRef.current * 0.25 + cx) * 1.2 + 2;

      // Coin shadow
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(cx + 11, cy + 21, 9, 3.5, 0, 0, Math.PI * 2);
      ctx.fill();

      // Coin body
      ctx.fillStyle = '#ffcc22';
      ctx.beginPath();
      ctx.arc(cx + 11, cy + 11, 10 + pulse * 0.1, 0, Math.PI * 2);
      ctx.fill();

      // Inner gold
      ctx.fillStyle = '#ffdd66';
      ctx.beginPath();
      ctx.arc(cx + 11, cy + 10, 7, 0, Math.PI * 2);
      ctx.fill();

      // Coin detail (S)
      ctx.strokeStyle = '#bb8800';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(cx + 11, cy + 11, 4, 0.7, 3.4);
      ctx.stroke();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#ddaa33';
    }

    // === DRAW PLAYER ===
    const px = Math.floor(player.x);
    let py = Math.floor(player.y);

    const isSliding = player.isSliding;
    const isJumping = player.isJumping;

    // Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.beginPath();
    ctx.ellipse(px + 16, GROUND_Y + 44, isSliding ? 25 : 16, isSliding ? 6 : 7, 0, 0, Math.PI * 2);
    ctx.fill();

    // Body
    if (isSliding) {
      // Sliding pose
      ctx.fillStyle = '#2f5bd4';
      ctx.fillRect(px + 4, py + 18, 40, 18);

      // Head
      ctx.fillStyle = '#f4d2a8';
      ctx.beginPath();
      ctx.arc(px + 12, py + 21, 8, 0, Math.PI * 2);
      ctx.fill();

      // Hair
      ctx.fillStyle = '#222';
      ctx.fillRect(px + 6, py + 13, 18, 8);

      // Legs sliding
      ctx.fillStyle = '#1e3f8b';
      ctx.fillRect(px + 6, py + 34, 36, 8);

      // Arms
      ctx.fillStyle = '#f4d2a8';
      ctx.fillRect(px + 38, py + 23, 12, 7);
    } else {
      // Normal running pose
      const bob = isJumping ? 0 : Math.sin(frameRef.current * 0.35) * 2.5;

      // Legs
      ctx.fillStyle = '#1e3f8b';
      ctx.fillRect(px + 9, py + 32 + bob * 0.6, 7, 17);
      ctx.fillRect(px + 22, py + 32 - bob * 0.6, 7, 17);

      // Shoes
      ctx.fillStyle = '#222';
      ctx.fillRect(px + 7, py + 46 + bob * 0.6, 10, 6);
      ctx.fillRect(px + 20, py + 46 - bob * 0.6, 10, 6);

      // Body
      ctx.fillStyle = '#2f5bd4';
      ctx.fillRect(px + 6, py + 16, 26, 21);

      // Hoodie detail
      ctx.fillStyle = '#253f9e';
      ctx.fillRect(px + 9, py + 19, 20, 6);

      // Arms
      ctx.fillStyle = '#f4d2a8';
      ctx.fillRect(px + 4, py + 19 + bob * 0.5, 6, 14);
      ctx.fillRect(px + 26, py + 19 - bob * 0.5, 6, 14);

      // Head
      ctx.fillStyle = '#f4d2a8';
      ctx.beginPath();
      ctx.arc(px + 19, py + 14, 9, 0, Math.PI * 2);
      ctx.fill();

      // Hair / hat
      ctx.fillStyle = '#222';
      ctx.beginPath();
      ctx.arc(px + 19, py + 11, 8, Math.PI, Math.PI * 2);
      ctx.fill();

      // Eyes
      ctx.fillStyle = '#222';
      ctx.fillRect(px + 14, py + 12, 3, 3);
      ctx.fillRect(px + 21, py + 12, 3, 3);

      // Smile
      ctx.strokeStyle = '#222';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(px + 19, py + 17, 3, 0.3, 2.8);
      ctx.stroke();
    }

    // Backpack
    ctx.fillStyle = '#ffcc22';
    ctx.fillRect(px + 26, py + 18, 9, 17);
    ctx.fillStyle = '#bb9900';
    ctx.fillRect(px + 28, py + 19, 5, 9);

    // === PARTICLES ===
    for (const p of particlesRef.current) {
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0.2, p.life / 26);
      ctx.fillRect(Math.floor(p.x), Math.floor(p.y), p.size, p.size);
    }
    ctx.globalAlpha = 1;

    // === SPEED LINES (when fast) ===
    if (speed > 5.5) {
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 4; i++) {
        const lx = 210 + (i * 130) + ((frameRef.current * speed * 0.8) % 110);
        ctx.beginPath();
        ctx.moveTo(lx, 190);
        ctx.lineTo(lx - 32, 220);
        ctx.stroke();
      }
    }

    ctx.restore();

    // === UI OVERLAY (drawn on canvas for better integration) ===
    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.fillRect(18, 16, 130, 34);
    ctx.strokeStyle = '#ffcc22';
    ctx.lineWidth = 3;
    ctx.strokeRect(18, 16, 130, 34);

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px "Press Start 2P", monospace';
    ctx.fillText('SCORE', 28, 30);
    ctx.fillStyle = '#ffcc22';
    ctx.fillText(state.score.toString().padStart(6, '0'), 28, 44);

    // Coins UI
    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.fillRect(CANVAS_WIDTH - 146, 16, 128, 34);
    ctx.strokeStyle = '#ffcc22';
    ctx.strokeRect(CANVAS_WIDTH - 146, 16, 128, 34);

    ctx.fillStyle = '#ffdd55';
    ctx.fillText('COINS', CANVAS_WIDTH - 136, 30);
    ctx.fillStyle = '#fff';
    ctx.fillText(state.coins.toString().padStart(3, '0'), CANVAS_WIDTH - 136, 44);

    // Distance meter
    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.fillRect(CANVAS_WIDTH / 2 - 82, 16, 164, 24);
    ctx.strokeStyle = '#667fa1';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(CANVAS_WIDTH / 2 - 82, 16, 164, 24);
    ctx.fillStyle = '#aab';
    ctx.font = '10px "Press Start 2P"';
    ctx.fillText('DISTANCE ' + state.distance.toString().padStart(5, '0') + 'm', CANVAS_WIDTH / 2 - 76, 32);

    // Pause status
    if (state.isPaused) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.fillStyle = '#ffcc22';
      ctx.font = 'bold 32px "Press Start 2P"';
      ctx.fillText('PAUSED', CANVAS_WIDTH / 2 - 70, CANVAS_HEIGHT / 2 - 18);
      ctx.font = '13px "Press Start 2P"';
      ctx.fillStyle = '#fff';
      ctx.fillText('PRESS P OR TAP TO CONTINUE', CANVAS_WIDTH / 2 - 148, CANVAS_HEIGHT / 2 + 26);
    }
  };

  const handleGameOver = () => {
    const state = gameStateRef.current;
    const finalScore = state.score;

    saveHighScore(finalScore);

    gameStateRef.current = {
      ...state,
      isRunning: false,
      isGameOver: true,
      isPaused: false,
    };

    setGameState(prev => ({
      ...prev,
      isRunning: false,
      isGameOver: true,
      isPaused: false,
    }));

    playSound('crash');

    // Extra particles on death
    const player = playerRef.current;
    createParticles(player.x + 14, player.y + 18, 18, '#ff6666');
    createParticles(player.x + 24, player.y + 30, 12, '#ffaa66');

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    // Final draw
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) draw(ctx);
    }
  };

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keysRef.current.add(e.key.toLowerCase());

      if (['ArrowLeft', 'a', 'A'].includes(e.key)) {
        handleInput('left');
        e.preventDefault();
      }
      if (['ArrowRight', 'd', 'D'].includes(e.key)) {
        handleInput('right');
        e.preventDefault();
      }
      if (['ArrowUp', 'w', 'W', ' '].includes(e.key)) {
        handleInput('jump');
        e.preventDefault();
      }
      if (['ArrowDown', 's', 'S'].includes(e.key)) {
        handleInput('slide');
        e.preventDefault();
      }
      if (e.key.toLowerCase() === 'p') {
        handleInput('pause');
        e.preventDefault();
      }
      if (e.key.toLowerCase() === 'r' && gameStateRef.current.isGameOver) {
        handleInput('restart');
      }
      if ((e.key === 'Enter' || e.key === ' ') && (gameStateRef.current.showStart || gameStateRef.current.isGameOver)) {
        handleInput('start');
        e.preventDefault();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.key.toLowerCase());
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Touch / Swipe controls
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let touchStartX = 0;
    let touchStartY = 0;

    const handleTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      touchStartX = e.touches[0].clientX - rect.left;
      touchStartY = e.touches[0].clientY - rect.top;

      if (gameStateRef.current.showStart || gameStateRef.current.isGameOver) {
        handleInput('start');
      } else if (gameStateRef.current.isPaused) {
        handleInput('pause');
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
    };

    const handleTouchEnd = (e: TouchEvent) => {
      e.preventDefault();
      if (gameStateRef.current.showStart || gameStateRef.current.isGameOver || gameStateRef.current.isPaused) return;

      const rect = canvas.getBoundingClientRect();
      const endX = e.changedTouches[0].clientX - rect.left;
      const endY = e.changedTouches[0].clientY - rect.top;

      const dx = endX - touchStartX;
      const dy = endY - touchStartY;

      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      if (absDx > 48 && absDx > absDy * 1.15) {
        if (dx > 0) handleInput('right');
        else handleInput('left');
      } else if (absDy > 45 && absDy > absDx * 1.1) {
        if (dy < 0) handleInput('jump');
        else handleInput('slide');
      } else if (absDx < 28 && absDy < 28) {
        // Tap: jump
        handleInput('jump');
      }
    };

    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd, { passive: false });

    return () => {
      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('touchmove', handleTouchMove);
      canvas.removeEventListener('touchend', handleTouchEnd);
    };
  }, []);

  // Start the game loop on mount
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.width = CANVAS_WIDTH;
      canvas.height = CANVAS_HEIGHT;
    }

    // Initial draw
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const initialDraw = () => {
          draw(ctx);
        };
        initialDraw();
      }
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  const handleStart = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    resetGame();
    lastTimeRef.current = performance.now();
    gameLoop();
  };

  const handleRestart = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    resetGame();
    lastTimeRef.current = performance.now();
    gameLoop();
  };

  const handlePause = () => {
    handleInput('pause');
  };

  return (
    <div className="game-container">
      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        style={{
          width: '100%',
          maxWidth: `${CANVAS_WIDTH}px`,
          height: 'auto',
          background: '#111',
          display: 'block',
        }}
      />

      {/* Start Screen */}
      {gameState.showStart && (
        <div className="start-screen">
          <h1>SUBWAY<br />SURFERS</h1>
          <div className="subtitle">REACT EDITION • 100% ACCURATE</div>

          <div className="instructions">
            <p>SWIPE or ARROW KEYS</p>
            <p>← → : Change Lanes</p>
            <p>↑ : Jump  •  ↓ : Slide</p>
            <p>P : Pause</p>
            <p style={{ marginTop: '14px', color: '#ffcc22' }}>Collect coins • Dodge trains!</p>
          </div>

          <button className="btn" onClick={handleStart} style={{ fontSize: '16px', padding: '14px 52px' }}>
            START RUNNING
          </button>
          <div style={{ marginTop: '18px', fontSize: '11px', color: '#777' }}>
            Best: {gameState.highScore.toString().padStart(6, '0')}
          </div>
        </div>
      )}

      {/* Game Over Screen */}
      {gameState.isGameOver && (
        <div className="game-over-screen">
          <h1>GAME OVER</h1>
          <div className="final-score">SCORE: {gameState.score.toString().padStart(6, '0')}</div>
          <div style={{ fontSize: '14px', marginBottom: '12px', color: '#ffdd66' }}>
            COINS: {gameState.coins} &nbsp; DISTANCE: {gameState.distance}m
          </div>
          <div className="high-score">
            HIGH SCORE: {gameState.highScore.toString().padStart(6, '0')}
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button className="btn" onClick={handleRestart}>
              PLAY AGAIN
            </button>
            <button className="btn secondary" onClick={handleStart}>
              MENU
            </button>
          </div>
        </div>
      )}

      {/* Pause Button */}
      {gameState.isRunning && !gameState.isPaused && (
        <button className="pause-btn" onClick={handlePause}>
          PAUSE
        </button>
      )}

      {/* Mobile Controls */}
      {gameState.isRunning && !gameState.isPaused && !gameState.isGameOver && (
        <div className="mobile-controls">
          <div className="control-btn" onClick={() => handleInput('left')} style={{ fontSize: '26px' }}>←</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
            <div className="control-btn" onClick={() => handleInput('jump')} style={{ fontSize: '21px' }}>↑</div>
            <div className="control-btn" onClick={() => handleInput('slide')} style={{ fontSize: '21px' }}>↓</div>
          </div>
          <div className="control-btn" onClick={() => handleInput('right')} style={{ fontSize: '26px' }}>→</div>
        </div>
      )}
    </div>
  );
};

export default SubwaySurfers;
