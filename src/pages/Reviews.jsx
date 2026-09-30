import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Star, Quote, Plus, PencilLine, Clock } from "lucide-react";
import { Button, Input, Textarea, Label } from "../components/ui";
import { useToast } from "../components/Layout";
import { getSupabaseClient } from "../lib/supabaseClient";
import { auth } from "../lib/db";

// Subscriber reviews — public social proof fed by real client users.
// Anyone may submit (moderated: only approved reviews render); signed-in
// FleetFlow users can submit straight into the pending queue with their
// organization attached.

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

export default function Reviews() {
  const toast = useToast();
  const location = useLocation();
  const [reviews, setReviews] = useState(null);
  const [form, setForm] = useState({ name: "", org: "", role: "", rating: 5, text: "" });
  const [sending, setSending] = useState(false);
  const [me, setMe] = useState(null);   // signed-in client user (prefill + attribution)
  const [mine, setMine] = useState(null); // this user's own review incl. pending (RLS: own rows only)

  const load = async () => {
    const sb = getSupabaseClient();
    const { data } = await sb
      .from("site_reviews")
      .select("*")
      .eq("approved", true)
      .order("created_at", { ascending: false })
      .limit(24);
    setReviews(data || []);
  };

  useEffect(() => {
    (async () => {
      // Dashboards deep-link here (state.scrollToForm) after a successful save;
      // signed-in users get their name/org/role prefilled and their review
      // stamped with who they are server-side (0034 trigger).
      const u = await auth.currentUser();
      if (u) {
        setMe(u);
        setForm((f) => ({
          ...f,
          name: u.full_name || f.name,
          org: u.org_name || f.org,
          role: u.role || f.role,
        }));
        const sb = getSupabaseClient();
        const { data: own, error: ownErr } = await sb
          .from("site_reviews")
          .select("id, rating, text, approved, created_at")
          .eq("submitter_user_id", u.id)
          .order("created_at", { ascending: false })
          .limit(1);
        if (!ownErr && own?.length) setMine(own[0]);
      }
      await load();
      if (location.state?.scrollToForm) {
        setTimeout(
          () => document.getElementById("share-review")?.scrollIntoView({ behavior: "smooth", block: "start" }),
          150
        );
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.text.trim() || !form.name.trim()) {
      toast({ title: "Add your name and a few words" });
      return;
    }
    setSending(true);
    try {
      const sb = getSupabaseClient();
      // Snapshot for the moderation queue; the DB trigger re-stamps these
      // from the session so they can't be spoofed (0034). If 0034 hasn't
      // been applied yet, retry without the attribution keys so the form
      // still works — only the queue badge is lost, never the submission.
      let { error } = await sb
        .from("site_reviews")
        .insert({
          name: form.name.trim(),
          org: form.org.trim() || null,
          role: form.role.trim() || null,
          rating: form.rating,
          text: form.text.trim(),
          approved: false,
          submitter_org: form.org.trim() || null,
          submitter_role: form.role.trim() || null,
        });
      if (error && /column|schema/i.test(error.message || "")) {
        ({ error } = await sb.from("site_reviews").insert({
          name: form.name.trim(),
          org: form.org.trim() || null,
          role: form.role.trim() || null,
          rating: form.rating,
          text: form.text.trim(),
          approved: false,
        }));
      }
      if (error) throw error;
      toast({
        title: "Thank you! 🌟",
        description: "Received! Your review is queued for the FleetFlow team's approval before it appears on the site.",
      });
      setForm((f) => ({ ...f, text: "" }));
      const u = await auth.currentUser();
      if (u) {
        const { data: own } = await sb
          .from("site_reviews")
          .select("id, rating, text, approved, created_at")
          .eq("submitter_user_id", u.id)
          .order("created_at", { ascending: false })
          .limit(1);
        if (own?.length) setMine(own[0]);
      }
    } catch (err) {
      toast({ title: "Couldn't submit", description: err.message || "Try again later." });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-sand/60 bg-cream/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2.5">
            <img src="/logo.svg" alt="" className="h-9 w-9 rounded-xl" />
            <span className="font-heading text-lg font-bold text-cocoa">FleetFlow</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link to="/pricing" className="px-3 text-xs font-bold uppercase tracking-wide text-cocoa hover:text-brand">
              Pricing
            </Link>
            <Link to="/register" className="inline-flex h-10 items-center justify-center rounded-lg bg-brand px-4 text-xs font-bold uppercase tracking-wide text-white hover:bg-brand-dark">
              Get started
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-20 pt-12">
        <section className="text-center">
          <p className="mb-3 inline-flex items-center rounded-full bg-mint px-3 py-1 text-xs font-bold uppercase tracking-wide text-brand">
            Subscriber reviews
          </p>
          <h1 className="font-heading text-4xl font-extrabold text-cocoa">
            What teams say after switching
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm text-mocha">
            Front desks, drivers and supervisors — in their own words.
          </p>
        </section>

        <section className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {reviews === null && <p className="text-sm text-taupe">Loading reviews…</p>}
          {reviews?.length === 0 && (
            <div className="col-span-full rounded-3xl border border-sand/60 bg-white p-10 text-center shadow-card">
              <Quote className="mx-auto h-10 w-10 text-sand" />
              <p className="mt-3 font-heading font-bold text-cocoa">Be the first to share</p>
              <p className="mt-1 text-sm text-mocha">
                Using FleetFlow? Tell other teams what changed for you — the form is below.
              </p>
            </div>
          )}
          {reviews?.map((r) => (
            <figure key={r.id} className="flex flex-col rounded-3xl bg-white p-6 shadow-card border border-sand/60">
              <Stars n={r.rating} />
              <blockquote className="mt-3 flex-1 text-sm leading-relaxed text-mocha">
                "{r.text}"
              </blockquote>
              <figcaption className="mt-4 text-sm">
                <span className="font-semibold text-cocoa">{r.name}</span>
                {r.role && <span className="text-taupe"> · {r.role}</span>}
                {r.org && <span className="block text-xs text-taupe">{r.org}</span>}
              </figcaption>
            </figure>
          ))}
        </section>

        <section
          id="share-review"
          className="mx-auto mt-14 max-w-2xl rounded-3xl bg-white p-8 shadow-card border border-sand/60 scroll-mt-20"
        >
          <h2 className="flex items-center gap-2 font-heading text-xl font-bold text-cocoa">
            <Plus className="h-5 w-5 text-brand" /> Share your experience
          </h2>
          <p className="mt-1 text-xs text-taupe mb-5">
            {me
              ? `Submitting as ${me.full_name || me.email}${me.role ? ` · ${me.role}` : ""} — reviews are approved by the FleetFlow team before publishing.`
              : "Reviews are moderated before publishing. Keep it honest — good or bad."}
          </p>
          {mine && !mine.approved && (
            <div className="mb-5 flex items-start gap-2.5 rounded-2xl bg-gold/10 border border-gold/30 px-4 py-3">
              <Clock className="h-4 w-4 text-accent-dark mt-0.5 flex-none" />
              <p className="text-xs leading-relaxed text-mocha">
                <b className="text-cocoa">Your review is in the approval queue.</b> It's visible only
                to you and the FleetFlow team until it's approved and published.
              </p>
            </div>
          )}
          {mine?.approved && (
            <div className="mb-5 flex items-start gap-2.5 rounded-2xl bg-mint/60 border border-teal/30 px-4 py-3">
              <PencilLine className="h-4 w-4 text-teal mt-0.5 flex-none" />
              <p className="text-xs leading-relaxed text-mocha">
                <b className="text-cocoa">Your review is live on this page.</b> Share another any time —
                your latest one is the one queued for approval.
              </p>
            </div>
          )}
          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Name *</Label>
                <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Juan D." />
              </div>
              <div className="space-y-1.5">
                <Label>Company</Label>
                <Input value={form.org} onChange={(e) => setForm((f) => ({ ...f, org: e.target.value }))} placeholder="Madison Suites" />
              </div>
              <div className="space-y-1.5">
                <Label>Role</Label>
                <Input value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} placeholder="Front Office" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Rating</Label>
              <div className="flex gap-1">
                {STARS.map((i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, rating: i }))}
                    className="p-0.5"
                  >
                    <Star className={`h-7 w-7 ${i <= form.rating ? "fill-current text-accent" : "text-sand"}`} />
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Your review *</Label>
              <Textarea
                rows={4}
                value={form.text}
                onChange={(e) => setForm((f) => ({ ...f, text: e.target.value }))}
                placeholder="What changed for your team since switching?"
              />
            </div>
            <Button variant="primary" type="submit" disabled={sending}>
              {sending ? "Sending…" : "Submit review"}
            </Button>
          </form>
        </section>
      </main>

      <footer className="border-t border-sand/70 py-8 text-center text-xs text-taupe">
        <Link to="/privacy" className="mr-4 hover:text-brand">Privacy</Link>
        <Link to="/pricing" className="mr-4 hover:text-brand">Pricing</Link>
        <Link to="/" className="hover:text-brand">Home</Link>
      </footer>
    </div>
  );
}
