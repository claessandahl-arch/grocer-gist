import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, Check, X, AlertCircle, RefreshCw, ChevronDown, ChevronUp, Trash2 } from "lucide-react";
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
  const [processedCount, setProcessedCount] = useState(0);
  const queryClient = useQueryClient();

  // Fetch user
  const { data: user } = useQuery({
    queryKey: ['current-user-ai-cat'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      return user;
    }
  });

  // Fetch all receipts to find uncategorized products
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

  // Fetch existing mappings
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

  // Find uncategorized products (sorted by occurrence)
  const uncategorizedProducts = useMemo(() => {
    if (!receipts || !mappings) return [];

    // Count product occurrences and track item details
    const productData = new Map<string, ItemOccurrence[]>();
    receipts.forEach(receipt => {
      const items = (receipt.items as any[]) || [];
      items.forEach((item, itemIndex) => {
        if (item.name) {
          if (!productData.has(item.name)) {
            productData.set(item.name, []);
          }
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

    // Find products without category in mappings
    const mappingsMap = new Map(mappings.map(m => [m.original_name.toLowerCase(), m.category]));
    const uncategorized: UncategorizedProduct[] = [];

    productData.forEach((items, name) => {
      const category = mappingsMap.get(name.toLowerCase());
      if (!category || category === null) {
        uncategorized.push({ 
          name, 
          occurrences: items.length,
          items 
        });
      }
    });

    // Sort by occurrence (most common first)
    uncategorized.sort((a, b) => b.occurrences - a.occurrences);

    return uncategorized;
  }, [receipts, mappings]);

  // Get current batch
  const totalBatches = Math.ceil(uncategorizedProducts.length / BATCH_SIZE);
  const startIndex = batchIndex * BATCH_SIZE;
  const endIndex = Math.min(startIndex + BATCH_SIZE, uncategorizedProducts.length);

  // Initialize batch when index changes
  useEffect(() => {
    if (uncategorizedProducts.length > 0) {
      const batch = uncategorizedProducts
        .slice(startIndex, endIndex)
        .map(p => ({ 
          ...p, 
          status: 'pending' as const,
          excludedItemIds: new Set<string>(),
          isExpanded: false
        }));
      setCurrentBatch(batch);
    }
  }, [batchIndex, uncategorizedProducts, startIndex, endIndex]);

  // Generate AI suggestions
  const generateSuggestions = async () => {
    if (!user || currentBatch.length === 0) return;

    setIsGeneratingSuggestions(true);

    try {
      const { data, error } = await supabase.functions.invoke('suggest-categories', {
        body: {
          products: currentBatch.map(p => ({ name: p.name, occurrences: p.occurrences })),
          userId: user.id,
        }
      });

      if (error) throw error;

      const suggestions = data.suggestions as CategorySuggestion[];

      // Match suggestions to products
      setCurrentBatch(prev => prev.map(product => {
        const suggestion = suggestions.find(s => s.product === product.name);
        return {
          ...product,
          suggestion,
          userCategory: suggestion?.category,
        };
      }));

      toast.success(`${suggestions.length} förslag genererade!`);
    } catch (error: any) {
      console.error('Error generating suggestions:', error);
      toast.error(`Kunde inte generera förslag: ${error.message}`);
    } finally {
      setIsGeneratingSuggestions(false);
    }
  };

  // Save feedback mutation (currently disabled as feedback table doesn't exist)
  const saveFeedback = useMutation({
    mutationFn: async (product: ProductWithSuggestion) => {
      // Feedback saving is currently disabled
      // Will be re-enabled when category_suggestion_feedback table is created
      return Promise.resolve();
    },
  });

  // Apply categories mutation
  const applyCategories = useMutation({
    mutationFn: async (productsToApply: ProductWithSuggestion[]) => {
      if (!user) throw new Error('Not authenticated');

      let totalUpdated = 0;

      for (const product of productsToApply) {
        if (product.status !== 'accepted' && product.status !== 'modified') continue;

        // Get non-excluded items
        const itemsToUpdate = product.items.filter(item => {
          const itemId = `${item.receiptId}-${item.itemIndex}`;
          return !product.excludedItemIds.has(itemId);
        });

        if (itemsToUpdate.length === 0) continue;

        // Group by receipt
        const receiptUpdates = new Map<string, number[]>();
        itemsToUpdate.forEach(item => {
          if (!receiptUpdates.has(item.receiptId)) {
            receiptUpdates.set(item.receiptId, []);
          }
          receiptUpdates.get(item.receiptId)!.push(item.itemIndex);
        });

        // Update each receipt
        for (const [receiptId, itemIndices] of receiptUpdates) {
          const { data: receipt, error: fetchError } = await supabase
            .from('receipts')
            .select('items')
            .eq('id', receiptId)
            .single();

          if (fetchError || !receipt) continue;

          const items = (receipt.items as any[]) || [];
          itemIndices.forEach(idx => {
            if (items[idx]) {
              items[idx].category = product.userCategory;
            }
          });

          const { error: updateError } = await supabase
            .from('receipts')
            .update({ items })
            .eq('id', receiptId);

          if (!updateError) {
            totalUpdated += itemIndices.length;
          }
        }

        // Also create a mapping for future items
        const { error: mappingError } = await supabase
          .from('product_mappings')
          .upsert({
            user_id: user.id,
            original_name: product.name,
            mapped_name: null,
            category: product.userCategory!,
          }, {
            onConflict: 'user_id,original_name',
            ignoreDuplicates: false
          });

        // Save feedback for learning
        await saveFeedback.mutateAsync(product);
      }

      return { count: totalUpdated };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['mappings-for-categorization'] });
      queryClient.invalidateQueries({ queryKey: ['receipts-for-categorization'] });
      setProcessedCount(prev => prev + result.count);
      toast.success(`${result.count} kategorier sparade!`);

      // Move to next batch
      if (batchIndex < totalBatches - 1) {
        setBatchIndex(prev => prev + 1);
      } else {
        toast.success('Alla produkter kategoriserade! 🎉');
      }
    },
    onError: (error: any) => {
      console.error('Error applying categories:', error);
      toast.error(`Kunde inte spara kategorier: ${error.message}`);
    }
  });

  const handleToggleExpand = (index: number) => {
    setCurrentBatch(prev => prev.map((p, i) =>
      i === index ? { ...p, isExpanded: !p.isExpanded } : p
    ));
  };

  const handleExcludeItem = (productIndex: number, itemId: string) => {
    setCurrentBatch(prev => prev.map((p, i) => {
      if (i === productIndex) {
        const newExcluded = new Set(p.excludedItemIds);
        if (newExcluded.has(itemId)) {
          newExcluded.delete(itemId);
        } else {
          newExcluded.add(itemId);
        }
        return { ...p, excludedItemIds: newExcluded };
      }
      return p;
    }));
  };

  const handleAccept = (index: number) => {
    setCurrentBatch(prev => prev.map((p, i) =>
      i === index ? { ...p, status: 'accepted' as const } : p
    ));
  };

  const handleModify = (index: number, newCategory: string) => {
    setCurrentBatch(prev => prev.map((p, i) =>
      i === index ? { ...p, userCategory: newCategory, status: 'modified' as const } : p
    ));
  };

  const handleSkip = (index: number) => {
    setCurrentBatch(prev => prev.map((p, i) =>
      i === index ? { ...p, status: 'skipped' as const } : p
    ));
  };

  const handleApplyBatch = () => {
    applyCategories.mutate(currentBatch);
  };

  const readyToApply = currentBatch.some(p => p.status === 'accepted' || p.status === 'modified');
  const allReviewed = currentBatch.every(p => p.status !== 'pending');
  const progress = uncategorizedProducts.length > 0
    ? Math.round(((processedCount + currentBatch.filter(p => p.status !== 'pending' && p.status !== 'skipped').length) / uncategorizedProducts.length) * 100)
    : 0;

  if (receiptsLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-center text-muted-foreground">Laddar...</p>
        </CardContent>
      </Card>
    );
  }

  if (uncategorizedProducts.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI-Kategorisering
          </CardTitle>
          <CardDescription>Använd AI för att kategorisera produkter</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert className="bg-green-500/10 border-green-500/20">
            <Check className="h-4 w-4 text-green-500" />
            <AlertDescription className="text-green-700 dark:text-green-400">
              Alla produkter är kategoriserade! 🎉
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              AI-Kategorisering
            </CardTitle>
            <CardDescription>
              {uncategorizedProducts.length} produkter behöver kategoriseras
            </CardDescription>
          </div>
          {currentBatch.length > 0 && !currentBatch[0].suggestion && (
            <Button
              onClick={generateSuggestions}
              disabled={isGeneratingSuggestions}
              className="gap-2"
            >
              {isGeneratingSuggestions ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Genererar...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Generera AI-förslag
                </>
              )}
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Progress */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Progress</span>
            <span>{processedCount} / {uncategorizedProducts.length} klara</span>
          </div>
          <Progress value={progress} />
          <p className="text-xs text-muted-foreground">
            Batch {batchIndex + 1} av {totalBatches}
          </p>
        </div>

        {/* Batch list */}
        <div className="space-y-3">
          {currentBatch.map((product, index) => (
            <Card key={product.name} className={`p-4 ${
              product.status === 'accepted' ? 'border-green-500/50 bg-green-500/5' :
              product.status === 'modified' ? 'border-blue-500/50 bg-blue-500/5' :
              product.status === 'skipped' ? 'border-gray-500/50 bg-gray-500/5' :
              ''
            }`}>
              <div className="space-y-3">
                {/* Product name and occurrences */}
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="font-semibold">{product.name}</p>
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-muted-foreground">
                        Förekommer {product.occurrences - product.excludedItemIds.size} gång{(product.occurrences - product.excludedItemIds.size) !== 1 ? 'er' : ''}
                        {product.excludedItemIds.size > 0 && (
                          <span className="text-orange-500">
                            {' '}({product.excludedItemIds.size} exkluderade)
                          </span>
                        )}
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleToggleExpand(index)}
                        className="h-6 px-2 text-xs"
                      >
                        {product.isExpanded ? (
                          <>
                            <ChevronUp className="h-3 w-3 mr-1" />
                            Dölj
                          </>
                        ) : (
                          <>
                            <ChevronDown className="h-3 w-3 mr-1" />
                            Visa alla [{product.occurrences}]
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                  {product.status !== 'pending' && (
                    <Badge variant={
                      product.status === 'accepted' ? 'default' :
                      product.status === 'modified' ? 'secondary' :
                      'outline'
                    }>
                      {product.status === 'accepted' ? 'Accepterad' :
                       product.status === 'modified' ? 'Justerad' :
                       'Hoppades över'}
                    </Badge>
                  )}
                </div>

                {/* Expandable item list */}
                {product.isExpanded && (
                  <div className="mt-3 space-y-2 border-t pt-3">
                    <p className="text-xs font-medium text-muted-foreground mb-2">Förekomster:</p>
                    <div className="space-y-1 max-h-60 overflow-y-auto">
                      {product.items.map((item, itemIdx) => {
                        const itemId = `${item.receiptId}-${item.itemIndex}`;
                        const isExcluded = product.excludedItemIds.has(itemId);
                        return (
                          <div
                            key={itemId}
                            className={`flex items-center justify-between gap-2 p-2 rounded text-xs ${
                              isExcluded ? 'bg-muted/30 line-through opacity-50' : 'bg-muted/50'
                            }`}
                          >
                              <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{item.productName}</span>
                                <span className="text-muted-foreground">•</span>
                                <span className="text-muted-foreground">{item.storeName}</span>
                              </div>
                              <div className="text-muted-foreground">
                                {item.price.toFixed(2)} kr
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleExcludeItem(index, itemId)}
                              className="h-7 w-7 p-0 shrink-0"
                              title={isExcluded ? "Inkludera" : "Exkludera"}
                            >
                              {isExcluded ? (
                                <Check className="h-3 w-3 text-green-500" />
                              ) : (
                                <Trash2 className="h-3 w-3 text-destructive" />
                              )}
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* AI Suggestion */}
                {product.suggestion && (
                  <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-primary" />
                        <span className="text-sm font-medium">AI-förslag</span>
                      </div>
                      <Badge variant="outline">
                        {Math.round(product.suggestion.confidence * 100)}% säker
                      </Badge>
                    </div>
                    <p className="text-sm font-semibold text-primary mb-1">
                      {categoryNames[product.suggestion.category] || product.suggestion.category}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {product.suggestion.reasoning}
                    </p>
                  </div>
                )}

                {/* Category selector */}
                {product.suggestion && product.status === 'pending' && (
                  <div className="space-y-2">
                    <Select
                      value={product.userCategory || product.suggestion.category}
                      onValueChange={(value) => handleModify(index, value)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {categoryOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => handleAccept(index)}
                        className="flex-1 gap-2"
                      >
                        <Check className="h-4 w-4" />
                        Acceptera
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleSkip(index)}
                        className="gap-2"
                      >
                        <X className="h-4 w-4" />
                        Hoppa över
                      </Button>
                    </div>
                  </div>
                )}

                {/* Modified category display */}
                {(product.status === 'accepted' || product.status === 'modified') && product.userCategory && (
                  <div className="flex items-center gap-2 text-sm">
                    <Check className="h-4 w-4 text-green-500" />
                    <span>Kategori: <strong>{categoryNames[product.userCategory]}</strong></span>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>

        {/* Helper Text */}
        {currentBatch.some(p => p.status === 'accepted' || p.status === 'modified') && (
          <Alert className="bg-primary/5 border-primary/20">
            <AlertCircle className="h-4 w-4 text-primary" />
            <AlertDescription className="text-sm">
              Granska och acceptera eller hoppa över produkter. Klicka sedan på "Spara kategorier" för att tillämpa alla ändringar till databasen.
            </AlertDescription>
          </Alert>
        )}

        {/* Apply button */}
        {allReviewed && (
          <div className="flex gap-2">
            <Button
              onClick={handleApplyBatch}
              disabled={!readyToApply || applyCategories.isPending}
              className={`flex-1 ${readyToApply ? 'shadow-lg ring-2 ring-primary/20' : ''}`}
              variant={readyToApply ? 'default' : 'secondary'}
            >
              {applyCategories.isPending ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Sparar...
                </>
              ) : (
                <>
                  Spara kategorier
                  {readyToApply && (
                    <Badge className="ml-2 bg-background text-foreground hover:bg-background">
                      {currentBatch.filter(p => p.status === 'accepted' || p.status === 'modified').length}
                    </Badge>
                  )}
                </>
              )}
            </Button>
            {batchIndex < totalBatches - 1 && (
              <Button
                variant="outline"
                onClick={() => setBatchIndex(prev => prev + 1)}
                disabled={applyCategories.isPending}
              >
                Hoppa över batch
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
