import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ProductGroup {
    name: string;
    productCount: number;
    categories: string[];
    sampleProducts: string[];
    isGlobal: boolean;
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const { userId, groups } = await req.json() as { userId: string; groups: ProductGroup[] };

        if (!userId || !groups || !Array.isArray(groups)) {
            return new Response(
                JSON.stringify({ error: 'Missing required fields: userId, groups (array)' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        if (groups.length < 2) {
            return new Response(
                JSON.stringify({ suggestions: [], message: 'Need at least 2 groups to find merge candidates' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
        if (!GEMINI_API_KEY) {
            throw new Error('GEMINI_API_KEY is not configured');
        }

        // Limit to 200 groups to avoid token limits
        const limitedGroups = groups.slice(0, 200);

        const promptText = `You are a product group consolidation assistant for a Swedish grocery app. Your task is to find product GROUPS that should be merged because they represent the same underlying product.

PRODUCT GROUPS (${limitedGroups.length} groups):
${JSON.stringify(limitedGroups.map(g => ({
            name: g.name,
            products: g.productCount,
            categories: g.categories,
            samples: g.sampleProducts,
            global: g.isGlobal
        })), null, 2)}

RULES:
1. Find groups that represent the SAME product but with different names.
   Examples of groups that SHOULD merge:
   - "Eko Creme Fraiche" + "Creme fraiche" → "Creme Fraiche"
   - "ÄPPLEN ROYAL GALA" + "Äpplen Royal Gala" + "Royal Gala Äpple" → "Royal Gala"
   - "Smör Bregott" + "Bregott Smör" → "Bregott"
   - "ICA Mjölk 3%" + "Mjölk 3%" → "Mjölk 3%"
   
2. Look for:
   - Case variations (ÄPPLEN vs Äpplen)
   - Prefix/suffix variations (Eko, Organic, ICA, Willys, Coop, etc.)
   - Word order changes (Smör Bregott vs Bregott Smör)
   - Spelling variants (Fil vs Filmjölk)
   - Brand variations of same product
   - Weight/size variations that are still same product
   
3. If a group is marked as "global: true", PREFER using that group's name as the target (it's a standardized name)

4. Groups with MORE products should be weighted higher as the target

5. Use the CLEANEST, SHORTEST, most GENERIC Swedish name as the target
   - Remove brand prefixes (ICA, Willys, Coop, Garant, etc.)
   - Remove "Eko"/"Organic" prefixes unless that's the only distinguishing feature
   - Keep essential descriptors (e.g., "3%" for milk fat content)

6. Provide confidence score 0-100:
   - 90-100: Very clear match (case/spelling variants)
   - 70-89: Good match (brand variants, word order)
   - 50-69: Likely match but verify (different descriptors)
   - Below 50: Don't suggest

7. Be CONSERVATIVE - only suggest merges you're confident about

8. Handle TRANSITIVE merges: If A→B and B→C, combine into one suggestion [A, B, C]→C

RETURN FORMAT (JSON):
{
  "suggestions": [
    {
      "sourceGroups": ["Group Name 1", "Group Name 2"],
      "targetName": "Suggested Merged Name",
      "confidence": 85,
      "reasoning": "Brief explanation in Swedish"
    }
  ]
}

IMPORTANT:
- Return ONLY valid JSON
- sourceGroups must contain EXACT group names from the input
- Include ALL groups that should merge into one in the same suggestion
- Maximum 20 suggestions to keep it manageable`;

        console.log(`[suggest-group-merges] Processing ${limitedGroups.length} groups for user ${userId}`);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 55000);

        try {
            const response = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${GEMINI_API_KEY}`,
                    'Content-Type': 'application/json',
                },
                signal: controller.signal,
                body: JSON.stringify({
                    model: 'gemini-2.0-flash',
                    messages: [
                        {
                            role: 'system',
                            content: 'You are an expert at consolidating Swedish grocery product groups. Return valid JSON only.'
                        },
                        {
                            role: 'user',
                            content: promptText
                        }
                    ],
                    temperature: 0.2,
                    response_format: { type: "json_object" }
                }),
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorText = await response.text();
                console.error('AI gateway error:', response.status, errorText);

                if (response.status === 429) {
                    throw new Error('Rate limit exceeded. Please try again in a moment.');
                }
                if (response.status === 402) {
                    throw new Error('AI credits exhausted. Please add more credits.');
                }

                throw new Error(`AI gateway returned ${response.status}: ${errorText}`);
            }

            const data = await response.json();
            const content = data.choices[0].message.content;

            let parsedContent;
            try {
                let jsonString = content.trim();
                if (jsonString.startsWith('```json')) {
                    jsonString = jsonString.replace(/^```json\s*/, '').replace(/\s*```$/, '');
                } else if (jsonString.startsWith('```')) {
                    jsonString = jsonString.replace(/^```\s*/, '').replace(/\s*```$/, '');
                }
                parsedContent = JSON.parse(jsonString);
            } catch (e) {
                console.error('Failed to parse AI response:', content);
                throw new Error('Invalid AI response format');
            }

            // Validate suggestions
            interface RawSuggestion {
                sourceGroups?: string[];
                targetName?: string;
                confidence?: number;
                reasoning?: string;
            }
            const groupNames = new Set(limitedGroups.map(g => g.name));
            const validSuggestions = (parsedContent.suggestions || []).filter((s: RawSuggestion) => {
                if (!s.sourceGroups || !Array.isArray(s.sourceGroups) || s.sourceGroups.length < 2) {
                    console.warn('Invalid suggestion - need at least 2 source groups:', s);
                    return false;
                }
                if (!s.targetName || typeof s.targetName !== 'string') {
                    console.warn('Invalid suggestion - missing target name:', s);
                    return false;
                }
                // Verify all source groups exist in input
                const allExist = s.sourceGroups.every((name: string) => groupNames.has(name));
                if (!allExist) {
                    console.warn('Invalid suggestion - source group not found:', s.sourceGroups);
                    return false;
                }
                return true;
            });

            console.log(`[suggest-group-merges] Generated ${validSuggestions.length} valid suggestions`);

            return new Response(
                JSON.stringify({ suggestions: validSuggestions }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        } catch (fetchError) {
            clearTimeout(timeoutId);
            if (fetchError instanceof Error && fetchError.name === 'AbortError') {
                console.error('Request timeout after 55 seconds');
                throw new Error('Request took too long. You have many groups - try again.');
            }
            throw fetchError;
        }

    } catch (error) {
        console.error('Error in suggest-group-merges:', error);
        return new Response(
            JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error occurred' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
