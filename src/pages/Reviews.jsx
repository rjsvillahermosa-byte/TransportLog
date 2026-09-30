import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Star, Quote, Plus } from "lucide-react";
import { Button, Input, Textarea, Label } from "../components/ui";
import { useToast } from "../components/Layout";
import { getSupabaseClient } from "../lib/supabaseClient";

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
  const [reviews, setReviews] = useState(null);
  const [form, setForm] = useState({ name: "", org: "", role: "", rating: 5, text: "" });
  const [sending, setSending] = useState(false);

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
  useEffect(() => { load(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.text.trim() || !form.name.trim()) {
      toast({ title: "Add your name and a few words" });
      return;
    }
    setSending(true);
    try {
      const sb = getSupabaseClient();
      const { error } = await sb.from("site_reviews").insert({
        name: form.name.trim(),
        org: form.org.trim() || null,
        role: form.role.trim() || null,
        rating: form.rating,
        text: form.text.trim(),
        approved: false,
      });
      if (error) throw error;
      toast({
        title: "Thank you! 🌟",
        description: "Your review is queued for approval and will appear shortly.",
      });
      setForm({ name: "", org: "", role: "", rating: 5, text: "" });
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

        <section className="mx-auto mt-14 max-w-2xl rounded-3xl bg-white p-8 shadow-card border border-sand/60">
          <h2 className="flex items-center gap-2 font-heading text-xl font-bold text-cocoa">
            <Plus className="h-5 w-5 text-brand" /> Share your experience
          </h2>
          <p className="mt-1 text-xs text-taupe mb-5">
            Reviews are moderated before publishing. Keep it honest — good or bad.
          </p>
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
