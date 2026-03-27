import {
  COLOR_DISTANCE_THRESHOLD,
  DEFAULT_SETTINGS,
  HASH_MATCH_THRESHOLD,
  HASH_ONNX_THRESHOLD,
  HASH_URL,
  MODEL_METADATA_URL,
  MODEL_URL,
} from "./shared/constants";
import {
  loadCorsImage,
  computeBrowserImageFeatures,
} from "./shared/browser-image";
import {
  colorDistance,
  findBestCandidate,
  normalizeProfileImageUrl,
} from "./shared/image-core";
import {
  loadMatchedAccounts,
  loadSettings,
  loadStats,
  saveMatchedAccounts,
  saveStats,
} from "./shared/storage";
import type {
  DetectionStats,
  DetectionResult,
  ExtensionSettings,
  HashDatabase,
  MatchedAccountMap,
  ModelMetadata,
  WorkerResponse,
} from "./shared/types";

const STYLE_ID = "milady-shrinkifier-style";
const ARTICLE_SELECTOR = 'article[data-testid="tweet"]';
const RESCAN_INTERVAL_MS = 1000;
const cache = new Map<string, Promise<DetectionResult>>();
const processed = new WeakMap<HTMLElement, string>();
const placeholders = new WeakMap<HTMLElement, HTMLDivElement>();

let settings: ExtensionSettings = DEFAULT_SETTINGS;
let hashDatabasePromise: Promise<HashDatabase> | null = null;
let modelMetadataPromise: Promise<ModelMetadata> | null = null;
let workerPromise: Promise<Worker> | null = null;
let pendingWorker = new Map<string, (score: number) => void>();
let scanScheduled = false;
let delayedScanTimer: number | null = null;
let stats: DetectionStats | null = null;
let matchedAccounts: MatchedAccountMap | null = null;
let localStateWriteScheduled = false;

void boot();

