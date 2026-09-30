import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Star, Check, X, EyeOff, ExternalLink, ShieldCheck, MessageSquareQuote } from "lucide-react";
import { Button, EmptyState } from "../components/ui";
import { useToast } from "../components/Layout";
import { getSupabaseClient } from "../lib/supabaseClient";
import dayjs from "../lib/day";

// Review Approvals — Special Access (platform owner only, can_platform_write).
// Client dashboards link every user to the public /reviews form; signed-in
// submissions are stamped with who and where they came from (0034) and queue
// here, invisible to the public, until published to the site's Reviews page.

const STARS = [1, 2, 3, 4, 5];

function Stars({ n, className = "text-accent" }) {
  return (
    <span className={`inline-flex gap-0.5 ${className}`}>
      {STARS.map((i) => (
        <Star key={i} className={`h-4 w-4 ${i <= n ? "fill-current" : "text-sand"}`} />
      ))}
    </span>
  );
}

export default function ReviewApprovals() {
  const toast = useToast();
  const [queue, setQueue] = useState(null); // approved = false
  const [live, setLive] = useState(null); // approved = true
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    const sb = getSupabaseClient();
    const [q, l] = await Promise.all([
      sb.from("site_reviews").select("*").eq("approved", false).order("created_at", { ascending: true }),
      // published_at arrives with migration 0034; fall back to created_at so
      // the page still works if it hasn't been applied yet.
      sb
        .from("site_reviews")
        .select("*")
        .eq("approved", true)
        .order("published_at", { ascending: false, nullsFirst: false })
        .limit(30)
        .then((r) => (r.error ? sb.from("site_reviews").select("*").eq("approved", true).order("created_at", { ascending: false }).limit(30) : r)),
    ]);
    setQueue(q.data || []);
    setLive(l.data || []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (r, approved) => {
    setBusyId(r.id);
    try {
      const sb = getSupabaseClient();
      const { error } = await sb.from("site_reviews").update({ approved }).eq("id", r.id);
      if (error) throw error;
      toast({
        title: approved ? "Review published 🌟" : "Review removed",
        description: approved
          ? `${r.name}'s review is now live on the public Reviews page.`
          : `${r.name}'s review is no longer public.`,
      });
      await load();
    } catch (err) {
      toast({ title: "Couldn't update", description: err.message || "Only the platform team can moderate reviews." });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="max-w-4xl">
      <div className="flex items-center gap-2 mb-1">
        <ShieldCheck className="w-4 h-4 text-brand" />
        <p className="text-[11px] font-medium text-brand uppercase tracking-wide">Special Access</p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
        <h1 className="text-2xl font-heading font-bold text-cocoa">Review Approvals</h1>
        <Link
          to="/reviews"
          className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-brand hover:underline"
        >
          <ExternalLink className="w-3.5 h-3.5" /> Open public Reviews page
        </Link>
      </div>
      <p className="text-sm text-taupe mt-1 mb-6">
        Reviews submitted from client dashboards and the public form queue here. Nothing appears on
        the site until you publish it.
      </p>

      {/* ================= QUEUE ================= */}
      <div className="bg-white rounded-3xl shadow-card border border-sand/60 p-5 mb-6">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-cocoa mb-4">
          <MessageSquareQuote className="w-4 h-4 text-brand" /> In the queue
          <span className="text-[10px] font-bold uppercase tracking-wide text-accent-dark bg-accent/20 border border-accent/50 rounded-full px-2 py-0.5">
            {queue?.length ?? "…"}
          </span>
        </h2>
        {queue === null ? (
          <p className="text-sm text-taupe py-6 text-center">Loading…</p>
        ) : queue.length === 0 ? (
          <EmptyState>Nothing waiting — every submitted review has been handled.</EmptyState>
        ) : (
          <div className="space-y-4">
            {queue.map((r) => (
              <div key={r.id} className="rounded-2xl border border-sand/70 bg-cream/60 p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <Stars n={r.rating} />
                    <p className="mt-2 text-sm leading-relaxed text-mocha">"{r.text}"</p>
                  </div>
                  <div className="flex gap-2 flex-none">
                    <Button size="sm" onClick={() => act(r, true)} disabled={busyId === r.id}>
                      <Check className="w-4 h-4" /> Publish
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => act(r, false)} disabled={busyId === r.id}>
                      <X className="w-4 h-4" /> Discard
                    </Button>
                  </div>
                </div>
                <p className="mt-3 text-xs text-taupe">
                  <b className="text-cocoa">{r.name}</b>
                  {r.role && ` · ${r.role}`}
                  {r.org && ` · ${r.org}`}
                  {` · submitted ${dayjs(r.created_at).format("MMM D, YYYY")}`}
                  {r.submitter_user_id && (
                    <span className="ml-1 rounded bg-mint/60 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-teal">
                      via client dashboard
                    </span>
                  )}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ================= LIVE ================= */}
      <div className="bg-white rounded-3xl shadow-card border border-sand/60 p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-cocoa mb-4">
          <Star className="w-4 h-4 text-brand" /> Live on the site
          <span className="text-[10px] font-bold uppercase tracking-wide text-teal bg-mint/70 border border-teal/30 rounded-full px-2 py-0.5">
            {live?.length ?? "…"}
          </span>
        </h2>
        {live === null ? (
          <p className="text-sm text-taupe py-6 text-center">Loading…</p>
        ) : live.length === 0 ? (
          <EmptyState>Nothing published yet.</EmptyState>
        ) : (
          <div className="divide-y divide-sand/60">
            {live.map((r) => (
              <div key={r.id} className="flex items-start gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <Stars n={r.rating} className="text-accent scale-90 origin-left" />
                  <p className="mt-1 text-sm text-mocha line-clamp-2">"{r.text}"</p>
                  <p className="mt-1 text-xs text-taupe">
                    <b className="text-cocoa">{r.name}</b>
                    {r.org && ` · ${r.org}`}
                    {r.published_at && ` · published ${dayjs(r.published_at).format("MMM D, YYYY")}`}
                  </p>
                </div>
                <Button variant="outline" size="sm" className="flex-none" onClick={() => act(r, false)} disabled={busyId === r.id}>
                  <EyeOff className="w-4 h-4" /> Unpublish
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
