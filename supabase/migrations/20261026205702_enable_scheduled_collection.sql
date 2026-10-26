-- Enable the scheduler and asynchronous HTTP transport.
-- Credentials and job activation remain environment-specific operations.
create extension if not exists pg_cron;
create extension if not exists pg_net;
