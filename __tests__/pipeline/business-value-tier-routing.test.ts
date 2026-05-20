/**
 * Pins the model-tier routing for the four Business Value LLM passes.
 *
 * Regression: previously all four passes were routed to the
 * `classification` tier (gemini-flash-lite class). For the very large
 * grounded prompts used by financial quantification + executive
 * synthesis, the smaller models would intermittently return empty
 * content and the BV step swallowed the error -- producing a silent
 * green tick + $0 in the Use Case Explorer.
 *
 * This test parses the source of `lib/pipeline/steps/business-value-analysis.ts`
 * and asserts the correct tier near each `executeAIQuery` call. It is
 * deliberately lightweight (no LLM mocks) so the contract is enforced
 * even when the call sites are refactored.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SOURCE_PATH = resolve(
  __dirname,
  "../../lib/pipeline/steps/business-value-analysis.ts",
);

function loadSource(): string {
  return readFileSync(SOURCE_PATH, "utf8");
}

/**
 * Find the LLM tier passed near a given prompt key. We look for the
 * `promptKey: "<KEY>"` line and walk forward until the next
 * `modelEndpoint: resolveEndpoint("<tier>")` line. This is robust to
 * whitespace and minor reformatting but breaks if the call site is
 * substantially restructured -- which is the desired behavior, since
 * the test exists to guard the routing intent.
 */
function tierForPrompt(source: string, promptKey: string): string | null {
  const promptIdx = source.indexOf(`promptKey: "${promptKey}"`);
  if (promptIdx === -1) return null;
  const window = source.slice(promptIdx, promptIdx + 600);
  const match = window.match(/modelEndpoint:\s*resolveEndpoint\("(\w+)"\)/);
  return match?.[1] ?? null;
}

describe("Business Value tier routing", () => {
  const source = loadSource();

  it("FINANCIAL_QUANTIFICATION_PROMPT routes to the reasoning tier", () => {
    expect(tierForPrompt(source, "FINANCIAL_QUANTIFICATION_PROMPT")).toBe("reasoning");
  });

  it("EXECUTIVE_SYNTHESIS_PROMPT routes to the reasoning tier", () => {
    expect(tierForPrompt(source, "EXECUTIVE_SYNTHESIS_PROMPT")).toBe("reasoning");
  });

  it("ROADMAP_PHASING_PROMPT stays on the classification tier (light reasoning load)", () => {
    expect(tierForPrompt(source, "ROADMAP_PHASING_PROMPT")).toBe("classification");
  });

  it("STAKEHOLDER_ANALYSIS_PROMPT stays on the classification tier (light reasoning load)", () => {
    expect(tierForPrompt(source, "STAKEHOLDER_ANALYSIS_PROMPT")).toBe("classification");
  });

  it("imports resolveEndpoint (so the model pool drives endpoint selection)", () => {
    expect(source).toMatch(/import\s*{[^}]*\bresolveEndpoint\b/);
    expect(source).toContain("resolveEndpoint");
  });
});
