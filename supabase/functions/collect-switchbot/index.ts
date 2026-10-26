import { createHandler } from './collector.ts';

const env = (name: string) => Deno.env.get(name) ?? '';
let databaseKey = env('SUPABASE_SERVICE_ROLE_KEY');
if (!databaseKey) {
  try { databaseKey = JSON.parse(env('SUPABASE_SECRET_KEYS') || '{}').default ?? ''; } catch { /* Handler reports missing configuration. */ }
}
const ids = env('SWITCHBOT_DEVICE_IDS').split(',').map((s) => s.trim()).filter(Boolean);
Deno.serve(createHandler({
  token: env('SWITCHBOT_TOKEN'), secret: env('SWITCHBOT_SECRET'),
  collectorToken: env('COLLECTOR_TOKEN'),
  supabaseUrl: env('SUPABASE_URL'), databaseKey,
  deviceIds: ids.length ? ids : undefined,
}));
