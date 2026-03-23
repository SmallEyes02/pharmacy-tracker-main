import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { autoRefreshToken: false, persistSession: false } }
);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
    // ── Verify the caller is an admin ──────────────────────────────────────
    // Extract JWT from the Authorization header and check their role
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace("Bearer ", "");

    const { data: { user }, error: userError } =
      await supabaseAdmin.auth.getUser(jwt);

    if (userError || !user) {
      throw new Error("Unauthorized");
    }

    // Check admin role in user_roles table
    const { data: roleData } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .single();

    if (!roleData) {
      throw new Error("Access denied: admin role required");
    }

    // ── Fetch all auth users (paginated, up to 1000) ───────────────────────
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page:    1,
      perPage: 1000,
    });

    if (error) throw new Error("Failed to list users: " + error.message);

    // Return only the fields the dashboard needs
    const users = data.users.map((u) => ({
      id:           u.id,
      email:        u.email ?? null,
      created_at:   u.created_at,
      user_metadata: {
        full_name: u.user_metadata?.full_name ?? null,
        phone:     u.user_metadata?.phone ?? null,
      },
    }));

    return new Response(
      JSON.stringify({ users }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[admin-list-users] ERROR:", msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});