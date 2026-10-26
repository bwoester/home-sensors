-- Operational configuration, not a schema migration. Run after a successful manual test.
-- Enable pg_cron and pg_net in the Dashboard beforehand.
-- Vault must contain home_sensors_project_url and home_sensors_collector_token.
-- The latter must match the Edge Function secret COLLECTOR_TOKEN.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'home_sensors_project_url')
     or not exists (select 1 from vault.secrets where name = 'home_sensors_collector_token') then
    raise exception 'Required Vault secrets are missing';
  end if;
end $$;

select cron.schedule(
  'collect-switchbot-every-two-minutes',
  '*/2 * * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'home_sensors_project_url') || '/functions/v1/collect-switchbot',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-collector-token', (select decrypted_secret from vault.decrypted_secrets where name = 'home_sensors_collector_token')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 45000
  );
  $job$
);
