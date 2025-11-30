import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { categoryOptions } from "@/lib/categoryConstants";
import { Globe, User } from "lucide-react";

type Product = {
  id: string;
  original_name: string;
  category: string | null;
  type: 'user' | 'global';
};

type CreateGroupDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedProducts: Product[];
  onSuccess: () => void;
};

export function CreateGroupDialog({
  open,
  onOpenChange,
  selectedProducts,
  onSuccess,
}: CreateGroupDialogProps) {
  const [groupName, setGroupName] = useState("");
  const [category, setCategory] = useState<string>("none");

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (open) {
      // Suggest shortest name as group name
      if (selectedProducts.length > 0) {
        const shortestName = selectedProducts.reduce((shortest, p) =>
          p.original_name.length < shortest.length ? p.original_name : shortest,
          selectedProducts[0].original_name
        );
        setGroupName(shortestName);
      }

      // Suggest most common category
      const categories = selectedProducts
        .map(p => p.category)
        .filter(c => c !== null);

      if (categories.length > 0) {
        const categoryCount = categories.reduce((acc, cat) => {
          acc[cat as string] = (acc[cat as string] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);

        const mostCommon = Object.entries(categoryCount).sort((a, b) => b[1] - a[1])[0];
        setCategory(mostCommon ? mostCommon[0] : "none");
      } else {
        setCategory("none");
      }
    } else {
      setGroupName("");
      setCategory("none");
    }
  }, [open, selectedProducts]);

  const createGroup = useMutation({
    mutationFn: async () => {
      console.log('[CreateGroup] Starting with:', {
        groupName: groupName.trim(),
        category,
        selectedProducts: selectedProducts.map(p => ({
          id: p.id,
          type: p.type,
          original_name: p.original_name
        }))
      });

      if (!groupName.trim()) {
        throw new Error("Gruppnamn krävs");
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Separate unmapped and mapped products
      const unmappedProducts = selectedProducts.filter(p => p.id.startsWith('unmapped-'));
      const mappedUserProducts = selectedProducts.filter(p => !p.id.startsWith('unmapped-') && p.type === 'user');
      const mappedGlobalProducts = selectedProducts.filter(p => !p.id.startsWith('unmapped-') && p.type === 'global');

      console.log('[CreateGroup] Product breakdown:', {
        unmapped: unmappedProducts.length,
        mappedUser: mappedUserProducts.length,
        mappedGlobal: mappedGlobalProducts.length,
        unmappedIds: unmappedProducts.map(p => p.id),
        userIds: mappedUserProducts.map(p => p.id),
        globalIds: mappedGlobalProducts.map(p => p.id)
      });

      const updates: { mapped_name: string; category?: string } = { mapped_name: groupName.trim() };
      if (category !== "none") {
        updates.category = category;
      }

      // Insert new mappings for unmapped products (or update if they already exist)
      if (unmappedProducts.length > 0) {
        const newMappings = unmappedProducts.map(p => ({
          user_id: user.id,
          original_name: p.original_name,
          mapped_name: groupName.trim(),
          category: category !== "none" ? category : null,
        }));

        console.log('[CreateGroup] Upserting unmapped products:', newMappings);
        const { data: upsertData, error: insertError } = await supabase
          .from('product_mappings')
          .upsert(newMappings, {
            onConflict: 'user_id,original_name',
            ignoreDuplicates: false
          })
          .select();

        console.log('[CreateGroup] Upsert result:', { data: upsertData, error: insertError });
        if (insertError) throw insertError;
      }

      // Update existing user products
      if (mappedUserProducts.length > 0) {
        console.log('[CreateGroup] Updating user products with IDs:', mappedUserProducts.map(p => p.id));
        const { data: updateData, error: userError } = await supabase
          .from('product_mappings')
          .update(updates)
          .in('id', mappedUserProducts.map(p => p.id))
          .select();

        console.log('[CreateGroup] User update result:', { data: updateData, error: userError });
        if (userError) throw userError;
      }

      // Update existing global products
      if (mappedGlobalProducts.length > 0) {
        console.log('[CreateGroup] Updating global products with IDs:', mappedGlobalProducts.map(p => p.id));
        const { data: globalData, error: globalError } = await supabase
          .from('global_product_mappings')
          .update(updates)
          .in('id', mappedGlobalProducts.map(p => p.id))
          .select();

        console.log('[CreateGroup] Global update result:', { data: globalData, error: globalError });
        if (globalError) throw globalError;
      }

      console.log('[CreateGroup] All operations completed successfully');
    },
    onSuccess: () => {
      console.log('[CreateGroup] onSuccess called');
      toast.success(`Produktgrupp "${groupName}" skapad med ${selectedProducts.length} produkt${selectedProducts.length !== 1 ? 'er' : ''}!`);
      onSuccess();
    },
    onError: (error: Error) => {
      console.error('[CreateGroup] onError:', error);
      toast.error(error.message || "Kunde inte skapa produktgrupp");
    }
  });

  const handleCreate = () => {
    console.log('[CreateGroup] handleCreate called');
    createGroup.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Skapa ny produktgrupp</DialogTitle>
          <DialogDescription>
            Gruppera {selectedProducts.length} produkt{selectedProducts.length !== 1 ? 'er' : ''} under ett gemensamt namn
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Selected Products */}
          <div className="space-y-2">
            <Label>Produkter som ska grupperas</Label>
            <div className="bg-muted/50 rounded-lg p-3 max-h-[200px] overflow-y-auto space-y-2">
              {selectedProducts.map((product) => (
                <div key={product.id} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <Badge variant={product.type === 'global' ? 'default' : 'outline'} className="h-5">
                      {product.type === 'global' ? (
                        <Globe className="h-3 w-3" />
                      ) : (
                        <User className="h-3 w-3" />
                      )}
                    </Badge>
                    <span className="font-medium">{product.original_name}</span>
                  </div>
                  {product.category && (
                    <Badge variant="secondary" className="text-xs">
                      {categoryOptions.find(c => c.value === product.category)?.label || product.category}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Group Name */}
          <div className="space-y-2">
            <Label htmlFor="group-name">
              Gruppnamn <span className="text-destructive">*</span>
            </Label>
            <Input
              id="group-name"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="T.ex. Mjölk, Ägg, Banan..."
            />
            <p className="text-xs text-muted-foreground">
              Detta namn kommer att användas för alla produkter i gruppen
            </p>
          </div>

          {/* Category */}
          <div className="space-y-2">
            <Label htmlFor="category">Kategori</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id="category">
                <SelectValue placeholder="Välj kategori" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Ingen kategori</SelectItem>
                {categoryOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Preview */}
          {groupName.trim() && (
            <div className="bg-primary/10 rounded-lg p-3">
              <Label className="text-sm font-medium">Förhandsgranskning</Label>
              <p className="text-sm mt-2">
                {selectedProducts.length} produkt{selectedProducts.length !== 1 ? 'er' : ''} kommer att grupperas som:{" "}
                <strong>{groupName.trim()}</strong>
                {category !== "none" && (
                  <>
                    {" "}i kategorin{" "}
                    <strong>{categoryOptions.find(c => c.value === category)?.label}</strong>
                  </>
                )}
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={createGroup.isPending}
          >
            Avbryt
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!groupName.trim() || createGroup.isPending}
          >
            {createGroup.isPending ? "Skapar..." : "Skapa produktgrupp"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
