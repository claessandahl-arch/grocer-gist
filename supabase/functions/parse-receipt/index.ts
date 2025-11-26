import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// ============================================================================
// CRITICAL: DO NOT REMOVE THIS IMPORT
// ============================================================================
// pdf-parse IS DENO COMPATIBLE via npm: prefix
// See: https://deno.land/manual/node/npm_specifiers
//
// If you see deployment errors, they are NOT caused by pdf-parse.
// Check Deno logs for the actual error before removing this.
//
// Removing this breaks PDF text extraction and drops parsing accuracy
// from 100% to ~80%. See CLAUDE.md lines 24-53 for full explanation.
//
// This has been removed incorrectly TWICE already. DO NOT REMOVE IT AGAIN.
// ============================================================================
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
  quantity_unit?: string;
  content_amount?: number;
  content_unit?: string;
  unit_price?: number;
  category: string;
  discount?: number;
}

/**
 * Parse structured Willys receipt text directly
 * Willys format: [Product Name] [Quantity*Price] [Total]
 * No article numbers, simpler layout
 */
function parseWillysReceiptText(text: string): { items: ParsedItem[]; store_name?: string; total_amount?: number; receipt_date?: string; _debug?: any } | null {
  try {
    console.log('🔧 Attempting structured parsing of Willys receipt...');
    console.log('📄 Input text length:', text.length);
    console.log('📄 First 200 chars:', text.substring(0, 200));

    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    console.log('📊 Total lines:', lines.length);

    // Find store name
    let storeName = 'Willys';
    for (const line of lines.slice(0, 10)) {
      if (line.toLowerCase().includes('willys') || line.toLowerCase().includes('willy')) {
        storeName = line.trim();
        break;
      }
    }

    // Find the start and end of product list
    const startIdx = lines.findIndex(l => l.includes('Start Självscanning') || l.includes('START'));
    const endIdx = lines.findIndex(l => l.includes('Slut Självscanning') || l.includes('SLUT'));

    console.log(`📍 Product list from line ${startIdx} to ${endIdx}`);

    if (startIdx === -1 || endIdx === -1) {
      console.log('❌ Could not find product list markers');
      return null;
    }

    const items: ParsedItem[] = [];
    let i = startIdx + 1;

    while (i < endIdx) {
      let line = lines[i];
      console.log(`\n🔍 Line ${i}: "${line}"`);

      // Check for discount embedded in line (format: "Rabatt:SALLAD -10,00")
      const discountInLineMatch = line.match(/Rabatt:(.+?)\s+(-\d+[,.]?\d*)/);
      if (discountInLineMatch) {
        console.log('  💰 Discount line detected (embedded format)');
        if (items.length > 0) {
          const discount = parseFloat(discountInLineMatch[2].replace(',', '.').replace('-', ''));
          const lastItem = items[items.length - 1];
          lastItem.discount = discount;
          lastItem.price = parseFloat((lastItem.price - discount).toFixed(2));
          console.log(`  ✅ Applied ${discount} kr discount to ${lastItem.name}`);
        }
        i++;
        continue;
      }

      // Check if this line has no price but next line is a weight calculation
      // Pattern: "MAJSKY.LÅRFILÉ" followed by "0,842kg*169,00kr/kg 142,30"
      const priceMatch = line.match(/(-?\d+[,.]?\d*)\s*$/);
      if (!priceMatch && i + 1 < endIdx) {
        const nextLine = lines[i + 1];
        const weightCalcMatch = nextLine.match(/^(\d+[,.]?\d*)kg\*(\d+[,.]?\d*)kr\/kg\s+(\d+[,.]?\d*)$/);
        if (weightCalcMatch) {
          console.log('  🔗 Product name on this line, weight+price on next line - combining');
          // Combine the lines: product name from current line, weight and price from next
          const productName = line.trim();
          const weight = parseFloat(weightCalcMatch[1].replace(',', '.'));
          const price = parseFloat(weightCalcMatch[3].replace(',', '.'));

          console.log(`  🏷️  Product: "${productName}"`);
          console.log(`  📦 Quantity: ${weight} kg`);
          console.log(`  💰 Price: ${price} kr`);

          items.push({
            name: productName,
            price: parseFloat(price.toFixed(2)),
            quantity: parseFloat(weight.toFixed(3)),
            category: 'other'
          });

          console.log(`  ✅ Added: ${productName} (${weight}kg x ${price} kr)`);
          i += 2; // Skip both lines
          continue;
        }
      }

      // Willys format patterns:
      // "PRODUCT NAME PRICE" - e.g., "GURKA IMPORT 14,90"
      // "PRODUCT NAME 2st*17,90 35,80" - e.g., "AUBERGINE ST 2st*17,90 35,80"
      // "PRODUCT NAME 0,842kg*169,00kr/kg 142,30" - weighted item (on one line)

      // Extract price (last number on the line, can be negative for PANTRETUR)
      if (!priceMatch) {
        console.log('  ⏭️  No price found, skipping');
        i++;
        continue;
      }

      const price = parseFloat(priceMatch[1].replace(',', '.'));
      const beforePrice = line.substring(0, line.lastIndexOf(priceMatch[0])).trim();
      console.log(`  💰 Price: ${price} kr`);
      console.log(`  📝 Before price: "${beforePrice}"`);

      // Check for quantity pattern: "2st*29,90" or just "2st"
      let quantity = 1;
      let productName = beforePrice;

      const qtyMatch = beforePrice.match(/(\d+)st\*(\d+[,.]?\d*)/);
      if (qtyMatch) {
        quantity = parseInt(qtyMatch[1]);
        // Remove the quantity part from product name
        productName = beforePrice.substring(0, beforePrice.indexOf(qtyMatch[0])).trim();
        console.log(`  📦 Quantity: ${quantity} (from pattern)`);
        console.log(`  🏷️  Product: "${productName}"`);
      } else {
        // Check for weighted item pattern: "0,842kg*169,00kr/kg"
        const weightMatch = beforePrice.match(/(\d+[,.]?\d*)kg\*(\d+[,.]?\d*)kr\/kg/);
        if (weightMatch) {
          quantity = parseFloat(weightMatch[1].replace(',', '.'));
          productName = beforePrice.substring(0, beforePrice.indexOf(weightMatch[0])).trim();
          console.log(`  📦 Quantity: ${quantity} kg (weighted item)`);
          console.log(`  🏷️  Product: "${productName}"`);
        } else {
          console.log(`  📦 Quantity: 1 (default)`);
          console.log(`  🏷️  Product: "${productName}"`);
        }
      }

      // Determine category based on product name
      let category = 'other';
      const nameLower = productName.toLowerCase();
      if (nameLower.includes('pant')) {
        category = 'pant';
      }

      items.push({
        name: productName,
        price: parseFloat(price.toFixed(2)), // Round to 2 decimals
        quantity: parseFloat(quantity.toFixed(3)), // Round to 3 decimals for weights
        category: category
      });

      console.log(`  ✅ Added: ${productName} (${quantity}x ${price} kr)`);
      i++;
    }

    // Check for items after "Slut Självscanning" (like PANTRETUR)
    let j = endIdx + 1;
    while (j < lines.length && !lines[j].includes('Totalt')) {
      const line = lines[j];
      console.log(`\n🔍 Post-scan line ${j}: "${line}"`);

      // Match pattern: "PANTRETUR -90,00"
      const postScanMatch = line.match(/^([A-ZÅÄÖ\s]+)\s+(-?\d+[,.]?\d*)\s*$/);
      if (postScanMatch) {
        const name = postScanMatch[1].trim();
        const price = parseFloat(postScanMatch[2].replace(',', '.'));
        const category = name.toLowerCase().includes('pant') ? 'pant' : 'other';

        items.push({
          name: name,
          price: parseFloat(price.toFixed(2)),
          quantity: 1,
          category: category
        });
        console.log(`  ✅ Added post-scan item: ${name} (${price} kr)`);
      }
      j++;
    }

    console.log(`\n✅ Willys structured parsing succeeded: ${items.length} items`);
    items.forEach((item, idx) => {
      console.log(`  ${idx + 1}. ${item.name} - ${item.quantity}x ${item.price} kr${item.discount ? ` (discount: ${item.discount} kr)` : ''}`);
    });

    return {
      items,
      store_name: storeName,
      _debug: {
        method: 'structured_parser_willys',
        lines_processed: endIdx - startIdx,
        items_found: items.length
      }
    };

  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    console.error('❌ Willys structured parsing failed:', errorMessage);
    return null;
  }
}

