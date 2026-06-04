import { supabase } from "../lib/supabaseClient";
import type { ScenarioInputs } from "../context/ScenarioContext";

// A saved scenario is just the ScenarioInputs object (the same thing the Share Link
// feature already serializes) persisted per user in Supabase.
export interface SavedScenario {
  id: string;
  name: string;
  scenario: ScenarioInputs;
  updated_at: string;
}

export async function listScenarios(): Promise<SavedScenario[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("saved_scenarios")
    .select("id, name, scenario, updated_at")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as SavedScenario[];
}

export async function saveScenario(
  name: string,
  scenario: ScenarioInputs,
  userId: string,
): Promise<void> {
  if (!supabase) throw new Error("Accounts are not configured.");
  const { error } = await supabase
    .from("saved_scenarios")
    .insert({ name, scenario, user_id: userId });
  if (error) throw error;
}

export async function deleteScenario(id: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("saved_scenarios").delete().eq("id", id);
  if (error) throw error;
}
