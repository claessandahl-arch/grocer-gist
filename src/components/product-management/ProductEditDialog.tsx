import { useState, useEffect } from "react";
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
import { Globe, User } from "lucide-react";

type ProductData = {
  id: string;
  original_name: string;
  mapped_name: string | null;
  category: string | null;
  type: 'user' | 'global';
  usage_count?: number;
};

type ProductEditDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: ProductData | null;
  onSave: (updates: { mapped_name?: string; category?: string }) => void;
};

export function ProductEditDialog({
  open,
  onOpenChange,
  product,
  onSave,
}: ProductEditDialogProps) {
  const [mappedName, setMappedName] = useState("");
  const [category, setCategory] = useState<string>("none");

  useEffect(() => {
    if (product) {
      setMappedName(product.mapped_name || "");
      setCategory(product.category || "none");
    }
  }, [product]);

  const handleSave = () => {
    const updates: { mapped_name?: string; category?: string } = {};

    if (mappedName && mappedName !== product?.mapped_name) {
      updates.mapped_name = mappedName;
    }

    if (category !== "none" && category !== product?.category) {
      updates.category = category;
    }

    if (Object.keys(updates).length > 0) {
      onSave(updates);
    } else {
      onOpenChange(false);
    }
  };

  if (!product) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Redigera produktmappning</DialogTitle>
          <DialogDescription>
            Uppdatera mappat namn och kategori för denna produkt
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Product Info */}
          <div className="space-y-2">
            <Label className="text-muted-foreground">Original namn</Label>
            <div className="flex items-center gap-2">
              <Input value={product.original_name} disabled />
              <Badge variant={product.type === 'global' ? 'default' : 'outline'}>
                {product.type === 'global' ? (
                  <><Globe className="h-3 w-3 mr-1" /> Global</>
                ) : (
                  <><User className="h-3 w-3 mr-1" /> User</>
                )}
              </Badge>
            </div>
          </div>

          {/* Mapped Name */}
          <div className="space-y-2">
            <Label htmlFor="mapped-name">Mappat namn</Label>
            <Input
              id="mapped-name"
              value={mappedName}
              onChange={(e) => setMappedName(e.target.value)}
              placeholder="T.ex. Mjölk"
            />
            <p className="text-xs text-muted-foreground">
              Standardnamn som ska användas istället för det ursprungliga namnet
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

          {/* Usage info */}
          {product.usage_count !== undefined && product.usage_count > 0 && (
            <div className="bg-accent/10 rounded-lg p-3">
              <p className="text-sm text-muted-foreground">
                Denna produkt har använts <strong>{product.usage_count} gånger</strong> i dina kvitton
              </p>
            </div>
          )}

          {/* Global product warning */}
          {product.type === 'global' && (
            <div className="bg-primary/10 rounded-lg p-3">
              <p className="text-sm text-primary">
                Detta är en global produktmappning. Ändringar kommer skapa en lokal override för dig.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Avbryt
          </Button>
          <Button onClick={handleSave}>
            Spara ändringar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
