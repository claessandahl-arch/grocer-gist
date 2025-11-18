import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, Check, X, AlertCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { categoryOptions, categoryNames } from "@/lib/categoryConstants";
import { Alert, AlertDescription } from "@/components/ui/alert";

const BATCH_SIZE = 15;

type UncategorizedProduct = {
  name: string;
  occurrences: number;
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
        .select('items')
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

    // Count product occurrences
    const productCounts = new Map<string, number>();
    receipts.forEach(receipt => {
      const items = (receipt.items as any[]) || [];
      items.forEach(item => {
        if (item.name) {
          productCounts.set(item.name, (productCounts.get(item.name) || 0) + 1);
        }
      });
    });

    // Find products without category in mappings
    const mappingsMap = new Map(mappings.map(m => [m.original_name.toLowerCase(), m.category]));
    const uncategorized: UncategorizedProduct[] = [];

    productCounts.forEach((count, name) => {
      const category = mappingsMap.get(name.toLowerCase());
      if (!category || category === null) {
        uncategorized.push({ name, occurrences: count });
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
        .map(p => ({ ...p, status: 'pending' as const }));
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

      const mappingsToCreate = productsToApply
        .filter(p => p.status === 'accepted' || p.status === 'modified')
        .map(p => ({
          user_id: user.id,
          original_name: p.name,
          mapped_name: null,
          category: p.userCategory!,
        }));

      if (mappingsToCreate.length === 0) return { count: 0 };

      const { error } = await supabase
        .from('product_mappings')
        .insert(mappingsToCreate);

      if (error) throw error;

      // Save feedback for learning
      for (const product of productsToApply) {
        if (product.status === 'accepted' || product.status === 'modified') {
          await saveFeedback.mutateAsync(product);
        }
      }

      return { count: mappingsToCreate.length };
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
                {/* Product name */}
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold">{product.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Förekommer {product.occurrences} gång{product.occurrences !== 1 ? 'er' : ''}
                    </p>
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

        {/* Apply button */}
        {allReviewed && (
          <div className="flex gap-2">
            <Button
              onClick={handleApplyBatch}
              disabled={!readyToApply || applyCategories.isPending}
              className="flex-1"
            >
              {applyCategories.isPending ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Sparar...
                </>
              ) : (
                `Spara kategorier (${currentBatch.filter(p => p.status === 'accepted' || p.status === 'modified').length})`
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
