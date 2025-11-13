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
    console.log('Fetching store patterns for improved accuracy...');

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
          storeContext = '\n\nIMPORTANT - Learned item categorizations from previous corrections:\n';
          patterns.forEach((p: any) => {
            storeContext += `\nFor ${p.store_name}:\n`;
            const itemPatterns = p.pattern_data?.item_patterns || [];
            itemPatterns.forEach((item: any) => {
              storeContext += `- "${item.name_pattern}" should be categorized as "${item.category}"\n`;
            });
          });
          storeContext += '\nWhen you see similar item names, use these learned categories. Match items by their core name, ignoring minor variations in spelling or formatting.\n';
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
                text: `Parse this grocery receipt and extract: store_name, total_amount (as number), receipt_date (YYYY-MM-DD format), and items array. Each item should have: name, price (as number), quantity (as number), category, and discount (as number, optional).

CRITICAL DISCOUNT HANDLING RULES:
1. When a discount line appears after a product (negative amount), DO NOT create a separate item for the discount
2. Instead, subtract the discount from the product's price to get the net price
3. Store the discount amount (as positive number) in the "discount" field of that product
4. Example: "Kycklingfärs 115,90" followed by "Kycklingfärs 2f -11,90" should become ONE item with price=104.00 and discount=11.90

Categories (one of: frukt_och_gront, mejeri, kott_fagel_chark, fisk_skaldjur, brod_bageri, skafferi, frysvaror, drycker, sotsaker_snacks, fardigmat, hushall_hygien, pant, other):
- frukt_och_gront: Färska frukter, grönsaker, sallader, örter och rotfrukter
- mejeri: Mjölk, grädde, fil, yoghurt, smör, margarin och ost
- kott_fagel_chark: Färskt kött, fågel, charkuterier, korv och bacon
- fisk_skaldjur: Färsk fisk, skaldjur, gravad lax och rökt fisk
- brod_bageri: Bröd, bullar, kakor och bakverk
- skafferi: Konserver, torra varor, pasta, ris, mjöl, såser, kryddor och konserver
- frysvaror: Frysta produkter som glass, frysta grönsaker och färdigrätter
- drycker: Vatten, läsk, juice, kaffe, te och alkoholfria drycker
- sotsaker_snacks: Godis, chips, choklad och andra snacks
- fardigmat: Salladsbarer, färdiglagade rätter, smörgåsar, oliver och specialostar
- hushall_hygien: Rengöringsmedel, tvättmedel, toalettpapper, personliga hygienprodukter (schampo, tvål) och blöjor
- pant: Avgift på flask- och burk drycker

Look for weight information on items if available. Be precise with item names and net prices after discounts.${storeContext}

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
                        price: { type: 'number', description: 'Net price after any discounts have been subtracted' },
                        quantity: { type: 'number' },
                        category: {
                          type: 'string',
                          enum: ['frukt_och_gront', 'mejeri', 'kott_fagel_chark', 'fisk_skaldjur', 'brod_bageri', 'skafferi', 'frysvaror', 'drycker', 'sotsaker_snacks', 'fardigmat', 'hushall_hygien', 'pant', 'other']
                        },
                        discount: { type: 'number', description: 'Discount amount as positive number, if any discount was applied to this item' }
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
