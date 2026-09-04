"use client";

import type { PersonProfile } from "@/lib/types";
import {
  averageEmbeddings as averageEmbeddingsPure,
  cosineSimilarity as cosineSimilarityPure,
  DEFAULT_FACE_THRESHOLD,
  euclideanDistance as euclideanDistancePure,
  findTrustedFaceMatchPure,
  type FaceMatchResult
} from "./face-match-math";

export type VisionInput = HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | ImageBitmap;

export interface ExtractedFace {
  embedding: number[];
  score: number;
  box?: number[];
}

export type FaceMatch = FaceMatchResult;

export {
  averageEmbeddingsPure as averageEmbeddings,
  cosineSimilarityPure as cosineSimilarity,
  euclideanDistancePure as euclideanDistance,
  findTrustedFaceMatchPure
};

const HUMAN_MODEL_BASE = "https://cdn.jsdelivr.net/npm/@vladmandic/human/models";
const DEFAULT_THRESHOLD = DEFAULT_FACE_THRESHOLD;

type FaceResultLike = {
  embedding?: number[];
  faceScore?: number;
  score?: number;
  box?: number[];
};

type HumanRuntime = {
  load: () => Promise<void>;
  warmup: () => Promise<unknown>;
  detect: (input: VisionInput) => Promise<{ face?: FaceResultLike[] }>;
  match?: {
    find?: (embedding: number[], embeddings: number[][]) => { index: number; similarity: number; distance: number };
  };
};

type HumanConstructor = new (config: Record<string, unknown>) => HumanRuntime;

declare global {
  interface Window {
    Human?: HumanConstructor | { default?: HumanConstructor; Human?: HumanConstructor };
  }
}

let humanPromise: Promise<HumanRuntime> | null = null;

const humanConfig: Record<string, unknown> = {
  modelBasePath: HUMAN_MODEL_BASE,
  async: true,
  cacheSensitivity: 0,
  face: {
    enabled: true,
    detector: { enabled: true, maxDetected: 4, minConfidence: 0.35, rotation: true },
    mesh: { enabled: true },
    description: { enabled: true, minConfidence: 0.1 },
    emotion: { enabled: false },
    age: { enabled: false },
    gender: { enabled: false },
    iris: { enabled: false },
    antispoof: { enabled: false },
    liveness: { enabled: false }
  },
  body: { enabled: false },
  hand: { enabled: false },
  object: { enabled: false },
  segmentation: { enabled: false },
  gesture: { enabled: false }
};

export async function getHuman() {
  if (typeof window === "undefined") throw new Error("Face recognition runs in the browser.");
  if (!humanPromise) {
    humanPromise = loadHumanScript().then(async (Human) => {
      const human = new Human(humanConfig);
      await human.load();
      await human.warmup();
      return human;
    });
  }
  return humanPromise;
}

export async function extractFaceEmbedding(input: VisionInput): Promise<ExtractedFace> {
  const human = await getHuman();
  const result = await human.detect(input);
  const faces = (result.face || []).filter((face) => Array.isArray(face.embedding));
  if (!faces.length) throw new Error("No face embedding found. Try a brighter, front-facing photo.");
  const face = faces.sort((a, b) => faceArea(b) - faceArea(a))[0];
  return {
    embedding: [...(face.embedding as number[])],
    score: face.faceScore || face.score || 0,
    box: face.box
  };
}

/** Match enrolled embeddings with pure math (no second Human load for match step). */
export async function findTrustedFaceMatch(
  embedding: number[],
  people: PersonProfile[],
  threshold = DEFAULT_THRESHOLD
): Promise<FaceMatch | null> {
  return findTrustedFaceMatchPure(embedding, people, threshold);
}

export function fileToImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Could not read ${file.name}`));
    };
    image.src = url;
  });
}

export function captureVideoFrame(video: HTMLVideoElement) {
  if (!video.videoWidth || !video.videoHeight) throw new Error("Camera frame is not ready yet.");
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not create camera canvas.");
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export function dataUrlToImage(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not decode image."));
    image.src = dataUrl;
  });
}

function loadHumanScript() {
  return new Promise<HumanConstructor>((resolve, reject) => {
    const existingConstructor = getHumanConstructor();
    if (existingConstructor) {
      resolve(existingConstructor);
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>("script[data-human-browser]");
    if (existing) {
      existing.addEventListener("load", () => {
        const Human = getHumanConstructor();
        return Human ? resolve(Human) : reject(new Error("Human constructor unavailable"));
      });
      existing.addEventListener("error", reject);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/@vladmandic/human@3.3.6/dist/human.js";
    script.async = true;
    script.dataset.humanBrowser = "true";
    script.onload = () => {
      const Human = getHumanConstructor();
      return Human ? resolve(Human) : reject(new Error("Human constructor unavailable"));
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

function getHumanConstructor() {
  const globalHuman = window.Human;
  if (typeof globalHuman === "function") return globalHuman;
  if (globalHuman && typeof globalHuman.default === "function") return globalHuman.default;
  if (globalHuman && typeof globalHuman.Human === "function") return globalHuman.Human;
  return null;
}

function faceArea(face: FaceResultLike) {
  const box = face.box || [0, 0, 0, 0];
  return (box[2] || 0) * (box[3] || 0);
}
