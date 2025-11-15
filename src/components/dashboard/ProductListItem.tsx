import React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface ProductListItemProps {
  product: string;
  isSelected: boolean;
  onToggle: (product: string) => void;
  onAddToGroup: (product: string, mappedName: string, category: string) => void;
  groupedMappings: Record<string, any[]> | undefined;
  isPending: boolean;
}

export const ProductListItem = React.memo(({ 
  product, 
  isSelected, 
  onToggle, 
  onAddToGroup, 
  groupedMappings,
  isPending 
}: ProductListItemProps) => {
  const handleCheckedChange = React.useCallback(() => {
    onToggle(product);
  }, [onToggle, product]);

  const handleValueChange = React.useCallback((value: string) => {
    const targetGroup = groupedMappings?.[value];
    if (targetGroup && targetGroup.length > 0) {
      const category = targetGroup[0].category || "";
      onAddToGroup(product, value, category);
    }
  }, [groupedMappings, onAddToGroup, product]);

  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <div className="flex items-center space-x-2 flex-1 min-w-0">
        <Checkbox
          id={product}
          checked={isSelected}
          onCheckedChange={handleCheckedChange}
        />
        <label htmlFor={product} className="text-sm cursor-pointer truncate">
          {product}
        </label>
      </div>
      
      {groupedMappings && Object.keys(groupedMappings).length > 0 && (
        <Select 
          value="" 
          onValueChange={handleValueChange}
          disabled={isPending}
        >
          <SelectTrigger className="w-48 h-8 text-xs">
            <SelectValue placeholder="Lägg till i grupp..." />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(groupedMappings).map(([mappedName]) => (
              <SelectItem key={mappedName} value={mappedName} className="text-xs">
                {mappedName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
});

ProductListItem.displayName = "ProductListItem";
