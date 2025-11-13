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
    const { imageUrl, originalFilename } = await req.json();
    
    if (!imageUrl) {
      return new Response(
        JSON.stringify({ error: 'Image URL is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Parsing receipt image:', imageUrl);
    if (originalFilename) {
      console.log('Original filename:', originalFilename);
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

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

${originalFilename ? `\n📁 FILENAME HINT: The original filename is "${originalFilename}". If it contains a date pattern (like "2025-10-26" or "2025-10-26T15_49_07"), use it to help determine the receipt_date. Match the date format YYYY-MM-DD.\n` : ''}

🚨 CRITICAL PARSING RULES - MUST FOLLOW EXACTLY:

1. MULTI-LINE PRODUCT NAMES:
   ✅ Products can span multiple lines where the second line continues the product name
   ✅ If a line has NO price/quantity but follows a product line, it's likely part of the product name
   ✅ Combine the lines into ONE product with the full name
   
   Example:
   *Juicy Melba    7340131603507    21,00    1,00 st    22,95
   Nocco                                                  -5,90
   
   ❌ WRONG: Two items: "Juicy Melba" and "Nocco"
   ✅ CORRECT: One item: "Juicy Melba Nocco" with price 17.05 (22.95 - 5.90) and discount 5.90

2. DISCOUNT RULES:
   ❌ NEVER create items with NEGATIVE prices (e.g., -25.00)
   ❌ NEVER create separate items for discount lines containing keywords: "rabatt", "special", "2för", "2f", "-KR", "-kr", "kampanj"
   ✅ When you see a negative amount line:
      - If the line also contains text without prices/quantity, it's likely continuing the product name from above
      - The negative amount is the DISCOUNT on the product
      - DO NOT create a separate item for the discount line
   
3. How to correctly handle discounts:
   - Look at the product line ABOVE the discount line
   - If the next line has text and a negative amount, combine the names
   - Original price = the total price shown on the product line
   - Discount = absolute value of the negative amount (convert to positive number)
   - Final price = original price - discount
   - Create ONE item with: name=(combined product name), price=(final price), discount=(discount amount as positive number)
   
4. Pattern recognition:
   - Lines with only text + negative amount = likely part of product name + discount
   - Lines with discount keywords + negative amount = discount on previous product
   - These ALL mean: apply discount to the product ABOVE
   
📋 REAL EXAMPLES - CORRECT PARSING:

Example 1 - Multi-line product name:
  *Juicy Melba    7340131603507    21,00    1,00 st    22,95
  Nocco                                                  -5,90

❌ WRONG: { name: "Juicy Melba", price: 22.95 }, { name: "Nocco", price: -5.90 }
✅ CORRECT: { name: "Juicy Melba Nocco", price: 17.05, quantity: 1, discount: 5.90 }

Example 2 - Discount keyword:
  *Fus Base          8006540989197    264,00    1.00 st    289.00
  STor&special -25KR                                        -25,00

❌ WRONG: { name: "*Fus Base", price: 289 }, { name: "STor&special -25KR", price: -25 }
✅ CORRECT: { name: "Fus Base", price: 264, quantity: 1, discount: 25 }

Example 3 - Duplicate name discount:
  Kycklingfärs                        64,00     1 st       75.90
  Kycklingfärs 2f                                         -11.90

❌ WRONG: Two items
✅ CORRECT: { name: "Kycklingfärs", price: 64, quantity: 1, discount: 11.90 }

Categories (one of: frukt_och_gront, mejeri, kott_fagel_chark, fisk_skaldjur, brod_bageri, skafferi, frysvaror, drycker, sotsaker_snacks, fardigmat, delikatess, hushall_hygien, pant, other):
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
- delikatess: Delikatesser, lyxvaror, exklusiva produkter och finkost
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
                          enum: ['frukt_och_gront', 'mejeri', 'kott_fagel_chark', 'fisk_skaldjur', 'brod_bageri', 'skafferi', 'frysvaror', 'drycker', 'sotsaker_snacks', 'fardigmat', 'delikatess', 'hushall_hygien', 'pant', 'other']
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
