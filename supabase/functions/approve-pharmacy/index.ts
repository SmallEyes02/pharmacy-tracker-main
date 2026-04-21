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

// ── Geocode address via Nominatim (OpenStreetMap, free, no API key) ───────────
const geocodeAddress = async (
  address: string
): Promise<{ lat: number; lng: number } | null> => {
  try {
    const query = encodeURIComponent(`${address}, Botswana`);
    const url   = `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1&countrycodes=bw`;
    const res   = await fetch(url, {
      headers: { "User-Agent": "PharmacyTracker/1.0 (gaborone@pharmacytracker.bw)" },
    });
    if (!res.ok) { console.warn("[geocode] status:", res.status); return null; }
    const data = await res.json();
    if (!data.length) { console.warn("[geocode] no results for:", address); return null; }
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch (e) {
    console.warn("[geocode] error:", e);
    return null;
  }
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
    const { application_id, admin_notes } = await req.json();
    if (!application_id) throw new Error("application_id is required");

    // 1. Fetch application
    const { data: application, error: fetchError } = await supabaseAdmin
      .from("pharmacy_applications").select("*").eq("id", application_id).single();
    if (fetchError) throw new Error("Fetch failed: " + fetchError.message);
    if (!application) throw new Error("Application not found");
    if (application.status !== "pending") throw new Error("Application already reviewed");

    // 2. Find pharmacist by email (case-insensitive, full list)
    const { data: userList, error: listError } =
      await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listError) throw new Error("Could not list users: " + listError.message);

    const pharmacistUser = userList.users.find(
      (u: any) => u.email?.toLowerCase() === application.pharmacist_email?.toLowerCase()
    );
    if (!pharmacistUser) {
      throw new Error(
        `No account found for ${application.pharmacist_email}. ` +
        "The pharmacist must register via the signup form first."
      );
    }
    const pharmacistUserId = pharmacistUser.id;

    // 3. Assign pharmacist role
    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: pharmacistUserId, role: "pharmacist" }, { onConflict: "user_id,role" });
    if (roleError) throw new Error("Role assignment failed: " + roleError.message);

    // 4. Geocode address → GPS coordinates
    const coords = await geocodeAddress(application.address);
    if (coords) {
      console.log(`[approve-pharmacy] Geocoded "${application.address}" → lat:${coords.lat} lng:${coords.lng}`);
    } else {
      console.warn(`[approve-pharmacy] Geocoding failed for "${application.address}" — location will be NULL`);
    }

    // 5. Create pharmacy record
    const pharmacyPayload: Record<string, any> = {
      name:                application.pharmacy_name,
      address:             application.address,
      phone:               application.phone,
      email:               application.email,
      accepts_medical_aid: application.accepts_medical_aid,
      opening_time:        application.opening_time,
      closing_time:        application.closing_time,
      is_active:           true,
      owner_id:            pharmacistUserId,
    };
    // Set PostGIS geography point only if geocoding succeeded
    if (coords) {
      pharmacyPayload.location = `SRID=4326;POINT(${coords.lng} ${coords.lat})`;
    }

    const { data: pharmacy, error: pharmacyError } = await supabaseAdmin
      .from("pharmacies").insert(pharmacyPayload).select("id").single();
    if (pharmacyError) throw new Error("Pharmacy insert failed: " + pharmacyError.message);
    if (!pharmacy) throw new Error("Pharmacy insert returned no data");

    // 6. Mark application approved
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

    console.log("[approve-pharmacy] Approved:", application.pharmacy_name, coords ? `at (${coords.lat},${coords.lng})` : "(no location)");

    return new Response(
      JSON.stringify({
        message:           "Pharmacy approved successfully!",
        pharmacy_id:       pharmacy.id,
        pharmacist_user_id: pharmacistUserId,
        location_geocoded: !!coords,
        coordinates:       coords ?? null,
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
