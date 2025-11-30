import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Missing Supabase configuration');
    }

    // Create admin client with service role (bypasses RLS)
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Verify the user is authenticated
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get the user from the JWT
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`🔐 Admin delete requested by user: ${user.email}`);

    const { action } = await req.json();

    if (action === 'delete-all-receipts') {
      console.log('🗑️ Deleting ALL receipts from all users...');

      // First, get count for logging
      const { count: beforeCount } = await supabaseAdmin
        .from('receipts')
        .select('*', { count: 'exact', head: true });

      // Delete all receipt_items first (foreign key constraint)
      const { error: itemsError } = await supabaseAdmin
        .from('receipt_items')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all (neq to impossible UUID)

      if (itemsError) {
        console.error('Error deleting receipt_items:', itemsError);
        throw itemsError;
      }

      // Delete all receipts
      const { error: receiptsError } = await supabaseAdmin
        .from('receipts')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

      if (receiptsError) {
        console.error('Error deleting receipts:', receiptsError);
        throw receiptsError;
      }

      console.log(`✅ Deleted ${beforeCount} receipts and their items`);

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: `Deleted ${beforeCount} receipts from all users`,
          deletedCount: beforeCount
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'delete-all-data') {
      console.log('🗑️ NUCLEAR OPTION: Deleting ALL user data...');

      // Delete in order of dependencies
      const tables = [
        'receipt_items',
        'receipts', 
        'product_mappings',
        'user_global_overrides',
        'category_suggestion_feedback',
        'store_patterns'
      ];

      const results: Record<string, number> = {};

      for (const table of tables) {
        try {
          const { count } = await supabaseAdmin
            .from(table)
            .select('*', { count: 'exact', head: true });

          const { error } = await supabaseAdmin
            .from(table)
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000');

          if (error) {
            console.error(`Error deleting ${table}:`, error);
          } else {
            results[table] = count || 0;
            console.log(`✅ Deleted ${count} rows from ${table}`);
          }
        } catch (e) {
          console.error(`Error with table ${table}:`, e);
        }
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Deleted all user data',
          deletedCounts: results
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Admin delete error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
