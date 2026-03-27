import {
  MEDIA_ELEMENTS,
  INTERACTIVE_ELEMENT,
  POST_BUTTONS,
  TWEET_COMPOSER,
  DM_CONTAINER,
  DM_CONVERSATION_PANEL,
  DM_MESSAGE_LIST,
  DM_MESSAGE,
  DM_COMPOSER_FORM,
  LAYERS,
} from "./selectors";
import type { ExtensionSettings } from "./shared/types";

// Module-level settings reference, updated by content.ts via setSoundSettings()
let settings: ExtensionSettings = { mode: "off", whitelistHandles: [], soundEnabled: false };

export function setSoundSettings(next: ExtensionSettings): void {
  settings = next;
}

let audioContext: AudioContext | null = null;
const soundsAttached = new WeakSet<HTMLElement>();
let dmListenersAttached = false;
let lastMessageCount = 0;

// AudioContext can only be created/resumed after a real user gesture (click/keydown).
// Hover events don't qualify, so pass hoverOnly=true to silently skip.
function getAudioContext(hoverOnly = false): AudioContext | null {
  if (!audioContext) {
    if (hoverOnly) return null;
    try {
      audioContext = new AudioContext();
    } catch {
      return null;
    }
  }
  if (audioContext.state === "suspended") {
    if (hoverOnly) return null;
    void audioContext.resume();
  }
  return audioContext;
}

function playTone(
  frequency: number,
  duration: number,
  type: OscillatorType = "sine",
  volume: number = 0.08,
  attack: number = 0.01,
  decay: number = 0.1,
): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return; // Audio not yet unlocked

    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);

    // ADSR envelope for pleasant sound
    gainNode.gain.setValueAtTime(0, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(volume, ctx.currentTime + attack);
    gainNode.gain.linearRampToValueAtTime(volume * 0.7, ctx.currentTime + attack + decay);
    gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + duration);

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + duration);
  } catch {
    // Audio not available, fail silently
  }
}

function playChord(frequencies: number[], duration: number, volume: number = 0.05): void {
  for (const freq of frequencies) {
    playTone(freq, duration, "sine", volume);
  }
}

// Sound presets
function playHoverSound(isMilady: boolean): void {
  if (!settings.soundEnabled || !getAudioContext(true)) return;
  if (isMilady) {
    // Sparkly high chime for milady
    playTone(1200, 0.12, "sine", 0.06);
    setTimeout(() => playTone(1500, 0.1, "sine", 0.04), 30);
  } else {
    // Subtle soft tone for non-milady
    playTone(400, 0.08, "sine", 0.03);
  }
}

function playClickSound(isMilady: boolean): void {
  if (!settings.soundEnabled) return;
  if (isMilady) {
    // Satisfying gold coin / chime sound
    playChord([523.25, 659.25, 783.99], 0.2, 0.05); // C5, E5, G5 major chord
    setTimeout(() => playTone(1046.5, 0.15, "sine", 0.04), 50); // C6 sparkle
  } else {
    // Simple click
    playTone(300, 0.06, "triangle", 0.04);
  }
}

function playSendSound(): void {
  if (!settings.soundEnabled) return;
  // Thup - low percussive thud
  playTone(180, 0.06, "triangle", 0.12, 0, 0.02);
  playTone(120, 0.04, "sine", 0.08, 0, 0.01);
}

function playMessageBlip(): void {
  if (!settings.soundEnabled) return;
  // Pip - short high tap
  playTone(1400, 0.03, "sine", 0.1, 0, 0.01);
}

function playMediaHoverSound(isMilady: boolean): void {
  if (!settings.soundEnabled || !getAudioContext(true)) return;
  if (isMilady) {
    // Soft shimmer for milady media
    playTone(800, 0.1, "sine", 0.04);
    setTimeout(() => playTone(1000, 0.08, "sine", 0.03), 40);
  } else {
    // Very subtle for non-milady
    playTone(300, 0.06, "sine", 0.02);
  }
}

export function attachSoundEvents(tweet: HTMLElement): void {
  if (soundsAttached.has(tweet)) return;
  soundsAttached.add(tweet);

  const isMilady = () => tweet.dataset.miladymaxxerEffect === "milady";

  tweet.addEventListener("mouseenter", () => {
    if (settings.mode !== "off") {
      playHoverSound(isMilady());
    }
  }, { passive: true });

  tweet.addEventListener("click", (e) => {
    if (settings.mode !== "off") {
      const target = e.target as HTMLElement;
      // Only play on interactive elements
      if (target.closest(INTERACTIVE_ELEMENT)) {
        playClickSound(isMilady());
      }
    }
  }, { passive: true });

  // Media hover sounds
  const mediaElements = tweet.querySelectorAll<HTMLElement>(MEDIA_ELEMENTS);
  for (const media of Array.from(mediaElements)) {
    if (soundsAttached.has(media)) continue;
    soundsAttached.add(media);
    media.addEventListener("mouseenter", () => {
      if (settings.mode !== "off") {
        playMediaHoverSound(isMilady());
      }
    }, { passive: true });
  }
}

// Global media hover sounds — attaches a subtle pip to ALL media on the page,
// regardless of whether the tweet was processed by the milady detection system.
export function attachGlobalMediaHoverSounds(): void {
  if (settings.mode === "off") return;

  const mediaElements = document.querySelectorAll<HTMLElement>(MEDIA_ELEMENTS);
  for (const media of Array.from(mediaElements)) {
    if (soundsAttached.has(media)) continue;
    soundsAttached.add(media);
    media.addEventListener("mouseenter", () => {
      if (settings.mode !== "off" && settings.soundEnabled && getAudioContext(true)) {
        // Very subtle, short pip — quieter and shorter than the milady media hover
        playTone(500, 0.05, "sine", 0.02);
      }
    }, { passive: true });
  }
}

