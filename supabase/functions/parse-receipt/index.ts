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

interface ParsedItem {
  name: string;
  article_number?: string;
  price: number;
  quantity: number;
  category: string;
  discount?: number;
}

/**
 * Parse structured ICA receipt text directly
 * Returns null if parsing fails (fall back to AI)
 */
function parseICAReceiptText(text: string): { items: ParsedItem[]; store_name?: string; total_amount?: number; receipt_date?: string } | null {
  try {
    console.log('🔧 Attempting structured parsing of ICA receipt...');

    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    // Try to find store name (usually at the top)
    let storeName = 'ICA';
    for (const line of lines.slice(0, 10)) {
      if (line.includes('ICA')) {
        storeName = line.trim();
        break;
      }
    }

    const items: ParsedItem[] = [];
    let i = 0;

    // Skip header row (Beskrivning, Artikelnummer, etc.)
    while (i < lines.length && !lines[i].match(/\d{8,13}/)) {
      i++;
    }

    while (i < lines.length) {
      const line = lines[i];

      // Product line pattern: has 8-13 digit article number
      const articleMatch = line.match(/(\d{8,13})/);

      if (articleMatch) {
        // This is a product line
        const parts = line.split(/\s+/);
        const articleIdx = parts.findIndex(p => /^\d{8,13}$/.test(p));

        if (articleIdx === -1) {
          i++;
          continue;
        }

        // Extract components
        const nameParts = parts.slice(0, articleIdx);
        const articleNumber = parts[articleIdx];
        const remaining = parts.slice(articleIdx + 1);

        // Find numeric values: [unit_price, quantity, (unit), summa]
        const numbers = remaining.filter(p => /^-?\d+[,.]?\d*$/.test(p.replace(',', '.')));

        if (numbers.length < 3) {
          i++;
          continue;
        }

        const unitPrice = parseFloat(numbers[0].replace(',', '.'));
        const quantity = parseFloat(numbers[1].replace(',', '.'));
        const summa = parseFloat(numbers[numbers.length - 1].replace(',', '.'));

        let productName = nameParts.join(' ').replace(/^\*/, '').trim();
        let discount = 0;

        // Check next line(s) for name continuation or discount
        let j = i + 1;
        while (j < lines.length) {
          const nextLine = lines[j];

          // If next line has article number, it's a new product
          if (nextLine.match(/\d{8,13}/)) {
            break;
          }

          // Check if it's a discount line (contains negative number)
          const negativeMatch = nextLine.match(/-(\d+[,.]?\d*)/);
          if (negativeMatch) {
            discount = parseFloat(negativeMatch[1].replace(',', '.'));

            // Check if there's text before the negative number (continuation of name)
            const beforeNegative = nextLine.substring(0, nextLine.indexOf('-')).trim();
            if (beforeNegative && !beforeNegative.match(/^\d/)) {
              productName += ' ' + beforeNegative;
            }

            j++;
            break;
          }

          // If no negative number, it might be name continuation
          if (!nextLine.match(/^\d/) && nextLine.length > 0) {
            productName += ' ' + nextLine;
            j++;
          } else {
            break;
          }
        }

        // Calculate final price
        const finalPrice = discount > 0 ? summa - discount : summa;

        // Add item (categorization will be done by AI later)
        items.push({
          name: productName,
          article_number: articleNumber,
          price: finalPrice,
          quantity: quantity,
          category: 'other', // Will be categorized by AI
          discount: discount > 0 ? discount : undefined
        });

        i = j;
      } else {
        // Line without article number - might be pant, plastkasse, etc.
        // Simple pattern: Name Price Quantity Total
        const parts = line.split(/\s+/);
        const numbers = parts.filter(p => /^-?\d+[,.]?\d*$/.test(p.replace(',', '.')));

        if (numbers.length >= 2) {
          const name = parts.slice(0, parts.length - numbers.length).join(' ');
          const quantity = parseFloat(numbers[numbers.length - 2].replace(',', '.'));
          const total = parseFloat(numbers[numbers.length - 1].replace(',', '.'));

          items.push({
            name: name,
            price: total,
            quantity: quantity,
            category: name.toLowerCase().includes('pant') ? 'pant' : 'other'
          });
        }

        i++;
      }
    }

    console.log(`✅ Structured parsing succeeded: ${items.length} items`);
    items.forEach((item, idx) => {
      console.log(`  ${idx + 1}. ${item.name} - ${item.quantity}x ${item.price} kr${item.discount ? ` (discount: ${item.discount} kr)` : ''}`);
    });

    return { items, store_name: storeName };

  } catch (e) {
    console.error('❌ Structured parsing failed:', e);
    return null;
  }
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
            console.log('✅ Successfully extracted text from raw PDF');
            console.log('📄 PDF Text Length:', data.text.length, 'characters');
            console.log('📄 First 500 chars:', data.text.substring(0, 500));
          } else {
            console.log('⚠️ PDF has no text layer - will rely on OCR from image');
          }
        }
      } catch (e) {
        console.error('❌ Error extracting text from raw PDF:', e);
      }
    } else {
      console.log('⚠️ No pdfUrl provided - will rely on OCR from images');
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

    // Try structured parsing first if we have PDF text
    if (pdfText) {
      const structuredResult = parseICAReceiptText(pdfText);

      if (structuredResult && structuredResult.items && structuredResult.items.length > 0) {
        console.log('🎯 Using structured parsing results instead of AI!');

        // Use AI only for categorization
        // Build a simple prompt to categorize the items
        const categorizationPrompt = `Categorize these Swedish grocery items into ONE of these categories:
- frukt_gront (Fruit, vegetables, salad)
- mejeri (Milk, cheese, yogurt, butter)
- kott_fagel_chark (Meat, chicken, deli meats)
- brod_bageri (Bread, pasta, pastries, baked goods)
- drycker (Drinks, juice, soda)
- sotsaker_snacks (Candy, chips, snacks)
- fardigmat (Ready meals, frozen food)
- hushall_hygien (Household products, cleaning, hygiene)
- delikatess (Delicatessen, specialty items)
- pant (Bottle deposit/return)
- other (Anything else)

Items to categorize:
${structuredResult.items.map((item, idx) => `${idx + 1}. ${item.name}`).join('\n')}

Return a JSON array of categories in the same order: ["category1", "category2", ...]`;

        try {
          // Call AI just for categorization
          const categorizationResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${LOVABLE_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'google/gemini-2.5-flash',
              messages: [
                { role: 'user', content: categorizationPrompt }
              ],
            }),
          });

          if (categorizationResponse.ok) {
            const catData = await categorizationResponse.json();
            const catText = catData.choices?.[0]?.message?.content || '';
            const categories = JSON.parse(catText.match(/\[.*\]/)?.[0] || '[]');

            // Apply categories to items
            structuredResult.items.forEach((item, idx) => {
              if (categories[idx]) {
                item.category = categories[idx];
              }
            });
          }
        } catch (e) {
          console.log('⚠️ Categorization failed, using defaults:', e);
        }

        // Calculate total amount
        const totalAmount = structuredResult.items.reduce((sum, item) => sum + item.price, 0);

        // Try to extract date from filename
        let receiptDate = new Date().toISOString().split('T')[0];
        if (originalFilename) {
          const dateMatch = originalFilename.match(/(\d{4})-(\d{2})-(\d{2})/);
          if (dateMatch) {
            receiptDate = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
          }
        }

        console.log('📦 Returning structured parsing results');
        return new Response(
          JSON.stringify({
            store_name: structuredResult.store_name || 'ICA',
            total_amount: totalAmount,
            receipt_date: receiptDate,
            items: structuredResult.items
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    console.log('⚠️ Structured parsing not available, falling back to AI...');

    const promptText = `Parse this ${imagesToProcess.length > 1 ? imagesToProcess.length + '-page ' : ''}grocery receipt${imagesToProcess.length > 1 ? '. Combine information from ALL pages into a single receipt. The images are in page order.' : ''} and extract: store_name, total_amount (as number), receipt_date (YYYY-MM-DD format), and items array. Each item should have: name, price (as number), quantity (as number), category, and discount (as number, optional).

${pdfText ? `\n📜 TEXT LAYER EXTRACTED FROM PDF:\n${pdfText}\n\n⚠️ CRITICAL: Use the extracted text above as the PRIMARY source of truth. The text layer is 100% accurate. DO NOT rely on OCR from images. Copy product names EXACTLY as they appear in the extracted text.\n` : ''}

🔴 TOP PRIORITY - ICA RECEIPT PARSING RULES:

For ICA/Swedish receipts, the layout is typically:
[*][Product Name] [Article#] [Qty] [Pris/unit] [Summa]
[Discount name if any]                          [-Amount]

CRITICAL RULES:
1. Lines starting with "*" are products WITH ACTIVE DISCOUNTS
2. The "Summa" column = TOTAL before discount (e.g., 65.90 for 2×22.50 + 20.90)
3. The next line after a product = DISCOUNT LINE (e.g., -20.90)
4. FINAL PRICE = Summa - Discount (e.g., 65.90 - 20.90 = 45.00)
5. ALWAYS check for discount lines immediately after products

MANDATORY STEPS FOR EACH PRODUCT:
Step 1: Read product line → Extract name from PDF text EXACTLY
Step 2: Look at next line → If it has a negative amount, IT IS A DISCOUNT
Step 3: Calculate: final_price = summa_value - abs(discount_value)
Step 4: Create ONE item with: name, price=final_price, discount=abs(discount_value)

REAL EXAMPLE FROM ICA RECEIPT:
  PDF Text:
  "*Linguine                 8008343200134  2,00  22,50     65,90"
  "Rummo pasta"
  "                                                        -20,90"

  CORRECT PARSING:
  {
    name: "Linguine Rummo pasta",
    article_number: "8008343200134",
    quantity: 2,
    price: 45.00,        // 65.90 - 20.90 = 45.00
    discount: 20.90,     // abs(-20.90)
    category: "brod_bageri"
  }

  WRONG PARSING (DO NOT DO THIS):
  ❌ name: "Lasagne" (wrong product - you misread it!)
  ❌ price: 65.90 (this is BEFORE discount, not the final price)
  ❌ discount: missing (you MUST capture the -20.90)

🏪 STORE NAME RULE:
- Extract the FULL STORE NAME including branch/location (e.g., "ICA Nära Älvsjö", "Willys Hemma", "Coop Konsum")
- DO NOT truncate to just the brand (e.g., "ICA Nära Älvsjö" is correct, "ICA" is WRONG)
- Exclude street addresses and city names if they are on a separate line, but keep the branch name if it's part of the logo/header

${originalFilename ? `\n📁 FILENAME HINT: The original filename is "${originalFilename}". If it contains a date pattern (like "2025-10-26" or "2025-10-26T15_49_07"), use it to help determine the receipt_date. Match the date format YYYY-MM-DD.\n` : ''}

🚨 CRITICAL PARSING RULES - MUST FOLLOW EXACTLY:

1. MULTI-LINE PRODUCT NAMES:
   ✅ Products often span 2-3 lines in ICA receipts:
      - Line 1: "*Linguine" (starts the name, has article#, qty, unit price, summa)
      - Line 2: "Rummo pasta" (continues the name, NO numbers)
      - Line 3: "-20,90" (discount, negative amount ONLY)

   ✅ ALWAYS combine lines until you see:
      - A line with article number/barcode (next product starts), OR
      - A line with only a negative amount (discount line)

   Example from ICA:
   "*Linguine                 8008343200134  2,00  22,50     65,90"
   "Rummo pasta"
   "                                                        -20,90"

   ✅ CORRECT PARSING:
   - Line 1+2 = Product name: "Linguine Rummo pasta"
   - Line 3 = Discount: 20.90 kr
   - Final item: { name: "Linguine Rummo pasta", quantity: 2, price: 45.00, discount: 20.90 }

   ❌ WRONG: Creating separate items for "Linguine" and "Rummo pasta"
   ❌ WRONG: Using "Lasagne" or any other product name not in the text
   ❌ WRONG: Ignoring the -20,90 discount line

2. DISCOUNT DETECTION - MANDATORY ALGORITHM:

   FOR EVERY PRODUCT LINE, YOU MUST:

   Step A: After reading a product line, peek at the NEXT line
   Step B: Check if next line contains ONLY:
           - Whitespace + negative number (e.g., "                    -20,90")
           - OR discount keywords + negative number (e.g., "rabatt -20,90")
   Step C: If YES → This is a DISCOUNT line:
           - discount = abs(negative_amount)
           - price = summa_from_product_line - discount
           - Attach discount to the product
           - DO NOT create separate item for this line
   Step D: If NO → Next line is a new product or continuation of name

   DISCOUNT LINE PATTERNS (all mean: subtract from product above):
   ✅ "                                                        -20,90"
   ✅ "Rummo pasta                                            -20,90"
   ✅ "rabatt                                                 -10,00"
   ✅ "2för90 rabatt                                          -25,00"
   ✅ "-KR 10.00                                              -10,00"

   CRITICAL: Lines starting with "*" = products WITH discounts coming on next line!

   ❌ NEVER create items with NEGATIVE prices
   ❌ NEVER create separate items for discount lines
   ❌ NEVER ignore discount lines - they MUST be captured

3. COMBINING MULTI-LINE NAMES WITH DISCOUNTS:

   Pattern: Product name can span multiple lines BEFORE the discount line

   Example:
   Line 1: "*Linguine                 8008343200134  2,00  22,50     65,90"
   Line 2: "Rummo pasta"                  ← continuation of name (no numbers)
   Line 3: "                                                        -20,90"  ← discount

   PARSING LOGIC:
   1. Read Line 1 → Product starts: "Linguine", summa=65.90, qty=2
   2. Read Line 2 → No article#/qty → Part of name! Append: "Linguine Rummo pasta"
   3. Read Line 3 → Negative number only → DISCOUNT! discount=20.90
   4. Calculate: price = 65.90 - 20.90 = 45.00
   5. OUTPUT: { name: "Linguine Rummo pasta", quantity: 2, price: 45.00, discount: 20.90 }

4. VALIDATION CHECKLIST (before returning results):

   ✓ Did you check EVERY product line for a discount on the next line?
   ✓ Are ALL discount values stored as positive numbers in the "discount" field?
   ✓ Are ALL final prices calculated as: summa - discount?
   ✓ Did you copy product names EXACTLY from the PDF text?
   ✓ Are there NO items with negative prices?
   ✓ Did you combine multi-line product names correctly?
   
5. SWEDISH ABBREVIATIONS & CONTEXT:
   - "st" = styck (piece/quantity). Example: "2 st" means quantity 2.
   - "kg" = kilogram. Treat as unit.
   - "pant" = deposit. Categorize as "pant".
   - "rabatt" = discount.
   - "moms" = tax (ignore line).
   - "öresavrundning" = rounding (ignore line).

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

7. ARTICLE NUMBERS:
   - ALWAYS extract article_number (Artikelnummer/GTIN/EAN) if visible
   - Usually 8-13 digits (e.g., "8008343200134")
   - Helps with product identification and matching

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
                        article_number: { type: "string", description: "GTIN/EAN/Article number (usually 8-13 digits)" },
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
