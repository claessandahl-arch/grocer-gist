import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Merge, Trash2, Tag } from "lucide-react";
import { categoryOptions } from "@/lib/categoryConstants";
import { useState } from "react";

type BulkActionsToolbarProps = {
  selectedCount: number;
  onMerge: () => void;
  onSetCategory: (category: string) => void;
  onDelete: () => void;
  onClearSelection: () => void;
};

export function BulkActionsToolbar({
  selectedCount,
  onMerge,
  onSetCategory,
  onDelete,
  onClearSelection,
}: BulkActionsToolbarProps) {
  const [categoryValue, setCategoryValue] = useState<string>("");

  const handleCategoryChange = (value: string) => {
    setCategoryValue(value);
    onSetCategory(value);
    setCategoryValue(""); // Reset after setting
  };

  return (
    <div className="bg-accent/10 border border-accent rounded-lg p-4 mb-4 flex items-center justify-between">
      <span className="text-sm font-medium">
        {selectedCount} produkt{selectedCount > 1 ? 'er' : ''} vald{selectedCount > 1 ? 'a' : ''}
      </span>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onMerge}
          className="gap-2"
        >
          <Merge className="h-4 w-4" />
          Slå ihop valda
        </Button>

        <Select value={categoryValue} onValueChange={handleCategoryChange}>
          <SelectTrigger className="w-[200px] h-9">
            <SelectValue placeholder="Sätt kategori" />
          </SelectTrigger>
          <SelectContent>
            {categoryOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                <div className="flex items-center gap-2">
                  <Tag className="h-3 w-3" />
                  {option.label}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant="destructive"
          size="sm"
          onClick={onDelete}
          className="gap-2"
        >
          <Trash2 className="h-4 w-4" />
          Radera valda
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={onClearSelection}
        >
          Avmarkera alla
        </Button>
      </div>
    </div>
  );
}