export function attachPostButtonSound(): void {
  if (settings.mode === "off") return;

  // Regular tweet buttons
  const postButtons = document.querySelectorAll<HTMLElement>(POST_BUTTONS);

  for (const button of Array.from(postButtons)) {
    if (soundsAttached.has(button)) continue;
    soundsAttached.add(button);

    button.addEventListener("click", () => {
      if (settings.mode !== "off") {
        playSendSound();
      }
    }, { passive: true });
  }
}

// Global DM sound handlers - set up once
export function attachDMSounds(): void {
  if (dmListenersAttached) return;
  dmListenersAttached = true;

  // Document-level click handler for all DM interactions
  document.addEventListener("click", (e) => {
    if (settings.mode === "off") return;

    const target = e.target as HTMLElement;
    const button = target.closest("button") as HTMLElement | null;

    // Check for send button (inside dm-composer-form or by aria-label)
    if (button) {
      const testId = button.getAttribute("data-testid") || "";
      const ariaLabel = button.getAttribute("aria-label") || "";

      // DM send: button inside the composer form, or explicit send labels
      const inComposerForm = button.closest(DM_COMPOSER_FORM);
      if (inComposerForm && (testId.includes("send") || ariaLabel.includes("Send") ||
          button.getAttribute("type") === "submit")) {
        playSendSound();
        return;
      }

      // Also catch any send button by testid/aria-label outside composer
      if (testId.includes("send") || testId.includes("Send") ||
          ariaLabel.includes("Send") || ariaLabel === "Send") {
        playSendSound();
        return;
      }
    }

    // Skip reaction/emoji buttons — no sound for react picker
    if (button) {
      const ariaLabel = button.getAttribute("aria-label") || "";
      if (/react|emoji|like/i.test(ariaLabel) ||
          /^[\p{Emoji}\u200d]+$/u.test(ariaLabel) ||
          /^[\p{Emoji_Presentation}\p{Extended_Pictographic}]/u.test(ariaLabel) ||
          target.closest(LAYERS)) {
        return;
      }
    }
    const dmPanel = target.closest(DM_CONVERSATION_PANEL) || target.closest(DM_CONTAINER);
    if (dmPanel && window.location.pathname.includes("/messages")) {
      playClickSound(false);
    }
  }, { passive: true, capture: true });

  // Document-level keydown for Enter to send in DM composer
  document.addEventListener("keydown", (e) => {
    if (settings.mode === "off") return;
    if (e.key !== "Enter" || e.shiftKey) return;

    const target = e.target as HTMLElement;
    const testId = target.getAttribute("data-testid") || "";

    // Direct match: dm-composer-textarea
    if (testId === "dm-composer-textarea") {
      playSendSound();
      return;
    }

    // Fallback: any textbox inside DM page that isn't the tweet composer
    const inDMPage = window.location.pathname.includes("/messages");
    const isTextbox = target.getAttribute("role") === "textbox" || target.isContentEditable;
    const notTweetComposer = !target.closest(TWEET_COMPOSER);

    if (inDMPage && isTextbox && notTweetComposer) {
      playSendSound();
    }
  }, { passive: true, capture: true });

  // Document-level mouseover for DM conversation hover sounds
  document.addEventListener("mouseover", (e) => {
    if (settings.mode === "off") return;

    const target = e.target as HTMLElement;
    // Hover on conversation panel or any DM message
    const dmElement = target.closest(DM_CONVERSATION_PANEL) ||
                      target.closest(DM_MESSAGE);

    if (dmElement && !soundsAttached.has(dmElement as HTMLElement) && getAudioContext(true)) {
      soundsAttached.add(dmElement as HTMLElement);
      playTone(600, 0.04, "sine", 0.03, 0, 0.01);
    }
  }, { passive: true });
}


// Observe incoming messages and reactions in DMs/GCs
let dmObserver: MutationObserver | null = null;
let observedMessageList: Element | null = null;

export function observeIncomingMessages(): void {
  const messageList = document.querySelector(DM_MESSAGE_LIST) ||
                      document.querySelector(DM_CONVERSATION_PANEL);

  if (!messageList) {
    // Left the DM view — tear down observer
    if (dmObserver) {
      dmObserver.disconnect();
      dmObserver = null;
      observedMessageList = null;
    }
    lastMessageCount = 0;
    return;
  }

  // Already observing this list
  if (observedMessageList === messageList) return;

  // New conversation opened — set baseline count and attach observer
  if (dmObserver) {
    dmObserver.disconnect();
  }
  observedMessageList = messageList;
  lastMessageCount = messageList.querySelectorAll(DM_MESSAGE).length;

  let dmMutationTimer: ReturnType<typeof setTimeout> | null = null;

  dmObserver = new MutationObserver(() => {
    // Debounce: Twitter may insert multiple nodes in rapid succession
    if (dmMutationTimer) return;
    dmMutationTimer = setTimeout(() => {
      dmMutationTimer = null;
      if (!settings.soundEnabled || settings.mode === "off") return;
      if (!document.hasFocus()) return;

      const currentCount = messageList.querySelectorAll(DM_MESSAGE).length;

      if (currentCount > lastMessageCount) {
        playMessageBlip();
      }

      lastMessageCount = currentCount;
    }, 100);
  });

  dmObserver.observe(messageList, {
    childList: true,
    subtree: true,
  });
}
