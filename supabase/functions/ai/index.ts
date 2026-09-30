// Edge Function "ai": the only place the AI provider API keys are ever decrypted. System Owner only.
// Actions (POST JSON { action, ... }): provider_save · provider_test · onboard · chat
// Secrets needed: AI_KEY_SECRET (16+ chars). SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
import { createClient } from 'npm:@supabase/supabase-js@2';
import * as ai from '../_shared/ai.ts';

// Narrowed from '*' (security review, 2026-09-29) — see ocr-extract's
// index.ts for why. NOTE: this function's own tables/RPCs (ai_providers,
// accounts, toolboxes, is_super_owner(), ...) are not part of this repo's
// migrations and were out of scope for that review; only this CORS line and
// bringing the file under version control were addressed here.
const cors = {
  'access-control-allow-origin': Deno.env.get('APP_ORIGIN') ?? 'https://fleet.flowworkssystems.com',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
  vary: 'Origin',
};
const reply = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { ...cors, 'content-type': 'application/json' } });
const fail = (error: string) => reply({ ok: false, error });

class Problem extends Error {}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const secret = Deno.env.get('AI_KEY_SECRET') ?? '';
    const authHeader = req.headers.get('Authorization') ?? '';
    const user = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: who } = await user.auth.getUser();
    if (!who?.user) return fail('Please sign in again.');
    const { data: isOwner } = await user.rpc('is_super_owner');
    if (isOwner !== true) return fail('Only the System Owner can use the AI Assistant.');
    const uid = who.user.id;

    const body = await req.json().catch(() => ({}));
    switch (body.action) {
      case 'provider_save': return reply(await providerSave(admin, secret, uid, body));
      case 'provider_test': return reply(await providerTest(admin, secret, body));
      case 'onboard': return reply(await onboard(user, admin, secret, body));
      case 'chat': return reply(await chat(user, admin, secret, uid, body));
      default: return fail('Unknown action.');
    }
  } catch (e) {
    if (e instanceof Problem) return fail(e.message);
    console.error('ai function error', e);
    return fail('Something went wrong on the server. Try again.');
  }
});

// ---------- providers ----------
async function loadProvider(admin: any, id: string | undefined, secret: string) {
  const q = admin.from('ai_providers').select('*').eq('is_active', true);
  const { data } = id ? await q.eq('id', id).maybeSingle() : await q.eq('is_default', true).maybeSingle();
  if (!data) throw new Problem(id ? 'That provider is not available.' : 'No provider is set as the default yet. Add one under Providers.');
  const key = await ai.decryptKey(data.api_key_enc, secret).catch((e: Error) => { throw new Problem(e.message); });
  return { row: data, key, info: data as ai.ProviderInfo };
}

async function callModel(p: { info: ai.ProviderInfo; key: string }, system: string, messages: ai.ChatMessage[], maxTokens?: number): Promise<string> {
  const problem = ai.baseUrlProblem(p.info.base_url);
  if (problem) throw new Problem(problem);
  const r = ai.buildRequest(p.info, p.key, system, messages, maxTokens);
  let res: Response;
  try {
    res = await fetch(r.url, { method: 'POST', headers: r.headers, body: JSON.stringify(r.body), signal: AbortSignal.timeout(120_000) });
  } catch (e) {
    throw new Problem((e as Error).name === 'TimeoutError' ? 'The provider took too long to answer. If this is a local model, check that it is running.' : 'Could not reach the provider. Check the URL (for a local model, that the tunnel is running).');
  }
  if (!res.ok) throw new Problem(ai.providerHttpProblem(res.status));
  const out = ai.parseProviderResponse(p.info.kind, await res.json().catch(() => null));
  if (out.error) throw new Problem(out.error);
  return out.text;
}

