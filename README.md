# Miladymaxxer

*elevate milady. diminish the rest.*

![hero](assets/hero.png)

## What It Does

On-device avatar detection for X/Twitter. A bundled ONNX classifier scans avatars as you scroll and applies visual effects:

- **Milady mode** — Gold card effects with depth shadows, hover float animation, sound feedback
- **Sound toggle** — Optional audio feedback: detection chimes, hover sounds, DM pips
- **Off** — Disable all effects

## Features

- **Gold/silver cards** — Milady posts get gold-tinted floating cards; 0-like posts get silver to encourage engagement. Liking a post smoothly animates to richer gold.
- **Dark mode optimized** — Warm gold and cool silver tinting with soft depth shadows (not neon glow). Liked posts visibly richer than base.
- **Hover float** — Milady cards subtly lift and scale on hover
- **Gold Follow buttons** — Shimmery gold "Follow back" for miladys who follow you, silver for those who don't
- **Pink hearts** — Faded pink like button on milady posts to encourage engagement
- **DM sounds** — Send thup, incoming message pip, conversation hover sounds
- **User cell detection** — Works in "Who to follow" sections too
- **Badge counter** — Shows milady posts liked this session
- **Privacy-first** — Everything runs locally, no server calls, no telemetry

The popup (styled with miladymaker.net's green palette) tracks session stats, keeps a list of detected accounts you can exempt individually, and collects avatar data you can export for offline labeling.

## Screenshots

| Timeline | Follow Button |
|----------|---------------|
| ![Timeline](assets/screenshot-timeline-1.png) | ![Follow Button](assets/screenshot-follow-button.png) |

## Install

There is no Chrome Web Store release. Install from GitHub Releases instead:

1. Download the latest `miladymaxxer-vX.Y.Z-unpacked.zip` from Releases.
2. Unzip it somewhere permanent on disk.
3. Open `chrome://extensions`.
4. Enable `Developer mode`.
5. Click `Load unpacked`.
6. Select the unzipped folder.

## Development

See `DEVELOPMENT.md` for debugging and training workflow commands.

```bash
pnpm install      # Install dependencies
pnpm run build    # Build extension
pnpm run dev      # Watch mode
pnpm test         # Run tests
```

## Architecture

The content script is split into focused modules:

- `content.ts` — Orchestrator: scroll observer, avatar detection loop, stat tracking
- `styles.ts` — All injected CSS (gold/silver cards, dark mode, hover, transitions)
- `sounds.ts` — Web Audio API sound system (detection chimes, DM sounds, hover pips)
- `detection.ts` — ONNX model inference and avatar classification
- `effects.ts` — DOM manipulation (applying milady/diminish effects, fade-ins)
- `selectors.ts` — Centralized DOM selector constants

## Notes

- Runtime model artifacts live in `public/models/` and `public/generated/`.
- Training data lives under ignored `cache/`.
- The extension runtime is ONNX-only.
