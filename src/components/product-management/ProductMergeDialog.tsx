import { useState, useMemo } from "react";
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
import { categoryOptions } from "@/lib/categoryConstants";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Globe, User, ArrowRight } from "lucide-react";

type ProductData = {
  id: string;
  original_name: string;
  mapped_name: string | null;
  category: string | null;
  type: 'user' | 'global';
  usage_count?: number;
};

type ProductMergeDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedProducts: ProductData[];
  onMergeComplete: () => void;
};

export function ProductMergeDialog({
  open,
  onOpenChange,
  selectedProducts,
  onMergeComplete,
}: ProductMergeDialogProps) {
  const [mappedName, setMappedName] = useState("");
  const [category, setCategory] = useState<string>("none");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Suggest mapped name based on most common or shortest name
  const suggestedName = useMemo(() => {
    if (selectedProducts.length === 0) return "";

    // Try to find existing mapped name
    const existingMapped = selectedProducts.find(p => p.mapped_name);
    if (existingMapped?.mapped_name) return existingMapped.mapped_name;

    // Otherwise, use the shortest name
    return selectedProducts.reduce((shortest, p) =>
      p.original_name.length < shortest.length ? p.original_name : shortest,
      selectedProducts[0].original_name
    );
  }, [selectedProducts]);

  // Suggest category based on most common
  const suggestedCategory = useMemo(() => {
    if (selectedProducts.length === 0) return "none";

    const categories = selectedProducts
      .map(p => p.category)
      .filter(c => c !== null);

    if (categories.length === 0) return "none";

    // Find most common category
    const categoryCount = categories.reduce((acc, cat) => {
      acc[cat as string] = (acc[cat as string] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const mostCommon = Object.entries(categoryCount).sort((a, b) => b[1] - a[1])[0];
    return mostCommon ? mostCommon[0] : "none";
  }, [selectedProducts]);

  // Set suggestions when dialog opens
  useState(() => {
    if (open) {
      setMappedName(suggestedName);
      setCategory(suggestedCategory);
    }
  });

  const handleMerge = async () => {
    if (!mappedName.trim()) {
      toast.error("Ange ett mappat namn");
      return;
    }

    if (selectedProducts.length < 2) {
      toast.error("Välj minst 2 produkter för att slå ihop");
      return;
    }

    setIsSubmitting(true);

    try {
      // Update all selected products with the same mapped_name and category
      const updates = selectedProducts.map(async (product) => {
        const table = product.type === 'user' ? 'product_mappings' : 'global_product_mappings';
        const updateData: any = { mapped_name: mappedName.trim() };

        if (category !== "none") {
          updateData.category = category;
        }

        const { error } = await supabase
          .from(table)
          .update(updateData)
          .eq('id', product.id);

        if (error) throw error;
      });

      await Promise.all(updates);

      toast.success(`${selectedProducts.length} produkter sammanslagen till "${mappedName}"`);
      onMergeComplete();
      onOpenChange(false);
      setMappedName("");
      setCategory("none");
    } catch (error) {
      console.error('Merge error:', error);
      toast.error("Kunde inte slå ihop produkter");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Slå ihop produkter</DialogTitle>
          <DialogDescription>
            Sammanslagning av {selectedProducts.length} produkter till en gemensam produktgrupp
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Selected Products Preview */}
          <div className="space-y-2">
            <Label>Valda produkter</Label>
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
                      {categoryOptions.find(c => c.value === product.category)?.label}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-center">
            <ArrowRight className="h-5 w-5 text-muted-foreground" />
          </div>

          {/* Merge Settings */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="merge-mapped-name">
                Mappat namn <span className="text-destructive">*</span>
              </Label>
              <Input
                id="merge-mapped-name"
                value={mappedName}
                onChange={(e) => setMappedName(e.target.value)}
                placeholder="T.ex. Mjölk"
              />
              <p className="text-xs text-muted-foreground">
                Alla valda produkter kommer att grupperas under detta namn
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="merge-category">Kategori</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="merge-category">
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
          </div>

          {/* Preview */}
          {mappedName.trim() && (
            <div className="bg-primary/10 rounded-lg p-3">
              <Label className="text-sm font-medium">Förhandsgranskning</Label>
              <p className="text-sm mt-2">
                {selectedProducts.length} produkter kommer att mappas till:{" "}
                <strong>{mappedName.trim()}</strong>
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
            disabled={isSubmitting}
          >
            Avbryt
          </Button>
          <Button
            onClick={handleMerge}
            disabled={!mappedName.trim() || isSubmitting}
          >
            {isSubmitting ? "Slår ihop..." : "Slå ihop produkter"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
