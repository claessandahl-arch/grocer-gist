import React, { useState, useMemo, useCallback, useTransition, useDeferredValue } from "react";
import { List } from "react-window";
import { ProductListItem } from "./ProductListItem";
import { logger } from "@/lib/logger";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Trash2, Plus, Sparkles, ChevronDown, ChevronRight, Info } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { categoryOptions, categoryNames } from "@/lib/categoryConstants";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useDebouncedCallback } from "use-debounce";

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

// Swedish alphabet for filtering
const SWEDISH_ALPHABET = ['Alla', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', 'Å', 'Ä', 'Ö', '#'];

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

// Row component for virtual list (react-window v2 API)
const ProductRow = React.memo<{
  index: number;
  products: string[];
  selectedProducts: string[];
  handleProductToggle: (product: string) => void;
  handleAddToExistingGroup: (product: string, mappedName: string) => void;
  groupNames: string[] | undefined;
  isPending: boolean;
}>(({ index, products, selectedProducts, handleProductToggle, handleAddToExistingGroup, groupNames, isPending }) => {
  const product = products[index];

  return (
    <div className="px-4 py-1">
      <ProductListItem
        product={product}
        isSelected={selectedProducts.includes(product)}
        onToggle={handleProductToggle}
        onAddToGroup={handleAddToExistingGroup}
        groupNames={groupNames}
        isPending={isPending}
      />
    </div>
  );
});

ProductRow.displayName = "ProductRow";

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
  const [selectedStandardCategory, setSelectedStandardCategory] = useState<Record<string, string>>({});
  const [receiptLimit, setReceiptLimit] = useState(100); // Pagination limit
  const [activeFilter, setActiveFilter] = useState<string>('Alla'); // Alphabet filter for unmapped products
  const [activeGroupsFilter, setActiveGroupsFilter] = useState<string>('Alla'); // Alphabet filter for product groups

  // Use transition for non-urgent updates to prevent blocking UI
  const [isPending, startTransition] = useTransition();

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

  // Fetch all unique products from receipts (with pagination for performance)
  const { data: receipts } = useQuery({
    queryKey: ['receipts', receiptLimit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('receipts')
        .select('*')
        .order('receipt_date', { ascending: false })
        .limit(receiptLimit);

      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });

  // Fetch user's category overrides for global mappings
  const { data: userOverrides, isLoading: overridesLoading } = useQuery({
    queryKey: ['user-global-overrides'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data, error } = await supabase
        .from('user_global_overrides')
        .select('*')
        .eq('user_id', user.id);

      if (error) {
        logger.error('Error fetching global overrides:', error);
        return [];
      }

      return data || [];
    },
    staleTime: 30 * 1000, // 30 seconds
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

      return { userMappings, globalMappings };
    },
    staleTime: 30 * 1000, // 30 seconds
    refetchOnWindowFocus: false,
  });

  // Apply overrides to global mappings and combine with user mappings
  const combinedMappings = useMemo(() => {
    const userMappings = mappings?.userMappings || [];
    const globalMappings = mappings?.globalMappings || [];

    // User mappings (unchanged)
    const userMaps = userMappings.map(m => ({ ...m, isGlobal: false }));

    // Global mappings with overrides applied
    const globalMaps = globalMappings.map(m => {
      // Check if user has an override for this global mapping
      const override = userOverrides?.find(o => o.global_mapping_id === m.id);

      return {
        ...m,
        isGlobal: true,
        user_id: null,
        // Use override category if it exists, otherwise use global category
        category: override ? override.override_category : m.category,
        // Flag to indicate this has a local override
        hasLocalOverride: !!override,
        // Store override ID for deletion
        overrideId: override?.id
      };
    });

    const combined = [...userMaps, ...globalMaps];

    // Sort by mapped_name
    combined.sort((a, b) => a.mapped_name.localeCompare(b.mapped_name));

    return combined;
  }, [mappings?.userMappings, mappings?.globalMappings, userOverrides]);

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
    const mappedOriginalNames = new Set(combinedMappings?.map(m => m.original_name) || []);
    return productList.filter(p => !mappedOriginalNames.has(p));
  }, [productList, combinedMappings]);

  // Defer expensive calculations to prevent blocking UI updates
  const deferredUnmappedProducts = useDeferredValue(unmappedProducts);

  // Filter products by selected alphabet letter
  const filteredUnmappedProducts = useMemo(() => {
    if (activeFilter === 'Alla') return unmappedProducts;

    return unmappedProducts.filter(product => {
      const firstChar = product[0]?.toUpperCase();
      if (activeFilter === '#') {
        // Numbers and symbols
        return /[0-9]/.test(firstChar);
      }
      return firstChar === activeFilter;
    });
  }, [unmappedProducts, activeFilter]);

  // Count products per letter for badge display
  const letterCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    SWEDISH_ALPHABET.forEach(letter => {
      if (letter === 'Alla') {
        counts[letter] = unmappedProducts.length;
      } else if (letter === '#') {
        counts[letter] = unmappedProducts.filter(p => /[0-9]/.test(p[0])).length;
      } else {
        counts[letter] = unmappedProducts.filter(p => p[0]?.toUpperCase() === letter).length;
      }
    });
    return counts;
  }, [unmappedProducts]);

  // Generate suggested merges based on similarity (memoized with cache - expensive!)
  const suggestedMerges = useMemo(() => {
    // Don't calculate suggestions until ignored list is loaded
    if (ignoredSuggestionsLoading) {
      return [];
    }

    // Limit similarity calculations for performance - only process first 100 unmapped products
    // Use deferred value to prevent blocking UI on state updates
    const productsToProcess = deferredUnmappedProducts.slice(0, 100);

    const merges: SuggestedMerge[] = [];
    const processed = new Set<string>();

    // Cache similarity scores to avoid recalculating
    const similarityCache = new Map<string, number>();

    const getCachedSimilarity = (str1: string, str2: string): number => {
      const key = str1 < str2 ? `${str1}|${str2}` : `${str2}|${str1}`;
      if (!similarityCache.has(key)) {
        similarityCache.set(key, calculateSimilarity(str1, str2));
      }
      return similarityCache.get(key)!;
    };

    productsToProcess.forEach((product, i) => {
      if (processed.has(product)) return;

      const similar: string[] = [product];

      for (let j = i + 1; j < productsToProcess.length; j++) {
        const other = productsToProcess[j];
        if (processed.has(other)) continue;

        const similarity = getCachedSimilarity(product, other);

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
  }, [deferredUnmappedProducts, ignoredSuggestions, ignoredSuggestionsLoading]);

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
        // Get category from existing mappings if not provided
        let finalCategory = params.category;
        if (!finalCategory) {
          const { data: existingMappings } = await supabase
            .from('product_mappings')
            .select('category')
            .eq('mapped_name', params.mapped_name)
            .eq('user_id', user.id)
            .limit(1);
          
          finalCategory = existingMappings?.[0]?.category || null;
        }
        
        mappingsToCreate = [{
          user_id: user.id,
          original_name: params.original_name,
          mapped_name: params.mapped_name,
          category: finalCategory,
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

  // Standardize category mutation - updates all products in a group to the same category
  const standardizeCategory = useMutation({
    mutationFn: async ({
      mappedName,
      category
    }: {
      mappedName: string;
      category: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Get all items in this group
      const groupItems = groupedMappings?.[mappedName] || [];
      const userMappings = groupItems.filter((item: any) => !item.isGlobal);
      const globalMappings = groupItems.filter((item: any) => item.isGlobal);

      let totalUpdated = 0;

      // Update user mappings
      if (userMappings.length > 0) {
        const { error: userError } = await supabase
          .from('product_mappings')
          .update({ category })
          .in('id', userMappings.map((m: any) => m.id));

        if (userError) throw userError;
        totalUpdated += userMappings.length;
      }

      // Update global mappings (separate table)
      if (globalMappings.length > 0) {
        const { error: globalError } = await supabase
          .from('global_product_mappings')
          .update({ category })
          .in('id', globalMappings.map((m: any) => m.id));

        if (globalError) throw globalError;
        totalUpdated += globalMappings.length;
      }

      return {
        updated: totalUpdated,
        category
      };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['product-mappings'] });
      toast.success(`${data.updated} produkter uppdaterade till ${categoryNames[data.category] || data.category}`);
    },
    onError: (error) => {
      toast.error("Kunde inte uppdatera kategori: " + error.message);
      logger.error("Category standardization error:", error);
    },
  });

  // Create or update category override for a global mapping
  const updateCategoryOverride = useMutation({
    mutationFn: async ({
      globalMappingId,
      category
    }: {
      globalMappingId: string;
      category: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Use upsert to handle both create and update
      const { error } = await supabase
        .from('user_global_overrides')
        .upsert({
          user_id: user.id,
          global_mapping_id: globalMappingId,
          override_category: category,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id,global_mapping_id'
        });

      if (error) throw error;

      return { globalMappingId, category };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['user-global-overrides'] });
      queryClient.invalidateQueries({ queryKey: ['product-mappings'] });
      toast.success(`Kategori uppdaterad lokalt till ${categoryNames[data.category] || data.category}`);
      logger.debug('Category override created/updated:', data);
    },
    onError: (error) => {
      toast.error(`Kunde inte uppdatera kategori: ${error.message}`);
      logger.error('Category override error:', error);
    }
  });

  // Remove category override (restore to global category)
  const removeCategoryOverride = useMutation({
    mutationFn: async (overrideId: string) => {
      const { error } = await supabase
        .from('user_global_overrides')
        .delete()
        .eq('id', overrideId);

      if (error) throw error;

      return overrideId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-global-overrides'] });
      queryClient.invalidateQueries({ queryKey: ['product-mappings'] });
      toast.success('Återställt till global kategori');
    },
    onError: (error) => {
      toast.error(`Kunde inte återställa kategori: ${error.message}`);
      logger.error('Remove override error:', error);
    }
  });

  // Optimized checkbox toggle - instant UI update with stable callback
  const handleProductToggle = useCallback((product: string) => {
    startTransition(() => {
      setSelectedProducts(prev =>
        prev.includes(product)
          ? prev.filter(p => p !== product)
          : [...prev, product]
      );
    });
  }, [startTransition]);

  // Debounced text input handlers to prevent excessive re-renders
  const handleMergedNameChange = useDebouncedCallback((value: string) => {
    startTransition(() => {
      setMergedName(value);
    });
  }, 150);

  const handleGroupMergeNameChange = useDebouncedCallback((value: string) => {
    startTransition(() => {
      setGroupMergeName(value);
    });
  }, 150);

  const handleEditingSuggestionChange = useDebouncedCallback((idx: number, value: string) => {
    startTransition(() => {
      setEditingSuggestion(prev => ({ ...prev, [idx]: value }));
    });
  }, 200);

  const handleEditingMergeGroupChange = useDebouncedCallback((key: string, value: string) => {
    startTransition(() => {
      setEditingMergeGroup(prev => ({ ...prev, [key]: value }));
    });
  }, 200);

  const handleAddToExistingGroup = useCallback((product: string, mappedName: string) => {
    createMapping.mutate(
      {
        original_name: product,
        mapped_name: mappedName,
        category: "", // Will be set from groupedMappings in the mutation
        user_id: null,
      },
      {
        onSuccess: () => {
          toast.success(`"${product}" har lagts till i gruppen "${mappedName}"`);
          setSelectedProducts(prev => prev.filter(p => p !== product));
        },
      }
    );
  }, []); // Stable callback

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
        const { data, error: globalError } = await supabase
          .from('global_product_mappings')
          .update({ mapped_name: newName })
          .eq('mapped_name', oldName)
          .select();

        if (globalError) {
          errors.push(`Globala mappningar: ${globalError.message}`);
        } else if (!data || data.length === 0) {
          errors.push(`Globala mappningar: Ingen behörighet att uppdatera (RLS blockerade)`);
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
      const globalMappings = groupItems.filter((item: any) => item.isGlobal);
      
      const errors: string[] = [];
      let userUpdateSuccess = false;
      let globalUpdateSuccess = false;

      // Update user mappings if any exist
      if (userMappings.length > 0) {
        const { error: userError } = await supabase
          .from('product_mappings')
          .update({ category: newCategory })
          .eq('user_id', user.id)
          .eq('mapped_name', mappedName);

        if (userError) {
          errors.push(`Användarmappningar: ${userError.message}`);
        } else {
          userUpdateSuccess = true;
        }
      }

      // Update global mappings if any exist
      if (globalMappings.length > 0) {
        const { data, error: globalError } = await supabase
          .from('global_product_mappings')
          .update({ category: newCategory })
          .eq('mapped_name', mappedName)
          .select();

        if (globalError) {
          errors.push(`Globala mappningar: ${globalError.message}`);
        } else if (!data || data.length === 0) {
          errors.push(`Globala mappningar: Ingen behörighet att uppdatera (RLS blockerade)`);
        } else {
          globalUpdateSuccess = true;
        }
      }

      // If we had errors, throw them
      if (errors.length > 0) {
        throw new Error(errors.join('; '));
      }

      await queryClient.invalidateQueries({ queryKey: ['product-mappings'] });
      
      // Clear editing state
      setEditingCategory(prev => {
        const next = { ...prev };
        delete next[mappedName];
        return next;
      });
      
      // Show appropriate success message
      if (userUpdateSuccess && globalUpdateSuccess) {
        toast.success(`Kategori uppdaterad! (${userMappings.length} användar + ${globalMappings.length} globala)`);
      } else if (userUpdateSuccess) {
        toast.success(`Kategori uppdaterad för användar-mappningar! (${userMappings.length})`);
      } else if (globalUpdateSuccess) {
        toast.success(`Kategori uppdaterad för globala mappningar! (${globalMappings.length})`);
      }
      
      logger.debug('Category updated:', { mappedName, newCategory, userCount: userMappings.length, globalCount: globalMappings.length });
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
    return combinedMappings?.reduce((acc, mapping) => {
      if (!acc[mapping.mapped_name]) {
        acc[mapping.mapped_name] = [];
      }
      acc[mapping.mapped_name].push(mapping);
      return acc;
    }, {} as Record<string, Array<typeof combinedMappings[number]>>);
  }, [combinedMappings]);

  // Optimized: Pass only group names to ProductListItem instead of entire groupedMappings object
  const groupNames = useMemo(() => Object.keys(groupedMappings || {}), [groupedMappings]);

  // Filter product groups by selected alphabet letter
  const filteredGroupedMappings = useMemo(() => {
    if (!groupedMappings) return {};
    if (activeGroupsFilter === 'Alla') return groupedMappings;

    const filtered: Record<string, Array<typeof combinedMappings[number]>> = {};
    Object.entries(groupedMappings).forEach(([mappedName, items]) => {
      const firstChar = mappedName[0]?.toUpperCase();
      if (activeGroupsFilter === '#') {
        // Numbers and symbols
        if (/[0-9]/.test(firstChar)) {
          filtered[mappedName] = items;
        }
      } else if (firstChar === activeGroupsFilter) {
        filtered[mappedName] = items;
      }
    });
    return filtered;
  }, [groupedMappings, activeGroupsFilter]);

  // Count product groups per letter for badge display
  const groupLetterCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    const allGroupNames = Object.keys(groupedMappings || {});

    SWEDISH_ALPHABET.forEach(letter => {
      if (letter === 'Alla') {
        counts[letter] = allGroupNames.length;
      } else if (letter === '#') {
        counts[letter] = allGroupNames.filter(name => /[0-9]/.test(name[0])).length;
      } else {
        counts[letter] = allGroupNames.filter(name => name[0]?.toUpperCase() === letter).length;
      }
    });
    return counts;
  }, [groupedMappings]);

  // Debug log to check how many groups we have (only in development)
  if (import.meta.env.DEV) {
    logger.debug('Total mappings:', combinedMappings?.length);
    logger.debug('User mappings:', combinedMappings?.filter(m => !m.isGlobal).length);
    logger.debug('Global mappings:', combinedMappings?.filter(m => m.isGlobal).length);
    logger.debug('Global overrides active:', userOverrides?.length || 0);
    logger.debug('Grouped mappings:', Object.keys(groupedMappings || {}).length, 'groups');
  }

  // Build product index for O(1) lookups of spending, count, and categories from receipts
  const productIndex = useMemo(() => {
    const index = new Map<string, { spending: number; count: number; categories: Set<string> }>();

    receipts?.forEach(receipt => {
      const receiptItems = receipt.items as any[] || [];
      receiptItems.forEach(item => {
        if (!item.name) return;

        const existing = index.get(item.name) || {
          spending: 0,
          count: 0,
          categories: new Set<string>()
        };

        existing.spending += Number(item.price) || 0;
        existing.count++;

        if (item.category) {
          existing.categories.add(item.category);
        }

        index.set(item.name, existing);
      });
    });

    return index;
  }, [receipts]);

  // Calculate spending stats and category info for each group (optimized with indexing!)
  const groupStats = useMemo(() => {
    // Now calculate stats for each group using the index
    const stats: Record<string, {
      totalSpending: number;
      productCount: number;
      commonCategory: string | null;
      uniqueCategories: string[];
      hasMixedCategories: boolean;
    }> = {};

    Object.entries(groupedMappings || {}).forEach(([mappedName, items]) => {
      let totalSpending = 0;
      let productCount = 0;
      const allCategories = new Set<string>();

      // Aggregate stats from the index (O(items in group) instead of O(all receipts × all items))
      (items as any[]).forEach(item => {
        const productData = productIndex.get(item.original_name);
        if (productData) {
          totalSpending += productData.spending;
          productCount += productData.count;
          productData.categories.forEach(cat => allCategories.add(cat));
        }
      });

      const uniqueCategories = Array.from(allCategories);
      const commonCategory = uniqueCategories.length === 1 ? uniqueCategories[0] : null;

      stats[mappedName] = {
        totalSpending,
        productCount,
        commonCategory,
        uniqueCategories,
        hasMixedCategories: uniqueCategories.length > 1
      };
    });

    return stats;
  }, [groupedMappings, productIndex]);

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
                            onChange={(e) => handleEditingSuggestionChange(idx, e.target.value)}
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
            <label className="text-sm font-medium">
              Välj produkter att slå ihop:
              {activeFilter !== 'Alla' && (
                <span className="ml-2 text-muted-foreground">
                  ({filteredUnmappedProducts.length} av {unmappedProducts.length})
                </span>
              )}
            </label>

            {/* Alphabet Filter */}
            {unmappedProducts.length > 0 && (
              <div className="flex flex-wrap gap-1 pb-3 border-b">
                {SWEDISH_ALPHABET.map((letter) => (
                  <button
                    key={letter}
                    onClick={() => setActiveFilter(letter)}
                    disabled={letterCounts[letter] === 0}
                    className={`
                      px-2 py-1 text-xs font-medium rounded transition-colors min-w-[32px]
                      ${activeFilter === letter
                        ? 'bg-primary text-primary-foreground'
                        : letterCounts[letter] > 0
                          ? 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                          : 'bg-muted text-muted-foreground/50 cursor-not-allowed'
                      }
                    `}
                  >
                    {letter}
                    {letterCounts[letter] > 0 && letter !== 'Alla' && (
                      <span className="ml-1 text-[10px] opacity-70">
                        {letterCounts[letter]}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            <div className="border rounded-md overflow-hidden max-h-[500px] overflow-y-auto">
              {unmappedProducts.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Alla produkter är redan sammanslagna
                </p>
              ) : filteredUnmappedProducts.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Inga produkter börjar med "{activeFilter}"
                </p>
              ) : (
                <List
                  rowCount={filteredUnmappedProducts.length}
                  rowHeight={48}
                  defaultHeight={400}
                  rowComponent={(props) => (
                    <ProductRow
                      {...props}
                      products={filteredUnmappedProducts}
                      selectedProducts={selectedProducts}
                      handleProductToggle={handleProductToggle}
                      handleAddToExistingGroup={handleAddToExistingGroup}
                      groupNames={groupNames}
                      isPending={createMapping.isPending}
                    />
                  )}
                  rowProps={{}}
                  style={{ width: '100%' }}
                />
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
              onChange={(e) => handleMergedNameChange(e.target.value)}
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
      {!mappingsLoading && (!combinedMappings || combinedMappings.length === 0) && (
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
              <CardTitle>
                Aktiva sammanslagningar
                {activeGroupsFilter !== 'Alla' && (
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    ({Object.keys(filteredGroupedMappings).length} av {Object.keys(groupedMappings).length})
                  </span>
                )}
              </CardTitle>
              <CardDescription>
                Produkter du har slagit ihop. Välj grupper för att slå ihop dem ytterligare.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Alphabet Filter for Product Groups */}
              <div className="flex flex-wrap gap-1 pb-3 mb-4 border-b">
                {SWEDISH_ALPHABET.map((letter) => (
                  <button
                    key={letter}
                    onClick={() => setActiveGroupsFilter(letter)}
                    disabled={groupLetterCounts[letter] === 0}
                    className={`
                      px-2 py-1 text-xs font-medium rounded transition-colors min-w-[32px]
                      ${activeGroupsFilter === letter
                        ? 'bg-primary text-primary-foreground'
                        : groupLetterCounts[letter] > 0
                          ? 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                          : 'bg-muted text-muted-foreground/50 cursor-not-allowed'
                      }
                    `}
                  >
                    {letter}
                    {groupLetterCounts[letter] > 0 && letter !== 'Alla' && (
                      <span className="ml-1 text-[10px] opacity-70">
                        {groupLetterCounts[letter]}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {Object.keys(filteredGroupedMappings).length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>Inga produktgrupper börjar med "{activeGroupsFilter}"</p>
                </div>
              ) : (
                <div className="space-y-4">
                {Object.entries(filteredGroupedMappings).map(([mappedName, items]: [string, any[]]) => {
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
                                onChange={(e) => handleEditingMergeGroupChange(mappedName, e.target.value)}
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
                                  </>
                                )}
                                {/* Category standardization UI for mixed categories */}
                                {hasMixedCategories && hasUserMappings && (
                                  <div className="w-full mt-2 p-3 border border-orange-200 rounded-md bg-orange-50">
                                    <div className="flex items-center gap-2">
                                      <Label htmlFor={`std-category-${mappedName}`} className="text-sm font-medium whitespace-nowrap">
                                        Standardisera till:
                                      </Label>
                                      <Select
                                        value={selectedStandardCategory[mappedName] || ""}
                                        onValueChange={(value) => setSelectedStandardCategory(prev => ({
                                          ...prev,
                                          [mappedName]: value
                                        }))}
                                      >
                                        <SelectTrigger id={`std-category-${mappedName}`} className="w-[200px]">
                                          <SelectValue placeholder="Välj kategori" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {categoryOptions.map(opt => {
                                            // Count how many products have this category
                                            const count = items.filter((item: any) => {
                                              const pd = productIndex.get(item.original_name);
                                              return pd?.categories.has(opt.value);
                                            }).length;

                                            return (
                                              <SelectItem key={opt.value} value={opt.value}>
                                                {opt.label}
                                                {count > 0 && ` (${count})`}
                                              </SelectItem>
                                            );
                                          })}
                                        </SelectContent>
                                      </Select>

                                      <Button
                                        size="sm"
                                        onClick={() => {
                                          standardizeCategory.mutate({
                                            mappedName,
                                            category: selectedStandardCategory[mappedName]
                                          });
                                          // Clear selection after mutation
                                          setSelectedStandardCategory(prev => {
                                            const next = { ...prev };
                                            delete next[mappedName];
                                            return next;
                                          });
                                        }}
                                        disabled={!selectedStandardCategory[mappedName] || standardizeCategory.isPending}
                                      >
                                        Tillämpa på alla produkter
                                      </Button>
                                    </div>
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
                          <TableHead>Kategori</TableHead>
                          <TableHead className="w-[100px]">Åtgärd</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {items.map(item => {
                          // Get saved category from mapping
                          const savedCategory = item.category;

                          // Get receipt categories from productIndex
                          const productData = productIndex.get(item.original_name);
                          const receiptCategories = productData?.categories || new Set<string>();
                          const receiptCategoriesArray = Array.from(receiptCategories);

                          // Determine display categories (saved first, then receipt categories)
                          let displayCategories: string[] = [];
                          if (savedCategory) {
                            displayCategories = [savedCategory];
                            // Add other receipt categories if they differ (show all per user preference)
                            receiptCategoriesArray.forEach(cat => {
                              if (cat !== savedCategory && !displayCategories.includes(cat)) {
                                displayCategories.push(cat);
                              }
                            });
                          } else {
                            // No saved category, show all receipt categories
                            displayCategories = receiptCategoriesArray;
                          }

                          // Check for conflicts
                          const hasConflict = savedCategory &&
                                            receiptCategories.size > 0 &&
                                            !receiptCategories.has(savedCategory);

                          // Check if this item's category differs from group's common category
                          const categoryMismatch = commonCategory &&
                                                  savedCategory &&
                                                  savedCategory !== commonCategory;

                          return (
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
                                {item.isGlobal ? (
                                  // Global product with editable dropdown
                                  <div className="flex items-center gap-2">
                                    <Select
                                      value={item.category || ""}
                                      onValueChange={(newCategory) => {
                                        updateCategoryOverride.mutate({
                                          globalMappingId: item.id,
                                          category: newCategory
                                        });
                                      }}
                                      disabled={updateCategoryOverride.isPending}
                                    >
                                      <SelectTrigger className="w-[200px]">
                                        <SelectValue placeholder="Välj kategori" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {categoryOptions.map(opt => (
                                          <SelectItem key={opt.value} value={opt.value}>
                                            {opt.label}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>

                                    {/* Local override indicator */}
                                    {item.hasLocalOverride && (
                                      <TooltipProvider>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <Info className="h-4 w-4 text-blue-500 cursor-help flex-shrink-0" />
                                          </TooltipTrigger>
                                          <TooltipContent className="max-w-xs">
                                            <p className="text-sm mb-2">
                                              Du har anpassat kategorin lokalt. Andra användare ser fortfarande den globala kategorin.
                                            </p>
                                            <Button
                                              size="sm"
                                              variant="outline"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                removeCategoryOverride.mutate(item.overrideId!);
                                              }}
                                              disabled={removeCategoryOverride.isPending}
                                              className="w-full"
                                            >
                                              Återställ till global kategori
                                            </Button>
                                          </TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>
                                    )}
                                  </div>
                                ) : (
                                  // User mapping - keep existing logic
                                  <div className="flex items-center gap-1">
                                    <span className={categoryMismatch ? "text-orange-600" : ""}>
                                      {displayCategories.length > 0
                                        ? displayCategories.map(cat => categoryNames[cat] || cat).join(', ')
                                        : "Okategoriserad"}
                                    </span>
                                    {hasConflict && (
                                      <span
                                        title={`Sparad kategori: ${categoryNames[savedCategory] || savedCategory}\nKategorier i kvitton: ${receiptCategoriesArray.map(c => categoryNames[c] || c).join(', ')}`}
                                        className="cursor-help text-blue-600"
                                      >
                                        ℹ️
                                      </span>
                                    )}
                                    {categoryMismatch && (
                                      <span
                                        title={`Avviker från gruppens kategori: ${categoryNames[commonCategory] || commonCategory}`}
                                        className="cursor-help"
                                      >
                                        ⚠️
                                      </span>
                                    )}
                                  </div>
                                )}
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
                          );
                        })}
                      </TableBody>
                    </Table>
                      </CollapsibleContent>
                    </Collapsible>
                  </div>
                );
                })}
              </div>
              )}
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
                    onChange={(e) => handleGroupMergeNameChange(e.target.value)}
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
