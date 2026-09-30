-- 0022 — Optional region/city hint for fuel-price-watch
-- ---------------------------------------------------------------------------
-- Some sources (an official price bulletin, a news roundup) list several
-- regions' prices on one static page. Without knowing which one is yours,
-- the extraction could grab the wrong region's number. This lets an admin
-- say which one to read — passed straight into the extraction prompt by
-- the fuel-price-watch edge function. Purely a hint: if the page only ever
-- states one price, or doesn't mention this region at all, it's ignored
-- (the function falls back to whatever single price it finds, and returns
-- null — never a guessed wrong-region number — if the named region truly
-- isn't on the page).
--
-- Does NOT make an interactive/JS-driven site (a live map, a geolocation
-- prompt) scrapable — this is text sent to the extraction model, not a URL
-- parameter or a browser API call. Those sites need a different kind of
-- source page entirely; there's no way around that with a text field.

alter table public.org_settings add column if not exists fuel_price_region text;

comment on column public.org_settings.fuel_price_region is
  'Optional hint (e.g. "Metro Manila") sent to fuel-price-watch''s extraction prompt, for sources that list multiple regions on one page.';

-- ---------------------------------------------------------------------------
-- VERIFY: Settings -> Fuel Price Watch now has a Region field. Save one,
-- click Refresh Now against a multi-region source, and check
-- fuel_price_last_status mentions "for <region>".
-- ============================================================================
