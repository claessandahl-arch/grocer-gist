import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ProductToMap {
  name: string;
  category?: string | null;
}

interface ExistingGroup {
  mapped_name: string;
  category: string | null;
  products: string[];
}

interface MappingResult {
  original_name: string;
  mapped_name: string;
  category: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { userId, products } = await req.json() as { userId: string; products: ProductToMap[] };

    if (!userId) {
      throw new Error("userId is required");
    }

    if (!products || products.length === 0) {
      return new Response(
        JSON.stringify({ success: true, mapped: 0, message: "No products to map" }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[auto-map-products] Processing ${products.length} products for user ${userId}`);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch existing user mappings
    const { data: userMappings, error: userError } = await supabase
      .from('product_mappings')
      .select('original_name, mapped_name, category')
      .eq('user_id', userId);

    if (userError) {
      console.error('Error fetching user mappings:', userError);
    }

    // Fetch global mappings
    const { data: globalMappings, error: globalError } = await supabase
      .from('global_product_mappings')
      .select('original_name, mapped_name, category');

    if (globalError) {
      console.error('Error fetching global mappings:', globalError);
    }

    // Build a map of existing original_names to avoid duplicates
    const existingOriginalNames = new Set<string>();
    userMappings?.forEach(m => existingOriginalNames.add(m.original_name.toLowerCase()));

    // Filter out products that already have mappings
    const productsToMap = products.filter(p =>
      p.name && !existingOriginalNames.has(p.name.toLowerCase())
    );

    if (productsToMap.length === 0) {
      console.log('[auto-map-products] All products already mapped');
      return new Response(
        JSON.stringify({ success: true, mapped: 0, message: "All products already mapped" }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[auto-map-products] ${productsToMap.length} products need mapping`);

    // Build existing groups from user + global mappings
    const groupMap = new Map<string, ExistingGroup>();

    // Add user groups
    userMappings?.forEach(m => {
      if (m.mapped_name) {
        const key = m.mapped_name.toLowerCase();
        if (!groupMap.has(key)) {
          groupMap.set(key, {
            mapped_name: m.mapped_name,
            category: m.category,
            products: []
          });
        }
        groupMap.get(key)!.products.push(m.original_name);
      }
    });

    // Add global groups (if not already present)
    globalMappings?.forEach(m => {
      if (m.mapped_name) {
        const key = m.mapped_name.toLowerCase();
        if (!groupMap.has(key)) {
          groupMap.set(key, {
            mapped_name: m.mapped_name,
            category: m.category,
            products: []
          });
        }
        groupMap.get(key)!.products.push(m.original_name);
      }
    });

    const existingGroups = Array.from(groupMap.values());
    console.log(`[auto-map-products] Found ${existingGroups.length} existing groups`);

    // Call AI to map products
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiApiKey) {
      throw new Error('GEMINI_API_KEY not configured');
    }

    const prompt = buildPrompt(productsToMap, existingGroups);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 55000); // 55 second timeout

