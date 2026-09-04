import { describe, expect, it } from "vitest";
import {
  buildCareContextSeed,
  buildDistressDemoPrompt,
  buildLumoLiveSystemInstruction,
  buildMatchedPersonContext,
  DISTRESS_DEMO_CHIPS
} from "./live-system-prompt";

describe("buildLumoLiveSystemInstruction", () => {
  it("includes distress, multilingual, and no-diagnosis rules", () => {
    const prompt = buildLumoLiveSystemInstruction({
      patientName: "Rajamma",
      caregiverName: "Ananya"
    });
    expect(prompt.length).toBeGreaterThan(200);
    expect(prompt.toLowerCase()).toMatch(/scared|stress|frighten|lost/);
    expect(prompt.toLowerCase()).toMatch(/language|hindi|kannada/);
    expect(prompt.toLowerCase()).toMatch(/not a doctor|diagnos/);
    expect(prompt).toContain("Rajamma");
    expect(prompt).toContain("Ananya");
  });
});

describe("care context helpers", () => {
  it("builds care context seed", () => {
    const seed = buildCareContextSeed({
      patientName: "Rajamma",
      caregiverName: "Ananya",
      homeLocation: "MSRIT",
      trustedPeople: [{ name: "Lakshmi", relation: "neighbour", memoryNote: "temple" }]
    });
    expect(seed).toContain("Rajamma");
    expect(seed).toContain("Lakshmi");
    expect(seed).toContain("Care context");
  });

  it("builds matched person context without inventing names", () => {
    const ctx = buildMatchedPersonContext({
      name: "Lakshmi",
      relation: "neighbour",
      similarity: 0.91
    });
    expect(ctx).toContain("Lakshmi");
    expect(ctx).toContain("Trusted person match");
    expect(ctx).toMatch(/91%/);
  });

  it("exports distress demo chips and prompt", () => {
    expect(DISTRESS_DEMO_CHIPS.length).toBeGreaterThan(3);
    expect(buildDistressDemoPrompt().toLowerCase()).toMatch(/scared|lost/);
  });
});
