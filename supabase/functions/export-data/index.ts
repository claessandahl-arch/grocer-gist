import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get auth token from request
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create client with user's token to get their user_id
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify user with anon client
    const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await anonClient.auth.getUser();
    if (authError || !user) {
      console.error("Auth error:", authError);
      return new Response(
        JSON.stringify({ error: "Unauthorized - invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Exporting data for user: ${user.id}`);

    // Use service role client to bypass RLS for reading
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    // Export user-specific data
    const [receiptsRes, productMappingsRes, userOverridesRes, feedbackRes] = await Promise.all([
      serviceClient.from("receipts").select("*").eq("user_id", user.id),
      serviceClient.from("product_mappings").select("*").eq("user_id", user.id),
      serviceClient.from("user_global_overrides").select("*").eq("user_id", user.id),
      serviceClient.from("category_suggestion_feedback").select("*").eq("user_id", user.id),
    ]);

    // Export global data (no user filter)
    const [globalMappingsRes, storePatternsRes] = await Promise.all([
      serviceClient.from("global_product_mappings").select("*"),
      serviceClient.from("store_patterns").select("*"),
    ]);

    // Check for errors
    const errors = [];
    if (receiptsRes.error) errors.push(`receipts: ${receiptsRes.error.message}`);
    if (productMappingsRes.error) errors.push(`product_mappings: ${productMappingsRes.error.message}`);
    if (userOverridesRes.error) errors.push(`user_global_overrides: ${userOverridesRes.error.message}`);
    if (feedbackRes.error && feedbackRes.error.code !== "42P01") {
      // 42P01 = table doesn't exist, which is ok
      errors.push(`category_suggestion_feedback: ${feedbackRes.error.message}`);
    }
    if (globalMappingsRes.error) errors.push(`global_product_mappings: ${globalMappingsRes.error.message}`);
    if (storePatternsRes.error) errors.push(`store_patterns: ${storePatternsRes.error.message}`);

    if (errors.length > 0) {
      console.error("Export errors:", errors);
    }

    const exportData = {
      exported_at: new Date().toISOString(),
      user_id: user.id,
      tables: {
        receipts: receiptsRes.data || [],
        product_mappings: productMappingsRes.data || [],
        global_product_mappings: globalMappingsRes.data || [],
        store_patterns: storePatternsRes.data || [],
        user_global_overrides: userOverridesRes.data || [],
        category_suggestion_feedback: feedbackRes.data || [],
      },
    };

    console.log(`Export complete: ${exportData.tables.receipts.length} receipts, ${exportData.tables.product_mappings.length} mappings`);

    return new Response(JSON.stringify(exportData, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Export error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
