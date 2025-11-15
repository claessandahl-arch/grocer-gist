import React, { useState, useMemo, useCallback } from "react";
import { ProductListItem } from "./ProductListItem";
import { logger } from "@/lib/logger";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Trash2, Plus, Sparkles, ChevronDown, ChevronRight } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { categoryOptions, categoryNames } from "@/lib/categoryConstants";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

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

// Get categories for products from receipts
const getProductCategories = (productNames: string[], receipts: any[] | undefined): { 
  commonCategory: string | null; 
  uniqueCategories: string[]; 
} => {
  if (!receipts) return { commonCategory: null, uniqueCategories: [] };
  
  const categories = new Set<string>();
  
  receipts.forEach(receipt => {
    if (!receipt.items) return;
    
    receipt.items.forEach((item: any) => {
      if (productNames.some(p => p.toLowerCase() === item.name?.toLowerCase())) {
        if (item.category) {
          categories.add(item.category);
        }
      }
    });
  });
  
  const uniqueCategories = Array.from(categories);
  
  // If all products have the same category, return it
  if (uniqueCategories.length === 1) {
    return { commonCategory: uniqueCategories[0], uniqueCategories };
  }
  
  return { commonCategory: null, uniqueCategories };
};

type SuggestedMerge = {
  products: string[];
  score: number;
  suggestedName: string;
};

