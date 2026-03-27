import {
  CLASSIFIER_MODEL_METADATA_URL,
  CLASSIFIER_MODEL_URL,
  LEGACY_MODEL_METADATA_URL,
  LEGACY_MODEL_URL,
} from "./shared/constants";
import {
  loadCorsImage,
  computeBrowserImageFeatures,
} from "./shared/browser-image";
import { LRUCache } from "./shared/lru-cache";
import type {
  DetectionResult,
  ModelMetadata,
  WorkerRequest,
  WorkerResponse,
} from "./shared/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ResolvedModel {
  metadata: ModelMetadata;
  modelUrl: string;
  positiveIndex: number;
  kind: "classifier" | "legacy";
}

export interface DetectionCallbacks {
  onCacheHit: () => void;
  onAvatarChecked: () => void;
  onError: () => void;
}

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

const CACHE_MAX_SIZE = 1000;
const cache = new LRUCache<string, Promise<DetectionResult>>(CACHE_MAX_SIZE);

let modelMetadataPromise: Promise<ResolvedModel> | null = null;
let workerPromise: Promise<Worker> | null = null;
let pendingWorker = new Map<string, { resolve: (score: number) => void; reject: (error: Error) => void }>();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function detectAvatar(
  image: HTMLImageElement,
  normalizedUrl: string,
  callbacks: DetectionCallbacks,
): Promise<DetectionResult> {
  const cached = cache.get(normalizedUrl);
  if (cached) {
    callbacks.onCacheHit();
    return cached;
  }

  const task = detectAvatarUncached(image, normalizedUrl, callbacks);
  cache.set(normalizedUrl, task);
  return task;
}

export function formatProbabilityDebugLabel(score: number, threshold: number): string {
  return `p${score.toFixed(3)} t${threshold.toFixed(3)}`;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function detectAvatarUncached(
  image: HTMLImageElement,
  normalizedUrl: string,
  callbacks: DetectionCallbacks,
): Promise<DetectionResult> {
  callbacks.onAvatarChecked();
  try {
    const runtimeImage = await loadCorsImage(normalizedUrl);
    const variants = await Promise.all([
      computeBrowserImageFeatures(runtimeImage, "center"),
      computeBrowserImageFeatures(runtimeImage, "top"),
    ]);
    const resolvedModel = await loadModelMetadata();
    const score = await scoreWithOnnx(
      resolvedModel,
      variants.map((entry) => entry.modelTensor),
      variants.map((entry) => entry.legacyFeatures),
      normalizedUrl,
    );
    return {
      matched: score >= resolvedModel.metadata.threshold,
      source: score >= resolvedModel.metadata.threshold ? "onnx" : null,
      score,
      tokenId: null,
      debugLabel: formatProbabilityDebugLabel(score, resolvedModel.metadata.threshold),
    };
  } catch (error) {
    console.error("Milady detection failed", error);
    callbacks.onError();
    return {
      matched: false,
      source: null,
      score: null,
      tokenId: null,
      debugLabel: "err",
    };
  }
}

async function loadModelMetadata(): Promise<ResolvedModel> {
  if (!modelMetadataPromise) {
    modelMetadataPromise = resolveModel(
      CLASSIFIER_MODEL_METADATA_URL,
      CLASSIFIER_MODEL_URL,
      "classifier",
      LEGACY_MODEL_METADATA_URL,
      LEGACY_MODEL_URL,
    );
  }
  return modelMetadataPromise;
}

async function resolveModel(
  preferredMetadataUrl: string,
  preferredModelUrl: string,
  preferredKind: ResolvedModel["kind"],
  fallbackMetadataUrl: string,
  fallbackModelUrl: string,
): Promise<ResolvedModel> {
  const preferredResponse = await fetch(chrome.runtime.getURL(preferredMetadataUrl));
  if (preferredResponse.ok) {
    const metadata = await preferredResponse.json() as ModelMetadata;
    return {
      metadata,
      modelUrl: chrome.runtime.getURL(preferredModelUrl),
      positiveIndex: typeof metadata.positiveIndex === "number" ? metadata.positiveIndex : 1,
      kind: preferredKind,
    };
  }

  const fallbackResponse = await fetch(chrome.runtime.getURL(fallbackMetadataUrl));
  if (!fallbackResponse.ok) {
    throw new Error(
      `Failed to load model metadata: preferred ${preferredResponse.status}, fallback ${fallbackResponse.status}`,
    );
  }

  const metadata = await fallbackResponse.json() as ModelMetadata;
  return {
    metadata,
    modelUrl: chrome.runtime.getURL(fallbackModelUrl),
    positiveIndex: typeof metadata.positiveIndex === "number" ? metadata.positiveIndex : 0,
    kind: "legacy",
  };
}

async function getWorker(resolvedModel: ResolvedModel): Promise<Worker> {
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
      const pending = pendingWorker.get(event.data.id);
      if (!pending) {
        return;
      }
      pendingWorker.delete(event.data.id);
      if (event.data.error) {
        pending.reject(new Error(event.data.error));
        return;
      }
      if (typeof event.data.score !== "number") {
        pending.reject(new Error("Worker returned no score"));
        return;
      }
      pending.resolve(event.data.score);
    });
    worker.postMessage({
      modelUrl: resolvedModel.modelUrl,
      wasmPath: chrome.runtime.getURL("ort/"),
      positiveIndex: resolvedModel.positiveIndex,
    });
    return worker;
  });

  return workerPromise;
}

async function scoreWithOnnx(
  resolvedModel: ResolvedModel,
  tensors: number[][],
  legacyFeatures: number[][],
  seed: string,
): Promise<number> {
  const worker = await getWorker(resolvedModel);
  const scores = await Promise.all(
    (resolvedModel.kind === "classifier" ? tensors : legacyFeatures).map(
      (input, index) =>
        new Promise<number>((resolve, reject) => {
          const id = `${seed}:${index}:${crypto.randomUUID()}`;
          pendingWorker.set(id, { resolve, reject });
          const payload: WorkerRequest =
            resolvedModel.kind === "classifier"
              ? {
                id,
                tensor: input,
                shape: [1, 3, 128, 128],
              }
              : {
                id,
                features: input,
              };
          worker.postMessage(payload);
        }),
    ),
  );
  return Math.max(...scores);
}
