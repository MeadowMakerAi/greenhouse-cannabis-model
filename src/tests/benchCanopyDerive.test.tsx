import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import type { ReactNode } from "react";
import { renderHook, act } from "@testing-library/react";
import { ScenarioProvider, useScenario } from "../context/ScenarioContext";

// The provider fetches climate on mount; stub fetch so the test never touches
// the network (it falls back to the built-in Montgomery normals).
beforeAll(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("no network in test"))),
  );
});
afterAll(() => vi.unstubAllGlobals());

const wrapper = ({ children }: { children: ReactNode }) => (
  <ScenarioProvider>{children}</ScenarioProvider>
);

describe("benched layout derives canopy from benches (setInputs integration)", () => {
  it("flipping to benched replaces the typed canopy with the bench-derived footprint", () => {
    const { result } = renderHook(() => useScenario(), { wrapper });
    expect(result.current.inputs.layoutMode).toBe("open");
    expect(result.current.inputs.canopyAreaSqFt).toBe(1200); // default open canopy

    act(() => result.current.setInputs({ layoutMode: "benched" }));
    // Default house 48 × 32 with rolling 4 × 40 benches → 6 benches → 960 ft².
    expect(result.current.inputs.canopyAreaSqFt).toBe(960);
  });

  it("an explicit canopy override wins even in benched mode", () => {
    const { result } = renderHook(() => useScenario(), { wrapper });
    act(() => result.current.setInputs({ layoutMode: "benched" }));
    act(() => result.current.setInputs({ canopyAreaSqFt: 500 }));
    expect(result.current.inputs.canopyAreaSqFt).toBe(500);
  });

  it("open mode ignores bench-field changes for canopy", () => {
    const { result } = renderHook(() => useScenario(), { wrapper });
    act(() => result.current.setInputs({ benchWidthFt: 6 }));
    expect(result.current.inputs.layoutMode).toBe("open");
    expect(result.current.inputs.canopyAreaSqFt).toBe(1200);
  });
});
