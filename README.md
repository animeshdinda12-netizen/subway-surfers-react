# Subway Surfers • True 3D React Clone

**Live Demo:** https://animeshdinda12-netizen.github.io/subway-surfers-react/

A faithful recreation of Subway Surfers built as a **true 3D game** using:
- React + TypeScript + Vite
- Three.js + @react-three/fiber + @react-three/drei

## Features (matching original)
- 3-lane switching (← → / A D)
- Accurate jump + slide physics
- Infinite procedural track + tunnel
- Coins, obstacles (trains, barriers, barrels, arches)
- Power-ups: Jetpack, Speed Boost, Mystery Box
- Police dog + Inspector chase
- Moving trains
- Ramps with real physics + boost
- Full particle system + streak / multiplier
- Complete Web Audio system (jump, coin, crash, jetpack, ramp, etc.)
- Grayscale mode (G key)
- High score persistence (localStorage)
- Mobile touch controls + full keyboard support

## Controls
- **Arrows / WASD**: Move lanes
- **Space / ↑**: Jump
- **↓ / S**: Slide
- **P**: Pause
- **G**: Toggle grayscale
- **Enter / Space**: Restart

## Development
```bash
npm install
npm run dev
```

## Deploy
- Uses GitHub Actions + GitHub Pages
- Workflow: `.github/workflows/deploy.yml`
- Built with `npm run build`

## References
Inspired by accurate implementations from:
- DanielLin0516/SUBWAY-SURFERS
- KSVSC/Subway-Surfers
- swetanjal/WebGL-Subway-Surfer

Built iteratively for maximum accuracy to the original Subway Surfers experience.
