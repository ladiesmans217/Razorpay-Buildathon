import { describe, expect, it } from "vitest";
import {
  averageEmbeddings,
  cosineSimilarity,
  euclideanDistance,
  findTrustedFaceMatchPure
} from "./face-match-math";
import type { PersonProfile } from "@/lib/types";

describe("face embedding math (unchanged pipeline)", () => {
  it("averages embeddings", () => {
    const avg = averageEmbeddings([
      [1, 2, 3],
      [3, 4, 5]
    ]);
    expect(avg).toEqual([2, 3, 4]);
  });

  it("computes cosine similarity of identical vectors as 1", () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1);
  });

  it("computes euclidean distance", () => {
    expect(euclideanDistance([0, 0], [3, 4])).toBeCloseTo(5);
  });

  it("rejects empty average", () => {
    expect(() => averageEmbeddings([])).toThrow();
  });

  it("matches consented embedding above threshold", () => {
    const people = [
      {
        id: "p1",
        patient_id: "patient_rajamma",
        name: "Lakshmi",
        relation: "Neighbour",
        consent_status: "consented",
        face_embedding: [1, 0, 0]
      }
    ] as PersonProfile[];
    const match = findTrustedFaceMatchPure([1, 0, 0], people, 0.5);
    expect(match?.person.name).toBe("Lakshmi");
  });
});