    try {
      const aiResponse = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${geminiApiKey}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: 'gemini-2.5-flash',
          messages: [
            {
              role: 'system',
              content: 'You are an expert at organizing Swedish grocery products into groups. Return valid JSON only.'
            },
            {
              role: 'user',
              content: prompt,
            }
          ],
          temperature: 0.2,
          response_format: { type: "json_object" }
        }),
      });

      clearTimeout(timeoutId);

      if (!aiResponse.ok) {
        const errorText = await aiResponse.text();
        console.error('AI API error:', aiResponse.status, errorText);
        throw new Error(`AI API error: ${aiResponse.status}`);
      }

      const aiData = await aiResponse.json();
      const aiContent = aiData.choices[0].message.content;

      // Parse AI response
      let parsedResponse: { mappings: MappingResult[] };
      try {
        let jsonString = aiContent.trim();
        if (jsonString.startsWith('```json')) {
          jsonString = jsonString.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        } else if (jsonString.startsWith('```')) {
          jsonString = jsonString.replace(/^```\s*/, '').replace(/\s*```$/, '');
        }
        parsedResponse = JSON.parse(jsonString);
      } catch (e) {
        console.error('Failed to parse AI response:', aiContent);
        throw new Error('Invalid AI response format');
      }

      const mappings = parsedResponse.mappings || [];
      console.log(`[auto-map-products] AI suggested ${mappings.length} mappings`);

      // Insert mappings into database
      let insertedCount = 0;
      const errors: string[] = [];

      for (const mapping of mappings) {
        if (!mapping.original_name || !mapping.mapped_name || !mapping.category) {
          console.warn('Skipping invalid mapping:', mapping);
          continue;
        }

        // Double-check we're not inserting a duplicate
        if (existingOriginalNames.has(mapping.original_name.toLowerCase())) {
          console.log(`Skipping already mapped product: ${mapping.original_name}`);
          continue;
        }

        const { error: insertError } = await supabase
          .from('product_mappings')
          .insert({
            user_id: userId,
            original_name: mapping.original_name,
            mapped_name: mapping.mapped_name,
            category: mapping.category,
            auto_mapped: true
          });

        if (insertError) {
          // Check if it's a unique constraint violation (duplicate)
          if (insertError.code === '23505') {
            console.log(`Duplicate mapping skipped: ${mapping.original_name}`);
          } else {
            console.error(`Error inserting mapping for ${mapping.original_name}:`, insertError);
            errors.push(mapping.original_name);
          }
        } else {
          insertedCount++;
          existingOriginalNames.add(mapping.original_name.toLowerCase());
        }
      }

      console.log(`[auto-map-products] Successfully inserted ${insertedCount} mappings`);

      return new Response(
        JSON.stringify({
          success: true,
          mapped: insertedCount,
          total: productsToMap.length,
          errors: errors.length > 0 ? errors : undefined
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        console.error('Request timeout after 55 seconds');
        throw new Error('Request took too long. Try with fewer products.');
      }
      throw fetchError;
    }

  } catch (error) {
    console.error('Error in auto-map-products:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});

function buildPrompt(
  products: ProductToMap[],
  existingGroups: ExistingGroup[]
): string {
  const categoryList = [
    'frukt_och_gront',
    'mejeri',
    'kott_fagel_chark',
    'fisk_skaldjur',
    'brod_bageri',
    'skafferi',
    'frysvaror',
    'drycker',
    'sotsaker_snacks',
    'fardigmat',
    'hushall_hygien',
    'delikatess',
    'pant',
    'other'
  ];

  const categoryDescriptions: Record<string, string> = {
    frukt_och_gront: 'Frukt och grönsaker (färska)',
    mejeri: 'Mjölkprodukter, ost, yoghurt, smör, ägg',
    kott_fagel_chark: 'Kött, kyckling, korv, pålägg, charkuterier',
    fisk_skaldjur: 'Fisk och skaldjur',
    brod_bageri: 'Bröd, kakor, bakverk',
    skafferi: 'Torrvaror, konserver, kryddor, pasta, ris, mjöl',
    frysvaror: 'Frysta produkter',
    drycker: 'Drycker (läsk, juice, vatten - INTE mjölk)',
    sotsaker_snacks: 'Godis, chips, snacks, choklad',
    fardigmat: 'Färdiglagad mat, frysta rätter',
    hushall_hygien: 'Städprodukter, hygienartiklar, hushållspapper',
    delikatess: 'Delikatessprodukter, specialost',
    pant: 'Pant på flaskor/burkar',
    other: 'Övriga produkter som inte passar någon annanstans'
  };

  // Format existing groups for the prompt
  const groupExamples = existingGroups
    .slice(0, 150) // Limit to avoid token overflow
    .map(g => {
      const sampleProducts = g.products.slice(0, 3).join('", "');
      return `- "${g.mapped_name}" (${g.category}): "${sampleProducts}"${g.products.length > 3 ? ` + ${g.products.length - 3} more` : ''}`;
    })
    .join('\n');

  return `Du ska mappa svenska matvaror till produktgrupper. Din uppgift är att:
1. Tilldela varje produkt till en BEFINTLIG grupp om en passande finns
2. Om ingen befintlig grupp passar, skapa en NY grupp med kortast möjliga rent namn
3. Tilldela rätt kategori till varje produkt

REGLER FÖR GRUPPNAMN:
- Använd kortast möjliga, rena namn (t.ex. "Selleri" inte "BLADSELLERI")
- Ta bort butikskoder, vikter och varianter från namnet
- Gruppera stavningsvarianter tillsammans (t.ex. "Zucchini", "Zuccini" → "Zucchini")
- Gruppera märkesvarianter om det är samma produkt (t.ex. "ICA Mjölk 3%", "Arla Mjölk" → "Mjölk")
- MINIMERA antalet nya grupper - var generös med att matcha till befintliga

TILLGÄNGLIGA KATEGORIER:
${categoryList.map(cat => `- ${cat}: ${categoryDescriptions[cat]}`).join('\n')}

BEFINTLIGA GRUPPER (prioritera att använda dessa):
${groupExamples || '(Inga befintliga grupper ännu)'}

PRODUKTER ATT MAPPA:
${products.map(p => `- "${p.name}"${p.category ? ` (AI-förslag: ${p.category})` : ''}`).join('\n')}

RETURNERA JSON I EXAKT DETTA FORMAT:
{
  "mappings": [
    {
      "original_name": "EXAKT produktnamn från listan ovan",
      "mapped_name": "Kortast möjliga gruppnamn",
      "category": "kategori_key"
    }
  ]
}

VIKTIGT:
- original_name MÅSTE vara EXAKT samma som i produktlistan
- mapped_name ska vara kortast möjliga rent svenskt namn
- category MÅSTE vara en av kategori-keys ovan
- Returnera ENDAST JSON, inget annat`;
}
