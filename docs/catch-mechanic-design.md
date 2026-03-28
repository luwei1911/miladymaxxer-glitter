# Catch Mechanic — Design

## Problem Context

The extension highlights miladys with gold cards and sound, but once the user scrolls past, there's no trace of the encounter. The matched accounts list in the popup is a flat log — it doesn't reward engagement or create a sense of progression.

## What This Feature Solves

It turns every milady encounter into a decision point: do I like this post and add this account to my collection? Repeated likes deepen the relationship — each account has a level that grows over time. This creates a gameplay loop (detect -> decide -> catch -> level up -> collect) that makes the extension sticky and gives the like button additional meaning.

## Design Principles

1. **Catching = liking.** No new UI actions. The like button is the catch button. This means the mechanic works on muscle memory users already have. We never show a separate "catch" button.

2. **Permanent collection.** Once caught, always caught. Unliking a specific post doesn't uncatch the account — you caught them the moment you engaged. This prevents accidental loss and makes the collection feel solid.

3. **Passive until it isn't.** Users who don't care about collecting simply see a number go up in the popup. Users who do care can browse their collection and chase levels. The mechanic shouldn't add friction to normal scrolling.

4. **Piggyback on existing signals.** Like detection, avatar scoring, account tracking, badge updates — all exist. The catch mechanic layers on top without new DOM observers or storage mechanisms.

5. **Feedback should feel earned.** The catch sound is distinct from the detection chime. Detection says "there's a milady here." Catch says "you got this one." Level-up says "you're building something." Each moment should feel like a small reward, but not so loud that it disrupts flow.

6. **Leveling is derived, not stored.** Level = `floor(sqrt(postsMatched))`. No XP counter, no separate level field. The level is a pure function of likes already tracked. This means zero migration complexity for leveling and no state to get out of sync.

## Implementation Philosophy

### Where catch detection lives

The catch check belongs in `effects.ts` inside `applyMode()`, right where the badge counter already runs. When `hasUserLiked()` is true and the account isn't already caught, we trigger the catch. This means:

- No changes to the detection pipeline (detection.ts, worker.ts)
- No changes to the scan loop (content.ts processVisibleTweets)
- The catch is detected during the same pass that applies visual effects

### How catch state flows

```
effects.ts: applyMode() detects like on milady post
  → calls onCatch(handle) callback for new catches
  → calls onLevelUp(handle, newLevel) callback when likes cross a threshold
  → content.ts: marks account as caught / increments postsMatched
  → scheduleLocalStateWrite() persists to chrome.storage.local
  → popup.tsx: reactive signal updates collection view
```

### Passing the handle to effects

The author handle is extracted in `content.ts:processTweet()` via `findAuthor()`. Effects needs it to identify which account was liked. Cleanest path: set `tweet.dataset.miladymaxxerHandle` during processing, read it back in effects when like detection fires. This follows the existing dataset attribute pattern used for state/debug/effect.

### Level computation

```typescript
function getLevel(postsMatched: number): number {
  return Math.floor(Math.sqrt(postsMatched));
}

function getLevelProgress(postsMatched: number): { current: number; needed: number } {
  const level = getLevel(postsMatched);
  const currentThreshold = level * level;
  const nextThreshold = (level + 1) * (level + 1);
  return {
    current: postsMatched - currentThreshold,
    needed: nextThreshold - currentThreshold,
  };
}
```

This is computed on render — never stored. The popup calls it when displaying each account.

### What the user experiences

**On first catch of an account:**
1. User likes a milady post (normal Twitter like)
2. Brief visual pulse on the tweet card (CSS animation, ~500ms)
3. Catch sound plays (if sound enabled)
4. Account appears in collection as Level 1

**On subsequent likes (XP gain):**
- XP bar advances in the collection view
- If a level boundary is crossed, level-up sound plays and brief visual on the tweet
- No feedback for likes that don't cross a level boundary (keep it clean)

**In the popup collection:**
- Each account shows: handle, display name, "Lv. X", small XP bar
- Sorted by total XP (likes) by default — highest level accounts at top
- Toggle to sort by most recent catch
- Uncaught accounts listed below, visually dimmed
- Stats at top: "42 caught / 127 seen (33%)"

### Sound design

Three distinct tones in the reward hierarchy:
- **Detection chime** (existing) = awareness ("there's a milady")
- **Catch sound** (new) = collection ("you got a new one") — bright, satisfying, single tone
- **Level-up sound** (new) = progression ("you're growing") — ascending arpeggio, slightly longer

### Verification (future)

The `verificationStatus` field is added to the data model now but defaults to `"unverified"` and has no UI. When remiliaNET API is available:
- Lookup on catch or as a periodic background sweep
- Collection view shows verified badge
- Potentially affects visual treatment (verified catches could have enhanced styling)
