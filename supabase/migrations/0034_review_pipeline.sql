-- 0034 — Client review pipeline (dashboard → moderation → public page)
-- ---------------------------------------------------------------------------
-- Flow: every client dashboard gets a "share your experience" card linking to
-- the public /reviews form. Signed-in submissions are stamped with who and
-- where they came from (trigger, not client input — can't be spoofed), stay
-- invisible publicly until the platform owner publishes them from
-- Special Access → Review Approvals (/review-approvals).
-- * submitter_user_id / submitter_org / submitter_role: attribution snapshot
--   taken server-side from the session + org membership at insert time.
-- * published_at: set when approved flips to true (audit-friendly).
-- * RLS: public sees approved only (unchanged); the submitter may read their
--   own pending review ("in review" state on the dashboard/public form).
-- Idempotent. Run in the SQL editor.
-- ---------------------------------------------------------------------------

-- 1) Attribution + audit columns ---------------------------------------------
alter table public.site_reviews
  add column if not exists submitter_user_id uuid references auth.users(id) on delete set null,
  add column if not exists submitter_org    text,
  add column if not exists submitter_role   text,
  add column if not exists published_at     timestamptz;

-- 2) Stamp attribution server-side at insert ---------------------------------
create or replace function public.set_site_review_attribution()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org text;
begin
  -- Only stamp when the caller is a signed-in user and hasn't been set.
  if new.submitter_user_id is null and auth.uid() is not null then
    new.submitter_user_id := auth.uid();

    if new.submitter_role is null then
      select p.role into new.submitter_role
        from public.profiles p
       where p.id = auth.uid();
    end if;

    if new.submitter_org is null then
      select o.name into v_org
        from public.organization_members m
        join public.organizations o on o.id = m.organization_id
       where m.user_id = auth.uid()
         and m.status = 'Active'
       order by m.joined_at
       limit 1;
      new.submitter_org := v_org;  -- null for platform-side accounts: fine
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_site_reviews_attribution on public.site_reviews;
create trigger trg_site_reviews_attribution
  before insert on public.site_reviews
  for each row execute function public.set_site_review_attribution();

-- 3) Keep published_at in sync with approved ---------------------------------
create or replace function public.set_site_review_published_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.approved and new.published_at is null then
    new.published_at := now();
  elsif not new.approved then
    new.published_at := null;   -- unpublished: clear the audit stamp
  end if;
  return new;
end $$;

drop trigger if exists trg_site_reviews_published_at on public.site_reviews;
create trigger trg_site_reviews_published_at
  before update of approved on public.site_reviews
  for each row execute function public.set_site_review_published_at();

-- 4) RLS: submitters can see their own (pending) review -----------------------
drop policy if exists "site_reviews own pending read" on public.site_reviews;
create policy "site_reviews own pending read" on public.site_reviews
  for select using (submitter_user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- VERIFY:
--   -- anon insert → submitter_user_id null (still submittable, policy unchanged)
--   -- signed-in insert → row carries uid + org name + role automatically
--   -- signed-in: GET /rest/v1/site_reviews?submitter_user_id=eq.<own> → own
--   --   pending row visible; other pending rows NOT visible
--   -- platform owner: PATCH approved=true from /review-approvals → appears
--   --   publicly with published_at stamped
-- ---------------------------------------------------------------------------