async function providerSave(admin: any, secret: string, uid: string, b: any) {
  const label = String(b.label ?? '').trim(), model = String(b.model ?? '').trim(), base_url = String(b.base_url ?? '').trim();
  if (!label || !model) throw new Problem('Give the provider a name and a model.');
  if (!['anthropic', 'openai_compatible'].includes(b.kind)) throw new Problem('Unknown provider type.');
  const bad = ai.baseUrlProblem(base_url);
  if (bad) throw new Problem(bad);
  const fields: Record<string, unknown> = {
    label, kind: b.kind, base_url, model, supports_vision: !!b.supports_vision, supports_pdf: b.kind === 'anthropic' && !!b.supports_pdf,
    max_input_chars: Math.min(Math.max(Number(b.max_input_chars) || 120000, 4000), 2_000_000), is_active: b.is_active !== false,
  };
  const key = typeof b.api_key === 'string' ? b.api_key.trim() : '';
  if (key) { fields.api_key_enc = await ai.encryptKey(key, secret).catch((e: Error) => { throw new Problem(e.message); }); fields.key_last4 = ai.last4(key); }
  let id = b.id as string | undefined;
  if (id) {
    const { error } = await admin.from('ai_providers').update(fields).eq('id', id);
    if (error) throw new Problem(error.message);
  } else {
    if (!key) throw new Problem('Paste the API key (for a local model that needs no key, type any placeholder).');
    const { data, error } = await admin.from('ai_providers').insert({ ...fields, created_by: uid }).select('id').single();
    if (error) throw new Problem(error.message);
    id = data.id;
    const { count } = await admin.from('ai_providers').select('id', { count: 'exact', head: true }).eq('is_default', true);
    if (!count) await admin.from('ai_providers').update({ is_default: true }).eq('id', id);
  }
  return { ok: true, id };
}

async function providerTest(admin: any, secret: string, b: any) {
  const p = await loadProvider(admin, b.provider_id, secret);
  const t0 = Date.now();
  const text = await callModel(p, 'Reply with the single word: ready', [{ role: 'user', content: 'Are you working?' }], 20);
  return { ok: true, ms: Date.now() - t0, sample: text.slice(0, 80) };
}

// ---------- onboarding: the AI studies the structure + workflows and writes a brief for the owner to approve ----------
async function onboard(user: any, admin: any, secret: string, b: any) {
  const p = await loadProvider(admin, b.provider_id, secret);
  const { data: snap, error } = await user.rpc('ai_schema_snapshot');
  if (error || !snap) throw new Problem(error?.message ?? 'Could not read the database structure.');
  const docs = (Array.isArray(b.docs) ? b.docs : []).slice(0, 12).map((d: any) => ({ name: String(d.name ?? 'doc').slice(0, 80), text: String(d.text ?? '').slice(0, 40000) }));
  const docChars = docs.reduce((n: number, d: any) => n + d.text.length, 0);
  const budget = Math.max(6000, p.info.max_input_chars - docChars - 4000);
  const prompt = ai.buildOnboardingPrompt(ai.compactSnapshot(snap, budget), docs);
  const brief = await callModel(p, prompt.system, [{ role: 'user', content: prompt.user }], 4096);
  const { data: id, error: e2 } = await user.rpc('ai_knowledge_new_draft', {
    p_snapshot: snap, p_hash: snap.hash, p_sources: docs.map((d: any) => ({ name: d.name, chars: d.text.length })), p_brief: brief, p_provider: p.row.id,
  });
  if (e2) throw new Problem(e2.message);
  return { ok: true, knowledge_id: id };
}

