# Catch Mechanic — Tasks

## Phase 1: Data Model & Storage

Core data changes. No UI or feedback yet — just the state tracking.

- [ ] Add `caught: boolean`, `caughtAt: string | null`, and `verificationStatus: "unverified" | "verified" | "unknown"` to `MatchedAccount` in `src/shared/types.ts`
- [ ] Add level utility functions in a new `src/shared/levels.ts`: `getLevel(postsMatched)`, `getLevelProgress(postsMatched)`
- [ ] Update `normalizeMatchedAccounts()` in `src/shared/storage.ts` to handle migration (default `caught: false, caughtAt: null, verificationStatus: "unverified"` for existing records)
- [ ] Add unit tests for migration: existing accounts get defaults, new accounts preserve caught state
- [ ] Add unit tests for level math: boundary cases (0, 1, 4, 9, 100), progress calculation

## Phase 2: Catch Detection

Wire up the catch trigger and handle passing.

- [ ] Set `tweet.dataset.miladymaxxerHandle` in `content.ts:processTweet()` when author is found
- [ ] Add `onCatch: (handle: string) => void` and `onLevelUp: (handle: string, newLevel: number) => void` callbacks to `EffectsContext` in `src/effects.ts`
- [ ] In `applyMode()`, when `hasUserLiked()` is true on a milady post: read handle from dataset, call `onCatch` if account not already caught
- [ ] Implement `markAccountCaught(handle)` in `src/content.ts`: sets `caught: true, caughtAt: now`, triggers storage write
- [ ] Implement level-up detection: in `content.ts` when incrementing `postsMatched` for a caught account, compare level before/after, call `onLevelUp` callback if crossed
- [ ] Wire `onCatch` and `onLevelUp` in `effectsCtx()` in content.ts
- [ ] Add unit tests: catch sets flag and timestamp, catching already-caught is no-op, level-up triggers at correct thresholds

## Phase 3: Catch Feedback

Sound and visual response.

- [ ] Add `playCatchSound()` to `src/sounds.ts` — bright, satisfying single tone
- [ ] Add `playLevelUpSound()` to `src/sounds.ts` — ascending arpeggio, slightly longer
- [ ] Call `playCatchSound()` from `onCatch` flow (if soundEnabled)
- [ ] Call `playLevelUpSound()` from `onLevelUp` flow (if soundEnabled)
- [ ] Add CSS keyframe animation for catch pulse in `src/styles.ts` — brief gold border flash, ~500ms
- [ ] Add CSS keyframe animation for level-up pulse in `src/styles.ts` — variant of catch animation
- [ ] Apply animation class to tweet on catch/level-up, remove after animation ends
- [ ] Guard animations with dataset attribute so re-scans don't re-trigger

## Phase 4: Popup Collection UI

Display caught accounts, levels, and XP bars.

- [ ] Add caught/seen/rate to the Stats tab: "42 caught / 127 seen (33%)"
- [ ] Update Accounts tab to show per-account: level badge ("Lv. 3"), small XP progress bar
- [ ] Show `caughtAt` date on caught accounts
- [ ] Add sort toggle: by XP (default) / by most recent catch
- [ ] Style uncaught (seen-only) accounts as dimmed/desaturated below caught accounts
- [ ] XP bar: thin inline bar showing `current / needed` progress to next level
- [ ] Add hover tooltip per account row: catch date, detection score, seen count, liked count, like rate %
- [ ] Verify storage change listener picks up catch state and postsMatched updates in real-time

## Phase 5: Polish

- [ ] Decide badge behavior: keep session like count, switch to caught count, or show both
- [ ] Test edge cases: caught + whitelisted, level-up on re-scan, rapid consecutive likes
- [ ] Verify no performance regression on rapid scrolling
- [ ] Update CHANGELOG.md

## Future (blocked on remiliaNET API)

- [ ] Add verification lookup at catch time or background sweep
- [ ] Show verified badge in collection view
- [ ] Enhanced styling for verified catches

## Notes

- **Level is never stored** — computed as `floor(sqrt(postsMatched))` on render. No migration needed for leveling.
- **postsMatched already increments** on every detected milady post in `recordMatchedAccount()`. For the catch mechanic, we only want to increment when the user *likes* the post. This is a behavior change — currently postsMatched counts detections, not likes. Options:
  - (a) Rename existing `postsMatched` to `postsSeen` and add a new `postsLiked` field for XP
  - (b) Repurpose `postsMatched` to mean likes (breaking change for existing data)
  - (c) Add `postsLiked` alongside `postsMatched`, use `postsLiked` for XP
  - **Recommended: option (c)** — add `postsLiked: number` field, use it for level calculation. `postsMatched` keeps its current meaning (posts detected). This preserves existing data and keeps both metrics useful.
- **Handle passing**: `tweet.dataset.miladymaxxerHandle` set in processTweet, read in applyMode. Follows existing dataset attribute pattern.
- **Level-up detection**: compare `getLevel(postsLiked)` before and after incrementing. If different, fire onLevelUp.
- **Catch guard**: check `matchedAccounts[handle].caught` directly — no need for a WeakSet since the state is persistent.

## Status

- [ ] Phase 1: Not started
- [ ] Phase 2: Not started
- [ ] Phase 3: Not started
- [ ] Phase 4: Not started
- [ ] Phase 5: Not started
