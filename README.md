# Milady Shrinkifier

Browser extension that detects Milady and Milady-derivative avatars on X/Twitter and lets you control how those posts render in your feed.

## What It Does

The extension scans author avatars locally with a bundled ONNX classifier. When a match is found, you choose what happens:

- `Hide` collapses matched posts behind a click-to-reveal row.
- `Fade` renders matched posts at 50% opacity.
- `Debug` shows visual markers and detector score badges.
- `Off` does nothing.

Everything runs locally. No server calls, no telemetry, no data leaves your browser unless you explicitly export collected avatar data yourself.

## Other Features

- `Stats` shows live session counts for seen posts, matched posts, match rate, exemptions, errors, and last match time.
- `Accounts` keeps a running list of caught handles, grouped into `Exempt` and `Caught`.
- `Data` collects normalized avatar URLs and metadata for offline dataset building.
- The `Export` action dumps collected avatars as JSON for labeling and model improvement.

## Install

There is no Chrome Web Store release yet.

To run it locally:

1. Install JavaScript dependencies:
   ```bash
   pnpm install
   ```
2. Install Python dependencies for the classifier and labeling pipeline:
   ```bash
   uv sync
   ```
3. Build the extension:
   ```bash
   pnpm run build
   ```
4. Load `dist/` as an unpacked extension in Chrome.

## Why

Some people find that a significant percentage of their timeline consists of accounts using aesthetically identical anime avatars posting aesthetically identical content. This extension addresses that.

## Privacy

All detection happens on-device using a bundled ONNX model. No images are uploaded anywhere. Collected data is stored in local browser storage and is never transmitted unless you explicitly export it.

## Local Development

Useful commands:

```bash
pnpm run build
pnpm run typecheck
pnpm run test
pnpm run check:pfp -- <avatar-url>
```

For live browser debugging with a persistent local Chrome profile:

```bash
pnpm run debug:chrome:launch-local-profile
pnpm run debug:chrome:attach
```

## Data and Training Workflow

The extension can export collected avatars as JSON manifests. The training pipeline ingests those exports into a local SQLite catalog and keeps all derived state under the ignored `cache/` tree.

Typical loop:

1. Ingest one or more exports:
   ```bash
   pnpm run ingest:avatars -- cache/milady-shrinkifier-avatars-<timestamp>.json
   ```
2. Download new avatar images:
   ```bash
   pnpm run download:avatars
   ```
3. Retry any failed downloads if needed:
   ```bash
   pnpm run download:avatars -- --retry-failed
   ```
4. Auto-label known positives from the current heuristic:
   ```bash
   pnpm run label:heuristic
   ```
5. Review and label avatars:
   ```bash
   pnpm run review:avatars
   ```
6. Materialize the train/val/test dataset:
   ```bash
   pnpm run build:dataset
   ```
7. Train a MobileNetV3-Small classifier:
   ```bash
   pnpm run train:classifier
   ```
8. Score the catalog for hard-negative mining:
   ```bash
   pnpm run score:classifier -- --run-id <run-id>
   ```
9. Export the trained classifier into the extension runtime:
   ```bash
   pnpm run export:classifier -- --run-id <run-id>
   pnpm run build
   ```

## Notes

- Runtime model artifacts live in `public/models/` and `public/generated/`.
- Training runs, labels, downloaded avatars, and dataset manifests live under ignored `cache/`.
- The review app supports both individual labeling and 9-up batch labeling.
- The extension runtime is ONNX-only; older hash-generation scripts remain only for offline data work.
