import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import AuditResultsView from "../components/AuditResultsView";
import type { SageFinding } from "../services/sageFindings";

afterEach(cleanup);

const findings: SageFinding[] = [
  {
    id: "f1",
    title: "No thermal screen",
    summary: "~50% of night heat is on the table",
    detail: "A screen cuts night heat loss ~50% for $1.50–3/sq ft installed.",
    severity: "savings",
    confidence: "high",
    metric: "Svensson energy-curtain retention 40–60%",
    tab: "hvac",
    patch: { thermalScreenEnabled: true },
    patchLabel: "Enable thermal screen",
  },
  {
    id: "f2",
    title: "VPD swing wide",
    summary: "Late-flower VPD drifts past the botrytis line",
    severity: "warn",
    tab: "humidity",
  },
];

describe("AuditResultsView", () => {
  it("renders each finding as a card with a header count (C1)", () => {
    render(<AuditResultsView findings={findings} onApply={() => {}} />);
    expect(screen.getByText(/2 findings/i)).toBeTruthy();
    expect(screen.getByText("No thermal screen")).toBeTruthy();
    expect(screen.getByText("VPD swing wide")).toBeTruthy();
    // Severity label chips render.
    expect(screen.getByText("Opportunity")).toBeTruthy();
    expect(screen.getByText("Risk")).toBeTruthy();
  });

  it("exposes detail + grounded-in metric behind progressive disclosure (C2)", () => {
    render(<AuditResultsView findings={findings} onApply={() => {}} />);
    expect(screen.getByText(/Svensson energy-curtain/)).toBeTruthy();
    expect(screen.getByText(/night heat loss ~50%/)).toBeTruthy();
  });

  it("dispatches select-tab when 'View in' is clicked (C3)", () => {
    const spy = vi.fn();
    window.addEventListener("greenhouse-model:select-tab", spy);
    render(<AuditResultsView findings={findings} onApply={() => {}} />);
    fireEvent.click(screen.getByText(/View in HVAC screening/));
    expect(spy).toHaveBeenCalledTimes(1);
    const detail = (spy.mock.calls[0][0] as CustomEvent).detail;
    expect(detail.tab).toBe("hvac");
    window.removeEventListener("greenhouse-model:select-tab", spy);
  });

  it("fires onApply with the finding's patch when Apply is clicked (C4)", () => {
    const onApply = vi.fn();
    render(<AuditResultsView findings={findings} onApply={onApply} />);
    fireEvent.click(screen.getByText("Enable thermal screen"));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply.mock.calls[0][0]).toEqual({ thermalScreenEnabled: true });
    expect(onApply.mock.calls[0][1]).toBe("Enable thermal screen");
  });

  it("only shows an Apply button on findings that carry a patch", () => {
    render(<AuditResultsView findings={findings} onApply={() => {}} />);
    // f1 has a patch (Enable thermal screen); f2 does not.
    expect(screen.queryAllByText("Enable thermal screen")).toHaveLength(1);
    expect(screen.queryByText("Apply")).toBeNull();
  });
});
