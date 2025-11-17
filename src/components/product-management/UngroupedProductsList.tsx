import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Globe, User, Plus } from "lucide-react";
import { AssignToGroupDropdown } from "./AssignToGroupDropdown";
import { CreateGroupDialog } from "./CreateGroupDialog";

type Product = {
  id: string;
  original_name: string;
  category: string | null;
  type: 'user' | 'global';
  usage_count?: number;
};

type ProductGroup = {
  name: string;
  products: any[];
  categories: Set<string>;
  types: Set<string>;
};

type UngroupedProductsListProps = {
  products: Product[];
  existingGroups: ProductGroup[];
  isLoading: boolean;
  onRefresh: () => void;
};

const ITEMS_PER_PAGE = 50;

// Swedish alphabet for filtering
const SWEDISH_ALPHABET = ['Alla', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', 'Å', 'Ä', 'Ö', '#'];

export function UngroupedProductsList({
  products,
  existingGroups,
  isLoading,
  onRefresh,
}: UngroupedProductsListProps) {
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(ITEMS_PER_PAGE);
  const [activeFilter, setActiveFilter] = useState<string>('Alla');
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const handleSelectProduct = (productId: string, checked: boolean) => {
    if (checked) {
      setSelectedProducts([...selectedProducts, productId]);
    } else {
      setSelectedProducts(selectedProducts.filter(id => id !== productId));
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedProducts(products.map(p => p.id));
    } else {
      setSelectedProducts([]);
    }
  };

  const handleCreateGroupFromSelected = () => {
    if (selectedProducts.length === 0) return;
    setCreateDialogOpen(true);
  };

  const handleGroupCreated = () => {
    setSelectedProducts([]);
    setCreateDialogOpen(false);
    onRefresh();
  };

  // Intersection Observer for infinite scroll
  useEffect(() => {
    if (!loadMoreRef.current) return;
    
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && visibleCount < products.length) {
          setVisibleCount(prev => Math.min(prev + ITEMS_PER_PAGE, products.length));
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [visibleCount, products.length]);

  // Reset visible count when products or filter changes
  useEffect(() => {
    setVisibleCount(ITEMS_PER_PAGE);
  }, [products, activeFilter]);

  // Filter products by selected letter
  const filteredProducts = useMemo(() => {
    if (activeFilter === 'Alla') return products;
    
    return products.filter(product => {
      const firstChar = product.original_name[0]?.toUpperCase();
      if (activeFilter === '#') {
        // Numbers and symbols
        return /[0-9]/.test(firstChar);
      }
      return firstChar === activeFilter;
    });
  }, [products, activeFilter]);

  // Count products per letter for badge display
  const letterCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    SWEDISH_ALPHABET.forEach(letter => {
      if (letter === 'Alla') {
        counts[letter] = products.length;
      } else if (letter === '#') {
        counts[letter] = products.filter(p => /[0-9]/.test(p.original_name[0])).length;
      } else {
        counts[letter] = products.filter(p => p.original_name[0]?.toUpperCase() === letter).length;
      }
    });
    return counts;
  }, [products]);

  const loadAllProducts = useCallback(() => {
    setVisibleCount(filteredProducts.length);
  }, [filteredProducts.length]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Produkter</CardTitle>
          <CardDescription>Laddar...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map(i => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const allSelected = filteredProducts.length > 0 && selectedProducts.length === products.length;
  const someSelected = selectedProducts.length > 0 && selectedProducts.length < products.length;
  const visibleProducts = filteredProducts.slice(0, visibleCount);
  const hasMore = visibleCount < filteredProducts.length;

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Produkter</CardTitle>
              <CardDescription>
                {activeFilter === 'Alla' ? (
                  <>
                    {products.length} produkt{products.length !== 1 ? 'er' : ''} utan grupp
                    {hasMore && ` (visar ${visibleCount} av ${products.length})`}
                  </>
                ) : (
                  <>
                    {filteredProducts.length} produkt{filteredProducts.length !== 1 ? 'er' : ''} börjar med "{activeFilter}"
                    {hasMore && ` (visar ${visibleCount} av ${filteredProducts.length})`}
                  </>
                )}
              </CardDescription>
            </div>
            {selectedProducts.length > 0 && (
              <Button
                size="sm"
                onClick={handleCreateGroupFromSelected}
                className="gap-2"
              >
                <Plus className="h-4 w-4" />
                Skapa grupp ({selectedProducts.length})
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {products.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>Alla produkter tillhör en grupp! 🎉</p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Alphabet Filter */}
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

              {/* Select All */}
              <div className="flex items-center gap-2 pb-2 border-b">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={handleSelectAll}
                  className={someSelected ? "data-[state=checked]:bg-primary/50" : ""}
                />
                <span className="text-sm text-muted-foreground">
                  Markera alla
                </span>
                {hasMore && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={loadAllProducts}
                    className="ml-auto text-xs"
                  >
                    Ladda alla ({filteredProducts.length})
                  </Button>
                )}
              </div>

              {/* No results message */}
              {filteredProducts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>Inga produkter börjar med "{activeFilter}"</p>
                </div>
              ) : (
                /* Product List */
                <div className="space-y-2 max-h-[600px] overflow-y-auto">
                {visibleProducts.map((product) => (
                  <div
                    key={product.id}
                    className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-accent/5 transition-colors"
                  >
                    <Checkbox
                      checked={selectedProducts.includes(product.id)}
                      onCheckedChange={(checked) => handleSelectProduct(product.id, checked as boolean)}
                      className="mt-1"
                    />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">
                            {product.original_name}
                          </p>
                          {product.category && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {product.category}
                            </p>
                          )}
                        </div>
                        <Badge variant={product.type === 'global' ? 'default' : 'outline'} className="shrink-0">
                          {product.type === 'global' ? (
                            <><Globe className="h-3 w-3 mr-1" /> Global</>
                          ) : (
                            <><User className="h-3 w-3 mr-1" /> User</>
                          )}
                        </Badge>
                      </div>

                      <AssignToGroupDropdown
                        product={product}
                        existingGroups={existingGroups}
                        onAssigned={onRefresh}
                        onCreateNew={() => {
                          setSelectedProducts([product.id]);
                          setCreateDialogOpen(true);
                        }}
                      />
                    </div>
                  </div>
                ))}

                {/* Load more trigger */}
                {hasMore && (
                  <div ref={loadMoreRef} className="text-center py-4 text-sm text-muted-foreground">
                    Laddar fler produkter...
                  </div>
                )}
              </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <CreateGroupDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        selectedProducts={products.filter(p => selectedProducts.includes(p.id))}
        onSuccess={handleGroupCreated}
      />
    </>
  );
}
