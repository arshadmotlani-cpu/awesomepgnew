import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { geocodeOfficeLocationQuery } from '@/src/workforce/lib/geocodeOfficeLocation';
import {
  geolocationErrorMessage,
  readCurrentGeolocation,
} from '@/src/workforce/lib/geolocationClient';

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

describe('Office location geocoding', () => {
  it('successful geocoding result populates coordinates', async () => {
    const mockFetch = async () =>
      ({
        ok: true,
        json: async () => [
          {
            display_name: 'Shabana Makeup, Nagpur, Maharashtra, India',
            lat: '21.145800',
            lon: '79.088200',
          },
        ],
      }) as Response;

    const result = await geocodeOfficeLocationQuery('Shabana Makeup Nagpur', mockFetch);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.results.length, 1);
    assert.equal(result.results[0]?.lat, 21.1458);
    assert.equal(result.results[0]?.lon, 79.0882);
  });

  it('no-result/error handling', async () => {
    const emptyFetch = async () =>
      ({
        ok: true,
        json: async () => [],
      }) as Response;
    const empty = await geocodeOfficeLocationQuery('nowhere-xyz-abc', emptyFetch);
    assert.equal(empty.ok, false);
    if (empty.ok) return;
    assert.match(empty.error, /No matching location found/);

    const short = await geocodeOfficeLocationQuery('ab');
    assert.equal(short.ok, false);
    if (short.ok) return;
    assert.match(short.error, /3 characters/);

    const badFetch = async () =>
      ({
        ok: false,
        json: async () => [],
      }) as Response;
    const failed = await geocodeOfficeLocationQuery('For Your Hair Nagpur', badFetch);
    assert.equal(failed.ok, false);
  });

  it('form uses server geocode route instead of direct Nominatim', () => {
    const form = read('src/workforce/components/attendance/OfficeLocationSettingsForm.tsx');
    assert.match(form, /\/fyh\/api\/office-location\/geocode/);
    assert.doesNotMatch(form, /nominatim\.openstreetmap\.org/);
    assert.match(form, /searchError/);
    assert.match(form, /searching \|\| searchQuery/);
  });
});

describe('Office location current GPS', () => {
  it('current-location success', async () => {
    const geolocation = {
      getCurrentPosition: (success: PositionCallback) => {
        success({
          coords: {
            latitude: 21.146,
            longitude: 79.088,
            accuracy: 12,
          },
        } as GeolocationPosition);
      },
    };

    const result = await readCurrentGeolocation(geolocation);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.lat, 21.146);
    assert.equal(result.lng, 79.088);
  });

  it('geolocation permission/error handling', async () => {
    assert.match(geolocationErrorMessage(1), /permission denied/i);
    assert.match(geolocationErrorMessage(2), /Could not determine/i);
    assert.match(geolocationErrorMessage(3), /timed out/i);

    const geolocation = {
      getCurrentPosition: (_success: PositionCallback, error?: PositionErrorCallback | null) => {
        error?.({ code: 1, message: 'denied' } as GeolocationPositionError);
      },
    };

    const denied = await readCurrentGeolocation(geolocation);
    assert.equal(denied.ok, false);
    if (denied.ok) return;
    assert.match(denied.error, /permission denied/i);

    const form = read('src/workforce/components/attendance/OfficeLocationSettingsForm.tsx');
    assert.match(form, /readCurrentGeolocation/);
    assert.match(form, /locationMessage/);
    assert.match(form, /locating/);
  });
});

describe('Office location tenant-scoped save', () => {
  it('save action requires manage_office and passes tenant context', () => {
    const actions = read('src/workforce/actions/attendance.ts');
    assert.match(actions, /attendance\.manage_office/);
    assert.match(actions, /getTenantContextForPage/);
    assert.match(actions, /updateOfficeLocationConfig\([\s\S]*ctx/);

    const route = read('app/(hair)/fyh/api/office-location/geocode/route.ts');
    assert.match(route, /attendance\.manage_office/);
    assert.match(route, /employeeHasPermission/);
  });

  it('geocode service sends required User-Agent server-side', () => {
    const lib = read('src/workforce/lib/geocodeOfficeLocation.ts');
    assert.match(lib, /User-Agent/);
    assert.match(lib, /nominatim\.openstreetmap\.org/);
  });
});

describe('Office location map preview', () => {
  it('selected coordinates update embedded map marker', () => {
    const form = read('src/workforce/components/attendance/OfficeLocationSettingsForm.tsx');
    assert.match(form, /marker=\$\{latNum\}/);
    assert.match(form, /applyCoordinates/);
  });
});
