import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CategorySuggestionRequest {
  products: Array<{
    name: string;
    occurrences?: number;
  }>;
  userId: string;
}

interface ReceiptItem {
  name: string;
  category?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { products, userId } = await req.json() as CategorySuggestionRequest;

    if (!products || products.length === 0) {
      throw new Error("No products provided");
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch training data: existing categorized products
    const { data: userMappings } = await supabase
      .from('product_mappings')
      .select('original_name, category')
      .eq('user_id', userId)
      .not('category', 'is', null);

    const { data: globalMappings } = await supabase
      .from('global_product_mappings')
      .select('original_name, category')
      .not('category', 'is', null);

    // Fetch categorized items from receipts
    const { data: receipts } = await supabase
      .from('receipts')
      .select('items')
      .eq('user_id', userId);

    // Build training examples
    const trainingExamples: Array<{ name: string; category: string }> = [];

    // Add from user mappings (highest priority)
    userMappings?.forEach(m => {
      if (m.category) {
        trainingExamples.push({ name: m.original_name, category: m.category });
      }
    });

    // Add from global mappings
    globalMappings?.forEach(m => {
      if (m.category) {
        trainingExamples.push({ name: m.original_name, category: m.category });
      }
    });

    // Add from receipts
    receipts?.forEach(receipt => {
      const items = (receipt.items as unknown as ReceiptItem[]) || [];
      items.forEach(item => {
        if (item.name && item.category) {
          trainingExamples.push({ name: item.name, category: item.category });
        }
      });
    });

    console.log(`Training data: ${trainingExamples.length} examples`);

    // Fetch previous feedback for learning
    const { data: feedbackData } = await supabase
      .from('category_suggestion_feedback')
      .select('product_name, suggested_category, final_category, accepted')
      .eq('user_id', userId)
      .limit(100);

    // Build AI prompt
    const prompt = buildPrompt(products, trainingExamples, feedbackData || []);

    // Call Lovable AI Gateway
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!lovableApiKey) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${lovableApiKey}`,
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'user',
            content: prompt,
          }
        ],
        temperature: 0.3,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', errorText);
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const aiSuggestions = aiData.choices[0].message.content;

    // Parse AI response (expecting JSON, possibly wrapped in markdown)
    let parsedResponse;
    try {
      let jsonString = aiSuggestions.trim();

      // Remove markdown code blocks if present
      if (jsonString.startsWith('```json')) {
        jsonString = jsonString.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (jsonString.startsWith('```')) {
        jsonString = jsonString.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }

      parsedResponse = JSON.parse(jsonString);
    } catch (e) {
      console.error('Failed to parse AI response:', aiSuggestions);
      throw new Error('Invalid AI response format');
    }

    // The AI returns { suggestions: [...] }, so we pass it through directly
    return new Response(
      JSON.stringify(parsedResponse),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      }
    );

  } catch (error) {
    console.error('Error in suggest-categories:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      }
    );
  }
});

function buildPrompt(
  products: Array<{ name: string; occurrences?: number }>,
  trainingExamples: Array<{ name: string; category: string }>,
  feedback: Array<{ product_name: string; suggested_category: string; final_category: string; accepted: boolean }>
): string {
  const categoryList = [
    'frukt_gront',
    'mejeri',
    'kott_fagel_chark',
    'brod_bageri',
    'drycker',
    'sotsaker_snacks',
    'fardigmat',
    'hushall_hygien',
    'delikatess',
    'pant',
    'other'
  ];

  const categoryDescriptions: Record<string, string> = {
    frukt_gront: 'Frukt och grönsaker',
    mejeri: 'Mjölkprodukter, ost, yoghurt, smör',
    kott_fagel_chark: 'Kött, kyckling, korv, chark',
    brod_bageri: 'Bröd, kakor, bakverk',
    drycker: 'Drycker (INTE mjölk)',
    sotsaker_snacks: 'Godis, chips, snacks',
    fardigmat: 'Färdiglagad mat, frysta rätter',
    hushall_hygien: 'Städprodukter, hygienartiklar',
    delikatess: 'Deli-produkter, ost från disk',
    pant: 'Pant',
    other: 'Övriga produkter'
  };

  let prompt = `Du är en expert på att kategorisera svenska matvaror. Din uppgift är att föreslå kategorier för produkter.

TILLGÄNGLIGA KATEGORIER:
${categoryList.map(cat => `- ${cat}: ${categoryDescriptions[cat] || cat}`).join('\n')}

TRÄNINGSDATA (${trainingExamples.length} exempel):
${trainingExamples.slice(0, 100).map(ex => `"${ex.name}" → ${ex.category}`).join('\n')}
`;

  if (feedback.length > 0) {
    prompt += `\n\nFEEDBACK FRÅN ANVÄNDAREN (lär dig av dessa):
${feedback.map(f => {
      if (f.accepted) {
        return `"${f.product_name}" → ${f.suggested_category} ✅ (accepterad)`;
      } else {
        return `"${f.product_name}" → AI föreslog: ${f.suggested_category}, Användare valde: ${f.final_category} ❌`;
      }
    }).join('\n')}
`;
  }

  prompt += `\n\nPRODUKTER ATT KATEGORISERA:
${products.map(p => `- "${p.name}"${p.occurrences ? ` (förekommer ${p.occurrences} gånger)` : ''}`).join('\n')}

INSTRUKTIONER:
1. Använd träningsdata och feedback för att göra bättre förslag
2. Om en liknande produkt finns i träningsdata, använd samma kategori
3. Om användaren tidigare korrigerat liknande förslag, lär dig av det
4. Ge en confidence score 0-1 (1 = mycket säker)
5. Returnera ENDAST ett JSON-objekt i detta format:

{
  "suggestions": [
    {
      "product": "produktnamn",
      "category": "kategori_key",
      "confidence": 0.95,
      "reasoning": "Kort förklaring varför"
    }
  ]
}

VIKTIGT:
- Returnera ENDAST JSON, inget annat
- Använd EXAKT samma kategori-keys som listan ovan
- Ge högre confidence för produkter som liknar träningsdata
`;

  return prompt;
}
