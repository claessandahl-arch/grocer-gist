import React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface ProductListItemProps {
  product: string;
  isSelected: boolean;
  onToggle: (product: string) => void;
  onAddToGroup: (product: string, mappedName: string) => void;
  groupNames: string[];
  isPending: boolean;
}

export const ProductListItem = React.memo(({ 
  product, 
  isSelected, 
  onToggle, 
  onAddToGroup, 
  groupNames,
  isPending 
}: ProductListItemProps) => {
  const handleCheckedChange = React.useCallback(() => {
    onToggle(product);
  }, [onToggle, product]);

  const handleValueChange = React.useCallback((value: string) => {
    onAddToGroup(product, value);
  }, [onAddToGroup, product]);

  return (
    <div className="flex items-center gap-2 py-1 w-full">
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

      {groupNames.length > 0 && (
        <div className="flex-shrink-0">
          <Select
            value=""
            onValueChange={handleValueChange}
            disabled={isPending}
          >
            <SelectTrigger className="w-48 h-8 text-xs">
              <SelectValue placeholder="Lägg till i grupp..." />
            </SelectTrigger>
            <SelectContent>
              {groupNames.map((groupName) => (
                <SelectItem key={groupName} value={groupName} className="text-xs">
                  {groupName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
});

ProductListItem.displayName = "ProductListItem";
