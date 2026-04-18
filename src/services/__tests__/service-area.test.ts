import {
  checkServiceArea,
  distanceFromKampalaKm,
  SERVICE_AREA_CENTER,
  SERVICE_AREA_RADIUS_KM,
} from '../service-area';

describe('distanceFromKampalaKm', () => {
  it('returns 0 for the center itself', () => {
    expect(distanceFromKampalaKm(SERVICE_AREA_CENTER.lat, SERVICE_AREA_CENTER.lng)).toBeCloseTo(
      0,
      3,
    );
  });

  it('returns a positive distance for a point nearby', () => {
    // Roughly Makerere University — a few km NW of CBD.
    const d = distanceFromKampalaKm(0.3345, 32.5695);
    expect(d).toBeGreaterThan(1);
    expect(d).toBeLessThan(5);
  });

  it('returns >15 km for a point outside the service area', () => {
    // Entebbe Airport, ~35 km south.
    expect(distanceFromKampalaKm(0.0424, 32.4435)).toBeGreaterThan(15);
  });
});

describe('checkServiceArea', () => {
  it('rejects null lat/lng', () => {
    const result = checkServiceArea(null, null);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/missing GPS/i);
  });

  it('rejects undefined coordinates', () => {
    expect(checkServiceArea(undefined, undefined).ok).toBe(false);
  });

  it('rejects NaN coordinates', () => {
    expect(checkServiceArea(NaN, NaN).ok).toBe(false);
  });

  it('rejects the (0, 0) sentinel — ocean, not Kampala', () => {
    const result = checkServiceArea(0, 0);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/invalid GPS/i);
  });

  it('accepts a point in central Kampala', () => {
    const result = checkServiceArea(SERVICE_AREA_CENTER.lat, SERVICE_AREA_CENTER.lng);
    expect(result.ok).toBe(true);
    expect(result.distanceKm).toBeCloseTo(0, 3);
  });

  it('accepts a point just inside the radius', () => {
    // ~14 km north of CBD — inside the 15 km ring.
    const result = checkServiceArea(0.44, SERVICE_AREA_CENTER.lng);
    expect(result.ok).toBe(true);
    expect(result.distanceKm).toBeDefined();
    expect(result.distanceKm!).toBeLessThan(SERVICE_AREA_RADIUS_KM);
  });

  it('rejects a point outside the radius and reports distance', () => {
    // Entebbe — well outside the 15 km ring.
    const result = checkServiceArea(0.0424, 32.4435);
    expect(result.ok).toBe(false);
    expect(result.distanceKm).toBeGreaterThan(SERVICE_AREA_RADIUS_KM);
    expect(result.reason).toMatch(/only deliver within/i);
  });
});
