import { useEffect, useState } from "react";
import { useScenario } from "../context/ScenarioContext";
import { useAuth } from "../context/AuthContext";
import { fetchForwardForecast } from "../services/forecastClient";
import {
  computeForecastRisk,
  worstDay,
  type DayRisk,
} from "../models/forecastRisk";
import {
  listFarms,
  addFarm,
  deleteFarm,
  recordObservation,
  latestObservation,
  type MonitoredFarm,
  type Observation,
} from "../services/monitoredFarms";

function ScoreBar({ label, score }: { label: string; score: number }) {
  const pct = Math.round(score);
  const color = pct >= 60 ? "bg-red-500" : pct >= 30 ? "bg-amber-500" : "bg-green-500";
  return (
    <div className="flex items-center gap-2">
      <span className="w-28 shrink-0 text-xs text-gray-600">{label}</span>
      <div className="h-2 flex-1 rounded bg-gray-100">
        <div className={`h-2 rounded ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-7 text-right text-xs tabular-nums text-gray-600">{pct}</span>
    </div>
  );
}

// Forward 7-day disease-pressure outlook + opt-in monitoring. Floats bottom-left.
export default function ForecastWatch() {
  const { inputs } = useScenario();
  const auth = useAuth();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [risk, setRisk] = useState<DayRisk[]>([]);
  const [error, setError] = useState("");
  const [farms, setFarms] = useState<MonitoredFarm[]>([]);
  const [latest, setLatest] = useState<Record<string, Observation | null>>({});
  const [monitorMsg, setMonitorMsg] = useState("");

  useEffect(() => {
    if (!open || !auth.user) return;
    let active = true;
    const userId = auth.user.id;
    (async () => {
      try {
        const fs = await listFarms(userId);
        if (!active) return;
        setFarms(fs);
        const entries = await Promise.all(
          fs.map(async (f) => [f.id, await latestObservation(f.id)] as const),
        );
        if (active) setLatest(Object.fromEntries(entries));
      } catch (e: unknown) {
        if (active) setMonitorMsg(e instanceof Error ? e.message : "Could not load farms");
      }
    })();
    return () => {
      active = false;
    };
  }, [open, auth.user]);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const days = await fetchForwardForecast(inputs.latitude, inputs.longitude, 7);
      setRisk(
        computeForecastRisk(
          days,
          inputs.cultivationPhase,
          inputs.cultivationPhase !== "vegetative",
        ),
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not fetch forecast");
    } finally {
      setLoading(false);
    }
  }

  async function refreshFarms() {
    if (!auth.user) return;
    const fs = await listFarms(auth.user.id);
    setFarms(fs);
    const entries = await Promise.all(
      fs.map(async (f) => [f.id, await latestObservation(f.id)] as const),
    );
    setLatest(Object.fromEntries(entries));
  }

  async function monitorThisFarm() {
    if (!auth.user) return;
    setMonitorMsg("Saving…");
    try {
      const farm = await addFarm(
        {
          name: inputs.siteAddress,
          latitude: inputs.latitude,
          longitude: inputs.longitude,
          cultivationPhase: inputs.cultivationPhase,
        },
        auth.user.id,
      );
      await recordObservation(farm, auth.user.id, risk);
      await refreshFarms();
      setMonitorMsg("Now monitoring this farm — the nightly check keeps it fresh.");
    } catch (e: unknown) {
      setMonitorMsg(e instanceof Error ? e.message : "Could not start monitoring");
    }
  }

  async function removeFarm(id: string) {
    if (!auth.user) return;
    try {
      await deleteFarm(id, auth.user.id);
      await refreshFarms();
    } catch (e: unknown) {
      setMonitorMsg(e instanceof Error ? e.message : "Could not stop monitoring");
    }
  }

  function openPanel() {
    setOpen(true);
    if (risk.length === 0) void load();
  }

  if (!open) {
    return (
      <button
        onClick={openPanel}
        className="fixed bottom-4 left-4 z-50 rounded-full border border-gray-300 bg-white px-4 py-3 text-sm font-semibold text-gray-700 shadow-lg hover:bg-gray-50"
      >
        🌦 Disease outlook
      </button>
    );
  }

  const worst = worstDay(risk);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/30"
        onClick={() => setOpen(false)}
        aria-hidden
      />
      <div className="relative z-10 flex max-h-[85vh] w-full max-w-lg flex-col gap-3 overflow-y-auto rounded-xl border border-gray-200 bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">
              Disease-pressure outlook — next 7 days
            </h2>
            <p className="text-xs text-gray-500">
              {inputs.siteAddress} · {inputs.cultivationPhase}
            </p>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="ml-2 text-gray-400 hover:text-gray-700"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {loading && <p className="text-sm text-gray-500">Fetching forecast…</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}

        {!loading && !error && worst && (
          <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
            Highest pressure: <strong>{worst.date}</strong> — {worst.pathogen.summary}
          </div>
        )}

        {!loading && !error && (
          <ul className="flex flex-col gap-2">
            {risk.map((d) => (
              <li key={d.date} className="rounded-md border border-gray-200 p-3 text-sm">
                <div className="mb-1.5 flex justify-between">
                  <span className="font-medium text-gray-800">{d.date}</span>
                  <span className="text-gray-500">
                    {Math.round(d.meanTempF)}°F · {Math.round(d.meanRH)}% RH
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <ScoreBar label="Botrytis" score={d.pathogen.botrytisScore} />
                  <ScoreBar label="Powdery mildew" score={d.pathogen.powderyMildewScore} />
                </div>
              </li>
            ))}
          </ul>
        )}

        {auth.configured && (
          <div className="border-t border-gray-200 pt-3">
            <h3 className="mb-2 text-sm font-semibold text-gray-800">Monitoring</h3>
            {!auth.user ? (
              <p className="text-xs text-gray-500">
                Sign in (top-right) to have the twin watch this farm and flag rising
                pressure even when you&apos;re away.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => void monitorThisFarm()}
                  disabled={risk.length === 0}
                  className="self-start rounded-md bg-leaf-500 px-3 py-2 text-sm font-semibold text-white hover:bg-leaf-600 disabled:opacity-50"
                >
                  + Monitor this farm
                </button>
                {farms.length > 0 && (
                  <ul className="flex flex-col gap-1">
                    {farms.map((f) => {
                      const o = latest[f.id];
                      return (
                        <li
                          key={f.id}
                          className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2 text-sm"
                        >
                          <div className="min-w-0">
                            <div className="truncate font-medium text-gray-800">
                              {f.name}
                            </div>
                            {o ? (
                              <div className="text-xs text-gray-500">
                                botrytis {o.max_botrytis} · PM {o.max_pm} ·{" "}
                                {new Date(o.observed_at).toLocaleDateString()}
                                {o.alerted && (
                                  <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-red-700">
                                    alert
                                  </span>
                                )}
                              </div>
                            ) : (
                              <div className="text-xs text-gray-400">
                                no observations yet
                              </div>
                            )}
                          </div>
                          <button
                            onClick={() => void removeFarm(f.id)}
                            className="ml-2 shrink-0 text-gray-300 hover:text-red-500"
                            aria-label={`Stop monitoring ${f.name}`}
                          >
                            ✕
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {monitorMsg && <p className="text-xs text-gray-500">{monitorMsg}</p>}
              </div>
            )}
          </div>
        )}

        <p className="text-[11px] leading-snug text-gray-400">
          Screening signal from the outdoor Open-Meteo forecast — indicates incoming
          disease-favorable weather, not in-canopy risk (which depends on your climate
          control). Weather data by Open-Meteo.com (CC&nbsp;BY&nbsp;4.0).
        </p>
        <button
          onClick={() => void load()}
          className="self-start text-xs text-gray-500 hover:text-gray-700"
        >
          Refresh
        </button>
      </div>
    </div>
  );
}
