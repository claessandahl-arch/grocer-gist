import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, Check, X, RefreshCw, ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { categoryOptions, categoryNames } from "@/lib/categoryConstants";
import { Alert, AlertDescription } from "@/components/ui/alert";

const BATCH_SIZE = 15;

type ItemOccurrence = {
  receiptId: string;
  productName: string;
  storeName: string;
  receiptDate: string;
  price: number;
  itemIndex: number;
};

type UncategorizedProduct = {
  name: string;
  occurrences: number;
  items: ItemOccurrence[];
};

type CategorySuggestion = {
  product: string;
  category: string;
  confidence: number;
  reasoning: string;
};

type ProductWithSuggestion = UncategorizedProduct & {
  suggestion?: CategorySuggestion;
  userCategory?: string;
  status: 'pending' | 'accepted' | 'modified' | 'skipped';
  excludedItemIds: Set<string>;
  isExpanded: boolean;
};

export function AICategorization() {
  const [currentBatch, setCurrentBatch] = useState<ProductWithSuggestion[]>([]);
  const [batchIndex, setBatchIndex] = useState(0);
  const [isGeneratingSuggestions, setIsGeneratingSuggestions] = useState(false);
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['current-user-ai-cat'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      return user;
    }
  });

  const { data: receipts, isLoading: receiptsLoading } = useQuery({
    queryKey: ['receipts-for-categorization'],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('receipts')
        .select('id, store_name, receipt_date, items')
        .eq('user_id', user.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const { data: mappings } = useQuery({
    queryKey: ['mappings-for-categorization'],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('product_mappings')
        .select('original_name, category')
        .eq('user_id', user.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const uncategorizedProducts = useMemo(() => {
    if (!receipts || !mappings) return [];

    const categorizedProducts = new Set<string>();
    mappings.forEach(m => {
      if (m.category) categorizedProducts.add(m.original_name.toLowerCase());
    });

    const productData = new Map<string, ItemOccurrence[]>();
    receipts.forEach(receipt => {
      const items = (receipt.items as any[]) || [];
      items.forEach((item, itemIndex) => {
        if (item.name) {
          if (!productData.has(item.name)) productData.set(item.name, []);
          productData.get(item.name)!.push({
            receiptId: receipt.id,
            productName: item.name,
            storeName: receipt.store_name || 'Okänd butik',
            receiptDate: receipt.receipt_date || '',
            price: item.price || 0,
            itemIndex,
          });
        }
      });
    });

    const uncategorized: UncategorizedProduct[] = [];
    productData.forEach((items, name) => {
      if (!categorizedProducts.has(name.toLowerCase())) {
        uncategorized.push({ name, occurrences: items.length, items });
      }
    });

    uncategorized.sort((a, b) => b.occurrences - a.occurrences);
    return uncategorized;
  }, [receipts, mappings]);

  const totalBatches = Math.ceil(uncategorizedProducts.length / BATCH_SIZE);
  const startIndex = batchIndex * BATCH_SIZE;
  const endIndex = Math.min(startIndex + BATCH_SIZE, uncategorizedProducts.length);

  useEffect(() => {
    if (uncategorizedProducts.length > 0) {
      const batch = uncategorizedProducts
        .slice(startIndex, endIndex)
        .map(p => ({ ...p, status: 'pending' as const, excludedItemIds: new Set<string>(), isExpanded: false }));
      setCurrentBatch(batch);
    }
  }, [batchIndex, uncategorizedProducts, startIndex, endIndex]);

  const generateSuggestions = async () => {
    if (!user || currentBatch.length === 0) return;
    setIsGeneratingSuggestions(true);
    try {
      const { data, error } = await supabase.functions.invoke('suggest-categories', {
        body: { products: currentBatch.map(p => ({ name: p.name, occurrences: p.occurrences })), userId: user.id }
      });
      if (error) throw error;
      const suggestions = data.suggestions as CategorySuggestion[];
      setCurrentBatch(prev => prev.map(product => {
        const suggestion = suggestions.find(s => s.product === product.name);
        return { ...product, suggestion, userCategory: suggestion?.category };
      }));
      toast.success(`${suggestions.length} förslag genererade!`);
    } catch (error: any) {
      toast.error(`Kunde inte generera förslag: ${error.message}`);
    } finally {
      setIsGeneratingSuggestions(false);
    }
  };

  const applyCategories = useMutation({
    mutationFn: async (productsToApply: ProductWithSuggestion[]) => {
      if (!user) throw new Error('Not authenticated');
      let successfulMappings = 0;
      let failedUpdates = 0;

      for (const product of productsToApply) {
        if (product.status !== 'accepted' && product.status !== 'modified') continue;
        const { error } = await supabase.from('product_mappings').upsert({
          user_id: user.id,
          original_name: product.name,
          mapped_name: product.name,
          category: product.userCategory,
        }, { onConflict: 'user_id,original_name' });

        if (error) failedUpdates++;
        else successfulMappings++;
      }
      if (failedUpdates > 0) throw new Error(`${failedUpdates} misslyckades`);
      return { successfulMappings, failedUpdates };
    },
    onSuccess: (data) => {
      toast.success(`${data.successfulMappings} kategorier sparade!`);
      queryClient.invalidateQueries({ queryKey: ['receipts-for-categorization'] });
      queryClient.invalidateQueries({ queryKey: ['mappings-for-categorization'] });
      queryClient.invalidateQueries({ queryKey: ['product-mappings'] });
      setCurrentBatch([]);
      setBatchIndex(0);
    },
    onError: (error: Error) => toast.error(`Fel: ${error.message}`)
  });

  const handleAccept = (index: number) => setCurrentBatch(prev => prev.map((p, i) => i === index ? { ...p, status: 'accepted' as const } : p));
  const handleModify = (index: number, newCategory: string) => setCurrentBatch(prev => prev.map((p, i) => i === index ? { ...p, userCategory: newCategory, status: 'modified' as const } : p));
  const handleSkip = (index: number) => setCurrentBatch(prev => prev.map((p, i) => i === index ? { ...p, status: 'skipped' as const } : p));
  const handleToggleExpand = (index: number) => setCurrentBatch(prev => prev.map((p, i) => i === index ? { ...p, isExpanded: !p.isExpanded } : p));
  const handleExcludeItem = (productIndex: number, itemId: string) => {
    setCurrentBatch(prev => prev.map((p, i) => {
      if (i === productIndex) {
        const newExcludedIds = new Set(p.excludedItemIds);
        newExcludedIds.has(itemId) ? newExcludedIds.delete(itemId) : newExcludedIds.add(itemId);
        return { ...p, excludedItemIds: newExcludedIds };
      }
      return p;
    }));
  };

  const handleApplyBatch = () => {
    const toApply = currentBatch.filter(p => p.status === 'accepted' || p.status === 'modified');
    if (toApply.length === 0) return toast.error('Acceptera kategorier först');
    applyCategories.mutate(toApply);
  };

  const acceptedCount = currentBatch.filter(p => p.status === 'accepted' || p.status === 'modified').length;

  if (receiptsLoading) return <Card><CardHeader><CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5" />AI-Kategorisering</CardTitle></CardHeader><CardContent><p className="text-muted-foreground">Laddar...</p></CardContent></Card>;
  if (uncategorizedProducts.length === 0) return <Card><CardHeader><CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5" />AI-Kategorisering</CardTitle></CardHeader><CardContent><Alert><Check className="h-4 w-4" /><AlertDescription>Alla produkter är kategoriserade! 🎉</AlertDescription></Alert></CardContent></Card>;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5" />AI-Kategorisering</CardTitle>
        <CardDescription>Använd AI för att kategorisera produkter via product_mappings</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>{uncategorizedProducts.length} okategoriserade produkter</span>
            <span>Batch {batchIndex + 1} av {totalBatches}</span>
          </div>
          <Progress value={(batchIndex / totalBatches) * 100} />
        </div>

        <div className="space-y-4">
          {currentBatch.map((product, index) => (
            <Card key={product.name} className="border-2">
              <CardContent className="pt-6 space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <h3 className="font-semibold">{product.name}</h3>
                    <p className="text-sm text-muted-foreground">{product.items.length} förekomster</p>
                  </div>
                  {product.status === 'accepted' && <Badge className="bg-green-500"><Check className="h-3 w-3 mr-1" />Accepterad</Badge>}
                  {product.status === 'modified' && <Badge className="bg-blue-500"><Check className="h-3 w-3 mr-1" />Modifierad</Badge>}
                  {product.status === 'skipped' && <Badge variant="secondary"><X className="h-3 w-3 mr-1" />Överhoppad</Badge>}
                </div>

                {product.suggestion && (
                  <div className="bg-muted/50 p-4 rounded-lg space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">AI-förslag:</span>
                      <Badge variant="outline">{Math.round(product.suggestion.confidence * 100)}% säker</Badge>
                    </div>
                    <span className="font-semibold">{categoryNames[product.suggestion.category] || product.suggestion.category}</span>
                  </div>
                )}

                <Select value={product.userCategory || ''} onValueChange={(value) => handleModify(index, value)}>
                  <SelectTrigger className="flex-1"><SelectValue placeholder="Välj kategori" /></SelectTrigger>
                  <SelectContent>{categoryOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
                </Select>

                <div className="flex gap-2">
                  {product.status === 'pending' && product.suggestion && (
                    <Button variant="default" size="sm" className="flex-1" onClick={() => handleAccept(index)} disabled={!product.userCategory}>
                      <Check className="h-4 w-4 mr-2" />Acceptera
                    </Button>
                  )}
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => handleSkip(index)}><X className="h-4 w-4 mr-2" />Hoppa över</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex gap-2 pt-4 border-t">
          <Button onClick={generateSuggestions} disabled={isGeneratingSuggestions || currentBatch.length === 0} className="flex-1">
            {isGeneratingSuggestions ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Genererar...</> : <><Sparkles className="h-4 w-4 mr-2" />Generera AI-förslag</>}
          </Button>
          <Button onClick={handleApplyBatch} disabled={acceptedCount === 0 || applyCategories.isPending} variant="default" className="flex-1">
            {applyCategories.isPending ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Sparar...</> : <><Check className="h-4 w-4 mr-2" />Spara kategorier {acceptedCount > 0 && `(${acceptedCount})`}</>}
          </Button>
        </div>

        {totalBatches > 1 && (
          <div className="flex justify-between items-center pt-4 border-t">
            <Button variant="outline" onClick={() => setBatchIndex(prev => Math.max(0, prev - 1))} disabled={batchIndex === 0}>Föregående</Button>
            <span className="text-sm text-muted-foreground">{startIndex + 1}-{endIndex} av {uncategorizedProducts.length}</span>
            <Button variant="outline" onClick={() => setBatchIndex(prev => Math.min(totalBatches - 1, prev + 1))} disabled={batchIndex === totalBatches - 1}>Nästa</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
