import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, Check, X, AlertCircle, RefreshCw, ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { categoryOptions, categoryNames } from "@/lib/categoryConstants";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

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

type ProductGroup = {
  id: string;
  products: UncategorizedProduct[];
  suggestion?: {
    category: string;
    confidence: number;
    reasoning: string;
  };
  userCategory?: string;
  status: 'pending' | 'accepted' | 'modified' | 'skipped';
  removedProducts: Set<string>; // Track removed products
  isExpanded: boolean;
};

export function AICategorization() {
  const [productGroups, setProductGroups] = useState<ProductGroup[]>([]);
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

  // Group similar products together
  const groupSimilarProducts = (products: UncategorizedProduct[]): ProductGroup[] => {
    const groups: ProductGroup[] = [];
    const processed = new Set<string>();

    products.forEach((product, idx) => {
      if (processed.has(product.name)) return;

      // For now, each product is its own group
      // TODO: Add similarity grouping logic
      const group: ProductGroup = {
        id: `group-${idx}`,
        products: [product],
        status: 'pending',
        removedProducts: new Set(),
        isExpanded: false,
      };

      groups.push(group);
      processed.add(product.name);
    });

    return groups;
  };

  // Get current batch
  const totalBatches = Math.ceil(uncategorizedProducts.length / BATCH_SIZE);
  const startIndex = batchIndex * BATCH_SIZE;
  const endIndex = Math.min(startIndex + BATCH_SIZE, uncategorizedProducts.length);

  // Initialize batch when index changes
  useEffect(() => {
    if (uncategorizedProducts.length > 0) {
      const batchProducts = uncategorizedProducts.slice(startIndex, endIndex);
      const groups = groupSimilarProducts(batchProducts);
      setProductGroups(groups);
    }
  }, [batchIndex, uncategorizedProducts, startIndex, endIndex]);

  // Generate AI suggestions
  const generateSuggestions = async () => {
    if (!user || productGroups.length === 0) return;

    setIsGeneratingSuggestions(true);

    try {
      // Collect all products from all groups
      const allProducts = productGroups.flatMap(g => g.products);

      const { data, error } = await supabase.functions.invoke('suggest-categories', {
        body: {
          products: allProducts.map(p => ({ name: p.name, occurrences: p.occurrences })),
          userId: user.id,
        }
      });

      if (error) throw error;

      const suggestions = data.suggestions as CategorySuggestion[];

      // Match suggestions to groups
      setProductGroups(prev => prev.map(group => {
        // Find suggestion for the first product in the group
        const suggestion = suggestions.find(s => s.product === group.products[0].name);
        return {
          ...group,
          suggestion: suggestion ? {
            category: suggestion.category,
            confidence: suggestion.confidence,
            reasoning: suggestion.reasoning,
          } : undefined,
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

  // Apply categories mutation
  const applyCategories = useMutation({
    mutationFn: async (groupsToApply: ProductGroup[]) => {
      if (!user) throw new Error('Not authenticated');

      const mappingsToCreate: any[] = [];

      groupsToApply
        .filter(g => g.status === 'accepted' || g.status === 'modified')
        .forEach(group => {
          // Only include products that haven't been removed
          group.products.forEach(product => {
            if (!group.removedProducts.has(product.name)) {
              mappingsToCreate.push({
                user_id: user.id,
                original_name: product.name,
                mapped_name: null,
                category: group.userCategory!,
              });
            }
          });
        });

      if (mappingsToCreate.length === 0) return { count: 0 };

      const { error } = await supabase
        .from('product_mappings')
        .insert(mappingsToCreate);

      if (error) throw error;

      return { count: mappingsToCreate.length };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['mappings-for-categorization'] });
      queryClient.invalidateQueries({ queryKey: ['receipts-for-categorization'] });
      setProcessedCount(prev => prev + result.count);
      toast.success(`${result.count} produkter kategoriserade!`);

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

  const handleAccept = (groupId: string) => {
    setProductGroups(prev => prev.map(g =>
      g.id === groupId ? { ...g, status: 'accepted' as const } : g
    ));
  };

  const handleModify = (groupId: string, newCategory: string) => {
    setProductGroups(prev => prev.map(g =>
      g.id === groupId ? { ...g, userCategory: newCategory, status: 'modified' as const } : g
    ));
  };

  const handleSkip = (groupId: string) => {
    setProductGroups(prev => prev.map(g =>
      g.id === groupId ? { ...g, status: 'skipped' as const } : g
    ));
  };

  const handleToggleExpand = (groupId: string) => {
    setProductGroups(prev => prev.map(g =>
      g.id === groupId ? { ...g, isExpanded: !g.isExpanded } : g
    ));
  };

  const handleRemoveProduct = (groupId: string, productName: string) => {
    setProductGroups(prev => prev.map(g => {
      if (g.id === groupId) {
        const newRemoved = new Set(g.removedProducts);
        newRemoved.add(productName);
        return { ...g, removedProducts: newRemoved };
      }
      return g;
    }));
  };

  const handleApplyBatch = () => {
    applyCategories.mutate(productGroups);
  };

  const getActiveProductCount = (group: ProductGroup) => {
    return group.products.filter(p => !group.removedProducts.has(p.name)).length;
  };

  const getTotalActiveProducts = () => {
    return productGroups
      .filter(g => g.status === 'accepted' || g.status === 'modified')
      .reduce((sum, g) => sum + getActiveProductCount(g), 0);
  };

  const readyToApply = productGroups.some(g => g.status === 'accepted' || g.status === 'modified');
  const allReviewed = productGroups.every(g => g.status !== 'pending');
  const progress = uncategorizedProducts.length > 0
    ? Math.round(((processedCount + getTotalActiveProducts()) / uncategorizedProducts.length) * 100)
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
          {productGroups.length > 0 && !productGroups[0].suggestion && (
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

        {/* Group list */}
        <div className="space-y-3">
          {productGroups.map((group) => {
            const activeCount = getActiveProductCount(group);
            const hasMultipleProducts = group.products.length > 1;

            return (
              <Card key={group.id} className={`p-4 ${
                group.status === 'accepted' ? 'border-green-500/50 bg-green-500/5' :
                group.status === 'modified' ? 'border-blue-500/50 bg-blue-500/5' :
                group.status === 'skipped' ? 'border-gray-500/50 bg-gray-500/5' :
                ''
              }`}>
                <div className="space-y-3">
                  {/* Group header */}
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-semibold">{group.products[0].name}</p>
                        {hasMultipleProducts && (
                          <Badge variant="secondary" className="text-xs">
                            +{group.products.length - 1} liknande
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {activeCount} produkt{activeCount !== 1 ? 'er' : ''} kommer att kategoriseras
                      </p>
                    </div>
                    {group.status !== 'pending' && (
                      <Badge variant={
                        group.status === 'accepted' ? 'default' :
                        group.status === 'modified' ? 'secondary' :
                        'outline'
                      }>
                        {group.status === 'accepted' ? 'Accepterad' :
                         group.status === 'modified' ? 'Justerad' :
                         'Hoppades över'}
                      </Badge>
                    )}
                  </div>

                  {/* Show all products button */}
                  {hasMultipleProducts && (
                    <Collapsible open={group.isExpanded} onOpenChange={() => handleToggleExpand(group.id)}>
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" className="w-full justify-start gap-2">
                          {group.isExpanded ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                          {group.isExpanded ? 'Dölj' : 'Visa'} alla produkter ({group.products.length})
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="mt-2">
                        <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                          {group.products.map((product, idx) => (
                            <div key={product.name} className="flex items-center justify-between text-sm">
                              <div className={group.removedProducts.has(product.name) ? 'line-through text-muted-foreground' : ''}>
                                <span className="font-medium">{product.name}</span>
                                <span className="text-muted-foreground ml-2">
                                  ({product.occurrences} gång{product.occurrences !== 1 ? 'er' : ''})
                                </span>
                              </div>
                              {!group.removedProducts.has(product.name) && idx !== 0 && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleRemoveProduct(group.id, product.name)}
                                  className="h-6 w-6 p-0"
                                >
                                  <Trash2 className="h-3 w-3 text-destructive" />
                                </Button>
                              )}
                            </div>
                          ))}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  )}

                  {/* AI Suggestion */}
                  {group.suggestion && (
                    <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-primary" />
                          <span className="text-sm font-medium">AI-förslag</span>
                        </div>
                        <Badge variant="outline">
                          {Math.round(group.suggestion.confidence * 100)}% säker
                        </Badge>
                      </div>
                      <p className="text-sm font-semibold text-primary mb-1">
                        {categoryNames[group.suggestion.category] || group.suggestion.category}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {group.suggestion.reasoning}
                      </p>
                    </div>
                  )}

                  {/* Category selector */}
                  {group.suggestion && group.status === 'pending' && (
                    <div className="space-y-2">
                      <Select
                        value={group.userCategory || group.suggestion.category}
                        onValueChange={(value) => handleModify(group.id, value)}
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
                          onClick={() => handleAccept(group.id)}
                          className="flex-1 gap-2"
                        >
                          <Check className="h-4 w-4" />
                          Acceptera ({activeCount} produkt{activeCount !== 1 ? 'er' : ''})
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleSkip(group.id)}
                          className="gap-2"
                        >
                          <X className="h-4 w-4" />
                          Hoppa över
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Modified category display */}
                  {(group.status === 'accepted' || group.status === 'modified') && group.userCategory && (
                    <div className="flex items-center gap-2 text-sm">
                      <Check className="h-4 w-4 text-green-500" />
                      <span>
                        Kategori: <strong>{categoryNames[group.userCategory]}</strong> tillämpas på {activeCount} produkt{activeCount !== 1 ? 'er' : ''}
                      </span>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
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
                `Spara kategorier (${getTotalActiveProducts()} produkter)`
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
