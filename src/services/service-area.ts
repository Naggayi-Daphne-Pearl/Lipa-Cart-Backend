/**
 * Service area enforcement for Lipa-Cart deliveries.
 *
 * We deliver within a fixed radius of central Kampala. The frontend already
 * shows a warning when a customer drops a pin outside this area, but the
 * backend MUST also enforce it so a malicious / outdated client can't slip an
 * out-of-area order through. Coordinates that are missing or obviously
 * placeholder (0,0) are treated as out-of-area.
 */

// Centered roughly on Kampala CBD (Old Taxi Park).
export const SERVICE_AREA_CENTER = {
  lat: 0.3136,
  lng: 32.5811,
};

export const SERVICE_AREA_RADIUS_KM = 15;

const EARTH_RADIUS_KM = 6371;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Great-circle distance between two coordinates in kilometres (haversine).
 */
export function distanceFromKampalaKm(lat: number, lng: number): number {
  const dLat = toRadians(lat - SERVICE_AREA_CENTER.lat);
  const dLng = toRadians(lng - SERVICE_AREA_CENTER.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(SERVICE_AREA_CENTER.lat)) *
      Math.cos(toRadians(lat)) *
      Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

export interface ServiceAreaCheck {
  ok: boolean;
  reason?: string;
  distanceKm?: number;
}

/**
 * Validate that a coordinate pair is inside the delivery area. Treats null,
 * undefined, NaN, and (0, 0) as out-of-area — these are sentinel values our
 * client uses when it failed to acquire a real GPS fix.
 */
export function checkServiceArea(
  lat: number | null | undefined,
  lng: number | null | undefined,
): ServiceAreaCheck {
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return {
      ok: false,
      reason: 'Delivery address is missing GPS coordinates. Please pin your location on the map.',
    };
  }
  if (lat === 0 && lng === 0) {
    return {
      ok: false,
      reason: 'Delivery address has invalid GPS coordinates. Please pin your location on the map.',
    };
  }
  const distanceKm = distanceFromKampalaKm(lat, lng);
  if (distanceKm > SERVICE_AREA_RADIUS_KM) {
    return {
      ok: false,
      distanceKm,
      reason: `We currently only deliver within ${SERVICE_AREA_RADIUS_KM} km of Kampala. Your address is ${distanceKm.toFixed(1)} km away.`,
    };
  }
  return { ok: true, distanceKm };
}
