import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Database } from "lucide-react";
import { toast } from "sonner";
import { ProductTable } from "@/components/datamanagement/ProductTable";
import { BulkCategoryEditor } from "@/components/datamanagement/BulkCategoryEditor";
import { ProductSearchFilter } from "@/components/datamanagement/ProductSearchFilter";
import { StatsCard } from "@/components/datamanagement/StatsCard";
import { CATEGORY_KEYS } from "@/lib/categoryConstants";

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

  // Fetch user mappings
  const { data: userMappings = [], isLoading: userMappingsLoading } = useQuery({
    queryKey: ['user-product-mappings', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('product_mappings')
        .select('*')
        .eq('user_id', user.id);
      
      if (error) throw error;
      return data.map(m => ({ ...m, type: 'user' as const }));
    },
    enabled: !!user,
  });

  // Fetch global mappings
  const { data: globalMappings = [], isLoading: globalMappingsLoading } = useQuery({
    queryKey: ['global-product-mappings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('global_product_mappings')
        .select('*');
      
      if (error) throw error;
      return data.map(m => ({ ...m, type: 'global' as const, user_id: '' }));
    },
  });

  // Combine all mappings
  const allMappings: ProductMapping[] = useMemo(() => {
    return [...userMappings, ...globalMappings];
  }, [userMappings, globalMappings]);

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
  const uncategorizedProducts = useMemo(() => {
    return allMappings.filter(m => !m.category || m.category === null);
  }, [allMappings]);

  // Update category mutation
  const updateCategory = useMutation({
    mutationFn: async ({ id, type, category }: { id: string; type: 'user' | 'global'; category: string }) => {
      const table = type === 'user' ? 'product_mappings' : 'global_product_mappings';
      const { error } = await supabase
        .from(table)
        .update({ category })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-product-mappings'] });
      queryClient.invalidateQueries({ queryKey: ['global-product-mappings'] });
      toast.success("Kategori uppdaterad");
    },
    onError: (error) => {
      console.error('Update error:', error);
      toast.error("Kunde inte uppdatera kategori");
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

  const isLoading = userMappingsLoading || globalMappingsLoading;

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

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <StatsCard
            title="Totalt produkter"
            value={allMappings.length}
            loading={isLoading}
          />
          <StatsCard
            title="Okategoriserade"
            value={uncategorizedProducts.length}
            subtitle={allMappings.length > 0 ? `${Math.round((uncategorizedProducts.length / allMappings.length) * 100)}%` : '0%'}
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
              mappings={uncategorizedProducts}
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
