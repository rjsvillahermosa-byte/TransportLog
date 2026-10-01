-- 0035 — Move notify-email's shared secret + anon key into Supabase Vault
-- ---------------------------------------------------------------------------
-- 0033's send_queued_approval_emails() read its secret and anon key via
-- current_setting('app.notify_secret' / 'app.notify_anon'), meant to be set
-- with `alter role postgres set ...`. This hosted project rejects that with
-- "permission denied to set parameter" — the exact same superuser-only
-- restriction already hit (and fixed) for fuel-price-watch's cron secret in
-- 0020/0021. Vault doesn't need superuser, so this switches the function to
-- read from there instead. No app.* GUC is needed anywhere after this.
-- ---------------------------------------------------------------------------

-- ONE-TIME SETUP — replace the two placeholders below with real values
-- BEFORE running this migration:
--   * notify_email_secret   -> same value as the NOTIFY_SECRET edge function secret
--   * notify_email_anon_key -> this project's anon key (public; see src/lib/supabaseClient.js)
select vault.create_secret(
  'REPLACE-WITH-NOTIFY_SECRET-VALUE',
  'notify_email_secret',
  'Shared secret so send_queued_approval_emails() can call notify-email.'
) where not exists (select 1 from vault.secrets where name = 'notify_email_secret');

select vault.create_secret(
  'REPLACE-WITH-ANON-KEY',
  'notify_email_anon_key',
  'Project anon key, sent as the Authorization bearer to notify-email.'
) where not exists (select 1 from vault.secrets where name = 'notify_email_anon_key');

create or replace function public.send_queued_approval_emails()
returns integer
language plpgsql security definer set search_path = public, extensions, vault
as $$
declare
  v_secret text;
  v_anon   text;
  v_count  integer := 0;
  r        record;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'notify_email_secret';
  select decrypted_secret into v_anon   from vault.decrypted_secrets where name = 'notify_email_anon_key';

  if coalesce(v_secret, '') = '' then
    raise notice 'notify_email_secret not set in Vault — skipping';
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
        'Authorization', 'Bearer ' || coalesce(v_anon, '')
      ),
      body := jsonb_build_object('type', r.email_type, 'membership_id', r.membership_id)
    );
    update public.approval_email_queue set processed_at = now() where id = r.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

-- ---------------------------------------------------------------------------
-- VERIFY (SQL editor, after filling in both secrets above and running this file):
--   select name from vault.secrets where name like 'notify_email_%';
--   -- expect both rows
--   -- then the self-test from 0033's own VERIFY block:
--   insert into approval_email_queue (membership_id, email_type)
--     values ('<a real membership id>', 'member_approved');
--   select public.send_queued_approval_emails();   -- expect 1
--   select * from approval_email_queue order by created_at desc limit 5;
-- ---------------------------------------------------------------------------
