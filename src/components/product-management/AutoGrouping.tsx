import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Sparkles, Check, X, RefreshCw, ArrowRight, Layers } from "lucide-react";
import { toast } from "sonner";

type ProductGroup = {
    name: string;
    productCount: number;
    categories: string[];
    sampleProducts: string[];
    isGlobal: boolean;
};

type MergeSuggestion = {
    sourceGroups: string[];
    targetName: string;
    confidence: number;
    reasoning: string;
    excludedGroups: Set<string>;
    status: 'pending' | 'accepted' | 'skipped';
};

export function AutoGrouping() {
    const [suggestions, setSuggestions] = useState<MergeSuggestion[]>([]);
    const [isGenerating, setIsGenerating] = useState(false);
    const queryClient = useQueryClient();

    const { data: user } = useQuery({
        queryKey: ['current-user-auto-group'],
        queryFn: async () => {
            const { data: { user } } = await supabase.auth.getUser();
            return user;
        }
    });

    // Fetch all product groups across all categories
    const { data: productGroups = [], isLoading: groupsLoading } = useQuery({
        queryKey: ['all-product-groups'],
        queryFn: async () => {
            if (!user) return [];

            // Fetch user's product mappings
            const { data: userMappings, error: userError } = await supabase
                .from('product_mappings')
                .select('original_name, mapped_name, category')
                .eq('user_id', user.id)
                .not('mapped_name', 'is', null);

            if (userError) throw userError;

            // Fetch global product mappings to check if a group is global
            const { data: globalMappings, error: globalError } = await supabase
                .from('global_product_mappings')
                .select('mapped_name');

            if (globalError) throw globalError;

            const globalGroupNames = new Set(globalMappings?.map(g => g.mapped_name) || []);

            // Group products by mapped_name
            const groupMap = new Map<string, {
                products: string[];
                categories: Set<string>;
            }>();

            userMappings?.forEach(mapping => {
                if (!mapping.mapped_name) return;
                
                const existing = groupMap.get(mapping.mapped_name);
                if (existing) {
                    existing.products.push(mapping.original_name);
                    if (mapping.category) existing.categories.add(mapping.category);
                } else {
                    groupMap.set(mapping.mapped_name, {
                        products: [mapping.original_name],
                        categories: new Set(mapping.category ? [mapping.category] : [])
                    });
                }
            });

            // Convert to array format expected by Edge Function
            const groups: ProductGroup[] = [];
            groupMap.forEach((value, name) => {
                groups.push({
                    name,
                    productCount: value.products.length,
                    categories: Array.from(value.categories),
                    sampleProducts: value.products.slice(0, 3),
                    isGlobal: globalGroupNames.has(name)
                });
            });

            return groups.sort((a, b) => b.productCount - a.productCount);
        },
        enabled: !!user
    });

    const generateSuggestions = async () => {
        if (!user || productGroups.length < 2) return;
        setIsGenerating(true);
        setSuggestions([]);
        
        try {
            const { data, error } = await supabase.functions.invoke('suggest-group-merges', {
                body: {
                    userId: user.id,
                    groups: productGroups
                }
            });

            if (error) throw error;

            if (data.error) {
                throw new Error(data.error);
            }

            const rawSuggestions = data.suggestions || [];

            if (rawSuggestions.length === 0) {
                toast.info("Inga liknande grupper hittades att slå ihop!");
            } else {
                const processedSuggestions = rawSuggestions.map((s: { sourceGroups: string[]; targetName: string; confidence: number; reasoning: string }) => ({
                    sourceGroups: s.sourceGroups,
                    targetName: s.targetName,
                    confidence: s.confidence,
                    reasoning: s.reasoning,
                    excludedGroups: new Set<string>(),
                    status: 'pending' as const
                }));
                setSuggestions(processedSuggestions);
                toast.success(`${processedSuggestions.length} sammanslagningsförslag hittades!`);
            }

        } catch (error) {
            console.error('Error generating suggestions:', error);
            toast.error(`Kunde inte generera förslag: ${(error as Error).message}`);
        } finally {
            setIsGenerating(false);
        }
    };

    const applyMerges = useMutation({
        mutationFn: async (mergesToApply: MergeSuggestion[]) => {
            if (!user) throw new Error('Not authenticated');
            let successfulMerges = 0;
            let failedUpdates = 0;

            for (const merge of mergesToApply) {
                // Get all source groups except excluded ones
                const groupsToMerge = merge.sourceGroups.filter(g => !merge.excludedGroups.has(g));
                
                // Update all products from source groups to the target name
                for (const sourceGroup of groupsToMerge) {
                    if (sourceGroup === merge.targetName) continue; // Skip if already target
                    
                    const { error } = await supabase
                        .from('product_mappings')
                        .update({ mapped_name: merge.targetName })
                        .eq('user_id', user.id)
                        .eq('mapped_name', sourceGroup);

                    if (error) {
                        console.error(`Failed to merge ${sourceGroup} -> ${merge.targetName}:`, error);
                        failedUpdates++;
                    }
                }
                successfulMerges++;
            }

            if (failedUpdates > 0) console.warn(`${failedUpdates} updates failed`);
            return { successfulMerges };
        },
        onSuccess: (data) => {
            toast.success(`${data.successfulMerges} sammanslagningar genomförda!`);
            queryClient.invalidateQueries({ queryKey: ['all-product-groups'] });
            queryClient.invalidateQueries({ queryKey: ['product-mappings'] });
            queryClient.invalidateQueries({ queryKey: ['grouped-products'] });
            setSuggestions([]);
        },
        onError: (error: Error) => toast.error(`Fel: ${error.message}`)
    });

    const handleSave = () => {
        const accepted = suggestions.filter(s => s.status === 'accepted');
        if (accepted.length === 0) return toast.error("Inga accepterade sammanslagningar att spara");
        applyMerges.mutate(accepted);
    };

    const toggleGroupExclusion = (suggestionIndex: number, groupName: string) => {
        setSuggestions(prev => prev.map((s, i) => {
            if (i !== suggestionIndex) return s;
            const newExcluded = new Set(s.excludedGroups);
            if (newExcluded.has(groupName)) newExcluded.delete(groupName);
            else newExcluded.add(groupName);
            return { ...s, excludedGroups: newExcluded };
        }));
    };

    const getProductCountForGroup = (groupName: string) => {
        const group = productGroups.find(g => g.name === groupName);
        return group?.productCount || 0;
    };

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Layers className="h-5 w-5" />
                        Auto-Gruppering
                    </CardTitle>
                    <CardDescription>
                        Använd AI för att hitta liknande produktgrupper som kan slås ihop.
                        T.ex. "Eko Creme Fraiche" och "Creme fraiche" → "Creme Fraiche"
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex gap-4 items-center">
                        <div className="flex-1">
                            {groupsLoading ? (
                                <p className="text-sm text-muted-foreground">Laddar produktgrupper...</p>
                            ) : (
                                <p className="text-sm text-muted-foreground">
                                    <span className="font-medium">{productGroups.length}</span> produktgrupper hittades.
                                    {productGroups.filter(g => g.isGlobal).length > 0 && (
                                        <span className="ml-2">
                                            ({productGroups.filter(g => g.isGlobal).length} globala)
                                        </span>
                                    )}
                                </p>
                            )}
                        </div>
                        <Button
                            onClick={generateSuggestions}
                            disabled={productGroups.length < 2 || isGenerating}
                        >
                            {isGenerating ? (
                                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                                <Sparkles className="h-4 w-4 mr-2" />
                            )}
                            {isGenerating ? "Analyserar..." : "Sök liknande grupper"}
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {suggestions.length > 0 && (
                <div className="space-y-4">
                    <div className="flex justify-between items-center">
                        <h3 className="text-lg font-semibold">
                            Förslag ({suggestions.length})
                        </h3>
                        <Button onClick={handleSave} disabled={applyMerges.isPending}>
                            {applyMerges.isPending ? "Sparar..." : `Slå ihop ${suggestions.filter(s => s.status === 'accepted').length} grupper`}
                        </Button>
                    </div>

                    <div className="grid gap-4">
                        {suggestions.map((suggestion, index) => (
                            <Card 
                                key={index} 
                                className={`border-l-4 ${
                                    suggestion.status === 'accepted' 
                                        ? 'border-l-green-500' 
                                        : suggestion.status === 'skipped' 
                                            ? 'border-l-gray-300' 
                                            : 'border-l-blue-500'
                                }`}
                            >
                                <CardContent className="pt-6">
                                    <div className="flex justify-between items-start gap-4">
                                        <div className="space-y-3 flex-1">
                                            <div className="flex items-center gap-3 flex-wrap">
                                                <Badge variant={
                                                    suggestion.confidence > 80 ? "default" : 
                                                    suggestion.confidence > 50 ? "secondary" : 
                                                    "destructive"
                                                }>
                                                    {suggestion.confidence}% säkerhet
                                                </Badge>
                                            </div>
                                            
                                            <p className="text-sm text-muted-foreground italic">
                                                {suggestion.reasoning}
                                            </p>

                                            <div className="bg-muted/30 p-4 rounded-md space-y-3">
                                                <p className="text-xs font-medium uppercase text-muted-foreground">
                                                    Grupper att slå ihop:
                                                </p>
                                                
                                                <div className="flex flex-wrap items-center gap-2">
                                                    {suggestion.sourceGroups.map((groupName, gIndex) => (
                                                        <div key={groupName} className="flex items-center gap-2">
                                                            {gIndex > 0 && (
                                                                <span className="text-muted-foreground">+</span>
                                                            )}
                                                            <div className="flex items-center gap-2 bg-background px-3 py-1.5 rounded border">
                                                                <Checkbox
                                                                    checked={!suggestion.excludedGroups.has(groupName)}
                                                                    onCheckedChange={() => toggleGroupExclusion(index, groupName)}
                                                                />
                                                                <span className={suggestion.excludedGroups.has(groupName) ? "text-muted-foreground line-through" : ""}>
                                                                    {groupName}
                                                                </span>
                                                                <Badge variant="outline" className="text-xs">
                                                                    {getProductCountForGroup(groupName)} produkter
                                                                </Badge>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>

                                                <div className="flex items-center gap-3 pt-2 border-t">
                                                    <ArrowRight className="h-5 w-5 text-muted-foreground" />
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm font-medium">Ny gruppnamn:</span>
                                                        <Input
                                                            value={suggestion.targetName}
                                                            onChange={(e) => setSuggestions(prev => 
                                                                prev.map((s, i) => i === index 
                                                                    ? { ...s, targetName: e.target.value } 
                                                                    : s
                                                                )
                                                            )}
                                                            className="w-auto min-w-[200px] font-semibold"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex flex-col gap-2">
                                            <Button
                                                size="sm"
                                                variant={suggestion.status === 'accepted' ? "default" : "outline"}
                                                onClick={() => setSuggestions(prev => 
                                                    prev.map((s, i) => i === index 
                                                        ? { ...s, status: 'accepted' } 
                                                        : s
                                                    )
                                                )}
                                            >
                                                <Check className="h-4 w-4 mr-2" /> Acceptera
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant={suggestion.status === 'skipped' ? "secondary" : "ghost"}
                                                onClick={() => setSuggestions(prev => 
                                                    prev.map((s, i) => i === index 
                                                        ? { ...s, status: 'skipped' } 
                                                        : s
                                                    )
                                                )}
                                            >
                                                <X className="h-4 w-4 mr-2" /> Hoppa över
                                            </Button>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
