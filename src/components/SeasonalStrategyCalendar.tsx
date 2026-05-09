import { useDerived } from "../context/useDerived";
import { MONTH_LONG } from "../utils/formatting";

export default function SeasonalStrategyCalendar() {
  const d = useDerived();
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
      {d.strategies.map((s) => {
        const monthD = d.months[s.month];
        const perMonth = d.warnings.perMonth[s.month] ?? [];
        return (
          <div key={s.month} className="card">
            <div className="card-header">
              <span>{MONTH_LONG[s.month]}</span>
              <span className="tag tag-muted">DLI {monthD.flowerWindowDLI.toFixed(1)}</span>
            </div>
            <div className="card-body space-y-1 text-sm text-ink-700">
              {s.bullets.map((b, i) => (
                <div key={i} className="flex gap-2">
                  <span className="mt-1 inline-block h-1.5 w-1.5 rounded-full bg-leaf-500" />
                  <span>{b}</span>
                </div>
              ))}
              {perMonth.length > 0 &&
                perMonth.map((b, i) => (
                  <div key={`w-${i}`} className="flex gap-2">
                    <span className="mt-1 inline-block h-1.5 w-1.5 rounded-full bg-warn-500" />
                    <span className="text-warn-500">{b}</span>
                  </div>
                ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
