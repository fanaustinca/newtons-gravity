# Newton's Gravity

A 3D web game built with Angular 17 and Three.js. Play as Isaac Newton under an apple tree — collect falling apples to increase your IQ while dodging deadly anvils. Spend your IQ on upgrades between waves.

## Tech Stack

| Layer | Tech |
|---|---|
| Framework | Angular 17 (standalone components, signals) |
| 3D Engine | Three.js r163 |
| Mobile | Capacitor 5 (Android + iOS) |
| Cloud | Docker → Cloud Run (nginx on port 8080) |

## Gameplay

- **Move**: Arrow keys / WASD (desktop) or touch left/right side of screen (mobile)
- **Apples** 🍎 — walk into them to gain IQ
- **Anvils** ⚒️ — dodge them; getting hit reduces health (kills at 0)
- **Waves** — each wave lasts 35 seconds, then an upgrade screen appears
- Objects fall faster and more frequently each wave

### Upgrades

| Upgrade | Effect | Max Level |
|---|---|---|
| Cognitive Enhancement 🧠 | +50% IQ per apple | 4 |
| Fortitude ❤️ | +1 max health | 3 |
| Agility 👟 | +25% move speed | 3 |
| Gravity Affinity 🧲 | Apples attracted toward Newton | 2 |

## Development

```bash
npm install
npm start          # dev server at http://localhost:4200
npm run build:prod # production build → dist/newton-game/browser/
```

## Docker / Cloud Run

```bash
# Build image
docker build -t newton-game .

# Run locally
docker run -p 8080:8080 newton-game

# Deploy to Cloud Run
gcloud builds submit --tag gcr.io/PROJECT_ID/newton-game
gcloud run deploy newton-game \
  --image gcr.io/PROJECT_ID/newton-game \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --port 8080
```

## Mobile (Capacitor)

```bash
# 1. Build the web app first
npm run build:prod

# 2. Add platforms (first time only)
npm run cap:add:android
npm run cap:add:ios

# 3. Sync web assets into native projects
npm run cap:sync

# 4. Open in Android Studio / Xcode
npm run cap:open:android
npm run cap:open:ios
```

### Android requirements
- Android Studio with Android SDK
- Java 17+

### iOS requirements
- macOS with Xcode 14+
- CocoaPods (`sudo gem install cocoapods`)

## Project Structure

```
src/
  app/
    game/
      engine.service.ts       # Three.js scene, game loop, collision detection
      game-state.service.ts   # Game state (signals), upgrade logic
      game.component.ts       # Canvas host, keyboard/touch input routing
    ui/
      hud/          # In-game HUD (IQ, health, wave)
      menu/         # Start screen
      upgrade/      # Between-wave upgrade shop
      game-over/    # Death screen with stats
  styles.scss
  main.ts
Dockerfile
nginx.conf
capacitor.config.ts
```
