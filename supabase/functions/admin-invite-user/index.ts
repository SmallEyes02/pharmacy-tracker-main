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
    const { email, full_name, phone, role } = await req.json();

    if (!email) throw new Error("email is required");

    const validRoles = ["patient", "pharmacist", "admin"];
    if (!validRoles.includes(role)) throw new Error("Invalid role");

    // 1. Invite user — sends a magic-link email to set password
    const { data: inviteData, error: inviteError } =
      await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        redirectTo: `${Deno.env.get("SITE_URL") ?? ""}/set-password`,
        data: { full_name, phone },
      });

    if (inviteError) {
      if (inviteError.message.includes("already been registered")) {
        throw new Error(`${email} already has an account`);
      }
      throw new Error("Invite failed: " + inviteError.message);
    }

    const userId = inviteData.user.id;

    // 2. Profile is auto-created by the on_auth_user_created trigger.
    //    Just update with the provided details.
    await supabaseAdmin
      .from("profiles")
      .update({ full_name: full_name ?? null, phone: phone ?? null })
      .eq("user_id", userId);

    // 3. Assign role
    await supabaseAdmin.from("user_roles").insert({
      user_id: userId,
      role,
    });

    return new Response(
      JSON.stringify({ message: `Invite sent to ${email}`, user_id: userId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[admin-invite-user]", msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});