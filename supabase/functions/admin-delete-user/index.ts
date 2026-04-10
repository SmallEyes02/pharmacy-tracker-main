import { serve } from 'https://deno.land/x/supa_edge_functions@0.0.1/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req: Request) => {
  // ── CORS pre-flight ──────────────────────────────────────────────────────────
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    // ── 1. Verify the caller is an authenticated admin ───────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json({ error: 'Missing Authorization header' }, 401);
    }

    // Service-role client — can delete auth users
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } }
    );

    // Anon client — used only to verify the caller's JWT and role
    const callerClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    // Confirm the caller is authenticated
    const { data: { user: caller }, error: callerErr } = await callerClient.auth.getUser();
    if (callerErr || !caller) {
      return json({ error: 'Unauthorized' }, 401);
    }

    // Confirm the caller has the admin role
    const { data: isAdmin, error: roleErr } = await (adminClient as any).rpc('has_admin_role', {
      _user_id: caller.id,
      _role_name: 'admin',
    });
    if (roleErr || isAdmin !== true) {
      return json({ error: 'Forbidden: admin role required' }, 403);
    }

    // ── 2. Parse + validate request body ────────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const { user_id } = body as { user_id?: string };

    if (!user_id || typeof user_id !== 'string') {
      return json({ error: 'user_id is required' }, 400);
    }

    // Prevent an admin from deleting their own account via this endpoint
    if (user_id === caller.id) {
      return json({ error: 'You cannot delete your own account' }, 400);
    }

    // ── 3. Delete profile + roles (belt-and-suspenders; dashboard does this  ──
    //       too, but we do it here so the edge function is self-contained)
    await adminClient.from('user_roles').delete().eq('user_id', user_id);
    await adminClient.from('profiles').delete().eq('user_id', user_id);

    // ── 4. Hard-delete the auth user ─────────────────────────────────────────
    const { error: deleteErr } = await adminClient.auth.admin.deleteUser(user_id);
    if (deleteErr) {
      return json({ error: 'Failed to delete auth user: ' + deleteErr.message }, 500);
    }

    return json({ success: true, deleted_user_id: user_id });

  } catch (err: any) {
    return json({ error: err?.message ?? 'Unexpected error' }, 500);
  }
});

// ── Helper ────────────────────────────────────────────────────────────────────
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