async function boot(): Promise<void> {
  injectStyles();
  [settings, stats, matchedAccounts] = await Promise.all([
    loadSettings(),
    loadStats(),
    loadMatchedAccounts(),
  ]);
  observeStorage();
  const observer = new MutationObserver(() => {
    scheduleProcessVisibleTweets();
    scheduleDelayedProcessVisibleTweets();
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
  window.addEventListener("scroll", scheduleDelayedProcessVisibleTweets, { passive: true });
  window.setInterval(() => {
    scheduleProcessVisibleTweets();
  }, RESCAN_INTERVAL_MS);
  scheduleProcessVisibleTweets();
  scheduleDelayedProcessVisibleTweets();
}

async function processVisibleTweets(): Promise<void> {
  const tweets = Array.from(document.querySelectorAll<HTMLElement>(ARTICLE_SELECTOR));
  await Promise.allSettled(tweets.map((tweet) => processTweet(tweet)));
}

function scheduleProcessVisibleTweets(): void {
  if (scanScheduled) {
    return;
  }
  scanScheduled = true;
  queueMicrotask(async () => {
    scanScheduled = false;
    await processVisibleTweets();
  });
}

function scheduleDelayedProcessVisibleTweets(): void {
  if (delayedScanTimer !== null) {
    window.clearTimeout(delayedScanTimer);
  }

  delayedScanTimer = window.setTimeout(() => {
    delayedScanTimer = null;
    scheduleProcessVisibleTweets();
  }, 350);
}

async function processTweet(tweet: HTMLElement): Promise<void> {
  try {
    const avatar = findAvatar(tweet);
    const author = findAuthor(tweet);
    if (!avatar) {
      tweet.dataset.miladyShrinkifierState = "miss";
      applyMode(tweet);
      scheduleDelayedProcessVisibleTweets();
      return;
    }

    if (!avatar.currentSrc && !avatar.src) {
      tweet.dataset.miladyShrinkifierState = "miss";
      applyMode(tweet);
      scheduleDelayedProcessVisibleTweets();
      return;
    }

    if (author && settings.whitelistHandles.includes(author.handle)) {
      clearEffects(tweet);
      delete tweet.dataset.miladyShrinkifier;
      delete tweet.dataset.miladyShrinkifierState;
      return;
    }

    const normalizedUrl = normalizeProfileImageUrl(avatar.currentSrc || avatar.src);
    if (processed.get(tweet) === normalizedUrl && tweet.dataset.miladyShrinkifierState) {
      applyMode(tweet);
      return;
    }

    tweet.dataset.miladyShrinkifierState = "miss";
    applyMode(tweet);
    processed.set(tweet, normalizedUrl);
    incrementStat("tweetsScanned");
    const result = await detectAvatar(avatar, normalizedUrl);
    if (result.matched) {
      tweet.dataset.miladyShrinkifier = result.source ?? "match";
      tweet.dataset.miladyShrinkifierState = "match";
      incrementMatchStats(result);
      if (author) {
        recordMatchedAccount(author.handle, author.displayName);
      }
      applyMode(tweet);
      return;
    }

    clearEffects(tweet);
    delete tweet.dataset.miladyShrinkifier;
    tweet.dataset.miladyShrinkifierState = "miss";
    applyMode(tweet);
  } catch (error) {
    console.error("Milady post processing failed", error);
    clearEffects(tweet);
    delete tweet.dataset.miladyShrinkifier;
    tweet.dataset.miladyShrinkifierState = "miss";
    applyMode(tweet);
  }
}

async function detectAvatar(image: HTMLImageElement, normalizedUrl: string): Promise<DetectionResult> {
  const cached = cache.get(normalizedUrl);
  if (cached) {
    incrementStat("cacheHits");
    return cached;
  }

  const task = detectAvatarUncached(image, normalizedUrl);
  cache.set(normalizedUrl, task);
  return task;
}

async function detectAvatarUncached(image: HTMLImageElement, normalizedUrl: string): Promise<DetectionResult> {
  incrementStat("avatarsChecked");
  try {
    const database = await loadHashDatabase();
    const runtimeImage = await loadCorsImage(normalizedUrl);
    const variants = await Promise.all([
      computeBrowserImageFeatures(runtimeImage, "center"),
      computeBrowserImageFeatures(runtimeImage, "top"),
    ]);
    const candidates = variants.map((features) => {
      const candidate = findBestCandidate(features.hash, features.averageColor, database.hashes);
      return {
        features,
        candidate,
        averageColorDistance: colorDistance(features.averageColor, candidate.entry.averageColor),
      };
    });
    const strongMatch = candidates.find(
      ({ candidate, averageColorDistance }) =>
        candidate.distance <= HASH_MATCH_THRESHOLD &&
        averageColorDistance <= COLOR_DISTANCE_THRESHOLD,
    );

    if (strongMatch) {
      return {
        matched: true,
        source: "phash",
        score: strongMatch.candidate.distance,
        tokenId: strongMatch.candidate.entry.tokenId,
      };
    }

    const best = candidates.reduce((currentBest, entry) => {
      if (!currentBest) {
        return entry;
      }

      if (entry.candidate.distance < currentBest.candidate.distance) {
        return entry;
      }

      if (
        entry.candidate.distance === currentBest.candidate.distance &&
        entry.averageColorDistance < currentBest.averageColorDistance
      ) {
        return entry;
      }

      return currentBest;
    }, candidates[0]);

    if (best.candidate.distance > HASH_ONNX_THRESHOLD) {
      return {
        matched: false,
        source: null,
        score: best.candidate.distance,
        tokenId: null,
      };
    }

    const score = await scoreWithOnnx(best.features.modelFeatures, normalizedUrl);
    const metadata = await loadModelMetadata();
    return {
      matched: score >= metadata.threshold,
      source: score >= metadata.threshold ? "onnx" : null,
      score,
      tokenId: score >= metadata.threshold ? best.candidate.entry.tokenId : null,
    };
  } catch (error) {
    console.error("Milady detection failed", error);
    incrementStat("errors");
    return {
      matched: false,
      source: null,
      score: null,
      tokenId: null,
    };
  }
}

function findAvatar(tweet: HTMLElement): HTMLImageElement | null {
  return (
    tweet.querySelector<HTMLImageElement>('[data-testid="Tweet-User-Avatar"] img[src*="profile_images"]') ??
    tweet.querySelector<HTMLImageElement>('img[src*="profile_images"]')
  );
}

function findAuthor(tweet: HTMLElement): { handle: string; displayName: string | null } | null {
  const avatarLink = tweet.querySelector<HTMLAnchorElement>(
    '[data-testid="Tweet-User-Avatar"] a[href^="/"]',
  );
  const handle = normalizeHandle(avatarLink?.getAttribute("href"));
  if (!handle) {
    return null;
  }

  const userName = tweet.querySelector<HTMLElement>('[data-testid="User-Name"]');
  return {
    handle,
    displayName: userName ? extractDisplayName(userName) : null,
  };
}

function applyMode(tweet: HTMLElement): void {
  clearVisualClasses(tweet);
  const isMatch = tweet.dataset.miladyShrinkifierState === "match";

  switch (settings.mode) {
    case "hide":
      if (!isMatch) {
        clearPlaceholder(tweet);
        tweet.style.display = "";
        return;
      }
      applyHiddenState(tweet);
      return;
    case "fade":
      if (!isMatch) {
        clearPlaceholder(tweet);
        tweet.style.display = "";
        return;
      }
      clearPlaceholder(tweet);
      tweet.classList.add("milady-shrinkifier-fade");
      tweet.style.display = "";
      return;
    case "debug":
      clearPlaceholder(tweet);
      applyDebugState(tweet);
      tweet.style.display = "";
      return;
    case "off":
    default:
      clearPlaceholder(tweet);
      tweet.style.display = "";
  }
}

function clearEffects(tweet: HTMLElement): void {
  clearVisualClasses(tweet);
  clearPlaceholder(tweet);
  tweet.style.display = "";
}

function clearVisualClasses(tweet: HTMLElement): void {
  tweet.classList.remove(
    "milady-shrinkifier-fade",
    "milady-shrinkifier-debug-match",
    "milady-shrinkifier-debug-miss",
  );
}

function applyDebugState(tweet: HTMLElement): void {
  if (tweet.dataset.miladyShrinkifierState === "match") {
    tweet.classList.add("milady-shrinkifier-debug-match");
    return;
  }

  tweet.classList.add("milady-shrinkifier-debug-miss");
}

function applyHiddenState(tweet: HTMLElement): void {
  let placeholder = placeholders.get(tweet);
  if (!placeholder) {
    placeholder = document.createElement("div");
    placeholder.className = "milady-shrinkifier-placeholder";
    const label = document.createElement("span");
    label.textContent = "Milady post hidden";
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Show";
    button.addEventListener("click", () => {
      tweet.style.display = "";
      placeholder?.remove();
      placeholders.delete(tweet);
    });
    placeholder.append(label, button);
    placeholders.set(tweet, placeholder);
  }

  if (!placeholder.isConnected) {
    tweet.insertAdjacentElement("beforebegin", placeholder);
  }

  tweet.style.display = "none";
}

function clearPlaceholder(tweet: HTMLElement): void {
  const placeholder = placeholders.get(tweet);
  if (placeholder) {
    placeholder.remove();
    placeholders.delete(tweet);
  }
}

function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) {
    return;
  }
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .milady-shrinkifier-fade {
      opacity: 0.5;
    }

    .milady-shrinkifier-debug-match {
      box-shadow: inset 0 0 0 2px rgba(231, 76, 60, 0.95);
      background-image: linear-gradient(rgba(231, 76, 60, 0.08), rgba(231, 76, 60, 0.08));
    }

    .milady-shrinkifier-debug-miss {
      box-shadow: inset 0 0 0 2px rgba(46, 204, 113, 0.75);
      background-image: linear-gradient(rgba(46, 204, 113, 0.04), rgba(46, 204, 113, 0.04));
    }

    .milady-shrinkifier-placeholder {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 12px 16px;
      margin: 8px 0;
      border: 1px solid rgba(83, 100, 113, 0.4);
      border-radius: 16px;
      background: rgba(21, 32, 43, 0.8);
      color: rgb(231, 233, 234);
      font: 14px/1.4 ui-sans-serif, system-ui, sans-serif;
    }

    .milady-shrinkifier-placeholder button {
      border: 0;
      border-radius: 999px;
      padding: 8px 12px;
      background: rgb(239, 243, 244);
      color: rgb(15, 20, 25);
      font: inherit;
      cursor: pointer;
    }
  `;
  document.head.append(style);
}

function observeStorage(): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && (changes.mode || changes.whitelistHandles)) {
      const nextMode = changes.mode?.newValue;
      settings = {
        mode: isFilterMode(nextMode) ? nextMode : settings.mode,
        whitelistHandles: normalizeWhitelistHandles(
          changes.whitelistHandles?.newValue ?? settings.whitelistHandles,
        ),
      };
      scheduleProcessVisibleTweets();
    }

    if (area === "local" && changes.stats) {
      stats = normalizeStats(changes.stats.newValue);
    }

    if (area === "local" && changes.matchedAccounts) {
      matchedAccounts = normalizeMatchedAccounts(changes.matchedAccounts.newValue);
    }
  });
}

async function loadHashDatabase(): Promise<HashDatabase> {
  if (!hashDatabasePromise) {
    hashDatabasePromise = fetch(chrome.runtime.getURL(HASH_URL)).then(async (response) => {
      if (!response.ok) {
        throw new Error(`Failed to load hashes: ${response.status}`);
      }
      return response.json() as Promise<HashDatabase>;
    });
  }
  return hashDatabasePromise;
}

async function loadModelMetadata(): Promise<ModelMetadata> {
  if (!modelMetadataPromise) {
    modelMetadataPromise = fetch(chrome.runtime.getURL(MODEL_METADATA_URL)).then(async (response) => {
      if (!response.ok) {
        throw new Error(`Failed to load model metadata: ${response.status}`);
      }
      return response.json() as Promise<ModelMetadata>;
    });
  }
  return modelMetadataPromise;
}

async function getWorker(): Promise<Worker> {
  if (workerPromise) {
    return workerPromise;
  }

  workerPromise = Promise.resolve().then(() => {
    const bootstrapUrl = URL.createObjectURL(
      new Blob([`importScripts(${JSON.stringify(chrome.runtime.getURL("worker.js"))});`], {
        type: "text/javascript",
      }),
    );
    const worker = new Worker(bootstrapUrl);
    URL.revokeObjectURL(bootstrapUrl);
    worker.addEventListener("message", (event: MessageEvent<WorkerResponse>) => {
      const resolver = pendingWorker.get(event.data.id);
      if (!resolver) {
        return;
      }
      pendingWorker.delete(event.data.id);
      resolver(event.data.score);
    });
    worker.postMessage({
      modelUrl: chrome.runtime.getURL(MODEL_URL),
      wasmPath: chrome.runtime.getURL("ort/"),
    });
    return worker;
  });

  return workerPromise;
}

async function scoreWithOnnx(features: number[], seed: string): Promise<number> {
  const worker = await getWorker();
  return new Promise<number>((resolve) => {
    const id = `${seed}:${crypto.randomUUID()}`;
    pendingWorker.set(id, resolve);
    worker.postMessage({
      id,
      features,
    });
  });
}

function isFilterMode(value: unknown): value is ExtensionSettings["mode"] {
  return value === "off" || value === "hide" || value === "fade" || value === "debug";
}

function incrementMatchStats(result: DetectionResult): void {
  incrementStat("postsMatched");
  if (result.source === "phash") {
    incrementStat("phashMatches");
  }
  if (result.source === "onnx") {
    incrementStat("onnxMatches");
  }
  if (!stats) {
    return;
  }
  stats.lastMatchAt = new Date().toISOString();
  scheduleLocalStateWrite();
}

function incrementStat(key: keyof Omit<DetectionStats, "lastMatchAt">): void {
  if (!stats) {
    return;
  }
  stats[key] += 1;
  scheduleLocalStateWrite();
}

function recordMatchedAccount(handle: string, displayName: string | null): void {
  if (!matchedAccounts) {
    return;
  }

  const existing = matchedAccounts[handle];
  matchedAccounts[handle] = {
    handle,
    displayName: displayName ?? existing?.displayName ?? null,
    postsMatched: (existing?.postsMatched ?? 0) + 1,
    lastMatchedAt: new Date().toISOString(),
  };
  scheduleLocalStateWrite();
}

function scheduleLocalStateWrite(): void {
  if (localStateWriteScheduled || !stats || !matchedAccounts) {
    return;
  }
  localStateWriteScheduled = true;
  window.setTimeout(async () => {
    localStateWriteScheduled = false;
    if (!stats || !matchedAccounts) {
      return;
    }
    await Promise.all([saveStats(stats), saveMatchedAccounts(matchedAccounts)]);
  }, 250);
}

function normalizeStats(value: unknown): DetectionStats {
  if (!value || typeof value !== "object") {
    return emptyStats();
  }

  const candidate = value as Partial<DetectionStats>;
  return {
    tweetsScanned: readNumber(candidate.tweetsScanned),
    avatarsChecked: readNumber(candidate.avatarsChecked),
    cacheHits: readNumber(candidate.cacheHits),
    postsMatched: readNumber(candidate.postsMatched),
    phashMatches: readNumber(candidate.phashMatches),
    onnxMatches: readNumber(candidate.onnxMatches),
    errors: readNumber(candidate.errors),
    lastMatchAt: typeof candidate.lastMatchAt === "string" ? candidate.lastMatchAt : null,
  };
}

function readNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function emptyStats(): DetectionStats {
  return {
    tweetsScanned: 0,
    avatarsChecked: 0,
    cacheHits: 0,
    postsMatched: 0,
    phashMatches: 0,
    onnxMatches: 0,
    errors: 0,
    lastMatchAt: null,
  };
}

function normalizeWhitelistHandles(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return DEFAULT_SETTINGS.whitelistHandles;
  }

  return Array.from(
    new Set(
      value
        .filter((handle): handle is string => typeof handle === "string")
        .map((handle) => normalizeHandle(handle))
        .filter((handle) => handle.length > 0),
    ),
  );
}

function normalizeMatchedAccounts(value: unknown): MatchedAccountMap {
  if (!value || typeof value !== "object") {
    return {};
  }

  const normalized: MatchedAccountMap = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (!entry || typeof entry !== "object") {
      continue;
    }

    const candidate = entry as Record<string, unknown>;
    const handle = normalizeHandle(
      typeof candidate.handle === "string" && candidate.handle.length > 0 ? candidate.handle : key,
    );
    if (!handle) {
      continue;
    }

    normalized[handle] = {
      handle,
      displayName: typeof candidate.displayName === "string" ? candidate.displayName : null,
      postsMatched: readNumber(candidate.postsMatched),
      lastMatchedAt: typeof candidate.lastMatchedAt === "string" ? candidate.lastMatchedAt : null,
    };
  }

  return normalized;
}

function normalizeHandle(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/^\/+/, "").replace(/^@+/, "").toLowerCase();
}

function extractDisplayName(userName: HTMLElement): string | null {
  for (const span of Array.from(userName.querySelectorAll("span"))) {
    const text = span.textContent?.trim();
    if (!text || text.startsWith("@") || text === "·") {
      continue;
    }
    return text;
  }

  return null;
}
