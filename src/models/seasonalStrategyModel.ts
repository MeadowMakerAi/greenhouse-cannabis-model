import { MONTH_LONG } from "../utils/formatting";

export interface SeasonalContext {
  month: number;
  outdoorDLI: number;
  flowerWindowDLI: number;
  meanTempF: number;
  designWetBulbF: number;
  designDewPointF: number;
  shadeActive: boolean;
  co2Enabled: boolean;
  hpsSelected: boolean;
  highDLITarget: boolean;
}

export interface SeasonalStrategy {
  month: number;
  monthLabel: string;
  bullets: string[];
}

export function seasonalStrategy(ctx: SeasonalContext): SeasonalStrategy {
  const bullets: string[] = [];
  const m = ctx.month;
  const winter = m <= 1 || m === 11;
  const shoulder = (m >= 2 && m <= 4) || (m >= 8 && m <= 10);
  const summer = m >= 5 && m <= 7;

  if (winter) {
    bullets.push("Natural DLI is the limiting factor — supplemental lighting drives flower quality.");
    bullets.push("Lighting waste heat usefully offsets envelope heating demand.");
    bullets.push("Greenhouses still trap moisture in winter; dehumidification remains essential.");
    bullets.push("Cold envelope surfaces drive condensation risk — manage night setpoints carefully.");
  }
  if (shoulder) {
    bullets.push("Strong production window — moderate supplemental lighting required.");
    bullets.push("Cool nights can spike RH; dehumidification stays important especially in late flower.");
  }
  if (summer) {
    bullets.push("Natural DLI is high — shade likely needed to reduce solar heat gain.");
    bullets.push(`Wet-bulb design ~${ctx.designWetBulbF.toFixed(0)}°F limits evaporative cooling reach.`);
    bullets.push("Mechanical dehumidification is critical in flower; botrytis/PM risk is elevated.");
    bullets.push("CO₂ enrichment is only practical in sealed/semi-sealed operating windows.");
  }

  if (ctx.hpsSelected && summer) {
    bullets.push("HPS adds large heat load in summer — expect cooling/dehumidification penalty.");
  }
  if (ctx.highDLITarget && !ctx.co2Enabled) {
    bullets.push("Aggressive DLI without CO₂ enrichment risks diminishing returns and stress.");
  }
  if (ctx.shadeActive) {
    bullets.push("Shade reduces both solar heat gain and natural DLI — supplemental light may need to compensate.");
  }

  return { month: m, monthLabel: MONTH_LONG[m], bullets };
}
