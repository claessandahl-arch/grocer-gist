import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageUrl } = await req.json();
    
    if (!imageUrl) {
      return new Response(
        JSON.stringify({ error: 'Image URL is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    console.log('Parsing receipt image:', imageUrl);

    // Fetch store patterns to improve parsing accuracy
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    let storeContext = '';
    try {
      const patternsResponse = await fetch(`${SUPABASE_URL}/rest/v1/store_patterns?select=*`, {
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY || '',
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
        }
      });
      
      if (patternsResponse.ok) {
        const patterns = await patternsResponse.json();
        if (patterns && patterns.length > 0) {
          storeContext = '\n\nLearned patterns from previous receipts:\n' + 
            patterns.map((p: any) => `Store: ${p.store_name}, Common categories: ${JSON.stringify(p.pattern_data?.item_patterns || [])}`).join('\n');
        }
      }
    } catch (e) {
      console.log('Could not fetch store patterns:', e);
    }

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: 'You are a receipt parser. Extract structured data from receipt images including store name, total amount, date, and itemized list with prices and categories. Return valid JSON only.'
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Parse this grocery receipt and extract: store_name, total_amount (as number), receipt_date (YYYY-MM-DD format), and items array. Each item should have: name, price (as number), quantity (as number), and category (one of: produce, dairy, meat, bakery, beverages, snacks, household, other). 
                
Look for savings, discounts, and weight information on items if available. Be precise with item names and prices.${storeContext}

Return only valid JSON with no markdown formatting.`
              },
              {
                type: 'image_url',
                image_url: {
                  url: imageUrl
                }
              }
            ]
          }
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'extract_receipt_data',
              description: 'Extract structured data from a grocery receipt',
              parameters: {
                type: 'object',
                properties: {
                  store_name: { type: 'string' },
                  total_amount: { type: 'number' },
                  receipt_date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
                  items: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
                        price: { type: 'number' },
                        quantity: { type: 'number' },
                        category: {
                          type: 'string',
                          enum: ['produce', 'dairy', 'meat', 'bakery', 'beverages', 'snacks', 'household', 'other']
                        }
                      },
                      required: ['name', 'price', 'quantity', 'category']
                    }
                  }
                },
                required: ['store_name', 'total_amount', 'receipt_date', 'items']
              }
            }
          }
        ],
        tool_choice: { type: 'function', function: { name: 'extract_receipt_data' } }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI gateway error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limits exceeded, please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Payment required, please add credits to your Lovable AI workspace.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: `AI gateway error: ${errorText}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    console.log('AI response received successfully');

    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall || !toolCall.function?.arguments) {
      console.error('No valid tool call in response:', JSON.stringify(data));
      throw new Error('No valid tool call in AI response');
    }

    const parsedData = JSON.parse(toolCall.function.arguments);
    console.log('Parsed receipt data successfully');

    return new Response(
      JSON.stringify(parsedData),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in parse-receipt function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