export const ProductMerge = React.memo(() => {
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [mergedName, setMergedName] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [selectedUnmappedProducts, setSelectedUnmappedProducts] = useState<string[]>([]);
  const [addToExistingGroup, setAddToExistingGroup] = useState<string>("");
  const [groupMergeName, setGroupMergeName] = useState("");
  const [editingSuggestion, setEditingSuggestion] = useState<Record<number, string>>({});
  const [addToExisting, setAddToExisting] = useState<Record<number, string>>({});
  const [editingMergeGroup, setEditingMergeGroup] = useState<Record<string, string>>({});
  const [editingCategory, setEditingCategory] = useState<Record<string, string>>({});
  const [selectedSuggestionCategory, setSelectedSuggestionCategory] = useState<Record<number, string>>({});
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const queryClient = useQueryClient();

  // Fetch ignored suggestions from database
  const { data: ignoredSuggestionsData, isLoading: ignoredSuggestionsLoading } = useQuery({
    queryKey: ['ignored-merge-suggestions'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from('ignored_merge_suggestions')
        .select('products')
        .eq('user_id', user.id);

      if (error) throw error;
      return data || [];
    },
    staleTime: 60 * 1000, // 1 minute
    refetchOnWindowFocus: false,
  });

  // Convert ignored suggestions to Set for fast lookup
  const ignoredSuggestions = useMemo(() => {
    const ignored = new Set<string>();
    ignoredSuggestionsData?.forEach(item => {
      const key = item.products.sort().join('|');
      ignored.add(key);
    });
    return ignored;
  }, [ignoredSuggestionsData]);

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
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
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
    staleTime: 30 * 1000, // 30 seconds
    refetchOnWindowFocus: false,
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
    // Don't calculate suggestions until ignored list is loaded
    if (ignoredSuggestionsLoading) {
      return [];
    }

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
  }, [unmappedProducts, ignoredSuggestions, ignoredSuggestionsLoading]);

  // Create mapping mutation
  const createMapping = useMutation({
    mutationFn: async (params: { 
      original_name: string; 
      mapped_name: string; 
      category: string; 
      user_id: string | null; 
    } | string[]) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Handle both array of products and single mapping object
      let mappingsToCreate;
      
      if (Array.isArray(params)) {
        // Original behavior for batch create
        mappingsToCreate = params.map(product => ({
          user_id: user.id,
          original_name: product,
          mapped_name: mergedName,
          category: selectedCategory || null,
        }));
      } else {
        // Single mapping for adding to existing group
        mappingsToCreate = [{
          user_id: user.id,
          original_name: params.original_name,
          mapped_name: params.mapped_name,
          category: params.category || null,
        }];
      }

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

  const handleProductToggle = useCallback((product: string) => {
    setSelectedProducts(prev =>
      prev.includes(product)
        ? prev.filter(p => p !== product)
        : [...prev, product]
    );
  }, []);

  const handleAddToExistingGroup = useCallback((product: string, mappedName: string, category: string) => {
    createMapping.mutate(
      {
        original_name: product,
        mapped_name: mappedName,
        category: category,
        user_id: null,
      },
      {
        onSuccess: () => {
          toast.success(`"${product}" har lagts till i gruppen "${mappedName}"`);
          setSelectedProducts(prev => prev.filter(p => p !== product));
        },
      }
    );
  }, [createMapping]);

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
      
      // Get category - use selected category if manually chosen, otherwise use common category
      const { commonCategory } = getProductCategories(suggestion.products, receipts);
      const finalCategory = selectedSuggestionCategory[idx] || commonCategory || null;

      const mappingsToCreate = suggestion.products.map(product => ({
        user_id: user.id,
        original_name: product,
        mapped_name: existingGroup || finalName,
        category: finalCategory,
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
      setSelectedSuggestionCategory(prev => {
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

  const handleIgnoreSuggestion = async (suggestion: SuggestedMerge) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from('ignored_merge_suggestions')
        .insert({
          user_id: user.id,
          products: suggestion.products.sort(),
        });

      if (error) {
        // If already exists (UNIQUE constraint), just ignore silently
        if (error.code === '23505') {
          logger.debug('Suggestion already ignored:', { products: suggestion.products });
          return;
        }
        throw error;
      }

      queryClient.invalidateQueries({ queryKey: ['ignored-merge-suggestions'] });
      logger.debug('Ignored suggestion:', { products: suggestion.products });
    } catch (error) {
      toast.error("Kunde inte ignorera förslag: " + (error as Error).message);
    }
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

  const handleGroupToggle = useCallback((groupName: string) => {
    setSelectedGroups(prev =>
      prev.includes(groupName)
        ? prev.filter(g => g !== groupName)
        : [...prev, groupName]
    );
  }, []);

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

  // Debug log to check how many groups we have (only in development)
  if (import.meta.env.DEV) {
    logger.debug('Total mappings:', mappings?.length);
    logger.debug('User mappings:', mappings?.filter(m => !m.isGlobal).length);
    logger.debug('Global mappings:', mappings?.filter(m => m.isGlobal).length);
    logger.debug('Grouped mappings:', Object.keys(groupedMappings || {}).length, 'groups');
  }

  // Calculate spending stats and category info for each group (memoized - very expensive!)
  const groupStats = useMemo(() => {
    const stats: Record<string, { 
      totalSpending: number; 
      productCount: number;
      commonCategory: string | null;
      uniqueCategories: string[];
      hasMixedCategories: boolean;
    }> = {};
    
    Object.entries(groupedMappings || {}).forEach(([mappedName, items]) => {
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

      // Calculate categories once for each group
      const originalNamesArray = Array.from(originalNames);
      const { commonCategory, uniqueCategories } = getProductCategories(originalNamesArray, receipts);

      stats[mappedName] = { 
        totalSpending, 
        productCount,
        commonCategory,
        uniqueCategories,
        hasMixedCategories: uniqueCategories.length > 1
      };
    });
    
    return stats;
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
                const { commonCategory, uniqueCategories } = getProductCategories(suggestion.products, receipts);
                const hasMixedCategories = uniqueCategories.length > 1;
                const selectedCategory = selectedSuggestionCategory[idx];
                
                return (
                  <div key={idx} className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-start gap-4">
                      <div className="flex-1 space-y-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="secondary">
                            {Math.round(suggestion.score * 100)}% match
                          </Badge>
                          <span className="text-sm font-medium">
                            {suggestion.products.length} produkter
                          </span>
                          {commonCategory && (
                            <Badge variant="default" className="bg-green-600">
                              {categoryNames[commonCategory] || commonCategory}
                            </Badge>
                          )}
                          {hasMixedCategories && (
                            <Badge variant="outline" className="text-orange-600 border-orange-600">
                              Blandade kategorier: {uniqueCategories.map(cat => categoryNames[cat] || cat).join(', ')}
                            </Badge>
                          )}
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

                        {hasMixedCategories && (
                          <div className="space-y-2">
                            <Label htmlFor={`category-${idx}`} className="text-sm font-medium">
                              Välj kategori: <span className="text-red-500">*</span>
                            </Label>
                            <Select
                              value={selectedCategory || ""}
                              onValueChange={(value) => setSelectedSuggestionCategory(prev => ({ ...prev, [idx]: value }))}
                            >
                              <SelectTrigger id={`category-${idx}`}>
                                <SelectValue placeholder="Välj kategori" />
                              </SelectTrigger>
                              <SelectContent>
                                {categoryOptions.map(option => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}

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
                          disabled={
                            createMapping.isPending || 
                            (!currentName.trim() && !existingMergeGroup) ||
                            (hasMixedCategories && !selectedCategory)
                          }
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
                  <ProductListItem
                    key={product}
                    product={product}
                    isSelected={selectedProducts.includes(product)}
                    onToggle={handleProductToggle}
                    onAddToGroup={handleAddToExistingGroup}
                    groupedMappings={groupedMappings}
                    isPending={createMapping.isPending}
                  />
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
                  // Use pre-calculated stats including category info
                  const stats = groupStats[mappedName] || { 
                    totalSpending: 0, 
                    productCount: 0,
                    commonCategory: null,
                    uniqueCategories: [],
                    hasMixedCategories: false
                  };
                  const isEditingThis = mappedName in editingMergeGroup;
                  const hasUserMappings = items.some((item: any) => !item.isGlobal);
                  const savedCategory = items[0]?.category;
                  
                  // Determine category status using pre-calculated values
                  const commonCategory = stats.commonCategory;
                  const uniqueCategories = stats.uniqueCategories;
                  const hasMixedCategories = stats.hasMixedCategories;
                  const categoryMatch = savedCategory === commonCategory;
                  const hasCommonCategory = commonCategory !== null;
                  
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
                                onChange={(e) => {
                                  const value = e.target.value;
                                  setEditingMergeGroup(prev => ({ 
                                    ...prev, 
                                    [mappedName]: value 
                                  }));
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    handleRenameMergeGroup(mappedName, editingMergeGroup[mappedName]);
                                  }
                                  if (e.key === 'Escape') {
                                    setEditingMergeGroup(prev => {
                                      const next = { ...prev };
                                      delete next[mappedName];
                                      return next;
                                    });
                                  }
                                }}
                                className="flex-1"
                                placeholder="Nytt namn för gruppen"
                                autoFocus
                              />
                              <Button
                                size="sm"
                                onClick={() => handleRenameMergeGroup(mappedName, editingMergeGroup[mappedName])}
                                disabled={!editingMergeGroup[mappedName]?.trim()}
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
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <h4 className="font-medium text-base">{mappedName}</h4>
                                  {/* Group type badge */}
                                  {items.every((item: any) => item.isGlobal) && (
                                    <Badge variant="secondary" className="text-xs">
                                      Global
                                    </Badge>
                                  )}
                                  {items.every((item: any) => !item.isGlobal) && (
                                    <Badge variant="outline" className="text-xs">
                                      Personlig
                                    </Badge>
                                  )}
                                  {items.some((item: any) => item.isGlobal) && items.some((item: any) => !item.isGlobal) && (
                                    <Badge variant="default" className="text-xs">
                                      Mixad
                                    </Badge>
                                  )}
                                </div>
                                {/* Edit button now shown for ALL groups */}
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setEditingMergeGroup(prev => ({
                                    ...prev,
                                    [mappedName]: mappedName
                                  }))}
                                  className="h-7 text-xs"
                                >
                                  Byt namn
                                </Button>
                              </div>
                              <div className="flex items-center gap-2 flex-wrap">
                                {savedCategory ? (
                                  <>
                                    <Badge variant={hasCommonCategory && categoryMatch ? "default" : "secondary"} 
                                      className={hasCommonCategory && categoryMatch ? "bg-green-600" : ""}>
                                      {categoryNames[savedCategory] || savedCategory}
                                    </Badge>
                                    {hasCommonCategory && !categoryMatch && (
                                      <Badge variant="outline" className="text-orange-600 border-orange-600">
                                        Produkter i kvitton: {categoryNames[commonCategory] || commonCategory}
                                      </Badge>
                                    )}
                                    {hasMixedCategories && (
                                      <Badge variant="outline" className="text-orange-600 border-orange-600">
                                        Blandade kategorier: {uniqueCategories.map(cat => categoryNames[cat] || cat).join(', ')}
                                      </Badge>
                                    )}
                                    {hasUserMappings && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => setEditingCategory(prev => ({ 
                                          ...prev, 
                                          [mappedName]: savedCategory || '' 
                                        }))}
                                        className="h-6 px-2 text-xs"
                                      >
                                        Ändra kategori
                                      </Button>
                                    )}
                                  </>
                                ) : (
                                  <>
                                    {hasCommonCategory && (
                                      <Badge variant="outline" className="text-blue-600 border-blue-600">
                                        Förslag: {categoryNames[commonCategory] || commonCategory}
                                      </Badge>
                                    )}
                                    {hasMixedCategories && (
                                      <Badge variant="outline" className="text-orange-600 border-orange-600">
                                        Blandade kategorier: {uniqueCategories.map(cat => categoryNames[cat] || cat).join(', ')}
                                      </Badge>
                                    )}
                                    {hasUserMappings ? (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => setEditingCategory(prev => ({ 
                                          ...prev, 
                                          [mappedName]: commonCategory || '' 
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
                                  </>
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
                                    <SelectTrigger className="w-[200px]">
                                      <SelectValue placeholder="Välj kategori" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {categoryOptions.map(({ value, label }) => (
                                        <SelectItem key={value} value={value}>
                                          {label}
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
                    <Collapsible
                      open={expandedGroups[mappedName] ?? false}
                      onOpenChange={(open) => setExpandedGroups(prev => ({ ...prev, [mappedName]: open }))}
                    >
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" className="w-full justify-start gap-2 mt-2">
                          {expandedGroups[mappedName] ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                          {expandedGroups[mappedName] ? 'Dölj' : 'Visa'} produkter
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <Table className="mt-2">
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
                      </CollapsibleContent>
                    </Collapsible>
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
});
