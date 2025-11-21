import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import pdf from "npm:pdf-parse@1.1.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ItemPattern {
  category: string;
  name_pattern: string;
}

interface StorePattern {
  store_name: string;
  pattern_data: {
    item_patterns: ItemPattern[];
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageUrl, imageUrls, originalFilename, pdfUrl } = await req.json();

    // Support both single image (legacy) and multiple images (new)
    const imagesToProcess = imageUrls || (imageUrl ? [imageUrl] : []);

    if (imagesToProcess.length === 0) {
      return new Response(
        JSON.stringify({ error: 'At least one image URL is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Parsing receipt with ${imagesToProcess.length} image(s)`);
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
          patterns.forEach((p: StorePattern) => {
            storeContext += `\nFor ${p.store_name}:\n`;
            const itemPatterns = p.pattern_data?.item_patterns || [];
            itemPatterns.forEach((item: ItemPattern) => {
              storeContext += `- "${item.name_pattern}" should be categorized as "${item.category}"\n`;
            });
          });
          storeContext += '\nWhen you see similar item names, use these learned categories. Match items by their core name, ignoring minor variations in spelling or formatting.\n';
        }
      }
    } catch (e) {
      console.log('Could not fetch store patterns:', e);
    }

    let pdfText = '';

    // Priority 1: Use provided raw PDF URL
    if (pdfUrl) {
      try {
        console.log('Using provided raw PDF URL for text extraction...');
        const pdfResponse = await fetch(pdfUrl);
        if (pdfResponse.ok) {
          const pdfBuffer = await pdfResponse.arrayBuffer();
          const data = await pdf(Buffer.from(pdfBuffer));
          if (data.text) {
            pdfText = `\n\n--- EXTRACTED TEXT FROM PDF ---\n${data.text}\n-------------------------------\n`;
            console.log('Successfully extracted text from raw PDF');
          }
        }
      } catch (e) {
        console.error('Error extracting text from raw PDF:', e);
      }
    }

    // Priority 2: Fallback to checking image URLs (legacy behavior)
    if (!pdfText) {
      // Check if any of the images are PDFs and extract text
      for (const url of imagesToProcess) {
        const isPdf = url.toLowerCase().endsWith('.pdf') ||
          (originalFilename && originalFilename.toLowerCase().endsWith('.pdf'));

        if (isPdf) {
          try {
            console.log('Detected PDF in images, fetching content for text extraction...');
            const pdfResponse = await fetch(url);
            if (pdfResponse.ok) {
              const pdfBuffer = await pdfResponse.arrayBuffer();
              const data = await pdf(Buffer.from(pdfBuffer));
              if (data.text) {
                pdfText += `\n\n--- EXTRACTED TEXT FROM PDF PAGE ---\n${data.text}\n------------------------------------\n`;
                console.log('Successfully extracted text from PDF image');
              }
            }
          } catch (e) {
            console.error('Error extracting text from PDF image:', e);
          }
        }
      }
    }

    const promptText = `Parse this ${imagesToProcess.length > 1 ? imagesToProcess.length + '-page ' : ''}grocery receipt${imagesToProcess.length > 1 ? '. Combine information from ALL pages into a single receipt. The images are in page order.' : ''} and extract: store_name, total_amount (as number), receipt_date (YYYY-MM-DD format), and items array. Each item should have: name, price (as number), quantity (as number), category, and discount (as number, optional).

${pdfText ? `\n📜 TEXT LAYER EXTRACTED FROM PDF:\n${pdfText}\n\n⚠️ INSTRUCTION: Use the extracted text above as the PRIMARY source of truth for item names and prices, as it is more accurate than OCR. Use the image only for visual confirmation or if the text is garbled.\n` : ''}

🏪 STORE NAME RULE:
- Extract the FULL STORE NAME including branch/location (e.g., "ICA Nära Älvsjö", "Willys Hemma", "Coop Konsum")
- DO NOT truncate to just the brand (e.g., "ICA Nära Älvsjö" is correct, "ICA" is WRONG)
- Exclude street addresses and city names if they are on a separate line, but keep the branch name if it's part of the logo/header

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
   
5. SWEDISH ABBREVIATIONS & CONTEXT:
   - "st" = styck (piece/quantity). Example: "2 st" means quantity 2.
   - "kg" = kilogram. Treat as unit.
   - "pant" = deposit. Categorize as "pant".
   - "rabatt" = discount.
   - "moms" = tax (ignore line).
   - "öresavrundning" = rounding (ignore line).
📋 REAL EXAMPLES - CORRECT PARSING:

Example 1 - Multi-line product name:
  *Juicy Melba    7340131603507    21,00    1,00 st    22,95
  Nocco                                                  -5,90

❌ WRONG: { name: "Juicy Melba", price: 22.95 }, { name: "Nocco", price: -5.90 }
✅ CORRECT: { name: "Juicy Melba Nocco", price: 17.05, quantity: 1, discount: 5.90 }

Example 2 - Discount keyword:
  Nocco BCAA Dr Pepper           69.95
  2för90 rabatt                  -25.00

❌ WRONG: Two items
✅ CORRECT: { name: "Nocco BCAA Dr Pepper", price: 44.95, quantity: 1, discount: 25.00 }

Example 3 - Standalone discount line:
  Lätta 70% 500g                 40.00
  -KR 10.00                      -10.00

❌ WRONG: Two items with one having negative price
✅ CORRECT: { name: "Lätta 70% 500g", price: 30.00, quantity: 1, discount: 10.00 }

6. CATEGORY MAPPING:
   Categorize each item into ONE of these Swedish categories:
   - frukt_gront (Fruit, vegetables, salad)
   - mejeri (Milk, cheese, yogurt, butter)
   - kott_fagel_chark (Meat, chicken, deli meats)
   - brod_bageri (Bread, pastries, baked goods)
   - drycker (Drinks, juice, soda)
   - sotsaker_snacks (Candy, chips, snacks)
   - fardigmat (Ready meals, frozen food)
   - hushall_hygien (Household products, cleaning, hygiene)
   - delikatess (Delicatessen, specialty items)
   - pant (Bottle deposit/return)
   - other (Anything else)

${storeContext}

🎯 OUTPUT FORMAT:
Return ONLY the function call with properly formatted JSON. No additional text or explanation. Make sure all numbers are actual numbers, not strings.`;

    // Build content for AI request
    const userContent = [
      {
        type: "text",
        text: promptText
      },
      ...imagesToProcess.map((url: string) => ({
        type: "image_url",
        image_url: { url }
      }))
    ];

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
            content: 'You are a receipt parser. Extract structured data from receipt images including store name, total amount, date, and itemized list with prices and categories. For multi-page receipts, combine all items into a single receipt. Return valid JSON only.'
          },
          {
            role: 'user',
            content: userContent
          }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "parse_receipt",
              description: "Parse receipt and extract structured data",
              parameters: {
                type: "object",
                properties: {
                  store_name: {
                    type: "string",
                    description: "Name of the store (brand/chain name, not location)"
                  },
                  total_amount: {
                    type: "number",
                    description: "Total amount on receipt"
                  },
                  receipt_date: {
                    type: "string",
                    description: "Date in YYYY-MM-DD format"
                  },
                  items: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string" },
                        price: { type: "number" },
                        quantity: { type: "number" },
                        category: { type: "string" },
                        discount: { type: "number" }
                      },
                      required: ["name", "price", "quantity", "category"]
                    }
                  }
                },
                required: ["store_name", "total_amount", "receipt_date", "items"]
              }
            }
          }
        ],
        tool_choice: {
          type: "function",
          function: { name: "parse_receipt" }
        }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI gateway error:', response.status, errorText);

      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again in a moment.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI credits depleted. Please add credits in your workspace settings.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      throw new Error(`AI gateway returned ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    console.log('AI response:', JSON.stringify(data, null, 2));

    const functionCall = data.choices?.[0]?.message?.tool_calls?.[0]?.function;
    if (!functionCall) {
      throw new Error('No function call in AI response');
    }

    const parsedData = JSON.parse(functionCall.arguments);
    console.log('Parsed receipt data:', JSON.stringify(parsedData, null, 2));

    return new Response(
      JSON.stringify(parsedData),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in parse-receipt function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error occurred' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
