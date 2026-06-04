import { supabase } from "../lib/supabaseClient";
import type { DayRisk } from "../models/forecastRisk";

export interface MonitoredFarm {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  cultivation_phase: string;
  botrytis_threshold: number;
  pm_threshold: number;
}

export interface Observation {
  id: string;
  farm_id: string;
  observed_at: string;
  max_botrytis: number;
  max_pm: number;
  alerted: boolean;
}

const FARM_COLS =
  "id, name, latitude, longitude, cultivation_phase, botrytis_threshold, pm_threshold";

export async function listFarms(): Promise<MonitoredFarm[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("monitored_farms")
    .select(FARM_COLS)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as MonitoredFarm[];
}

export async function addFarm(
  farm: {
    name: string;
    latitude: number;
    longitude: number;
    cultivationPhase: string;
  },
  userId: string,
): Promise<MonitoredFarm> {
  if (!supabase) throw new Error("Accounts are not configured.");
  const { data, error } = await supabase
    .from("monitored_farms")
    .insert({
      user_id: userId,
      name: farm.name,
      latitude: farm.latitude,
      longitude: farm.longitude,
      cultivation_phase: farm.cultivationPhase,
    })
    .select(FARM_COLS)
    .single();
  if (error) throw error;
  return data as MonitoredFarm;
}

export async function deleteFarm(id: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("monitored_farms").delete().eq("id", id);
  if (error) throw error;
}

export async function recordObservation(
  farm: MonitoredFarm,
  userId: string,
  risk: DayRisk[],
): Promise<void> {
  if (!supabase || risk.length === 0) return;
  const maxBotrytis = Math.round(
    Math.max(0, ...risk.map((d) => d.pathogen.botrytisScore)),
  );
  const maxPm = Math.round(
    Math.max(0, ...risk.map((d) => d.pathogen.powderyMildewScore)),
  );
  const alerted =
    maxBotrytis >= farm.botrytis_threshold || maxPm >= farm.pm_threshold;
  const { error } = await supabase.from("farm_observations").insert({
    farm_id: farm.id,
    user_id: userId,
    max_botrytis: maxBotrytis,
    max_pm: maxPm,
    alerted,
    payload: risk,
  });
  if (error) throw error;
}

export async function latestObservation(
  farmId: string,
): Promise<Observation | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("farm_observations")
    .select("id, farm_id, observed_at, max_botrytis, max_pm, alerted")
    .eq("farm_id", farmId)
    .order("observed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as Observation | null;
}
