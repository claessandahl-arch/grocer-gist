import { useState } from "react";
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

export function UngroupedProductsList({
  products,
  existingGroups,
  isLoading,
  onRefresh,
}: UngroupedProductsListProps) {
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

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

  const allSelected = products.length > 0 && selectedProducts.length === products.length;
  const someSelected = selectedProducts.length > 0 && selectedProducts.length < products.length;

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Produkter</CardTitle>
              <CardDescription>
                {products.length} produkt{products.length !== 1 ? 'er' : ''} utan grupp
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
            <div className="space-y-2">
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
              </div>

              {/* Product List */}
              {products.map((product) => (
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
