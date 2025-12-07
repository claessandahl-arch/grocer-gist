import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Database, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { ProductTable } from "@/components/datamanagement/ProductTable";
import { BulkCategoryEditor } from "@/components/datamanagement/BulkCategoryEditor";
import { ProductSearchFilter } from "@/components/datamanagement/ProductSearchFilter";
import { StatsCard } from "@/components/datamanagement/StatsCard";
import { CATEGORY_KEYS } from "@/lib/categoryConstants";
import { ReceiptItem } from "@/types/receipt";

type ProductMapping = {
  id: string;
  original_name: string;
  mapped_name: string;
  category: string | null;
  user_id: string;
  created_at: string;
  updated_at: string;
  type: 'user' | 'global';
  usage_count?: number;
};

export default function DataManagement() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("name-asc");
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [bulkEditorOpen, setBulkEditorOpen] = useState(false);

  // Fetch current user
  const { data: user } = useQuery({
    queryKey: ['current-user'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/auth');
        throw new Error("Not authenticated");
      }
      return user;
    }
  });

  // Fetch all receipts to get product names
  // Note: Not filtering by user_id to match ProductManagement behavior and ensure all products are shown
  const { data: receipts = [], isLoading: receiptsLoading } = useQuery({
    queryKey: ['receipts-all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('receipts')
        .select('*')
        .order('receipt_date', { ascending: false });

      if (error) throw error;
      console.log('[DataManagement] Fetched receipts:', data?.length || 0);
      return data || [];
    },
    refetchOnMount: true, // Force fresh data
    staleTime: 0, // Don't use cached data
  });

  // Fetch user mappings with pagination (Supabase has 1000 row limit per query)
  const { data: userMappings = [], isLoading: userMappingsLoading } = useQuery({
    queryKey: ['user-product-mappings', user?.id],
    queryFn: async () => {
      if (!user) return [];
      
      const PAGE_SIZE = 1000;
      let allData: any[] = [];
      let from = 0;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('product_mappings')
          .select('*')
          .eq('user_id', user.id)
          .range(from, from + PAGE_SIZE - 1);

        if (error) throw error;
        
        if (data && data.length > 0) {
          allData = [...allData, ...data];
          from += PAGE_SIZE;
          hasMore = data.length === PAGE_SIZE;
        } else {
          hasMore = false;
        }
      }

      console.log('[DataManagement] User mappings fetched (paginated):', allData.length);
      return allData.map(m => ({ ...m, type: 'user' as const }));
    },
    enabled: !!user,
    refetchOnMount: true,
    staleTime: 0,
  });

  // Fetch global mappings
  const { data: globalMappings = [], isLoading: globalMappingsLoading } = useQuery({
    queryKey: ['global-product-mappings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('global_product_mappings')
        .select('*')
        .limit(10000); // Override default 1000 row limit

      if (error) throw error;
      console.log('[DataManagement] Global mappings fetched:', data?.length || 0);
      return data.map(m => ({ ...m, type: 'global' as const, user_id: '' }));
    },
  });

  // Get unique product names from all receipts
  const allProductNames = useMemo(() => {
    const uniqueNames = new Set<string>();
    console.log('[DataManagement] Processing receipts:', receipts.length);
    receipts.forEach((receipt, idx) => {
      const items = (receipt.items as unknown as ReceiptItem[]) || [];
      console.log(`[DataManagement] Receipt ${idx + 1}/${receipts.length}: ${items.length} items from ${receipt.store_name || 'unknown store'}`);
      items.forEach(item => {
        if (item.name) uniqueNames.add(item.name);
      });
    });
    const result = Array.from(uniqueNames);
    console.log('[DataManagement] Total unique products from receipts:', result.length);
    return result;
  }, [receipts]);

  // Combine all mappings
  const allMappings: ProductMapping[] = useMemo(() => {
    return [...userMappings, ...globalMappings];
  }, [userMappings, globalMappings]);

  // Get mapped original names
  const mappedOriginalNames = useMemo(() => {
    return new Set(allMappings.map(m => m.original_name));
  }, [allMappings]);

  // Filter and sort mappings
  const filteredMappings = useMemo(() => {
    let filtered = allMappings;

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(m =>
        m.original_name.toLowerCase().includes(query) ||
        m.mapped_name.toLowerCase().includes(query)
      );
    }

    // Category filter
    if (categoryFilter === "uncategorized") {
      filtered = filtered.filter(m => !m.category || m.category === null);
    } else if (categoryFilter !== "all") {
      filtered = filtered.filter(m => m.category === categoryFilter);
    }

    // Type filter
    if (typeFilter !== "all") {
      filtered = filtered.filter(m => m.type === typeFilter);
    }

    // Sort
    filtered = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case "name-asc":
          return a.original_name.localeCompare(b.original_name, 'sv');
        case "name-desc":
          return b.original_name.localeCompare(a.original_name, 'sv');
        case "category":
          return (a.category || 'zzz').localeCompare(b.category || 'zzz', 'sv');
        case "usage":
          return (b.usage_count || 0) - (a.usage_count || 0);
        case "updated":
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
        default:
          return 0;
      }
    });

    return filtered;
  }, [allMappings, searchQuery, categoryFilter, typeFilter, sortBy]);

  // Get uncategorized products
  // This includes: unmapped products + mapped products without category
  const uncategorizedProducts = useMemo(() => {
    const uncategorized: ProductMapping[] = [];

    // Check each product from receipts
    allProductNames.forEach(productName => {
      // Find if this product has a mapping
      const mapping = allMappings.find(m => m.original_name === productName);

      if (!mapping) {
        // Unmapped product (no category by definition)
        uncategorized.push({
          id: `unmapped-${productName}`,
          original_name: productName,
          mapped_name: '',
          category: null,
          user_id: '',
          created_at: '',
          updated_at: '',
          type: 'user' as const,
        });
      } else if (!mapping.category || mapping.category === null) {
        // Mapped but no category
        uncategorized.push(mapping);
      }
    });

    console.log('[DataManagement] Uncategorized products:', uncategorized.length);
    console.log('[DataManagement] Breakdown:', {
      totalProducts: allProductNames.length,
      mappedProducts: allMappings.length,
      uncategorized: uncategorized.length,
    });

    return uncategorized;
  }, [allProductNames, allMappings]);

  // Filter and sort uncategorized products (apply search and sort)
  const filteredUncategorizedMappings = useMemo(() => {
    let filtered = uncategorizedProducts;

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(m =>
        m.original_name.toLowerCase().includes(query) ||
        m.mapped_name.toLowerCase().includes(query)
      );
    }

    // Apply type filter
    if (typeFilter !== "all") {
      filtered = filtered.filter(m => m.type === typeFilter);
    }

    // Apply sort
    filtered = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case "name-asc":
          return a.original_name.localeCompare(b.original_name, 'sv');
        case "name-desc":
          return b.original_name.localeCompare(a.original_name, 'sv');
        case "category":
          return (a.category || 'zzz').localeCompare(b.category || 'zzz', 'sv');
        case "usage":
          return (b.usage_count || 0) - (a.usage_count || 0);
        case "updated":
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
        default:
          return 0;
      }
    });

    return filtered;
  }, [uncategorizedProducts, searchQuery, typeFilter, sortBy]);

  // Update category mutation
  const updateCategory = useMutation({
    mutationFn: async ({ id, type, category }: { id: string; type: 'user' | 'global'; category: string }) => {
      console.log('[DataManagement] updateCategory called:', { id, type, category });

      // Check if this is an unmapped product
      const isUnmapped = id.startsWith('unmapped-');

      if (isUnmapped) {
        // Extract product name from ID
        const productName = id.substring('unmapped-'.length);
        console.log('[DataManagement] Creating new mapping for unmapped product:', productName);

        // Create new mapping
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");

        const { error } = await supabase
          .from('product_mappings')
          .upsert({
            user_id: user.id,
            original_name: productName,
            mapped_name: productName,
            category: category,
          }, { 
            onConflict: 'user_id,original_name',
            ignoreDuplicates: false
          });

        if (error) {
          console.error('[DataManagement] Failed to create mapping:', error);
          throw error;
        }
        console.log('[DataManagement] Successfully created mapping for:', productName);
      } else {
        // Update existing mapping
        console.log('[DataManagement] Updating existing mapping:', id);
        const table = type === 'user' ? 'product_mappings' : 'global_product_mappings';
        const { error } = await supabase
          .from(table)
          .update({ category })
          .eq('id', id);

        if (error) {
          console.error('[DataManagement] Failed to update mapping:', error);
          throw error;
        }
        console.log('[DataManagement] Successfully updated mapping:', id);
      }
    },
    onSuccess: () => {
      console.log('[DataManagement] Category update successful, invalidating queries');
      queryClient.invalidateQueries({ queryKey: ['product-mappings'] });
      queryClient.invalidateQueries({ queryKey: ['user-product-mappings'] });
      queryClient.invalidateQueries({ queryKey: ['global-product-mappings'] });
      queryClient.invalidateQueries({ queryKey: ['receipts-all'] });
      toast.success("Kategori uppdaterad");
    },
    onError: (error) => {
      console.error('[DataManagement] Category update failed:', error);
      toast.error(error instanceof Error ? error.message : "Kunde inte uppdatera kategori");
    }
  });

  // Delete mapping mutation
  const deleteMapping = useMutation({
    mutationFn: async ({ id, type }: { id: string; type: 'user' | 'global' }) => {
      const table = type === 'user' ? 'product_mappings' : 'global_product_mappings';
      const { error } = await supabase
        .from(table)
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-product-mappings'] });
      queryClient.invalidateQueries({ queryKey: ['global-product-mappings'] });
      toast.success("Produktmappning raderad");
    },
    onError: (error) => {
      console.error('Delete error:', error);
      toast.error("Kunde inte radera mappning");
    }
  });

  const handleCategoryUpdate = (id: string, type: 'user' | 'global', category: string) => {
    updateCategory.mutate({ id, type, category });
  };

  const handleDelete = (id: string, type: 'user' | 'global') => {
    if (confirm('Är du säker på att du vill radera denna produktmappning?')) {
      deleteMapping.mutate({ id, type });
    }
  };

  const handleBulkCategoryUpdate = (category: string) => {
    const selectedMappings = filteredMappings.filter(m => selectedProducts.includes(m.id));

    Promise.all(
      selectedMappings.map(m => updateCategory.mutateAsync({ id: m.id, type: m.type, category }))
    ).then(() => {
      setSelectedProducts([]);
      setBulkEditorOpen(false);
    });
  };

  const handleBulkDelete = () => {
    if (!confirm(`Är du säker på att du vill radera ${selectedProducts.length} produktmappningar?`)) {
      return;
    }

    const selectedMappings = filteredMappings.filter(m => selectedProducts.includes(m.id));

    Promise.all(
      selectedMappings.map(m => deleteMapping.mutateAsync({ id: m.id, type: m.type }))
    ).then(() => {
      setSelectedProducts([]);
    });
  };

  const isLoading = receiptsLoading || userMappingsLoading || globalMappingsLoading;

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/dashboard')}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Tillbaka
            </Button>
            <div className="flex items-center gap-2">
              <Database className="h-6 w-6 text-primary" />
              <h1 className="text-3xl font-bold text-foreground">Datahantering</h1>
            </div>
          </div>
        </div>

        {/* Data Truncation Warning */}
        {(userMappings.length === 10000 || globalMappings.length === 10000) && (
          <Alert variant="destructive" className="mb-6">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Varning: Du har nått gränsen för produktmappningar ({userMappings.length === 10000 ? 'personliga' : 'globala'}). 
              Vissa produkter kanske inte visas. Kontakta support om du behöver hantera fler mappningar.
            </AlertDescription>
          </Alert>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <StatsCard
            title="Totalt produkter"
            value={allProductNames.length}
            loading={isLoading}
          />
          <StatsCard
            title="Okategoriserade"
            value={uncategorizedProducts.length}
            subtitle={allProductNames.length > 0 ? `${Math.round((uncategorizedProducts.length / allProductNames.length) * 100)}%` : '0%'}
            loading={isLoading}
            variant="warning"
          />
          <StatsCard
            title="Globala mappningar"
            value={globalMappings.length}
            loading={isLoading}
            variant="success"
          />
          <StatsCard
            title="Personliga mappningar"
            value={userMappings.length}
            loading={isLoading}
            variant="info"
          />
        </div>

        {/* Search and Filters */}
        <ProductSearchFilter
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          categoryFilter={categoryFilter}
          onCategoryFilterChange={setCategoryFilter}
          typeFilter={typeFilter}
          onTypeFilterChange={setTypeFilter}
          sortBy={sortBy}
          onSortChange={setSortBy}
        />

        {/* Bulk Actions Bar */}
        {selectedProducts.length > 0 && (
          <div className="bg-accent/10 border border-accent rounded-lg p-4 mb-4 flex items-center justify-between">
            <span className="text-sm font-medium">
              {selectedProducts.length} produkt{selectedProducts.length > 1 ? 'er' : ''} vald{selectedProducts.length > 1 ? 'a' : ''}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setBulkEditorOpen(true)}
              >
                Sätt kategori
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleBulkDelete}
              >
                Radera valda
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedProducts([])}
              >
                Avmarkera alla
              </Button>
            </div>
          </div>
        )}

        {/* Tabs */}
        <Tabs defaultValue="uncategorized" className="space-y-4">
          <TabsList>
            <TabsTrigger value="uncategorized">
              Okategoriserade ({uncategorizedProducts.length})
            </TabsTrigger>
            <TabsTrigger value="all">
              Alla produkter ({allMappings.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="uncategorized">
            <ProductTable
              mappings={filteredUncategorizedMappings}
              selectedProducts={selectedProducts}
              onSelectionChange={setSelectedProducts}
              onCategoryUpdate={handleCategoryUpdate}
              onDelete={handleDelete}
              isLoading={isLoading}
            />
          </TabsContent>

          <TabsContent value="all">
            <ProductTable
              mappings={filteredMappings}
              selectedProducts={selectedProducts}
              onSelectionChange={setSelectedProducts}
              onCategoryUpdate={handleCategoryUpdate}
              onDelete={handleDelete}
              isLoading={isLoading}
            />
          </TabsContent>
        </Tabs>

        {/* Bulk Category Editor Dialog */}
        <BulkCategoryEditor
          open={bulkEditorOpen}
          onOpenChange={setBulkEditorOpen}
          selectedCount={selectedProducts.length}
          onCategoryUpdate={handleBulkCategoryUpdate}
        />
      </div>
    </div>
  );
}
