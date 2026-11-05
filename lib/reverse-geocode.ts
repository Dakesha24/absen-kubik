import { db } from "@/lib/db";

type ReverseResult = {
  name?: unknown;
  display_name?: unknown;
  address?: Record<string, unknown>;
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function reserveLookupSlot() {
  const rows = await db()`
    INSERT INTO geocoding_rate_limit (id, next_request_at)
    VALUES (1, NOW())
    ON CONFLICT (id) DO UPDATE SET
      next_request_at = GREATEST(NOW(), geocoding_rate_limit.next_request_at) + INTERVAL '1 second'
    WHERE geocoding_rate_limit.next_request_at <= NOW() + INTERVAL '1 second'
    RETURNING next_request_at
  `;
  if (!rows.length) return false;

  const waitMs = Math.max(0, new Date(String(rows[0].next_request_at)).getTime() - Date.now());
  if (waitMs > 2000) return false;
  if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
  return true;
}

/**
 * Resolve a coarse place label from user-requested check-in coordinates.
 * This is best-effort: a geocoder outage must never prevent a check-in.
 */
export async function reverseGeocodeLabel(latitude: number, longitude: number): Promise<string | null> {
  try {
    if (!await reserveLookupSlot()) return null;
    const endpoint = process.env.GEOCODING_REVERSE_URL?.trim() || "https://nominatim.openstreetmap.org/reverse";
    const url = new URL(endpoint);

    // Round to roughly 100 m before sending coordinates to the public geocoder.
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("lat", latitude.toFixed(3));
    url.searchParams.set("lon", longitude.toFixed(3));
    url.searchParams.set("zoom", "15");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("accept-language", "id");

    const response = await fetch(url, {
      headers: { "User-Agent": "ABSEN-KUBIK/1.0 (tutor attendance check-in)" },
      signal: AbortSignal.timeout(1800),
      next: { revalidate: 60 * 60 * 24 * 30 },
    });
    if (!response.ok) return null;

    const result = await response.json() as ReverseResult;
    const address = result.address ?? {};
    const locality = text(address.city) || text(address.town) || text(address.village) || text(address.municipality) || text(address.county) || text(address.state_district);
    const district = text(address.suburb) || text(address.city_district) || text(address.district) || text(address.neighbourhood);
    const landmark = text(result.name);
    const region = text(address.state);
    const parts = [landmark, district, locality, region].filter((part, index, list) => part && list.indexOf(part) === index);

    if (parts.length) return parts.join(", ").slice(0, 240);
    const fallback = text(result.display_name).split(",").map((part) => part.trim()).filter(Boolean).slice(-4);
    return fallback.length ? fallback.join(", ").slice(0, 240) : null;
  } catch {
    return null;
  }
}
