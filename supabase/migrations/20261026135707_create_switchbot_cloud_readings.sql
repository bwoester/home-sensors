create table public.switchbot_cloud_readings (
  id bigint generated always as identity primary key,
  device_id text not null,
  device_type text not null,
  received_at timestamptz not null,
  poll_slot timestamptz not null,
  measured_at timestamptz,
  payload_version smallint not null default 1,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  constraint switchbot_cloud_readings_device_slot_key unique (device_id, poll_slot)
);

create index switchbot_cloud_readings_received_at_idx
  on public.switchbot_cloud_readings (received_at desc);

alter table public.switchbot_cloud_readings enable row level security;
revoke all on public.switchbot_cloud_readings from anon, authenticated;
revoke all on sequence public.switchbot_cloud_readings_id_seq from anon, authenticated;
grant select, insert on public.switchbot_cloud_readings to service_role;
grant usage on sequence public.switchbot_cloud_readings_id_seq to service_role;

comment on table public.switchbot_cloud_readings is
  'Successful SwitchBot Cloud status responses. Payload is complete decoded JSON; no field normalization at ingestion.';
comment on column public.switchbot_cloud_readings.measured_at is
  'Unknown for initial cloud polling. Do not substitute received_at for a sensor measurement timestamp.';
comment on column public.switchbot_cloud_readings.poll_slot is
  'UTC two-minute polling window used for idempotent inserts; not a sensor measurement timestamp.';
