import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Admins allowed to manage users. Comma-separated `ADMIN_EMAILS` secret overrides;
// defaults to the project owner. Keep in sync with ADMIN_EMAILS in src/lib/supabase.ts.
const ADMIN_EMAILS = (Deno.env.get('ADMIN_EMAILS') ?? 'mengmobile777@gmail.com')
  .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);

const BAN_FOREVER = '876000h'; // ~100 years — Supabase has no "permanent", so we use a long ban.

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);

    // 1) Identify the caller from their JWT (anon client carrying the caller's token).
    const caller = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: userErr } = await caller.auth.getUser();
    if (userErr || !user) return json({ error: 'Unauthorized' }, 401);

    // 2) Must be an admin — the gate that makes the service-role power safe to expose.
    if (!ADMIN_EMAILS.includes((user.email ?? '').toLowerCase()))
      return json({ error: 'Forbidden — admin only.' }, 403);

    // 3) Validate the request.
    const { action, userId } = (await req.json().catch(() => ({}))) as { action?: string; userId?: string };
    if (!userId || !action || !['delete', 'ban', 'unban'].includes(action))
      return json({ error: 'Bad request: expected { action: "delete" | "ban" | "unban", userId }.' }, 400);
    if (userId === user.id)
      return json({ error: "You can't delete or ban your own account." }, 400);

    // 4) Perform with the service-role client — only ever runs server-side here.
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    if (action === 'delete') {
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) return json({ error: error.message }, 400);
      // Remove the profile row too in case there's no ON DELETE CASCADE FK.
      await admin.from('profiles').delete().eq('id', userId);
      return json({ ok: true, action });
    }

    // ban / unban — reversible, keeps the row and history.
    const ban_duration = action === 'ban' ? BAN_FOREVER : 'none';
    const { error } = await admin.auth.admin.updateUserById(userId, { ban_duration });
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true, action });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
