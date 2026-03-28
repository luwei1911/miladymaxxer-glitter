# Catch Mechanic — Spec

## Overview

A collection system where liking a milady post "catches" that milady account. Users build a persistent collection over time, turning passive scrolling into active engagement. Each caught milady has a level that grows with continued engagement — the more you like their posts, the higher the level.

## Problem

The extension detects miladys and highlights them, but the interaction is passive. Users see gold cards, maybe like a post, then scroll on. There's no persistent feedback loop — no reason to seek out miladys, no sense of progress, no reward for engagement beyond the momentary visual.

## Target Users

- Existing miladymaxxer users who already scroll Twitter with the extension active
- Collectors / completionists who enjoy tracking progress
- Community members who want to signal engagement with the milady ecosystem

## Core Features

### 1. Catch on Like

When a user likes a milady-detected post, that account is marked as "caught" in their collection.

- A milady account is caught the first time the user likes any of their posts
- Catching is permanent — unliking a single post doesn't uncatch the account
- The catch timestamp is recorded
- Re-liking a different post from an already-caught account does not re-catch, but does add XP

### 2. Leveling

Each caught milady has a level based on total likes (postsMatched).

- **Formula**: `level = floor(sqrt(totalLikes))`
- **XP to next level**: `nextLevelThreshold = (level + 1)^2`, progress = `totalLikes - level^2`
- **No level cap** — keeps scaling polynomially
- **Progression examples**:

| Level | Total likes needed | Likes for this level |
|-------|-------------------|---------------------|
| 1 | 1 | 1 |
| 2 | 4 | 3 |
| 3 | 9 | 5 |
| 4 | 16 | 7 |
| 5 | 25 | 9 |
| 10 | 100 | 19 |

- Level-up triggers feedback (sound + visual) distinct from the initial catch

### 3. Collection Stats

Persistent counters visible in the popup:

- **Caught**: unique milady accounts the user has liked a post from
- **Seen**: unique milady accounts detected (whether liked or not)
- **Catch rate**: caught / seen as a percentage

### 4. Collection View

The popup Accounts tab shows the user's collection:

- List of caught milady accounts with: handle, display name, level, XP bar to next level
- Default sort: by XP (total likes), highest first
- Alternate sort: by most recent catch date
- Uncaught (seen-only) milady accounts shown below, dimmed
- XP bar is a small inline progress indicator showing progress to next level
- Hover tooltip on each account: catch date, detection score, times seen, times liked, like rate %

### 5. Catch Feedback

When a catch happens (first like on an uncaught milady account):

- Unique catch sound (distinct from existing detection chime)
- Visual pulse on the tweet card (brief gold flash animation)

When a level-up happens (like crosses a level threshold):

- Level-up sound (distinct from catch sound, ascending tone)
- Brief visual indicator on the tweet

### 6. Future: Verification (remiliaNET)

Prepared in the data model but not implemented until remiliaNET API is available.

- `verificationStatus` field on MatchedAccount: `"unverified" | "verified" | "unknown"`
- When API exists: lookup at catch time or background sweep
- Collection view will distinguish verified vs unverified catches

## Technical Requirements

### Data Model

Extend `MatchedAccount` with:

```typescript
interface MatchedAccount {
  // ... existing fields (handle, displayName, postsMatched, lastMatchedAt, lastDetectionScore)
  caught: boolean;
  caughtAt: string | null;
  verificationStatus: "unverified" | "verified" | "unknown";
}
```

Level and XP are computed from `postsMatched` — no new stored fields needed for leveling.

### Detection

- Like detection already exists via `hasUserLiked()` in effects.ts
- Need to bridge: when a like is detected on a milady post, look up the author handle, mark as caught (if new), and increment postsMatched (for XP)
- Level-up detection: compare level before and after incrementing postsMatched

### Storage

- Uses existing `chrome.storage.local` matchedAccounts store
- No new storage keys — just new fields on existing records
- Migration: existing accounts get `caught: false, caughtAt: null, verificationStatus: "unverified"`

### Performance

- Catch/level detection piggybacks on existing `applyMode()` scan cycle — no additional DOM traversal
- Level computation is `Math.floor(Math.sqrt(n))` — trivial
- Storage writes are already debounced at 250ms

## Non-Goals

- Server-side sync (separate feature, later)
- Leaderboards or social features (depends on sync)
- Catching from notifications or DMs (only timeline likes for v1)
- Named level tiers (just numbered levels for now)
- remiliaNET verification (data model ready, implementation deferred)

## Success Metrics

- Users can see their caught count and levels grow over normal usage
- Catch and level-up feedback is noticeable but not disruptive
- Collection view loads instantly from local storage
- Zero performance regression on scroll/detection loop
