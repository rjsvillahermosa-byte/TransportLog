-- 0033 — Approval email notifications (requires the notify-email Edge Function)
-- ---------------------------------------------------------------------------
-- Database triggers notify via Edge Function so emails fire regardless of
-- which surface made the change: web console, native app, or SQL editor.
--
--   * AFTER INSERT on organization_members, status = 'Pending'
--       → notify the org's Active admins ("someone is waiting")
--   * AFTER UPDATE, status Pending→Active
--       → welcome email to the member
--
-- Delivery model: the trigger INSERTs into approval_email_queue; a separate
-- pg_net step POSTs to the function. pg_net is async by design so a slow or
-- failed HTTP call NEVER blocks or rolls back the member change.
-- Requires: `create extension if not exists pg_net;` (Supabase supports it).
--
-- Secrets to set (Dashboard → Edge Functions → Secrets):
--   RESEND_API_KEY, NOTIFY_SECRET, NOTIFY_FROM_EMAIL (optional)
-- Then deploy: supabase functions deploy notify-email --no-verify-jwt
-- ---------------------------------------------------------------------------

-- pg_net for async HTTP from triggers
create extension if not exists pg_net;

-- 1) Queue table: the trigger's write, the edge-function invoker's read ------
create table if not exists public.approval_email_queue (
  id            uuid primary key default gen_random_uuid(),
  membership_id uuid not null,
  email_type    text not null check (email_type in ('pending_approval','member_approved')),
  created_at    timestamptz not null default now(),
  processed_at  timestamptz
);
alter table public.approval_email_queue enable row level security;
-- RLS: no policies on purpose. Written by SECURITY DEFINER triggers, read by
-- the service-role invoker. Clients can't touch the queue at all.

-- 2) Trigger: queue the right email type on insert / approval ----------------
create or replace function public.queue_approval_email()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' and new.status = 'Pending' then
    insert into public.approval_email_queue (membership_id, email_type)
    values (new.id, 'pending_approval');
  elsif tg_op = 'UPDATE' and old.status = 'Pending' and new.status = 'Active' then
    insert into public.approval_email_queue (membership_id, email_type)
    values (new.id, 'member_approved');
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists trg_queue_approval_email on public.organization_members;
create trigger trg_queue_approval_email
  after insert or update of status on public.organization_members
  for each row execute function public.queue_approval_email();

-- 3) Sender: pg_net POST to the Edge Function for each unprocessed row ------
-- Set your function's shared secret here (same value as the NOTIFY_SECRET
-- secret) so the endpoint only accepts these calls:
create or replace function public.send_queued_approval_emails()
returns integer
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_secret text;
  v_count  integer := 0;
  r        record;
begin
  v_secret := current_setting('app.notify_secret', true);
  if coalesce(v_secret, '') = '' then
    raise notice 'Set app.notify_secret first: alter database ... set app.notify_secret = ''...''';
    return 0;
  end if;

  for r in
    select id, membership_id, email_type from public.approval_email_queue
    where processed_at is null
    order by created_at
    limit 20
  loop
    perform net.http_post(
      url := 'https://yhdvfjkfzrgcrzstnpti.supabase.co/functions/v1/notify-email',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-notify-secret', v_secret,
        'Authorization', 'Bearer ' || current_setting('app.notify_anon', true)
      ),
      body := jsonb_build_object(
        'type', r.email_type,
        'membership_id', r.membership_id
      )
    );
    update public.approval_email_queue set processed_at = now() where id = r.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

-- 4) Fire the sender automatically every minute via pg_cron if available;
-- otherwise schedule send_queued_approval_emails() from Dashboard → Cron
-- (Integrations → Cron), or call it manually in the SQL editor after
-- approving someone:
create or replace function public.try_schedule_approval_sweeper()
returns void language plpgsql as $fn$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'approval-email-sweeper',
      '* * * * *',
      -- distinct dollar-quote tag: a nested $$ would close the outer body early
      $cmd$select public.send_queued_approval_emails();$cmd$
    );
  else
    raise notice 'pg_cron not available - schedule send_queued_approval_emails() via Dashboard → Cron.';
  end if;
end $fn$;
select public.try_schedule_approval_sweeper();

-- ---------------------------------------------------------------------------
-- VERIFY:
--   insert into approval_email_queue (membership_id, email_type)
--     values ('<a real membership id>', 'member_approved');
--   select public.send_queued_approval_emails();   -- returns 1
--   -- Edge Function logs: Dashboard → Edge Functions → notify-email → Logs
--   select * from approval_email_queue order by created_at desc limit 5;
-- ---------------------------------------------------------------------------
