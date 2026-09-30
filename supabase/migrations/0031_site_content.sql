-- 0031 — Site content CMS (Site Editor) for the public landing & pricing
-- ---------------------------------------------------------------------------
-- Marketing copy is data, not code: the platform owner edits every block of
-- the landing and pricing pages in the app (Special Access → Site Editor),
-- and the public pages read the saved doc at render time.
-- * one row per page key ('landing', 'pricing'), value = full JSON document
-- * anon can SELECT (it's the public marketing copy — nothing sensitive)
-- * only the platform owner / platform admins can write (0029 can_platform_write)
-- Idempotent. Defaults live in the app (fail-open), so an empty table still
-- renders the shipped copy.
-- ---------------------------------------------------------------------------

create table if not exists public.site_content (
  key        text primary key check (key in ('landing','pricing')),
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.site_content enable row level security;

drop policy if exists "site_content public read" on public.site_content;
create policy "site_content public read" on public.site_content
  for select using (true);

drop policy if exists "site_content owner write" on public.site_content;
create policy "site_content owner write" on public.site_content
  for all using (public.can_platform_write())
  with check (public.can_platform_write());

-- ---------------------------------------------------------------------------
-- VERIFY:
--   select key, jsonb_object_keys(value) from site_content;  -- after first save
--   -- anon: GET /rest/v1/site_content  → rows readable
--   -- client admin: PATCH → 42501-ish denial (only platform owner writes)
-- ---------------------------------------------------------------------------