// ---------- chat ----------
async function chat(user: any, admin: any, secret: string, uid: string, b: any) {
  const text = String(b.text ?? '').trim();
  const atts: { name: string; kind: 'image' | 'pdf'; mime: string; size: number; path: string }[] = Array.isArray(b.attachments) ? b.attachments.slice(0, 5) : [];
  if (!text && atts.length === 0 && !b.sheet_text) throw new Problem('Type a message or attach a file.');

  const { data: settings } = await admin.from('ai_settings').select('daily_message_cap').eq('id', true).single();
  const dayStart = new Date(); dayStart.setUTCHours(0, 0, 0, 0);
  const { count: today } = await admin.from('ai_messages').select('id', { count: 'exact', head: true }).eq('role', 'user').gte('created_at', dayStart.toISOString());
  if ((today ?? 0) >= (settings?.daily_message_cap ?? 200)) throw new Problem(`Daily limit of ${settings?.daily_message_cap ?? 200} messages reached. It resets at midnight UTC; the owner can raise it under Providers.`);

  const p = await loadProvider(admin, b.provider_id, secret);

  // conversation (create on first message)
  let convId: string | undefined = b.conversation_id;
  const accountId: string | null = b.account_id || null;
  if (convId) {
    const { data: c } = await admin.from('ai_conversations').select('id').eq('id', convId).maybeSingle();
    if (!c) throw new Problem('That conversation no longer exists.');
    await admin.from('ai_conversations').update({ account_id: accountId, provider_id: p.row.id, updated_at: new Date().toISOString() }).eq('id', convId);
  } else {
    const { data: c, error } = await admin.from('ai_conversations').insert({ title: (text || atts[0]?.name || 'New conversation').slice(0, 80), account_id: accountId, provider_id: p.row.id, created_by: uid }).select('id').single();
    if (error) throw new Problem(error.message);
    convId = c.id;
  }

  // attachments: only files this owner uploaded, checked against what the provider can read
  const attachments: ai.Attachment[] = [];
  for (const a of atts) {
    if (!String(a.path).startsWith(uid + '/')) throw new Problem('That attachment is not yours.');
    const why = ai.attachmentProblem(p.info, a);
    if (why) throw new Problem(`${a.name}: ${why}`);
    const { data: blob, error } = await admin.storage.from('ai-uploads').download(a.path);
    if (error || !blob) throw new Problem(`Could not read ${a.name}. Upload it again.`);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    attachments.push({ kind: a.kind, mime: a.mime, base64: btoa(bin) });
  }

  // context: approved brief, company, its toolboxes, and recent history
  const { data: kn } = await admin.from('ai_knowledge').select('brief').eq('status', 'approved').maybeSingle();
  const { data: co } = accountId ? await admin.from('accounts').select('name, client_code').eq('id', accountId).maybeSingle() : { data: null };
  const { data: tbs } = accountId ? await admin.from('toolboxes').select('id, tb_name, tb_code').eq('account_id', accountId).limit(50) : { data: [] };
  const system = ai.buildSystemPrompt({ brief: kn?.brief ?? '', company: co, toolboxes: (tbs ?? []).map((t: any) => ({ id: t.id, name: t.tb_name, tb_code: t.tb_code })) });
  const { data: hist } = await admin.from('ai_messages').select('role, content').eq('conversation_id', convId).order('created_at', { ascending: false }).limit(20);
  const history: ai.ChatMessage[] = (hist ?? []).reverse().map((m: any) => ({
    role: m.role,
    content: m.role === 'assistant' ? JSON.stringify({ message: m.content, questions: [], actions: [] }) : m.content,
  }));

  const sheet = b.sheet_text ? ai.truncateText(String(b.sheet_text), Math.floor(p.info.max_input_chars / 2)) : null;
  const userContent = [text, sheet ? `\n\n[Attached spreadsheet, as text${sheet.truncated ? ', truncated' : ''}]\n${sheet.text}` : ''].join('').trim();
  const turn: ai.ChatMessage = { role: 'user', content: userContent, attachments };

  const { data: umsg } = await admin.from('ai_messages').insert({
    conversation_id: convId, role: 'user', content: userContent.slice(0, 60000),
    attachments: atts.map((a) => ({ name: a.name, kind: a.kind, mime: a.mime, size: a.size, path: a.path })),
  }).select('id').single();

  let raw = await callModel(p, system, [...history, turn]);
  let parsed = ai.parseAssistantReply(raw);
  if (!parsed) {
    // one automatic repair attempt, then fall back to showing the text with no actions (never guess at actions)
    raw = await callModel(p, system, [...history, turn, { role: 'assistant', content: raw }, { role: 'user', content: 'Your reply was not valid JSON. Reply again with ONLY the JSON object described in the instructions.' }]);
    parsed = ai.parseAssistantReply(raw) ?? { message: raw, questions: [], actions: [], dropped: [] };
  }

  const { data: amsg } = await admin.from('ai_messages').insert({
    conversation_id: convId, role: 'assistant', content: parsed.message || (parsed.questions.length ? 'I need a bit more information.' : '(no message)'),
    usage: { questions: parsed.questions, dropped: parsed.dropped },
  }).select('id').single();

  const actions: unknown[] = [];
  for (const a of parsed.actions) {
    const { data: row } = await admin.from('ai_actions').insert({ conversation_id: convId, message_id: amsg?.id, account_id: accountId, action_type: a.type, params: { ...a.params, _summary: a.summary } }).select('id').single();
    actions.push({ id: row?.id, type: a.type, summary: a.summary, params: a.params, errors: a.errors });
  }
  return { ok: true, conversation_id: convId, user_message_id: umsg?.id, message: parsed.message, questions: parsed.questions, actions, dropped: parsed.dropped, remaining_today: Math.max(0, (settings?.daily_message_cap ?? 200) - (today ?? 0) - 1) };
}
