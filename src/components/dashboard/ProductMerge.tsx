import React, { useState, useMemo } from "react";
import { logger } from "@/lib/logger";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Trash2, Plus, Sparkles } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { categoryOptions, categoryNames } from "@/lib/categoryConstants";

// Calculate similarity score between two strings (0-1)
const calculateSimilarity = (str1: string, str2: string): number => {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();
  
  // If strings are identical, return 1
  if (s1 === s2) return 1;
  
  // Check if one string contains the other
  if (s1.includes(s2) || s2.includes(s1)) return 0.8;
  
  // Simple token-based similarity
  const tokens1 = s1.split(/\s+/);
  const tokens2 = s2.split(/\s+/);
  
  const commonTokens = tokens1.filter(t => tokens2.includes(t)).length;
  const totalTokens = Math.max(tokens1.length, tokens2.length);
  
  if (commonTokens > 0) {
    return commonTokens / totalTokens;
  }
  
  // Levenshtein distance for similar strings
  const maxLen = Math.max(s1.length, s2.length);
  if (maxLen === 0) return 1;
  
  const distance = levenshteinDistance(s1, s2);
  return 1 - distance / maxLen;
};

// Calculate Levenshtein distance between two strings
const levenshteinDistance = (str1: string, str2: string): number => {
  const matrix: number[][] = [];
  
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  
  return matrix[str2.length][str1.length];
};

type SuggestedMerge = {
  products: string[];
  score: number;
  suggestedName: string;
};

