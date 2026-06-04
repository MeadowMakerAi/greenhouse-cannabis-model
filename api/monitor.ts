import process from "node:process";
import { createClient } from "@supabase/supabase-js";
import { fetchForwardForecast } from "../src/services/forecastClient";
import { computeForecastRisk } from "../src/models/forecastRisk";
import type { PathogenInput } from "../src/models/pathogenModel";

// Scheduled twin job (Vercel Cron). For every monitored farm: pull the forward forecast,
// run the SAME cited pathogen model the app uses (no duplicated model), store an observation,
// and on a threshold crossing email the owner. Bearer CRON_SECRET.
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function sendAlertEmail(
  to: string,
  farmName: string,
  maxB: number,
  maxP: number,
): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key || !to) return; // delivery off until a key is configured — graceful no-op
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: process.env.ALERT_FROM ?? "Greenhouse Twin <onboarding@resend.dev>",
      to,
      subject: `Disease-pressure alert — ${farmName}`,
      text:
        `Your 7-day forecast shows elevated disease pressure at ${farmName}:\n\n` +
        `  Botrytis: ${maxB}/100\n  Powdery mildew: ${maxP}/100\n\n` +
        `Screening signal from the outdoor forecast — tighten humidity/airflow control and ` +
        `inspect. Not in-canopy risk (that depends on your climate control).`,
    }),
  }).catch(() => {
    /* delivery is best-effort; never fail the run on email */
  });
}

export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return json({ error: "Supabase env not configured" }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: farms, error } = await supabase
    .from("monitored_farms")
    .select(
      "id, user_id, name, latitude, longitude, cultivation_phase, botrytis_threshold, pm_threshold",
    );
  if (error) return json({ error: error.message }, 500);

  let observations = 0;
  let alerts = 0;
  for (const f of farms ?? []) {
    try {
      const days = await fetchForwardForecast(f.latitude, f.longitude, 7);
      const risk = computeForecastRisk(
        days,
        f.cultivation_phase as PathogenInput["cropStage"],
        f.cultivation_phase !== "vegetative",
      );
      const maxB = Math.round(
        Math.max(0, ...risk.map((d) => d.pathogen.botrytisScore)),
      );
      const maxP = Math.round(
        Math.max(0, ...risk.map((d) => d.pathogen.powderyMildewScore)),
      );
      const alerted = maxB >= f.botrytis_threshold || maxP >= f.pm_threshold;
      await supabase.from("farm_observations").insert({
        farm_id: f.id,
        user_id: f.user_id,
        max_botrytis: maxB,
        max_pm: maxP,
        alerted,
        payload: risk,
      });
      observations++;
      if (alerted) {
        alerts++;
        const { data: u } = await supabase.auth.admin.getUserById(f.user_id);
        const email = u?.user?.email;
        if (email) await sendAlertEmail(email, f.name, maxB, maxP);
      }
    } catch {
      // skip this farm; keep processing the rest
    }
  }

  return json({ ok: true, farms: (farms ?? []).length, observations, alerts });
}
