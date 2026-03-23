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
    const { application_id, admin_notes } = await req.json();
    if (!application_id) throw new Error("application_id is required");

    // ── 1. Fetch the application ───────────────────────────────────────────
    const { data: application, error: fetchError } = await supabaseAdmin
      .from("pharmacy_applications")
      .select("*")
      .eq("id", application_id)
      .single();

    if (fetchError) throw new Error("Fetch failed: " + fetchError.message);
    if (!application) throw new Error("Application not found");
    if (application.status !== "pending") throw new Error("Application already reviewed");

    // ── 2. Find the pharmacist's auth user by email ───────────────────────
    // The pharmacist created their account during signup — we just look them up
    const { data: userList, error: listError } =
      await supabaseAdmin.auth.admin.listUsers();
    if (listError) throw new Error("Could not list users: " + listError.message);

    const pharmacistUser = userList.users.find(
      (u: any) => u.email === application.pharmacist_email
    );

    if (!pharmacistUser) {
      throw new Error(
        `No account found for ${application.pharmacist_email}. ` +
        "The pharmacist must register via the signup form first."
      );
    }

    const pharmacistUserId = pharmacistUser.id;

    // ── 3. Assign pharmacist role ──────────────────────────────────────────
    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .upsert(
        { user_id: pharmacistUserId, role: "pharmacist" },
        { onConflict: "user_id,role" }
      );

    if (roleError) throw new Error("Role assignment failed: " + roleError.message);

    // ── 4. Create the pharmacy record ──────────────────────────────────────
    const { data: pharmacy, error: pharmacyError } = await supabaseAdmin
      .from("pharmacies")
      .insert({
        name:                application.pharmacy_name,
        address:             application.address,
        phone:               application.phone,
        email:               application.email,
        accepts_medical_aid: application.accepts_medical_aid,
        opening_time:        application.opening_time,
        closing_time:        application.closing_time,
        is_active:           true,
        owner_id:            pharmacistUserId,
      })
      .select("id")
      .single();

    if (pharmacyError) throw new Error("Pharmacy insert failed: " + pharmacyError.message);
    if (!pharmacy) throw new Error("Pharmacy insert returned no data");

    // ── 5. Mark application approved ──────────────────────────────────────
    const { error: updateError } = await supabaseAdmin
      .from("pharmacy_applications")
      .update({
        status:      "approved",
        admin_notes: admin_notes ?? null,
        reviewed_at: new Date().toISOString(),
        pharmacy_id: pharmacy.id,
      } as any)
      .eq("id", application_id);

    if (updateError) throw new Error("Status update failed: " + updateError.message);

    console.log("[approve-pharmacy] Approved:", application.pharmacy_name, "for", application.pharmacist_email);

    return new Response(
      JSON.stringify({
        message:            "Pharmacy approved successfully!",
        pharmacy_id:        pharmacy.id,
        pharmacist_user_id: pharmacistUserId,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[approve-pharmacy] ERROR:", msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});