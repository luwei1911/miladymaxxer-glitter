# Upstream Sync Guide

This project is a fork of [banteg/milady-shrinkifier](https://github.com/banteg/milady-shrinkifier).

We take **detection model updates** (trained classifiers, training pipeline) from upstream. We do **not** take UX changes — upstream shrinks/hides miladys, we elevate them.

## Quick Reference

```
git remote: upstream → https://github.com/banteg/milady-shrinkifier.git
fork point:  4e2a72ea
last synced: 2026-03-28 (upstream v0.4.0, run 20260328T144735Z)
```

## What We Take From Upstream

- `public/models/milady-mobilenetv3-small.onnx` — the ONNX model binary
- `public/generated/milady-mobilenetv3-small.meta.json` — threshold + metadata
- `milady/` — the full Python training/labeling/export pipeline
- `pyproject.toml` / `uv.lock` — Python dependency changes for the pipeline

## What We Never Take

- `src/content.ts` — upstream is monolithic; ours is split (see mapping below)
- Filter modes — upstream uses `"off" | "hide" | "fade" | "debug"`; ours uses `"off" | "milady" | "debug"`
- UX behavior — upstream shrinks/fades miladys; we add gold cards, sounds, engagement nudges
- Dataset attribute prefix — upstream uses `data-miladyShrinkifier*`; ours uses `data-miladymaxxer*`
- Default mode — upstream defaults to `"off"`; ours defaults to `"milady"`

## Architecture Mapping

Our fork split upstream's monolithic `content.ts` into focused modules:

| Upstream (single file)          | Our file              | Purpose                              |
|---------------------------------|-----------------------|--------------------------------------|
| `content.ts` detection logic    | `detection.ts`        | ONNX inference, cache, model loading |
| `content.ts` DOM effects        | `effects.ts`          | Tiered cards, badges, visual state   |
| `content.ts` CSS                | `styles.ts`           | Injected stylesheet                  |
| `content.ts` selectors          | `selectors.ts`        | Centralized DOM query constants      |
| (not in upstream)               | `sounds.ts`           | Web Audio polyphonic sound system    |
| (not in upstream)               | `background.ts`       | Service worker for badge updates     |
| `content.ts` orchestration      | `content.ts`          | Scan loop, storage, DOM traversal    |

### Shared modules

| Upstream                        | Ours                          | Notes                                  |
|---------------------------------|-------------------------------|----------------------------------------|
| `shared/browser-image.ts`       | `shared/browser-image.ts`     | Ours removed legacy 32x32 path         |
| `shared/node-image.ts`          | `shared/node-image.ts`        | Ours removed legacy 32x32 path         |
| `shared/constants.ts`           | `shared/constants.ts`         | Ours adds sound, matched account defaults |
| `shared/types.ts`               | `shared/types.ts`             | Ours adds sound, matched accounts, collected avatars |
| `shared/storage.ts`             | `shared/storage.ts`           | Ours extends with sound + data export  |
| `shared/runtime-image-types.ts` | `shared/runtime-image-types.ts` | Identical after legacy removal       |
| `shared/image-core.ts`          | `shared/image-core.ts`        | Identical                              |
| (not in upstream)               | `shared/lru-cache.ts`         | Detection result caching               |
| (not in upstream)               | `shared/parse-count.ts`       | Engagement count parsing               |

### Training pipeline

| Upstream                   | Ours                              | Notes                              |
|----------------------------|-----------------------------------|------------------------------------|
| `milady/` package          | `milady/` package                 | Taken directly from upstream       |
| `milady/cli.py`            | `milady/cli.py`                   | CLI entry point                    |
| `milady/train_classifier.py` | `milady/train_classifier.py`    | Full training pipeline             |
| `milady/mobilenet_common.py` | `milady/mobilenet_common.py`    | Image preprocessing, augmentation  |
| `milady/pipeline_common.py`  | `milady/pipeline_common.py`     | DB schema, paths, fingerprinting   |
| `scripts/` (legacy stubs)   | `scripts/` (legacy stubs)       | Thin wrappers calling `milady.*`   |

## Pulling a New Model

When upstream trains a new classifier:

```bash
# 1. Fetch upstream
git fetch upstream

# 2. Check what changed
git log ..upstream/master --oneline

# 3. Bring in model files (always safe — no code conflicts)
git checkout upstream/master -- public/models/milady-mobilenetv3-small.onnx
git checkout upstream/master -- public/generated/milady-mobilenetv3-small.meta.json

# 4. If training pipeline changed, bring that in too
git checkout upstream/master -- milady/
git checkout upstream/master -- pyproject.toml uv.lock

# 5. Rebuild
pnpm run build

# 6. Test
pnpm test
```

The model binary and metadata are self-contained — updating them requires zero code changes in our extension. The threshold is read at runtime from the metadata JSON.

## Pulling Training Pipeline Updates

The `milady/` package is taken wholesale from upstream. Our `scripts/` directory contains thin wrappers that delegate to the package. To update:

```bash
git checkout upstream/master -- milady/ pyproject.toml uv.lock
uv sync
```

No conflicts expected — we don't modify the `milady/` package.

## Things That Could Conflict

If upstream changes these files, manual review is needed:

| File | Risk | Why |
|------|------|-----|
| `src/worker.ts` | Low | We both use the same ONNX inference path now |
| `src/shared/browser-image.ts` | Low | Both use classifier-only path; crop logic is shared |
| `src/shared/constants.ts` | Medium | We add extra constants (sound, defaults) |
| `src/shared/types.ts` | Medium | We add extra types (sound, matched accounts) |
| `src/content.ts` | High | Completely different — never merge directly |

## Key Differences to Preserve

1. **Default mode**: `"milady"` not `"off"` — we want detection on by default
2. **Sound system**: Entirely our addition, no upstream equivalent
3. **Tiered cards**: Silver/Gold/Diamond visual system — our core UX
4. **Badge counter**: Gold extension badge tracking liked milady posts
5. **Data collection**: Avatar export for offline labeling — more comprehensive than upstream
6. **LRU cache**: Our detection cache with eviction (upstream uses unbounded Map)
