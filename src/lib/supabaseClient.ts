import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// The simulator runs fully standalone. The twin's account features (login + saved
// scenarios) only light up when these env vars are present, so the open-source /
// no-account experience is preserved when they're absent.
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey) : null;
