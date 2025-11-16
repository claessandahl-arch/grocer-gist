import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Package } from "lucide-react";
import { StatsCard } from "@/components/datamanagement/StatsCard";
import { UngroupedProductsList } from "@/components/product-management/UngroupedProductsList";
import { ProductGroupsList } from "@/components/product-management/ProductGroupsList";
import { ProductSearchFilter } from "@/components/product-management/ProductSearchFilter";

export default function ProductManagement() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string>("all"); // all, grouped, ungrouped
  const [sortBy, setSortBy] = useState<string>("name-asc");

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

  // Fetch all user mappings
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

  // Fetch all global mappings
  const { data: globalMappings = [], isLoading: globalMappingsLoading } = useQuery({
    queryKey: ['global-product-mappings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('global_product_mappings')
        .select('*');

      if (error) throw error;
      return data.map(m => ({ ...m, type: 'global' as const }));
    },
  });

  // Combine all mappings
  const allMappings = useMemo(() => {
    return [...userMappings, ...globalMappings];
  }, [userMappings, globalMappings]);

  // Get ungrouped products (no mapped_name)
  const ungroupedProducts = useMemo(() => {
    return allMappings.filter(m => !m.mapped_name || m.mapped_name.trim() === '');
  }, [allMappings]);

  // Get product groups (unique mapped_name values)
  const productGroups = useMemo(() => {
    const groupsMap = new Map();

    allMappings
      .filter(m => m.mapped_name && m.mapped_name.trim() !== '')
      .forEach(mapping => {
        const key = mapping.mapped_name;
        if (!groupsMap.has(key)) {
          groupsMap.set(key, {
            name: key,
            products: [],
            categories: new Set(),
            types: new Set(),
            totalPurchases: 0,
            totalAmount: 0,
          });
        }

        const group = groupsMap.get(key);
        group.products.push(mapping);
        if (mapping.category) group.categories.add(mapping.category);
        group.types.add(mapping.type);
        group.totalPurchases += mapping.usage_count || 0;
      });

    return Array.from(groupsMap.values());
  }, [allMappings]);

  // Get unique groups by type
  const globalGroups = useMemo(() => {
    return productGroups.filter(g => g.types.has('global') && !g.types.has('user'));
  }, [productGroups]);

  const personalGroups = useMemo(() => {
    return productGroups.filter(g => g.types.has('user'));
  }, [productGroups]);

  // Calculate stats
  const stats = useMemo(() => {
    const totalProducts = allMappings.length;
    const ungrouped = ungroupedProducts.length;
    const ungroupedPercentage = totalProducts > 0
      ? Math.round((ungrouped / totalProducts) * 100)
      : 0;

    return {
      totalProducts,
      ungrouped,
      ungroupedPercentage,
      totalGroups: productGroups.length,
      globalGroupsCount: globalGroups.length,
      personalGroupsCount: personalGroups.length,
    };
  }, [allMappings, ungroupedProducts, productGroups, globalGroups, personalGroups]);

  // Apply search and sort
  const filteredUngroupedProducts = useMemo(() => {
    let filtered = ungroupedProducts;

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(p =>
        p.original_name.toLowerCase().includes(query)
      );
    }

    // Sort
    filtered = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case "name-asc":
          return a.original_name.localeCompare(b.original_name, 'sv');
        case "name-desc":
          return b.original_name.localeCompare(a.original_name, 'sv');
        default:
          return 0;
      }
    });

    return filtered;
  }, [ungroupedProducts, searchQuery, sortBy]);

  const filteredProductGroups = useMemo(() => {
    let filtered = productGroups;

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(g =>
        g.name.toLowerCase().includes(query) ||
        g.products.some(p => p.original_name.toLowerCase().includes(query))
      );
    }

    // Sort
    filtered = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case "name-asc":
          return a.name.localeCompare(b.name, 'sv');
        case "name-desc":
          return b.name.localeCompare(a.name, 'sv');
        default:
          return 0;
      }
    });

    return filtered;
  }, [productGroups, searchQuery, sortBy]);

  const isLoading = userMappingsLoading || globalMappingsLoading;

  const showLeftPanel = filterType === 'all' || filterType === 'ungrouped';
  const showRightPanel = filterType === 'all' || filterType === 'grouped';

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
              <h1 className="text-3xl font-bold text-foreground">Produkthantering</h1>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <StatsCard
            title="Totalt produkter"
            value={stats.totalProducts}
            loading={isLoading}
          />
          <StatsCard
            title="Tillhör ingen grupp"
            value={stats.ungrouped}
            subtitle={`${stats.ungroupedPercentage}%`}
            loading={isLoading}
            variant="warning"
          />
          <StatsCard
            title="Produktgrupper"
            value={stats.globalGroupsCount}
            loading={isLoading}
            variant="success"
          />
          <StatsCard
            title="Personliga produktgrupper"
            value={stats.personalGroupsCount}
            loading={isLoading}
            variant="info"
          />
        </div>

        {/* Search and Filters */}
        <ProductSearchFilter
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          filterType={filterType}
          onFilterTypeChange={setFilterType}
          sortBy={sortBy}
          onSortChange={setSortBy}
        />

        {/* Split-screen Layout */}
        <div className={`grid gap-4 ${showLeftPanel && showRightPanel ? 'lg:grid-cols-5' : 'lg:grid-cols-1'}`}>
          {/* Left Panel - Ungrouped Products */}
          {showLeftPanel && (
            <div className={showLeftPanel && showRightPanel ? 'lg:col-span-2' : 'lg:col-span-1'}>
              <UngroupedProductsList
                products={filteredUngroupedProducts}
                existingGroups={productGroups}
                isLoading={isLoading}
                onRefresh={() => {
                  queryClient.invalidateQueries({ queryKey: ['user-product-mappings'] });
                  queryClient.invalidateQueries({ queryKey: ['global-product-mappings'] });
                }}
              />
            </div>
          )}

          {/* Right Panel - Product Groups */}
          {showRightPanel && (
            <div className={showLeftPanel && showRightPanel ? 'lg:col-span-3' : 'lg:col-span-1'}>
              <ProductGroupsList
                groups={filteredProductGroups}
                isLoading={isLoading}
                onRefresh={() => {
                  queryClient.invalidateQueries({ queryKey: ['user-product-mappings'] });
                  queryClient.invalidateQueries({ queryKey: ['global-product-mappings'] });
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
