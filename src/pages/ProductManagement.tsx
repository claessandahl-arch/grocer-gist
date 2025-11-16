import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Package, Download } from "lucide-react";
import { toast } from "sonner";
import { categoryOptions } from "@/lib/categoryConstants";
import { ProductManagementTable } from "@/components/product-management/ProductManagementTable";
import { ProductSearchFilter } from "@/components/product-management/ProductSearchFilter";
import { StatsCard } from "@/components/datamanagement/StatsCard";
import { ProductMergeDialog } from "@/components/product-management/ProductMergeDialog";
import { ProductEditDialog } from "@/components/product-management/ProductEditDialog";
import { BulkActionsToolbar } from "@/components/product-management/BulkActionsToolbar";

type ProductData = {
  id: string;
  original_name: string;
  mapped_name: string | null;
  category: string | null;
  user_id?: string;
  created_at: string;
  updated_at: string;
  type: 'user' | 'global';
  usage_count?: number;
  isMerged: boolean;
  hasCategory: boolean;
  hasLocalOverride?: boolean;
};

export default function ProductManagement() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("name-asc");
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductData | null>(null);

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
      return data;
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
      return data;
    },
  });

  // Combine all mappings
  const allProducts: ProductData[] = useMemo(() => {
    const userProds = userMappings.map(m => ({
      ...m,
      type: 'user' as const,
      isMerged: !!m.mapped_name,
      hasCategory: !!m.category,
    }));

    const globalProds = globalMappings.map(m => ({
      ...m,
      type: 'global' as const,
      isMerged: !!m.mapped_name,
      hasCategory: !!m.category,
    }));

    return [...userProds, ...globalProds];
  }, [userMappings, globalMappings]);

  // Calculate stats
  const stats = useMemo(() => {
    const totalProducts = allProducts.length;
    const mergedProducts = allProducts.filter(p => p.isMerged).length;
    const notMergedProducts = allProducts.filter(p => !p.isMerged).length;
    const uniqueGroups = new Set(
      allProducts
        .filter(p => p.mapped_name)
        .map(p => p.mapped_name)
    ).size;

    return {
      totalProducts,
      mergedProducts,
      notMergedProducts,
      uniqueGroups,
    };
  }, [allProducts]);

  // Filter and sort products
  const filteredProducts = useMemo(() => {
    let filtered = allProducts;

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(p =>
        p.original_name.toLowerCase().includes(query) ||
        (p.mapped_name && p.mapped_name.toLowerCase().includes(query))
      );
    }

    // Category filter
    if (categoryFilter === "uncategorized") {
      filtered = filtered.filter(p => !p.category || p.category === null);
    } else if (categoryFilter !== "all") {
      filtered = filtered.filter(p => p.category === categoryFilter);
    }

    // Status filter (merged/not merged)
    if (statusFilter === "merged") {
      filtered = filtered.filter(p => p.isMerged);
    } else if (statusFilter === "not-merged") {
      filtered = filtered.filter(p => !p.isMerged);
    }

    // Type filter
    if (typeFilter !== "all") {
      filtered = filtered.filter(p => p.type === typeFilter);
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
        case "type":
          return a.type.localeCompare(b.type);
        case "updated":
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
        default:
          return 0;
      }
    });

    return filtered;
  }, [allProducts, searchQuery, categoryFilter, statusFilter, typeFilter, sortBy]);

  // Get products by tab
  const mergedProducts = useMemo(() => {
    return filteredProducts.filter(p => p.isMerged);
  }, [filteredProducts]);

  const notMergedProducts = useMemo(() => {
    return filteredProducts.filter(p => !p.isMerged);
  }, [filteredProducts]);

  // Update mapping mutation
  const updateMapping = useMutation({
    mutationFn: async ({ id, type, updates }: {
      id: string;
      type: 'user' | 'global';
      updates: { mapped_name?: string; category?: string }
    }) => {
      const table = type === 'user' ? 'product_mappings' : 'global_product_mappings';
      const { error } = await supabase
        .from(table)
        .update(updates)
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-product-mappings'] });
      queryClient.invalidateQueries({ queryKey: ['global-product-mappings'] });
      toast.success("Produkten uppdaterad");
    },
    onError: (error) => {
      console.error('Update error:', error);
      toast.error("Kunde inte uppdatera produkten");
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

  const handleEdit = (product: ProductData) => {
    setEditingProduct(product);
    setEditDialogOpen(true);
  };

  const handleDelete = (id: string, type: 'user' | 'global') => {
    if (confirm('Är du säker på att du vill radera denna produktmappning?')) {
      deleteMapping.mutate({ id, type });
    }
  };

  const handleMerge = () => {
    if (selectedProducts.length < 2) {
      toast.error("Välj minst 2 produkter för att slå ihop");
      return;
    }
    setMergeDialogOpen(true);
  };

  const handleBulkCategoryUpdate = async (category: string) => {
    const selectedMappings = filteredProducts.filter(p => selectedProducts.includes(p.id));

    try {
      await Promise.all(
        selectedMappings.map(p =>
          updateMapping.mutateAsync({
            id: p.id,
            type: p.type,
            updates: { category }
          })
        )
      );
      setSelectedProducts([]);
      toast.success(`${selectedMappings.length} produkter uppdaterade`);
    } catch (error) {
      console.error('Bulk update error:', error);
    }
  };

  const handleBulkDelete = () => {
    if (!confirm(`Är du säker på att du vill radera ${selectedProducts.length} produktmappningar?`)) {
      return;
    }

    const selectedMappings = filteredProducts.filter(p => selectedProducts.includes(p.id));

    Promise.all(
      selectedMappings.map(p => deleteMapping.mutateAsync({ id: p.id, type: p.type }))
    ).then(() => {
      setSelectedProducts([]);
    });
  };

  const handleExportCSV = () => {
    // Prepare CSV data
    const headers = ['Original namn', 'Mappat namn', 'Kategori', 'Typ', 'Användning'];
    const rows = filteredProducts.map(p => [
      p.original_name,
      p.mapped_name || '-',
      p.category ? (categoryOptions.find(c => c.value === p.category)?.label || p.category) : 'Ingen kategori',
      p.type === 'global' ? 'Global' : 'User',
      p.usage_count?.toString() || '0'
    ]);

    // Create CSV content
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    // Create blob and download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', `product-management-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast.success(`${filteredProducts.length} produkter exporterade till CSV`);
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
              <Package className="h-6 w-6 text-primary" />
              <h1 className="text-3xl font-bold text-foreground">Product Management</h1>
            </div>
          </div>
          <Button
            variant="outline"
            onClick={handleExportCSV}
            disabled={filteredProducts.length === 0}
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            Exportera CSV
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <StatsCard
            title="Totalt produkter"
            value={stats.totalProducts}
            loading={isLoading}
          />
          <StatsCard
            title="Sammanslagningar"
            value={stats.mergedProducts}
            loading={isLoading}
            variant="success"
          />
          <StatsCard
            title="Ej sammanslagen"
            value={stats.notMergedProducts}
            loading={isLoading}
            variant="warning"
          />
          <StatsCard
            title="Unika produktgrupper"
            value={stats.uniqueGroups}
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
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          typeFilter={typeFilter}
          onTypeFilterChange={setTypeFilter}
          sortBy={sortBy}
          onSortChange={setSortBy}
        />

        {/* Bulk Actions Bar */}
        {selectedProducts.length > 0 && (
          <BulkActionsToolbar
            selectedCount={selectedProducts.length}
            onMerge={handleMerge}
            onSetCategory={handleBulkCategoryUpdate}
            onDelete={handleBulkDelete}
            onClearSelection={() => setSelectedProducts([])}
          />
        )}

        {/* Tabs */}
        <Tabs defaultValue="all" className="space-y-4">
          <TabsList>
            <TabsTrigger value="all">
              Alla produkter ({stats.totalProducts})
            </TabsTrigger>
            <TabsTrigger value="merged">
              Sammanslagningar ({stats.mergedProducts})
            </TabsTrigger>
            <TabsTrigger value="not-merged">
              Ej sammanslagen ({stats.notMergedProducts})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="all">
            <ProductManagementTable
              products={filteredProducts}
              selectedProducts={selectedProducts}
              onSelectionChange={setSelectedProducts}
              onEdit={handleEdit}
              onDelete={handleDelete}
              isLoading={isLoading}
            />
          </TabsContent>

          <TabsContent value="merged">
            <ProductManagementTable
              products={mergedProducts}
              selectedProducts={selectedProducts}
              onSelectionChange={setSelectedProducts}
              onEdit={handleEdit}
              onDelete={handleDelete}
              isLoading={isLoading}
            />
          </TabsContent>

          <TabsContent value="not-merged">
            <ProductManagementTable
              products={notMergedProducts}
              selectedProducts={selectedProducts}
              onSelectionChange={setSelectedProducts}
              onEdit={handleEdit}
              onDelete={handleDelete}
              isLoading={isLoading}
            />
          </TabsContent>
        </Tabs>

        {/* Dialogs */}
        <ProductMergeDialog
          open={mergeDialogOpen}
          onOpenChange={setMergeDialogOpen}
          selectedProducts={filteredProducts.filter(p => selectedProducts.includes(p.id))}
          onMergeComplete={() => {
            setSelectedProducts([]);
            queryClient.invalidateQueries({ queryKey: ['user-product-mappings'] });
            queryClient.invalidateQueries({ queryKey: ['global-product-mappings'] });
          }}
        />

        <ProductEditDialog
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          product={editingProduct}
          onSave={(updates) => {
            if (editingProduct) {
              updateMapping.mutate({
                id: editingProduct.id,
                type: editingProduct.type,
                updates,
              });
            }
            setEditDialogOpen(false);
            setEditingProduct(null);
          }}
        />
      </div>
    </div>
  );
}