/**
 * Parse structured ICA receipt text directly
 * Returns null if parsing fails (fall back to AI)
 */
function parseICAReceiptText(text: string): { items: ParsedItem[]; store_name?: string; total_amount?: number; receipt_date?: string; _debug?: any } | null {
  try {
    console.log('🔧 Attempting structured parsing of ICA receipt...');
    console.log('📄 Input text length:', text.length);
    console.log('📄 First 200 chars:', text.substring(0, 200));

    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    console.log('📊 Total lines after filtering:', lines.length);
    console.log('📊 First 10 lines:', lines.slice(0, 10));

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
    console.log('🔍 Looking for first line with 8-13 digit article number...');
    while (i < lines.length && !lines[i].match(/\d{8,13}/)) {
      console.log(`  Line ${i}: "${lines[i]}" - No article number found`);
      i++;
    }

    if (i >= lines.length) {
      console.log('❌ No lines with article numbers found in entire text!');
      console.log('📄 All lines:', lines);
      return null;
    }

    console.log(`✓ Found first article number at line ${i}: "${lines[i]}"`);
    console.log(`📝 Will process ${lines.length - i} lines for products`);

    while (i < lines.length) {
      const line = lines[i];
      console.log(`\n🔍 Processing line ${i}: "${line}"`);

      // Product line pattern: has 8-13 digit article number
      const articleMatch = line.match(/(\d{8,13})/);

      if (articleMatch) {
        console.log(`  ✓ Found article number: ${articleMatch[1]}`);

        // This is a product line
        const parts = line.split(/\s+/);
        console.log(`  📦 Split into ${parts.length} parts:`, parts);

        const articleIdx = parts.findIndex(p => /^\d{8,13}$/.test(p));
        console.log(`  📍 Article number at index: ${articleIdx}`);

        if (articleIdx === -1) {
          console.log(`  ❌ Article number not found as separate part (might be embedded)`);
          i++;
          continue;
        }

        // Extract components
        const nameParts = parts.slice(0, articleIdx);
        const articleNumber = parts[articleIdx];
        const remaining = parts.slice(articleIdx + 1);
        console.log(`  📝 Name parts:`, nameParts);
        console.log(`  🔢 Article: ${articleNumber}`);
        console.log(`  💰 Remaining parts:`, remaining);

        // Find numeric values: [unit_price, quantity, (unit), summa]
        const numbers = remaining.filter(p => /^-?\d+[,.]?\d*$/.test(p.replace(',', '.')));
        console.log(`  💵 Found ${numbers.length} numeric values:`, numbers);

        if (numbers.length < 3) {
          console.log(`  ❌ Not enough numbers (need at least 3, got ${numbers.length})`);
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

        console.log(`  ✅ Created item: ${productName} (${quantity}x ${finalPrice} kr${discount > 0 ? `, discount: ${discount}` : ''})`);

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
        console.log(`  ⏭️  No article number, skipping`);

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

    return {
      items,
      store_name: storeName,
      _debug: {
        method: 'structured_parser',
        lines_processed: lines.length,
        items_found: items.length
      }
    };

  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    const errorStack = e instanceof Error ? e.stack : undefined;
    console.error('❌ Structured parsing failed:', errorMessage);
    console.error('Stack:', errorStack);
    console.error('Text that failed:', text.substring(0, 500));
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
    let rawPdfText = ''; // Store raw text for structured parsing
    const debugLog: string[] = []; // Track what happens for debugging

    // Priority 1: Use provided raw PDF URL
    if (pdfUrl) {
      debugLog.push(`✓ pdfUrl provided: ${pdfUrl.substring(0, 100)}...`);
      try {
        console.log('Using provided raw PDF URL for text extraction...');
        debugLog.push('→ Fetching PDF from URL...');
        const pdfResponse = await fetch(pdfUrl);
        debugLog.push(`→ PDF fetch status: ${pdfResponse.status} ${pdfResponse.statusText}`);

        if (pdfResponse.ok) {
          const pdfBuffer = await pdfResponse.arrayBuffer();
          debugLog.push(`→ PDF buffer size: ${pdfBuffer.byteLength} bytes`);

          // Deno doesn't have Buffer global - use Uint8Array instead
          const uint8Array = new Uint8Array(pdfBuffer);
          debugLog.push('→ Converting to Uint8Array...');

          const data = await pdf(uint8Array);
          debugLog.push(`→ pdf-parse completed, text length: ${data.text?.length || 0}`);

          if (data.text) {
            rawPdfText = data.text; // Store raw text
            pdfText = `\n\n--- EXTRACTED TEXT FROM PDF ---\n${data.text}\n-------------------------------\n`;
            console.log('✅ Successfully extracted text from raw PDF');
            console.log('📄 PDF Text Length:', data.text.length, 'characters');
            console.log('📄 First 500 chars:', data.text.substring(0, 500));
            debugLog.push(`✓ PDF text extracted: ${data.text.length} characters`);
            debugLog.push(`✓ First 100 chars: ${data.text.substring(0, 100)}`);
          } else {
            console.log('⚠️ PDF has no text layer - will rely on OCR from image');
            debugLog.push('✗ PDF has no text layer');
          }
        } else {
          console.error(`❌ Failed to fetch PDF: ${pdfResponse.status} ${pdfResponse.statusText}`);
          debugLog.push(`✗ Failed to fetch PDF: ${pdfResponse.status}`);
        }
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        console.error('❌ Error extracting text from raw PDF:', e);
        console.error('Error details:', errorMsg);
        debugLog.push(`✗ PDF extraction error: ${errorMsg}`);
      }
    } else {
      console.log('⚠️ No pdfUrl provided - will rely on OCR from images');
      debugLog.push('✗ No pdfUrl provided');
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
              // Deno doesn't have Buffer global - use Uint8Array instead
              const uint8Array = new Uint8Array(pdfBuffer);
              const data = await pdf(uint8Array);
              if (data.text) {
                rawPdfText += data.text; // Store raw text
                pdfText += `\n\n--- EXTRACTED TEXT FROM PDF PAGE ---\n${data.text}\n------------------------------------\n`;
                console.log('✅ Successfully extracted text from PDF image');
              }
            } else {
              console.error(`❌ Failed to fetch PDF from images: ${pdfResponse.status} ${pdfResponse.statusText}`);
            }
          } catch (e) {
            console.error('❌ Error extracting text from PDF image:', e);
            console.error('Error details:', e instanceof Error ? e.message : String(e));
          }
        }
      }
    }

    // Try structured parsing first if we have raw PDF text
    if (rawPdfText) {
      console.log('🔍 Trying structured parsing with raw PDF text...');
      debugLog.push('→ Attempting structured parsing...');

      // Detect store type from PDF text
      const isWillys = rawPdfText.toLowerCase().includes('willys') ||
        rawPdfText.toLowerCase().includes('willy') ||
        rawPdfText.includes('Självscanning');

      console.log(`🏪 Detected store type: ${isWillys ? 'Willys' : 'ICA'}`);

      const structuredResult = isWillys
        ? parseWillysReceiptText(rawPdfText)
        : parseICAReceiptText(rawPdfText);

      if (structuredResult && structuredResult.items && structuredResult.items.length > 0) {
        console.log('🎯 Using structured parsing results instead of AI!');
        debugLog.push(`✓ Structured parsing succeeded: ${structuredResult.items.length} items`);

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

        // Calculate total amount (round to 2 decimals to avoid floating point errors)
        const totalAmount = parseFloat(structuredResult.items.reduce((sum, item) => sum + item.price, 0).toFixed(2));

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
            items: structuredResult.items,
            _debug: {
              method: 'structured_parser',
              debugLog: debugLog,
              items_found: structuredResult.items.length,
              pdf_text_length: rawPdfText.length
            }
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } else {
        debugLog.push('✗ Structured parsing returned no items or failed');
      }
    } else {
      debugLog.push('✗ No rawPdfText available for structured parsing');
    }

    console.log('⚠️ Structured parsing not available, falling back to AI...');
    debugLog.push('→ Falling back to AI parser...');

    // Build conditional prompt sections separately to avoid nested template literals
    const pdfTextSection = pdfText
      ? `\n📜 TEXT LAYER EXTRACTED FROM PDF:\n${pdfText}\n\n⚠️ CRITICAL: Use the extracted text above as the PRIMARY source of truth. The text layer is 100% accurate. DO NOT rely on OCR from images. Copy product names EXACTLY as they appear in the extracted text.\n`
      : '';

    const filenameHint = originalFilename
      ? `\n📁 FILENAME HINT: The original filename is "${originalFilename}". If it contains a date pattern (like "2025-10-26" or "2025-10-26T15_49_07"), use it to help determine the receipt_date. Match the date format YYYY-MM-DD.\n`
      : '';

    const promptText = `Parse this ${imagesToProcess.length > 1 ? imagesToProcess.length + '-page ' : ''}grocery receipt${imagesToProcess.length > 1 ? '. Combine information from ALL pages into a single receipt. The images are in page order.' : ''} and extract: store_name, total_amount (as number), receipt_date (YYYY-MM-DD format), and items array. Each item should have: name, price (as number), quantity (as number), quantity_unit (string, e.g. 'st', 'kg'), content_amount (number, optional), content_unit (string, optional), category, and discount (as number, optional).

${pdfTextSection}

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

UNIT EXTRACTION (CRITICAL FOR PRICE COMPARISON):
- Extract `quantity_unit` (e.g., 'st', 'kg', 'l', 'g', 'ml') from the receipt text if available.
- Extract `content_amount` and `content_unit` if the product is a package with a specific size.
  - Example: "Kaffe 500g" -> content_amount: 0.5, content_unit: 'kg'
  - Example: "Mjölk 1.5L" -> content_amount: 1.5, content_unit: 'l'
  - Example: "Äpplen 1.2kg" -> quantity: 1.2, quantity_unit: 'kg' (weighted item)
- Normalize units:
  - Convert 'g' to 'kg' (divide by 1000)
  - Convert 'ml', 'cl', 'dl' to 'l' (divide by 1000, 100, 10 respectively)
  - Default `quantity_unit` is 'st' if not specified.

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
    quantity_unit: "st",
    content_amount: 0.5, // inferred standard pasta size or extracted if text says "500g"
    content_unit: "kg",
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

${filenameHint}

🚨 CRITICAL PARSING RULES - MUST FOLLOW EXACTLY:

1. MULTI-LINE PRODUCT NAMES - COMPREHENSIVE DETECTION:

   ⭐ GOLDEN RULE: If a line contains text but NO price/article number/quantity data, it is a CONTINUATION of the previous product name.

   ✅ Products often span 2-3 lines in ICA receipts:
      - Line 1: "*Linguine" (starts the name, has article#, qty, unit price, summa)
      - Line 2: "Rummo pasta" (continues the name, NO numbers)
      - Line 3: "-20,90" (discount, negative amount ONLY)

   ✅ FLAVOR/BRAND ON SECOND LINE PATTERN:
      Sometimes the flavor or brand appears on the second line:

      Example 1 - "Blood Orange Nocco":
      Line 1: "*Blood Orange              7350073321017  1,00  20,00     40,00"
      Line 2: "Nocco"                     ← Brand name, NO price data
      Line 3: "                                                         -5,90"

      ✅ CORRECT: { name: "Blood Orange Nocco", quantity: 1, price: 34.10, discount: 5.90 }
      ❌ WRONG: Creating TWO items - "Blood Orange" (40 kr) and "Nocco" (0 kr)

      Example 2 - "Juicy Melba Nocco":
      Line 1: "*Juicy Melba               7350073321024  1,00  20,00     40,00"
      Line 2: "Nocco"

      ✅ CORRECT: { name: "Juicy Melba Nocco", quantity: 1, price: 40.00 }
      ❌ WRONG: Splitting into two separate products

   ✅ DETECTION ALGORITHM - Apply to EVERY line:
      1. Read a line with product data (article#, qty, price)
      2. Peek at NEXT line
      3. Does next line have ONLY text (no numbers except possibly in middle of words)?
         → YES: It's a name continuation! Append to current product name
      4. After appending, peek at the line AFTER that
      5. Is it a discount line (negative number)?
         → YES: Apply discount to the combined product
      6. Continue until you hit a new product (article#) or discount line

   ✅ ALWAYS combine lines until you see:
      - A line with article number/barcode (next product starts), OR
      - A line with only a negative amount (discount line), OR
      - A line with price/quantity columns (next product starts)

   Example from ICA:
   "*Linguine                 8008343200134  2,00  22,50     65,90"
   "Rummo pasta"
   "                                                        -20,90"

   ✅ CORRECT PARSING:
   - Line 1+2 = Product name: "Linguine Rummo pasta"
   - Line 3 = Discount: 20.90 kr
   - Final item: { name: "Linguine Rummo pasta", quantity: 2, price: 45.00, discount: 20.90 }

   ❌ WRONG: Creating separate items for "Linguine" and "Rummo pasta"
   ❌ WRONG: Creating an item "Nocco" with 0 kr price
   ❌ WRONG: Using "Lasagne" or any other product name not in the text
   ❌ WRONG: Ignoring the -20,90 discount line
   ❌ WRONG: Not combining "Blood Orange" with "Nocco" on the next line

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
   ✅ "Rummo pasta                                            -20,90"  ← Text + discount = name continuation!
   ✅ "Nocco                                                   -5,90"   ← Brand + discount = name continuation!
   ✅ "rabatt                                                 -10,00"
   ✅ "2för90 rabatt                                          -25,00"
   ✅ "-KR 10.00                                              -10,00"

   🔴 CRITICAL RULE FOR TEXT + NEGATIVE NUMBER LINES:
   If a line has:
   - Text (product name continuation) + negative number = DISCOUNT LINE
   - The text part is the REST OF THE PRODUCT NAME from the line above
   - The negative number is the DISCOUNT amount
   - DO NOT create a separate item for this line!
   - MERGE the text with the previous product name
   - APPLY the discount to the previous product

   Example:
   Line 1: "*Blood Orange         7340131605891  21,00  2,00 st    45,90"
   Line 2: "Nocco                                                   -5,90"

   ✅ CORRECT INTERPRETATION:
   - "Nocco" = continuation of product name from line 1
   - "-5,90" = discount amount
   - Result: { name: "Blood Orange Nocco", quantity: 2, price: 40.00, discount: 5.90 }

   ❌ WRONG INTERPRETATION:
   - Creating item "Nocco" with 0 kr price and 5.90 discount
   - OR Creating item "Nocco" as separate product

   CRITICAL: Lines starting with "*" = products WITH discounts coming on next line!

   ❌ NEVER create items with NEGATIVE prices
   ❌ NEVER create separate items for discount lines
   ❌ NEVER ignore discount lines - they MUST be captured
   ❌ NEVER create items with 0 kr price (except pant) - check if it's a name continuation!

3. COMBINING MULTI-LINE NAMES WITH DISCOUNTS:

   Pattern: Product name can span multiple lines BEFORE the discount line

   Example 1 - Brand + discount on SAME LINE (ACTUAL ICA FORMAT):
   Line 1: "*Blood Orange         7340131605891  21,00  2,00 st    45,90"
   Line 2: "Nocco                                                   -5,90"

   PARSING LOGIC - THIS IS THE CRITICAL CASE:
   1. Read Line 1 → Product starts: "Blood Orange", article#=7340131605891, summa=45.90, qty=2
   2. Read Line 2 → "Nocco" (text) + "-5,90" (negative number)
      🚨 THIS IS NOT A SEPARATE PRODUCT!
      🚨 "Nocco" = REST OF THE PRODUCT NAME (continuation from line 1)
      🚨 "-5,90" = DISCOUNT for the product
   3. Combine name: "Blood Orange" + "Nocco" = "Blood Orange Nocco"
   4. Extract discount: abs(-5,90) = 5.90
   5. Calculate final price: 45.90 - 5.90 = 40.00
   6. OUTPUT: { name: "Blood Orange Nocco", quantity: 2, price: 40.00, discount: 5.90 }

   ❌ WRONG (what AI currently does):
   - Item 1: "Blood Orange" (45.90 kr)
   - Item 2: "Nocco" (0 kr, discount: 5.90)  ← This is WRONG! Don't create this!

   Example 2 - Traditional multi-line with discount:
   Line 1: "*Linguine                 8008343200134  2,00  22,50     65,90"
   Line 2: "Rummo pasta"              ← continuation of name (no numbers)
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
   ✓ 🚨 CRITICAL: Are there NO items with 0 kr price (except "pant")?
      ❌ If you see "Nocco" with 0 kr → WRONG! Merge with "Blood Orange" above!
   ✓ 🚨 CRITICAL: Did you check for "text + negative number" lines (e.g., "Nocco -5,90")?
      ❌ This is NOT a separate item - it's name continuation + discount!
   ✓ 🚨 CRITICAL: For items starting with "*", check if next line has text + discount
      ❌ "*Blood Orange... 45,90" + "Nocco -5,90" = ONE item "Blood Orange Nocco" (40 kr)!
   
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

8. WEIGHTED ITEMS & UNIT PRICES (CRITICAL):
   - Extract "Pris" column as \`unit_price\`.
   - Extract "Mängd" column unit as \`quantity_unit\` (e.g., "kg", "st", "lit").
   - **Logic for Weighted Items**:
     - If \`Mängd\` says "1" (or integer) BUT \`Summa\` != \`Pris\`, it is likely a WEIGHTED item where the quantity is hidden in the price calculation.
     - **Formula**: \`quantity\` = \`Summa\` / \`unit_price\`.
     - Set \`quantity_unit\` to "kg" (or appropriate unit).
   
   **Example (Weighted Item):**
   - Receipt: \`Apelsin ... 26,95 ... 1,00 st ... 19,89\`
   - Analysis: Summa (19.89) != Pris (26.95). This is NOT 1 item. It is ~0.74 kg.
   - Calculation: 19.89 / 26.95 = 0.738
   - Output: { name: "Apelsin", price: 19.89, quantity: 0.738, quantity_unit: "kg", unit_price: 26.95 }

   **Example (Standard Item):**
   - Receipt: \`Mjölk ... 12,95 ... 2,00 st ... 25,90\`
   - Analysis: 2 * 12.95 = 25.90. Matches.
   - Output: { name: "Mjölk", price: 25.90, quantity: 2, quantity_unit: "st", unit_price: 12.95 }

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
                        price: { type: "number", description: "Final total price for this line item (after discount)" },
                        quantity: { type: "number", description: "Quantity or Weight. For weighted items, calculate: Summa / Unit Price" },
                        quantity_unit: { type: "string", description: "Unit of measure (e.g., 'kg', 'st', 'lit', 'g')" },
                        unit_price: { type: "number", description: "Price per unit (from 'Pris' column)" },
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

    // Add debug info to AI response
    parsedData._debug = {
      method: 'ai_parser',
      debugLog: debugLog
    };

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
