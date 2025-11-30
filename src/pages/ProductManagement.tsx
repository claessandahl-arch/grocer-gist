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
import { AutoGrouping } from "@/components/product-management/AutoGrouping";
import { ReceiptItem } from "@/types/receipt";

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

  // Fetch all receipts to get product names
  // Note: Not filtering by user_id to match ProductMerge behavior and ensure all products are shown
  const { data: receipts = [], isLoading: receiptsLoading } = useQuery({
    queryKey: ['receipts-all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('receipts')
        .select('*')
        .order('receipt_date', { ascending: false });

      if (error) throw error;
      console.log('[ProductManagement] Fetched receipts:', data?.length || 0);
      return data || [];
    },
    refetchOnMount: true, // Force fresh data
    staleTime: 0, // Don't use cached data
  });

  // Fetch all user mappings
  const { data: userMappings = [], isLoading: userMappingsLoading } = useQuery({
    queryKey: ['user-product-mappings', user?.id],
    queryFn: async () => {
      console.log('[ProductManagement] Fetching user mappings...');
      if (!user) return [];
      const { data, error } = await supabase
        .from('product_mappings')
        .select('*')
        .eq('user_id', user.id)
        .limit(10000); // Override default 1000 row limit

      if (error) throw error;
      console.log('[ProductManagement] User mappings fetched:', data?.length || 0);
      return data.map(m => ({ ...m, type: 'user' as const }));
    },
    enabled: !!user,
    staleTime: 0, // Don't cache - always refetch
  });

  // Fetch all global mappings
  const { data: globalMappings = [], isLoading: globalMappingsLoading } = useQuery({
    queryKey: ['global-product-mappings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('global_product_mappings')
        .select('*')
        .limit(10000); // Override default 1000 row limit

      if (error) throw error;
      return data.map(m => ({ ...m, type: 'global' as const }));
    },
  });

  // Get unique product names from all receipts
  const allProductNames = useMemo(() => {
    const uniqueNames = new Set<string>();
    console.log('[ProductManagement] Processing receipts:', receipts.length);
    receipts.forEach((receipt, idx) => {
      const items = (receipt.items as unknown as ReceiptItem[]) || [];
      console.log(`[ProductManagement] Receipt ${idx + 1}/${receipts.length}: ${items.length} items from ${receipt.store_name || 'unknown store'}`);
      items.forEach(item => {
        if (item.name) uniqueNames.add(item.name);
      });
    });
    const result = Array.from(uniqueNames);
    console.log('[ProductManagement] Total unique products from receipts:', result.length);
    console.log('[ProductManagement] First 10 products:', result.slice(0, 10));
    return result;
  }, [receipts]);

  // Combine all mappings
  const allMappings = useMemo(() => {
    return [...userMappings, ...globalMappings];
  }, [userMappings, globalMappings]);

  // Get mapped original names
  const mappedOriginalNames = useMemo(() => {
    const mapped = new Set(allMappings.map(m => m.original_name));
    console.log('[ProductManagement] Total mapped products:', mapped.size);
    console.log('[ProductManagement] User mappings:', userMappings.length);
    console.log('[ProductManagement] Global mappings:', globalMappings.length);
    return mapped;
  }, [allMappings, userMappings, globalMappings]);

  // Get unmapped products (products from receipts that don't have mappings yet)
  const unmappedProducts = useMemo(() => {
    const result = allProductNames
      .filter(name => !mappedOriginalNames.has(name))
      .map(name => ({
        id: `unmapped-${name}`, // Temporary ID for unmapped products
        original_name: name,
        mapped_name: null,
        category: null,
        type: 'user' as const,
        usage_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));
    console.log('[ProductManagement] Unmapped products (from receipts without mappings):', result.length);
    return result;
  }, [allProductNames, mappedOriginalNames]);

  // Get products with mappings but no group (no mapped_name)
  const mappedButUngrouped = useMemo(() => {
    const result = allMappings.filter(m => !m.mapped_name || m.mapped_name.trim() === '');
    console.log('[ProductManagement] Mapped but ungrouped products:', result.length);
    return result;
  }, [allMappings]);

  // Combine unmapped and mapped-but-ungrouped products
  const ungroupedProducts = useMemo(() => {
    const result = [...unmappedProducts, ...mappedButUngrouped];
    console.log('[ProductManagement] Total ungrouped products:', result.length);
    console.log('[ProductManagement] Breakdown:', {
      unmapped: unmappedProducts.length,
      mappedButUngrouped: mappedButUngrouped.length
    });
    return result;
  }, [unmappedProducts, mappedButUngrouped]);

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
        group.totalPurchases += (mapping.type === 'global' ? mapping.usage_count : 0) || 0;
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
    const totalProducts = allProductNames.length;
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
  }, [allProductNames, ungroupedProducts, productGroups, globalGroups, personalGroups]);

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

    if (filterType === 'mixed-categories') {
      filtered = filtered.filter(g => g.categories.size > 1);
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

  const isLoading = receiptsLoading || userMappingsLoading || globalMappingsLoading;

  const showLeftPanel = filterType === 'all' || filterType === 'ungrouped';
  const showRightPanel = filterType === 'all' || filterType === 'grouped' || filterType === 'mixed-categories';
  const showAutoGrouping = filterType === 'auto-grouping';

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

        {/* Content Area */}
        {showAutoGrouping ? (
          <div className="mt-6">
            <AutoGrouping />
          </div>
        ) : (
          <div className={`grid gap-4 ${showLeftPanel && showRightPanel ? 'lg:grid-cols-5' : 'lg:grid-cols-1'}`}>
            {/* Left Panel - Ungrouped Products */}
            {showLeftPanel && (
              <div className={showLeftPanel && showRightPanel ? 'lg:col-span-2' : 'lg:col-span-1'}>
                <UngroupedProductsList
                  products={filteredUngroupedProducts}
                  existingGroups={productGroups}
                  isLoading={isLoading}
                  onRefresh={async () => {
                    console.log('[ProductManagement] onRefresh called - Refreshing after assignment...');
                    console.log('[ProductManagement] Current user id:', user?.id);
                    // Use exact query key with user id for user mappings
                    console.log('[ProductManagement] Refetching user-product-mappings...');
                    await queryClient.refetchQueries({ 
                      queryKey: ['user-product-mappings', user?.id],
                      exact: true,
                    });
                    console.log('[ProductManagement] Refetching global-product-mappings...');
                    await queryClient.refetchQueries({ 
                      queryKey: ['global-product-mappings'],
                      exact: true,
                    });
                    console.log('[ProductManagement] Refetching receipts-all...');
                    await queryClient.refetchQueries({ 
                      queryKey: ['receipts-all'],
                      exact: true,
                    });
                    console.log('[ProductManagement] All refetches complete');
                  }}
                />
              </div>
            )}

            {/* Right Panel - Product Groups */}
            {showRightPanel && (
              <div className={showLeftPanel && showRightPanel ? 'lg:col-span-3' : 'lg:col-span-1'}>
                <ProductGroupsList
                  groups={filteredProductGroups}
                  allGroups={productGroups}
                  isLoading={isLoading}
                  onRefresh={async () => {
                    console.log('[ProductManagement] onRefresh called - Refreshing after group change...');
                    await queryClient.refetchQueries({ 
                      queryKey: ['user-product-mappings', user?.id],
                      exact: true,
                    });
                    await queryClient.refetchQueries({ 
                      queryKey: ['global-product-mappings'],
                      exact: true,
                    });
                    await queryClient.refetchQueries({ 
                      queryKey: ['receipts-all'],
                      exact: true,
                    });
                    console.log('[ProductManagement] All refetches complete');
                  }}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
