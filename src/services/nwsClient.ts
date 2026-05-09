/**
 * National Weather Service API client (api.weather.gov).
 * Used only to look up the nearest forecast office and current observations
 * for sanity-checking the long-run climate model. Not used as the primary
 * climate data source.
 *
 * Docs: https://www.weather.gov/documentation/services-web-api
 */
const NWS = "https://api.weather.gov";

export interface NWSPointMeta {
  forecastOffice: string;
  observationStations: string;
  gridId: string;
  gridX: number;
  gridY: number;
}

interface PointsResponse {
  properties: {
    forecastOffice: string;
    observationStations: string;
    gridId: string;
    gridX: number;
    gridY: number;
  };
}

export async function fetchNWSPointMeta(
  latitude: number,
  longitude: number,
  signal?: AbortSignal,
): Promise<NWSPointMeta> {
  const url = `${NWS}/points/${latitude.toFixed(4)},${longitude.toFixed(4)}`;
  const res = await fetch(url, {
    signal,
    headers: {
      "User-Agent": "greenhouse-model (cottage-grove planning, contact alxclaiborne@gmail.com)",
      Accept: "application/geo+json",
    },
  });
  if (!res.ok) throw new Error(`NWS error ${res.status}`);
  const json: PointsResponse = await res.json();
  return {
    forecastOffice: json.properties.forecastOffice,
    observationStations: json.properties.observationStations,
    gridId: json.properties.gridId,
    gridX: json.properties.gridX,
    gridY: json.properties.gridY,
  };
}