export const ProductMerge = () => {
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [mergedName, setMergedName] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [groupMergeName, setGroupMergeName] = useState("");
  const [editingSuggestion, setEditingSuggestion] = useState<Record<number, string>>({});
  const [addToExisting, setAddToExisting] = useState<Record<number, string>>({});
  const [editingMergeGroup, setEditingMergeGroup] = useState<Record<string, string>>({});
  const [editingCategory, setEditingCategory] = useState<Record<string, string>>({});
  const [ignoredSuggestions, setIgnoredSuggestions] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();

  // Fetch all unique products from receipts
  const { data: receipts } = useQuery({
    queryKey: ['receipts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('receipts')
        .select('*')
        .order('receipt_date', { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  // Fetch existing mappings (both user-specific and global)
  const { data: mappings, isLoading: mappingsLoading } = useQuery({
    queryKey: ['product-mappings'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Fetch user-specific mappings
      const { data: userMappings, error: userError } = await supabase
        .from('product_mappings')
        .select('*')
        .eq('user_id', user.id);

      if (userError) throw userError;

      // Fetch global mappings
      const { data: globalMappings, error: globalError } = await supabase
        .from('global_product_mappings')
        .select('*');

      // Log if there's an error fetching global mappings (might not exist yet)
      if (globalError) {
        logger.error('Error fetching global mappings:', globalError);
        // Don't throw - global mappings table might not exist yet
      }

      // Combine and mark global mappings
      const combined = [
        ...(userMappings || []).map(m => ({ ...m, isGlobal: false })),
        ...(globalMappings || []).map(m => ({ ...m, isGlobal: true, user_id: null })),
      ];

      // Sort by mapped_name
      combined.sort((a, b) => a.mapped_name.localeCompare(b.mapped_name));

      return combined;
    },
  });

  // Get unique product names from all receipts (memoized)
  const productList = useMemo(() => {
    const uniqueProducts = new Set<string>();
    receipts?.forEach(receipt => {
      const items = receipt.items as any[] || [];
      items.forEach(item => {
        if (item.name) uniqueProducts.add(item.name);
      });
    });
    return Array.from(uniqueProducts).sort();
  }, [receipts]);

  // Filter out products that are already mapped (memoized)
  const unmappedProducts = useMemo(() => {
    const mappedOriginalNames = new Set(mappings?.map(m => m.original_name) || []);
    return productList.filter(p => !mappedOriginalNames.has(p));
  }, [productList, mappings]);

  // Generate suggested merges based on similarity (memoized - expensive!)
  const suggestedMerges = useMemo(() => {
    const merges: SuggestedMerge[] = [];
    const processed = new Set<string>();

    unmappedProducts.forEach((product, i) => {
      if (processed.has(product)) return;

      const similar: string[] = [product];

      for (let j = i + 1; j < unmappedProducts.length; j++) {
        const other = unmappedProducts[j];
        if (processed.has(other)) continue;

        const similarity = calculateSimilarity(product, other);

        if (similarity >= 0.6) {
          similar.push(other);
          processed.add(other);
        }
      }

      if (similar.length > 1) {
        processed.add(product);
        // Use the shortest name as suggested name
        const suggestedName = similar.reduce((a, b) => a.length <= b.length ? a : b);
        merges.push({
          products: similar,
          score: similar.length > 2 ? 0.9 : 0.7,
          suggestedName,
        });
      }
    });

    // Filter out ignored suggestions
    return merges.filter(merge => {
      const key = merge.products.sort().join('|');
      return !ignoredSuggestions.has(key);
    });
  }, [unmappedProducts, ignoredSuggestions]);

  // Create mapping mutation
  const createMapping = useMutation({
    mutationFn: async (products: string[]) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const mappingsToCreate = products.map(product => ({
        user_id: user.id,
        original_name: product,
        mapped_name: mergedName,
        category: selectedCategory || null,
      }));

      const { error } = await supabase
        .from('product_mappings')
        .insert(mappingsToCreate);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-mappings'] });
      setSelectedProducts([]);
      setMergedName("");
      setSelectedCategory("");
      toast.success("Produkter sammanslagna!");
    },
    onError: (error) => {
      toast.error("Kunde inte slå ihop produkter: " + error.message);
    },
  });

  // Delete mapping mutation
  const deleteMapping = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('product_mappings')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-mappings'] });
      toast.success("Mappning borttagen!");
    },
    onError: (error) => {
      toast.error("Kunde inte ta bort mappning: " + error.message);
    },
  });

  const handleProductToggle = (product: string) => {
    setSelectedProducts(prev =>
      prev.includes(product)
        ? prev.filter(p => p !== product)
        : [...prev, product]
    );
  };

  const handleMerge = () => {
    if (selectedProducts.length < 2) {
      toast.error("Välj minst 2 produkter att slå ihop");
      return;
    }
    if (!mergedName.trim()) {
      toast.error("Ange ett namn för den sammanslagna produkten");
      return;
    }
    if (!selectedCategory) {
      toast.error("Välj en kategori för produkten");
      return;
    }
    createMapping.mutate(selectedProducts);
  };

  const handleAcceptSuggestion = async (suggestion: SuggestedMerge, idx: number) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const finalName = editingSuggestion[idx] || suggestion.suggestedName;
      const existingGroup = addToExisting[idx];

      const mappingsToCreate = suggestion.products.map(product => ({
        user_id: user.id,
        original_name: product,
        mapped_name: existingGroup || finalName,
        category: null,
      }));

      const { error } = await supabase
        .from('product_mappings')
        .insert(mappingsToCreate);

      if (error) throw error;

      // Clear the editing states for this suggestion
      setEditingSuggestion(prev => {
        const next = { ...prev };
        delete next[idx];
        return next;
      });
      setAddToExisting(prev => {
        const next = { ...prev };
        delete next[idx];
        return next;
      });

      queryClient.invalidateQueries({ queryKey: ['product-mappings'] });
      toast.success(existingGroup ? "Produkter tillagda till grupp!" : "Produkter sammanslagna!");
    } catch (error) {
      toast.error("Kunde inte slå ihop produkter: " + (error as Error).message);
    }
  };

  const handleIgnoreSuggestion = (suggestion: SuggestedMerge) => {
    const key = suggestion.products.sort().join('|');
    setIgnoredSuggestions(prev => new Set([...prev, key]));
    logger.debug('Ignored suggestion:', { key, products: suggestion.products });
  };

  const handleRenameMergeGroup = async (oldName: string, newName: string) => {
    if (!newName.trim() || newName === oldName) {
      setEditingMergeGroup(prev => {
        const next = { ...prev };
        delete next[oldName];
        return next;
      });
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Get all items in this group to determine what needs updating
      const groupItems = groupedMappings?.[oldName] || [];
      const userMappings = groupItems.filter((item: any) => !item.isGlobal);
      const globalMappings = groupItems.filter((item: any) => item.isGlobal);

      let userUpdateSuccess = false;
      let globalUpdateSuccess = false;
      let errors: string[] = [];

      // Update user-specific mappings if any exist
      if (userMappings.length > 0) {
        const { error: userError } = await supabase
          .from('product_mappings')
          .update({ mapped_name: newName })
          .eq('user_id', user.id)
          .eq('mapped_name', oldName);

        if (userError) {
          errors.push(`Användar-mappningar: ${userError.message}`);
        } else {
          userUpdateSuccess = true;
        }
      }

      // Update global mappings if any exist
      if (globalMappings.length > 0) {
        const { error: globalError } = await supabase
          .from('global_product_mappings')
          .update({ mapped_name: newName })
          .eq('mapped_name', oldName);

        if (globalError) {
          errors.push(`Globala mappningar: ${globalError.message}`);
        } else {
          globalUpdateSuccess = true;
        }
      }

      // If we had errors, throw them
      if (errors.length > 0) {
        throw new Error(errors.join('; '));
      }

      // Clear editing state
      setEditingMergeGroup(prev => {
        const next = { ...prev };
        delete next[oldName];
        return next;
      });

      // Invalidate queries to refresh the UI
      queryClient.invalidateQueries({ queryKey: ['product-mappings'] });

      // Show appropriate success message
      if (userUpdateSuccess && globalUpdateSuccess) {
        toast.success(`Gruppnamn uppdaterat! (${userMappings.length} användar + ${globalMappings.length} globala)`);
      } else if (userUpdateSuccess) {
        toast.success(`Användar-gruppnamn uppdaterat! (${userMappings.length} mappningar)`);
      } else if (globalUpdateSuccess) {
        toast.success(`Globalt gruppnamn uppdaterat! (${globalMappings.length} mappningar)`);
      }

      logger.debug('Rename complete:', { oldName, newName, userCount: userMappings.length, globalCount: globalMappings.length });
    } catch (error) {
      toast.error("Kunde inte uppdatera gruppnamn: " + (error as Error).message);
      logger.error('Rename failed:', error);
    }
  };

  const handleUpdateCategory = async (mappedName: string, newCategory: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Ingen användare inloggad");

      // Get all items in this group
      const groupItems = groupedMappings?.[mappedName] || [];
      const userMappings = groupItems.filter((item: any) => !item.isGlobal);
      
      if (userMappings.length === 0) {
        toast.error("Kan inte uppdatera kategori för globala mappningar");
        return;
      }

      // Update category for all user mappings with this mapped_name
      const { error } = await supabase
        .from('product_mappings')
        .update({ category: newCategory })
        .eq('user_id', user.id)
        .eq('mapped_name', mappedName);

      if (error) throw error;

      await queryClient.invalidateQueries({ queryKey: ['product-mappings'] });
      
      // Clear editing state
      setEditingCategory(prev => {
        const next = { ...prev };
        delete next[mappedName];
        return next;
      });
      
      toast.success(`Kategori uppdaterad för ${mappedName}`);
      logger.debug('Category updated:', { mappedName, newCategory });
    } catch (error) {
      toast.error("Kunde inte uppdatera kategori: " + (error as Error).message);
    }
  };

  // Merge selected groups mutation
  const mergeGroups = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Update all mappings in selected groups to the new merged name
      const { error } = await supabase
        .from('product_mappings')
        .update({ mapped_name: groupMergeName })
        .in('mapped_name', selectedGroups)
        .eq('user_id', user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-mappings'] });
      setSelectedGroups([]);
      setGroupMergeName("");
      toast.success("Produktgrupper sammanslagna!");
    },
    onError: (error) => {
      toast.error("Kunde inte slå ihop grupper: " + error.message);
    },
  });

  const handleGroupToggle = (groupName: string) => {
    setSelectedGroups(prev =>
      prev.includes(groupName)
        ? prev.filter(g => g !== groupName)
        : [...prev, groupName]
    );
  };

  const handleMergeGroups = () => {
    if (selectedGroups.length < 2) {
      toast.error("Välj minst 2 grupper att slå ihop");
      return;
    }
    if (!groupMergeName.trim()) {
      toast.error("Ange ett namn för den sammanslagna gruppen");
      return;
    }
    mergeGroups.mutate();
  };

  // Group mappings by mapped_name with stats (memoized)
  const groupedMappings = useMemo(() => {
    return mappings?.reduce((acc, mapping) => {
      if (!acc[mapping.mapped_name]) {
        acc[mapping.mapped_name] = [];
      }
      acc[mapping.mapped_name].push(mapping);
      return acc;
    }, {} as Record<string, Array<typeof mappings[number]>>);
  }, [mappings]);

  // Debug log to check how many groups we have
  logger.debug('Total mappings:', mappings?.length);
  logger.debug('User mappings:', mappings?.filter(m => !m.isGlobal).length);
  logger.debug('Global mappings:', mappings?.filter(m => m.isGlobal).length);
  logger.debug('Grouped mappings:', Object.keys(groupedMappings || {}).length, 'groups');

  // Calculate spending stats for each group (memoized - very expensive!)
  const groupStats = useMemo(() => {
    return Object.entries(groupedMappings || {}).reduce((acc, [mappedName, items]) => {
      const originalNames = new Set((items as any[]).map(item => item.original_name));
      let totalSpending = 0;
      let productCount = 0;

      receipts?.forEach(receipt => {
        const receiptItems = receipt.items as any[] || [];
        receiptItems.forEach(item => {
          if (originalNames.has(item.name)) {
            totalSpending += Number(item.price) || 0;
            productCount++;
          }
        });
      });

      acc[mappedName] = { totalSpending, productCount };
      return acc;
    }, {} as Record<string, { totalSpending: number; productCount: number }>);
  }, [groupedMappings, receipts]);

  return (
    <div className="space-y-6">
      {/* Suggested merges */}
      {suggestedMerges.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              Föreslagna sammanslagningar
            </CardTitle>
            <CardDescription>
              Produkter som verkar vara liknande baserat på namn
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {suggestedMerges.map((suggestion, idx) => {
                const isEditing = idx in editingSuggestion;
                const currentName = editingSuggestion[idx] ?? suggestion.suggestedName;
                const existingMergeGroup = addToExisting[idx];
                
                return (
                  <div key={idx} className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-start gap-4">
                      <div className="flex-1 space-y-3">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">
                            {Math.round(suggestion.score * 100)}% match
                          </Badge>
                          <span className="text-sm font-medium">
                            {suggestion.products.length} produkter
                          </span>
                        </div>
                        <div className="text-sm text-muted-foreground space-y-1">
                          {suggestion.products.map((product, i) => (
                            <div key={i}>• {product}</div>
                          ))}
                        </div>
                        
                        <div className="space-y-2">
                          <Label htmlFor={`suggestion-name-${idx}`} className="text-sm font-medium">
                            Produktnamn:
                          </Label>
                          <Input
                            id={`suggestion-name-${idx}`}
                            value={currentName}
                            onChange={(e) => setEditingSuggestion(prev => ({ ...prev, [idx]: e.target.value }))}
                            placeholder="Ange produktnamn"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor={`add-to-existing-${idx}`} className="text-sm font-medium">
                            Lägg till i befintlig grupp (valfritt):
                          </Label>
                          <Select
                            value={existingMergeGroup || "new"}
                            onValueChange={(value) => setAddToExisting(prev => 
                              value === "new" 
                                ? { ...prev, [idx]: "" } 
                                : { ...prev, [idx]: value }
                            )}
                          >
                            <SelectTrigger id={`add-to-existing-${idx}`}>
                              <SelectValue placeholder="Ny grupp" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="new">Skapa ny grupp</SelectItem>
                              {Object.keys(groupedMappings || {}).map(groupName => (
                                <SelectItem key={groupName} value={groupName}>
                                  {groupName}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      
                      <div className="flex flex-col gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleAcceptSuggestion(suggestion, idx)}
                          disabled={createMapping.isPending || (!currentName.trim() && !existingMergeGroup)}
                        >
                          {existingMergeGroup ? "Lägg till" : "Acceptera"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleIgnoreSuggestion(suggestion)}
                        >
                          Ignorera
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Slå ihop produkter</CardTitle>
          <CardDescription>
            Välj produkter som ska räknas som samma vara och ange vad de ska heta tillsammans
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Välj produkter att slå ihop:</label>
            <div className="max-h-64 overflow-y-auto border rounded-md p-4 space-y-2">
              {unmappedProducts.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Alla produkter är redan sammanslagna
                </p>
              ) : (
                unmappedProducts.map(product => (
                  <div key={product} className="flex items-center space-x-2">
                    <Checkbox
                      id={product}
                      checked={selectedProducts.includes(product)}
                      onCheckedChange={() => handleProductToggle(product)}
                    />
                    <label htmlFor={product} className="text-sm cursor-pointer">
                      {product}
                    </label>
                  </div>
                ))
              )}
            </div>
          </div>

          {selectedProducts.length > 0 && (
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Valda produkter ({selectedProducts.length}):
              </label>
              <div className="text-sm text-muted-foreground border rounded-md p-2">
                {selectedProducts.join(", ")}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="merged-name">
              Namn för sammanslagna produkten:
            </Label>
            <Input
              id="merged-name"
              placeholder="T.ex. Coca-Cola"
              value={mergedName}
              onChange={(e) => setMergedName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">
              Kategori:
            </Label>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger id="category">
                <SelectValue placeholder="Välj kategori" />
              </SelectTrigger>
              <SelectContent>
                {categoryOptions.map(cat => (
                  <SelectItem key={cat.value} value={cat.value}>
                    {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={handleMerge}
            disabled={selectedProducts.length < 2 || !mergedName.trim() || !selectedCategory || createMapping.isPending}
            className="w-full"
          >
            <Plus className="h-4 w-4 mr-2" />
            Slå ihop valda produkter
          </Button>
        </CardContent>
      </Card>

      {/* Show message if no mappings exist */}
      {!mappingsLoading && (!mappings || mappings.length === 0) && (
        <Card>
          <CardHeader>
            <CardTitle>Aktiva sammanslagningar</CardTitle>
            <CardDescription>
              Inga sammanslagningar ännu
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground text-center py-8">
              Du har inte slagit ihop några produkter ännu. Använd formuläret ovan för att börja slå ihop liknande produkter.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Show existing mappings with merge option */}
      {!mappingsLoading && groupedMappings && Object.keys(groupedMappings).length > 0 && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Aktiva sammanslagningar</CardTitle>
              <CardDescription>
                Produkter du har slagit ihop. Välj grupper för att slå ihop dem ytterligare.
              </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="space-y-4">
                {Object.entries(groupedMappings).map(([mappedName, items]: [string, any[]]) => {
                  const stats = groupStats[mappedName] || { totalSpending: 0, productCount: 0 };
                  const isEditingThis = mappedName in editingMergeGroup;
                  const hasUserMappings = items.some((item: any) => !item.isGlobal);
                  
                  return (
                    <div key={mappedName} className="border rounded-md p-4">
                      <div className="flex items-start gap-3 mb-2">
                        <Checkbox
                          id={`group-${mappedName}`}
                          checked={selectedGroups.includes(mappedName)}
                          onCheckedChange={() => handleGroupToggle(mappedName)}
                        />
                        <div className="flex-1">
                          {isEditingThis ? (
                            <div className="flex items-center gap-2 mb-2">
                              <Input
                                value={editingMergeGroup[mappedName]}
                                onChange={(e) => setEditingMergeGroup(prev => ({ 
                                  ...prev, 
                                  [mappedName]: e.target.value 
                                }))}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    handleRenameMergeGroup(mappedName, editingMergeGroup[mappedName]);
                                  } else if (e.key === 'Escape') {
                                    setEditingMergeGroup(prev => {
                                      const next = { ...prev };
                                      delete next[mappedName];
                                      return next;
                                    });
                                  }
                                }}
                                className="flex-1"
                                autoFocus
                              />
                              <Button
                                size="sm"
                                onClick={() => handleRenameMergeGroup(mappedName, editingMergeGroup[mappedName])}
                              >
                                Spara
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setEditingMergeGroup(prev => {
                                  const next = { ...prev };
                                  delete next[mappedName];
                                  return next;
                                })}
                              >
                                Avbryt
                              </Button>
                            </div>
                          ) : (
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <label htmlFor={`group-${mappedName}`} className="font-medium cursor-pointer">
                                  {mappedName}
                                </label>
                                {hasUserMappings && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setEditingMergeGroup(prev => ({ 
                                      ...prev, 
                                      [mappedName]: mappedName 
                                    }))}
                                    className="h-6 px-2"
                                  >
                                    Byt namn
                                  </Button>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                {items[0]?.category ? (
                                  <>
                                    <div className="text-sm text-muted-foreground">
                                      {categoryNames[items[0].category] || items[0].category}
                                    </div>
                                    {hasUserMappings && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => setEditingCategory(prev => ({ 
                                          ...prev, 
                                          [mappedName]: items[0].category || '' 
                                        }))}
                                        className="h-6 px-2 text-xs"
                                      >
                                        Ändra kategori
                                      </Button>
                                    )}
                                  </>
                                ) : hasUserMappings ? (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setEditingCategory(prev => ({ 
                                      ...prev, 
                                      [mappedName]: '' 
                                    }))}
                                    className="h-7 text-xs"
                                  >
                                    + Lägg till kategori
                                  </Button>
                                ) : (
                                  <div className="text-sm text-muted-foreground italic">
                                    Ingen kategori
                                  </div>
                                )}
                              </div>
                              {editingCategory[mappedName] !== undefined && (
                                <div className="flex items-center gap-2 mt-2">
                                  <Select 
                                    value={editingCategory[mappedName]} 
                                    onValueChange={(value) => setEditingCategory(prev => ({ 
                                      ...prev, 
                                      [mappedName]: value 
                                    }))}
                                  >
                                    <SelectTrigger className="h-8 text-sm">
                                      <SelectValue placeholder="Välj kategori" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {categoryOptions.map(cat => (
                                        <SelectItem key={cat.value} value={cat.value}>
                                          {cat.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <Button
                                    size="sm"
                                    onClick={() => handleUpdateCategory(mappedName, editingCategory[mappedName])}
                                    disabled={!editingCategory[mappedName]}
                                  >
                                    Spara
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setEditingCategory(prev => {
                                      const next = { ...prev };
                                      delete next[mappedName];
                                      return next;
                                    })}
                                  >
                                    Avbryt
                                  </Button>
                                </div>
                              )}
                              <div className="flex gap-4 text-sm text-muted-foreground">
                                <span>{items.length} {items.length === 1 ? 'variant' : 'varianter'}</span>
                                <span>•</span>
                                <span>{stats.productCount} köp</span>
                                <span>•</span>
                                <span className="font-medium">{stats.totalSpending.toFixed(0)} kr totalt</span>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Originalnamn</TableHead>
                          <TableHead className="w-[100px]">Åtgärd</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {items.map(item => (
                          <TableRow key={item.id}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {item.original_name}
                                {item.isGlobal && (
                                  <Badge variant="outline" className="text-xs">
                                    Global
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => deleteMapping.mutate(item.id)}
                              disabled={deleteMapping.isPending || item.isGlobal}
                              title={item.isGlobal ? "Kan inte ta bort globala mappningar" : "Ta bort mappning"}
                            >
                                <Trash2 className={`h-4 w-4 ${item.isGlobal ? 'opacity-50' : ''}`} />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Merge groups section */}
          {selectedGroups.length > 1 && (
            <Card>
              <CardHeader>
                <CardTitle>Slå ihop valda grupper</CardTitle>
                <CardDescription>
                  Sammanslå {selectedGroups.length} produktgrupper till en
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Valda grupper ({selectedGroups.length}):
                  </label>
                  <div className="text-sm text-muted-foreground border rounded-md p-2">
                    {selectedGroups.join(", ")}
                  </div>
                </div>

                <div className="space-y-2">
                  <label htmlFor="group-merge-name" className="text-sm font-medium">
                    Namn för sammanslagna gruppen:
                  </label>
                  <Input
                    id="group-merge-name"
                    placeholder="T.ex. Coca-Cola"
                    value={groupMergeName}
                    onChange={(e) => setGroupMergeName(e.target.value)}
                  />
                </div>

                <Button
                  onClick={handleMergeGroups}
                  disabled={!groupMergeName.trim() || mergeGroups.isPending}
                  className="w-full"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Slå ihop {selectedGroups.length} grupper
                </Button>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
};
