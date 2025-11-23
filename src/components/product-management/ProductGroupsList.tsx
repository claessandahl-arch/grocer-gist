import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronRight, AlertTriangle, Globe, User, X, Edit, Merge } from "lucide-react";
import { toast } from "sonner";
import { categoryOptions } from "@/lib/categoryConstants";
import { RenameGroupDialog } from "./RenameGroupDialog";
import { MergeGroupsDialog } from "./MergeGroupsDialog";

type ProductGroup = {
  name: string;
  products: { id: string; user_id: string | null; original_name: string; category: string | null }[];
  categories: Set<string>;
  types: Set<string>;
  totalPurchases: number;
  totalAmount: number;
};

type ProductGroupsListProps = {
  groups: ProductGroup[];
  isLoading: boolean;
  onRefresh: () => void;
};

export function ProductGroupsList({
  groups,
  isLoading,
  onRefresh,
}: ProductGroupsListProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<ProductGroup | null>(null);
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [selectedGroupToMerge, setSelectedGroupToMerge] = useState<ProductGroup | null>(null);

  const toggleExpanded = (groupName: string) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(groupName)) {
      newExpanded.delete(groupName);
    } else {
      newExpanded.add(groupName);
    }
    setExpandedGroups(newExpanded);
  };

  const standardizeCategory = useMutation({
    mutationFn: async ({ groupName, category }: { groupName: string; category: string }) => {
      const group = groups.find(g => g.name === groupName);
      if (!group) throw new Error("Group not found");

      // Group products by type
      const userProducts = group.products.filter(p => p.user_id);
      const globalProducts = group.products.filter(p => !p.user_id);

      // Update user products
      if (userProducts.length > 0) {
        const { error: userError } = await supabase
          .from('product_mappings')
          .update({ category })
          .in('id', userProducts.map(p => p.id));

        if (userError) throw userError;
      }

      // Update global products
      if (globalProducts.length > 0) {
        const { error: globalError } = await supabase
          .from('global_product_mappings')
          .update({ category })
          .in('id', globalProducts.map(p => p.id));

        if (globalError) throw globalError;
      }
    },
    onSuccess: (_, { groupName, category }) => {
      const categoryLabel = categoryOptions.find(c => c.value === category)?.label || category;
      toast.success(`Kategori uppdaterad till "${categoryLabel}" för gruppen "${groupName}"`);
      onRefresh();
    },
    onError: (error) => {
      console.error('Standardize category error:', error);
      toast.error("Kunde inte uppdatera kategori");
    }
  });

  const removeFromGroup = useMutation({
    mutationFn: async ({ productId, isGlobal, originalName }: { productId: string; isGlobal: boolean; originalName: string }) => {
      if (isGlobal) {
        // For global products, we need to create a user mapping that "overrides" the global one
        // by setting mapped_name to an empty string (effectively ungrouping it for this user)
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");

        const { error } = await supabase
          .from('product_mappings')
          .insert({
            user_id: user.id,
            original_name: originalName,
            mapped_name: '', // Empty string means ungrouped
          });

        if (error) throw error;
      } else {
        // For user mappings, we just update the existing record
        const { error } = await supabase
          .from('product_mappings')
          .update({ mapped_name: '' }) // Set to empty string instead of null
          .eq('id', productId);

        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Produkt borttagen från gruppen");
      onRefresh();
    },
    onError: (error) => {
      console.error('Remove from group error:', error);
      toast.error("Kunde inte ta bort produkten från gruppen");
    }
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Produktgrupper</CardTitle>
          <CardDescription>Laddar...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map(i => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Produktgrupper</CardTitle>
        <CardDescription>
          {groups.length} produktgrupp{groups.length !== 1 ? 'er' : ''}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {groups.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>Inga produktgrupper ännu</p>
            <p className="text-sm mt-2">Skapa din första grupp från produkter till vänster</p>
          </div>
        ) : (
          <div className="space-y-3">
            {groups.map((group) => {
              const hasMixedCategories = group.categories.size > 1;
              const isExpanded = expandedGroups.has(group.name);
              const isPersonal = group.types.has('user');
              const categoryArray = Array.from(group.categories);
              const firstCategory = categoryArray[0] || null;

              return (
                <Collapsible
                  key={group.name}
                  open={isExpanded}
                  onOpenChange={() => toggleExpanded(group.name)}
                >
                  <div className="border rounded-lg p-4 bg-card">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-semibold text-sm truncate">{group.name}</h4>
                          <Badge variant={isPersonal ? 'outline' : 'default'}>
                            {isPersonal ? (
                              <><User className="h-3 w-3 mr-1" /> Personlig</>
                            ) : (
                              <><Globe className="h-3 w-3 mr-1" /> Global</>
                            )}
                          </Badge>
                        </div>

                        {/* Category or Warning */}
                        {hasMixedCategories ? (
                          <div className="bg-orange-500/10 border border-orange-500/20 rounded-md p-2 mt-2">
                            <div className="flex items-start gap-2">
                              <AlertTriangle className="h-4 w-4 text-orange-500 shrink-0 mt-0.5" />
                              <div className="flex-1 min-w-0 space-y-2">
                                <p className="text-xs text-orange-700 dark:text-orange-400">
                                  Blandade kategorier: {categoryArray.map(cat =>
                                    categoryOptions.find(c => c.value === cat)?.label || cat
                                  ).join(', ')}
                                </p>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-medium shrink-0">Standardisera till:</span>
                                  <Select
                                    onValueChange={(value) => {
                                      if (value !== "none") {
                                        standardizeCategory.mutate({ groupName: group.name, category: value });
                                      }
                                    }}
                                  >
                                    <SelectTrigger className="h-7 text-xs">
                                      <SelectValue placeholder="Välj kategori" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {categoryOptions.map((option) => (
                                        <SelectItem key={option.value} value={option.value}>
                                          {option.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                            </div>
                          </div>
                        ) : firstCategory ? (
                          <div className="mt-1">
                            <Badge variant="secondary" className="text-xs">
                              {categoryOptions.find(c => c.value === firstCategory)?.label || firstCategory}
                            </Badge>
                          </div>
                        ) : (
                          <div className="mt-1">
                            <Badge variant="destructive" className="text-xs">
                              Ingen kategori
                            </Badge>
                          </div>
                        )}

                        {/* Stats */}
                        <p className="text-xs text-muted-foreground mt-2">
                          {group.products.length} variant{group.products.length !== 1 ? 'er' : ''}
                          {group.totalPurchases > 0 && ` • ${group.totalPurchases} köp`}
                        </p>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex gap-2 shrink-0">
                        {/* Rename Button */}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedGroup(group);
                            setRenameDialogOpen(true);
                          }}
                          className="h-8"
                        >
                          <Edit className="h-3 w-3 mr-1" />
                          Byt namn
                        </Button>

                        {/* Merge Button */}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedGroupToMerge(group);
                            setMergeDialogOpen(true);
                          }}
                          className="h-8"
                        >
                          <Merge className="h-3 w-3 mr-1" />
                          Kombinera
                        </Button>
                      </div>
                    </div>

                    {/* Expand/Collapse Trigger */}
                    <CollapsibleTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start gap-2 mt-2 h-8 text-xs"
                      >
                        <ChevronRight
                          className={`h-3 w-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                        />
                        {isExpanded ? 'Dölj' : 'Visa'} produkter
                      </Button>
                    </CollapsibleTrigger>

                    {/* Expanded Product List */}
                    <CollapsibleContent className="mt-3">
                      <div className="space-y-2 pl-4 border-l-2">
                        {group.products.map((product) => (
                          <div
                            key={product.id}
                            className="flex items-center justify-between gap-2 text-xs py-1.5"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate">{product.original_name}</p>
                              {product.category && (
                                <p className="text-muted-foreground">
                                  {categoryOptions.find(c => c.value === product.category)?.label || product.category}
                                </p>
                              )}
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removeFromGroup.mutate({
                                productId: product.id,
                                isGlobal: !product.user_id,
                                originalName: product.original_name
                              })}
                              className="h-6 w-6 p-0"
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              );
            })}
          </div>
        )}

        {/* Rename Group Dialog */}
        <RenameGroupDialog
          group={selectedGroup}
          open={renameDialogOpen}
          onClose={() => {
            setRenameDialogOpen(false);
            setSelectedGroup(null);
          }}
          onSuccess={() => {
            setRenameDialogOpen(false);
            setSelectedGroup(null);
            onRefresh();
          }}
        />

        {/* Merge Groups Dialog */}
        <MergeGroupsDialog
          sourceGroup={selectedGroupToMerge}
          allGroups={groups}
          open={mergeDialogOpen}
          onClose={() => {
            setMergeDialogOpen(false);
            setSelectedGroupToMerge(null);
          }}
          onSuccess={() => {
            setMergeDialogOpen(false);
            setSelectedGroupToMerge(null);
            onRefresh();
          }}
        />
      </CardContent>
    </Card>
  );
}
