type JsonObject = Record<string, unknown>;
type Device = { deviceId: string; deviceType: string };
export type Config = {
  token: string; secret: string; collectorToken: string;
  supabaseUrl: string; databaseKey: string; deviceIds?: string[];
};

const supported = new Set(['Meter', 'MeterPlus', 'Meter Plus', 'Meter Plus (US)', 'Meter Plus (JP)', 'Hub 2']);
const json = (body: unknown, status = 200) => Response.json(body, { status });
const object = (v: unknown): v is JsonObject => v !== null && typeof v === 'object' && !Array.isArray(v);

export async function signHeaders(token: string, secret: string, time: string, nonce: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(token + time + nonce)));
  return { Authorization: token, t: time, nonce, sign: btoa(String.fromCharCode(...signature)), 'Content-Type': 'application/json' };
}

async function matches(actual: string, expected: string) {
  const enc = new TextEncoder();
  const digest = async (s: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s)));
  const [a, b] = await Promise.all([digest(actual), digest(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export function createHandler(config: Config, fetcher: typeof fetch = fetch, now = () => new Date()) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
    if (!config.collectorToken) return json({ error: 'missing_collector_secret' }, 503);
    if (!await matches(request.headers.get('x-collector-token') ?? '', config.collectorToken)) {
      return json({ error: 'unauthorized' }, 401);
    }
    if (!config.token || !config.secret || !config.databaseKey || !config.supabaseUrl) {
      return json({ error: 'missing_configuration' }, 503);
    }
    const started = now();
    const pollSlot = new Date(Math.floor(started.getTime() / 120_000) * 120_000).toISOString();
    async function get(path: string): Promise<JsonObject> {
      const headers = await signHeaders(config.token, config.secret, String(now().getTime()), crypto.randomUUID());
      const response = await fetcher('https://api.switch-bot.com/v1.1' + path, {
        headers, signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error('switchbot_http_' + response.status);
      const payload: unknown = await response.json();
      if (!object(payload) || payload.statusCode !== 100) throw new Error('switchbot_api_error');
      return payload;
    }
    try {
      const listing = await get('/devices');
      if (!object(listing.body) || !Array.isArray(listing.body.deviceList)) throw new Error('invalid_device_list');
      const discoveredTypes: Record<string, number> = {};
      for (const item of listing.body.deviceList) {
        if (object(item) && typeof item.deviceType === 'string') {
          discoveredTypes[item.deviceType] = (discoveredTypes[item.deviceType] ?? 0) + 1;
        }
      }
      const devices = listing.body.deviceList.filter((d): d is Device =>
        object(d) && typeof d.deviceId === 'string' && typeof d.deviceType === 'string' &&
        supported.has(d.deviceType) && (!config.deviceIds || config.deviceIds.includes(d.deviceId)));
      // 1 discovery + at most 10 status calls per poll = 7,920 calls/day.
      // No automatic retries: keep below SwitchBot's 10,000/day account quota.
      if (devices.length > 10) return json({ error: 'too_many_devices_configure_allowlist' }, 422);
      if (!devices.length) return json({ error: 'no_matching_devices' }, 422);
      const rows: JsonObject[] = [];
      let failed = 0;
      await Promise.all(devices.map(async (device) => {
        try {
          const payload = await get('/devices/' + encodeURIComponent(device.deviceId) + '/status');
          if (!object(payload.body) || payload.body.deviceId !== device.deviceId) throw new Error('invalid_device_status');
          rows.push({
            device_id: device.deviceId, device_type: device.deviceType,
            received_at: now().toISOString(), poll_slot: pollSlot,
            payload_version: 1, payload,
          });
        } catch {
          failed++;
        }
      }));
      if (rows.length) {
        const response = await fetcher(config.supabaseUrl + '/rest/v1/switchbot_cloud_readings?on_conflict=device_id,poll_slot', {
          method: 'POST',
          headers: {
            apikey: config.databaseKey, Authorization: 'Bearer ' + config.databaseKey,
            'Content-Type': 'application/json', Prefer: 'resolution=ignore-duplicates,return=minimal',
          },
          body: JSON.stringify(rows), signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) return json({ error: 'database_write_failed', status: response.status }, 502);
      }
      // Counts only: no tokens, device IDs, account metadata, or payloads in logs/responses.
      return json({ submitted: rows.length, failed, poll_slot: pollSlot, discovered_types: discoveredTypes }, failed ? 502 : 200);
    } catch {
      return json({ error: 'collection_failed' }, 502);
    }
  };
}
