import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { categoryOptions } from "@/lib/categoryConstants";

type BulkCategoryEditorProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCount: number;
  onCategoryUpdate: (category: string) => void;
};

export function BulkCategoryEditor({
  open,
  onOpenChange,
  selectedCount,
  onCategoryUpdate,
}: BulkCategoryEditorProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>("");

  const handleSubmit = () => {
    if (selectedCategory) {
      onCategoryUpdate(selectedCategory);
      setSelectedCategory("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sätt kategori för flera produkter</DialogTitle>
          <DialogDescription>
            Du är på väg att sätta kategori för {selectedCount} produkt{selectedCount > 1 ? 'er' : ''}.
            Välj kategori nedan.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger>
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

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Avbryt
          </Button>
          <Button onClick={handleSubmit} disabled={!selectedCategory}>
            Uppdatera {selectedCount} produkt{selectedCount > 1 ? 'er' : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
