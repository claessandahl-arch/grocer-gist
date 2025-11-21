import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Plus } from "lucide-react";

type Product = {
  id: string;
  original_name: string;
  type: 'user' | 'global';
};

type ProductGroup = {
  name: string;
  products: unknown[];
};

type AssignToGroupDropdownProps = {
  product: Product;
  existingGroups: ProductGroup[];
  onAssigned: () => void;
  onCreateNew: () => void;
};

export function AssignToGroupDropdown({
  product,
  existingGroups,
  onAssigned,
  onCreateNew,
}: AssignToGroupDropdownProps) {
  const [value, setValue] = useState<string>("");

  const assignToGroup = useMutation({
    mutationFn: async (groupName: string) => {
      // Check if this is an unmapped product (temporary ID)
      const isUnmapped = product.id.startsWith('unmapped-');

      if (isUnmapped) {
        // Create new mapping for unmapped product
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");

        const { error } = await supabase
          .from('product_mappings')
          .insert({
            user_id: user.id,
            original_name: product.original_name,
            mapped_name: groupName,
          });

        if (error) throw error;
      } else {
        // Update existing mapping
        const table = product.type === 'user' ? 'product_mappings' : 'global_product_mappings';

        const { error } = await supabase
          .from(table)
          .update({ mapped_name: groupName })
          .eq('id', product.id);

        if (error) throw error;
      }
    },
    onSuccess: (_, groupName) => {
      toast.success(`"${product.original_name}" tillagd i gruppen "${groupName}"`);
      setValue("");
      onAssigned();
    },
    onError: (error) => {
      console.error('Assign error:', error);
      toast.error("Kunde inte tilldela produkten till gruppen");
    }
  });

  const handleValueChange = (newValue: string) => {
    if (newValue === "create-new") {
      onCreateNew();
      return;
    }

    if (newValue && newValue !== "") {
      assignToGroup.mutate(newValue);
    }
  };

  // Sort groups alphabetically
  const sortedGroups = [...existingGroups].sort((a, b) =>
    a.name.localeCompare(b.name, 'sv')
  );

  return (
    <Select value={value} onValueChange={handleValueChange}>
      <SelectTrigger className="w-full h-8 text-xs">
        <SelectValue placeholder="Lägg till i grupp..." />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="create-new" className="text-primary font-medium">
          <div className="flex items-center gap-2">
            <Plus className="h-3 w-3" />
            Skapa ny produktgrupp...
          </div>
        </SelectItem>

        {sortedGroups.length > 0 && (
          <>
            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
              Befintliga produktgrupper:
            </div>
            {sortedGroups.map((group) => (
              <SelectItem key={group.name} value={group.name}>
                {group.name} ({group.products.length})
              </SelectItem>
            ))}
          </>
        )}

        {sortedGroups.length === 0 && (
          <div className="px-2 py-4 text-xs text-muted-foreground text-center">
            Inga produktgrupper ännu
          </div>
        )}
      </SelectContent>
    </Select>
  );
}
