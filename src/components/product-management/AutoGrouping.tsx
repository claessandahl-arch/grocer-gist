import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Sparkles, Check, X, RefreshCw, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { categoryOptions, categoryNames } from "@/lib/categoryConstants";
import { Alert, AlertDescription } from "@/components/ui/alert";

type ProductCandidate = {
    original_name: string;
    occurrences: number;
};

type GroupSuggestion = {
    groupName: string;
    products: string[];
    confidence: number;
    reasoning: string;
    excludedProducts: Set<string>;
    status: 'pending' | 'accepted' | 'skipped';
};

export function AutoGrouping() {
    const [selectedCategory, setSelectedCategory] = useState<string>("");
    const [suggestions, setSuggestions] = useState<GroupSuggestion[]>([]);
    const [isGenerating, setIsGenerating] = useState(false);
    const queryClient = useQueryClient();

    const { data: user } = useQuery({
        queryKey: ['current-user-auto-group'],
        queryFn: async () => {
            const { data: { user } } = await supabase.auth.getUser();
            return user;
        }
    });

    // Fetch ungrouped products for the selected category
    const { data: candidates = [], isLoading: candidatesLoading } = useQuery({
        queryKey: ['ungrouped-products', selectedCategory],
        queryFn: async () => {
            if (!user || !selectedCategory) return [];

            // We need to fetch products that have a category but NO mapped_name
            const { data, error } = await supabase
                .from('product_mappings')
                .select('original_name')
                .eq('user_id', user.id)
                .eq('category', selectedCategory)
                .is('mapped_name', null);

            if (error) throw error;

            // For occurrences, we would ideally join with receipts, but for now we'll just count them
            // This is a simplification. In a real scenario, we might want a dedicated RPC or view.
            // Here we will just map them to a default occurrence of 1 if we can't easily get the count,
            // or we could try to fetch receipt items.
            // Let's try to get occurrences from receipts for these products.

            // Optimization: Fetch all receipt items for this user once or filter?
            // Fetching all items is heavy. Let's stick to a simpler approach for now:
            // Just pass the names. The Edge Function prompt says "occurrences" is input, 
            // but if we don't have it easily, maybe we can skip it or fetch it separately.

            // Let's try to get a count from receipts.
            const { data: receiptItems } = await supabase
                .from('receipts')
                .select('items')
                .eq('user_id', user.id);

            const occurrenceMap = new Map<string, number>();
            receiptItems?.forEach(receipt => {
                const items = (receipt.items as any[]) || [];
                items.forEach(item => {
                    if (item.name) {
                        occurrenceMap.set(item.name, (occurrenceMap.get(item.name) || 0) + 1);
                    }
                });
            });

            return data.map(p => ({
                original_name: p.original_name,
                occurrences: occurrenceMap.get(p.original_name) || 0
            })).filter(p => p.occurrences > 0) // Only include products that actually appear in receipts
                .sort((a, b) => b.occurrences - a.occurrences);
        },
        enabled: !!user && !!selectedCategory,
    });

    const generateSuggestions = async () => {
        if (!user || !selectedCategory || candidates.length === 0) return;
        setIsGenerating(true);
        try {
            const { data, error } = await supabase.functions.invoke('suggest-product-groups', {
                body: {
                    userId: user.id,
                    category: selectedCategory,
                    products: candidates.slice(0, 50) // Batch limit to prevent timeout
                }
            });

            if (error) throw error;

            const newSuggestions = (data.suggestions as any[]).map(s => ({
                ...s,
                excludedProducts: new Set<string>(),
                status: 'pending'
            }));

            setSuggestions(newSuggestions);
            toast.success(`${newSuggestions.length} förslag genererade!`);
        } catch (error: any) {
            toast.error(`Kunde inte generera förslag: ${error.message}`);
        } finally {
            setIsGenerating(false);
        }
    };

    const applyGroups = useMutation({
        mutationFn: async (groupsToApply: GroupSuggestion[]) => {
            if (!user) throw new Error('Not authenticated');
            let successfulGroups = 0;
            let failedUpdates = 0;

            for (const group of groupsToApply) {
                const productsToGroup = group.products.filter(p => !group.excludedProducts.has(p));

                for (const productName of productsToGroup) {
                    const { error } = await supabase
                        .from('product_mappings')
                        .update({ mapped_name: group.groupName })
                        .eq('user_id', user.id)
                        .eq('original_name', productName);

                    if (error) failedUpdates++;
                }
                successfulGroups++;
            }

            if (failedUpdates > 0) console.warn(`${failedUpdates} products failed to update`);
            return { successfulGroups };
        },
        onSuccess: (data) => {
            toast.success(`${data.successfulGroups} grupper sparade!`);
            queryClient.invalidateQueries({ queryKey: ['ungrouped-products'] });
            queryClient.invalidateQueries({ queryKey: ['product-mappings'] });
            setSuggestions([]);
        },
        onError: (error: Error) => toast.error(`Fel: ${error.message}`)
    });

    const handleSave = () => {
        const accepted = suggestions.filter(s => s.status === 'accepted');
        if (accepted.length === 0) return toast.error("Inga accepterade grupper att spara");
        applyGroups.mutate(accepted);
    };

    const toggleProductExclusion = (groupIndex: number, productName: string) => {
        setSuggestions(prev => prev.map((g, i) => {
            if (i !== groupIndex) return g;
            const newExcluded = new Set(g.excludedProducts);
            if (newExcluded.has(productName)) newExcluded.delete(productName);
            else newExcluded.add(productName);
            return { ...g, excludedProducts: newExcluded };
        }));
    };

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5" />Auto-Gruppering</CardTitle>
                    <CardDescription>Använd AI för att hitta och gruppera varianter av samma produkt.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex gap-4 items-end">
                        <div className="space-y-2 flex-1">
                            <label className="text-sm font-medium">Välj kategori att analysera</label>
                            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Välj kategori" />
                                </SelectTrigger>
                                <SelectContent>
                                    {categoryOptions.map(opt => (
                                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <Button
                            onClick={generateSuggestions}
                            disabled={!selectedCategory || candidates.length === 0 || isGenerating}
                        >
                            {isGenerating ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                            Generera förslag
                        </Button>
                    </div>

                    {selectedCategory && (
                        <div className="text-sm text-muted-foreground">
                            {candidatesLoading ? "Laddar produkter..." : `${candidates.length} kandidater hittades för analys.`}
                        </div>
                    )}
                </CardContent>
            </Card>

            {suggestions.length > 0 && (
                <div className="space-y-4">
                    <div className="flex justify-between items-center">
                        <h3 className="text-lg font-semibold">Förslag ({suggestions.length})</h3>
                        <Button onClick={handleSave} disabled={applyGroups.isPending}>
                            {applyGroups.isPending ? "Sparar..." : `Spara ${suggestions.filter(s => s.status === 'accepted').length} grupper`}
                        </Button>
                    </div>

                    <div className="grid gap-4">
                        {suggestions.map((group, index) => (
                            <Card key={index} className={`border-l-4 ${group.status === 'accepted' ? 'border-l-green-500' : group.status === 'skipped' ? 'border-l-gray-300' : 'border-l-blue-500'}`}>
                                <CardContent className="pt-6">
                                    <div className="flex justify-between items-start gap-4">
                                        <div className="space-y-3 flex-1">
                                            <div className="flex items-center gap-3">
                                                <Input
                                                    value={group.groupName}
                                                    onChange={(e) => setSuggestions(prev => prev.map((g, i) => i === index ? { ...g, groupName: e.target.value } : g))}
                                                    className="font-semibold text-lg w-auto min-w-[200px]"
                                                />
                                                <Badge variant={group.confidence > 80 ? "default" : group.confidence > 50 ? "secondary" : "destructive"}>
                                                    {group.confidence}% säkerhet
                                                </Badge>
                                            </div>
                                            <p className="text-sm text-muted-foreground italic">{group.reasoning}</p>

                                            <div className="bg-muted/30 p-3 rounded-md space-y-2">
                                                <p className="text-xs font-medium uppercase text-muted-foreground">Produkter att gruppera:</p>
                                                {group.products.map(product => (
                                                    <div key={product} className="flex items-center gap-2">
                                                        <Checkbox
                                                            checked={!group.excludedProducts.has(product)}
                                                            onCheckedChange={() => toggleProductExclusion(index, product)}
                                                        />
                                                        <span className={group.excludedProducts.has(product) ? "text-muted-foreground line-through" : ""}>{product}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="flex flex-col gap-2">
                                            <Button
                                                size="sm"
                                                variant={group.status === 'accepted' ? "default" : "outline"}
                                                onClick={() => setSuggestions(prev => prev.map((g, i) => i === index ? { ...g, status: 'accepted' } : g))}
                                            >
                                                <Check className="h-4 w-4 mr-2" /> Acceptera
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant={group.status === 'skipped' ? "secondary" : "ghost"}
                                                onClick={() => setSuggestions(prev => prev.map((g, i) => i === index ? { ...g, status: 'skipped' } : g))}
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
