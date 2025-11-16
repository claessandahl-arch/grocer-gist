import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Trash2, Globe, User, Info } from "lucide-react";
import { categoryOptions } from "@/lib/categoryConstants";
import { Skeleton } from "@/components/ui/skeleton";

type UserOverride = {
  id: string;
  user_id: string;
  global_mapping_id: string;
  override_category: string;
  created_at: string;
  updated_at: string;
};

type ProductMapping = {
  id: string;
  original_name: string;
  mapped_name: string;
  category: string | null;
  type: 'user' | 'global';
  usage_count?: number;
  override?: UserOverride;
  effectiveCategory?: string | null;
};

type ProductTableProps = {
  mappings: ProductMapping[];
  selectedProducts: string[];
  onSelectionChange: (selected: string[]) => void;
  onCategoryUpdate: (id: string, type: 'user' | 'global', category: string) => void;
  onDelete: (id: string, type: 'user' | 'global') => void;
  isLoading: boolean;
};

export function ProductTable({
  mappings,
  selectedProducts,
  onSelectionChange,
  onCategoryUpdate,
  onDelete,
  isLoading,
}: ProductTableProps) {
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      onSelectionChange(mappings.map(m => m.id));
    } else {
      onSelectionChange([]);
    }
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    if (checked) {
      onSelectionChange([...selectedProducts, id]);
    } else {
      onSelectionChange(selectedProducts.filter(p => p !== id));
    }
  };

  const allSelected = mappings.length > 0 && selectedProducts.length === mappings.length;
  const someSelected = selectedProducts.length > 0 && selectedProducts.length < mappings.length;

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map(i => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (mappings.length === 0) {
    return (
      <div className="bg-card rounded-lg border p-8 text-center">
        <p className="text-muted-foreground">Inga produkter hittades</p>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-lg border shadow-sm">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">
              <Checkbox
                checked={allSelected}
                onCheckedChange={handleSelectAll}
                aria-label="Välj alla"
                className={someSelected ? "data-[state=checked]:bg-primary/50" : ""}
              />
            </TableHead>
            <TableHead>Original namn</TableHead>
            <TableHead>Mappat namn</TableHead>
            <TableHead>Kategori</TableHead>
            <TableHead>Typ</TableHead>
            <TableHead className="w-12"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {mappings.map((mapping) => (
            <TableRow key={mapping.id}>
              <TableCell>
                <Checkbox
                  checked={selectedProducts.includes(mapping.id)}
                  onCheckedChange={(checked) => handleSelectOne(mapping.id, checked as boolean)}
                  aria-label={`Välj ${mapping.original_name}`}
                />
              </TableCell>
              <TableCell className="font-medium">{mapping.original_name}</TableCell>
              <TableCell>{mapping.mapped_name}</TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Select
                    value={mapping.effectiveCategory ?? mapping.category ?? "none"}
                    onValueChange={(value) => {
                      if (value !== "none") {
                        onCategoryUpdate(mapping.id, mapping.type, value);
                      }
                    }}
                  >
                    <SelectTrigger className="w-[200px]">
                      <SelectValue>
                        {(mapping.effectiveCategory ?? mapping.category) ? (
                          <Badge variant="secondary">
                            {categoryOptions.find(c => c.value === (mapping.effectiveCategory ?? mapping.category))?.label || (mapping.effectiveCategory ?? mapping.category)}
                          </Badge>
                        ) : (
                          <Badge variant="destructive">Ingen kategori</Badge>
                        )}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none" disabled>
                        Välj kategori
                      </SelectItem>
                      {categoryOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  
                  {/* Show info icon if category is overridden */}
                  {mapping.type === 'global' && mapping.override && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-4 w-4 text-primary cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Du har ändrat kategorin lokalt</p>
                          <p className="text-xs text-muted-foreground">
                            Global kategori: {mapping.category || 'Ingen'}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <Badge variant={mapping.type === 'global' ? 'default' : 'outline'}>
                  {mapping.type === 'global' ? (
                    <><Globe className="h-3 w-3 mr-1" /> Global</>
                  ) : (
                    <><User className="h-3 w-3 mr-1" /> Personlig</>
                  )}
                </Badge>
                {mapping.usage_count !== undefined && mapping.usage_count > 0 && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    ({mapping.usage_count}x)
                  </span>
                )}
              </TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onDelete(mapping.id, mapping.type)}
                  className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
