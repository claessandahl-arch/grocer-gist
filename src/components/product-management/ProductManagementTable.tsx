import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Pencil, Trash2, Globe, User } from "lucide-react";
import { categoryOptions } from "@/lib/categoryConstants";
import { Skeleton } from "@/components/ui/skeleton";

type ProductData = {
  id: string;
  original_name: string;
  mapped_name: string | null;
  category: string | null;
  type: 'user' | 'global';
  usage_count?: number;
  isMerged: boolean;
  hasCategory: boolean;
};

type ProductManagementTableProps = {
  products: ProductData[];
  selectedProducts: string[];
  onSelectionChange: (selected: string[]) => void;
  onEdit: (product: ProductData) => void;
  onDelete: (id: string, type: 'user' | 'global') => void;
  isLoading: boolean;
};

export function ProductManagementTable({
  products,
  selectedProducts,
  onSelectionChange,
  onEdit,
  onDelete,
  isLoading,
}: ProductManagementTableProps) {
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      onSelectionChange(products.map(p => p.id));
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

  const allSelected = products.length > 0 && selectedProducts.length === products.length;
  const someSelected = selectedProducts.length > 0 && selectedProducts.length < products.length;

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map(i => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (products.length === 0) {
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
            <TableHead className="text-right">Åtgärder</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {products.map((product) => (
            <TableRow key={product.id}>
              <TableCell>
                <Checkbox
                  checked={selectedProducts.includes(product.id)}
                  onCheckedChange={(checked) => handleSelectOne(product.id, checked as boolean)}
                  aria-label={`Välj ${product.original_name}`}
                />
              </TableCell>
              <TableCell className="font-medium">{product.original_name}</TableCell>
              <TableCell>
                {product.mapped_name ? (
                  <span className="text-foreground">{product.mapped_name}</span>
                ) : (
                  <span className="text-muted-foreground italic">-</span>
                )}
              </TableCell>
              <TableCell>
                {product.category ? (
                  <Badge variant="secondary">
                    {categoryOptions.find(c => c.value === product.category)?.label || product.category}
                  </Badge>
                ) : (
                  <Badge variant="destructive">Ingen kategori</Badge>
                )}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Badge variant={product.type === 'global' ? 'default' : 'outline'}>
                    {product.type === 'global' ? (
                      <><Globe className="h-3 w-3 mr-1" /> Global</>
                    ) : (
                      <><User className="h-3 w-3 mr-1" /> User</>
                    )}
                  </Badge>
                  {product.usage_count !== undefined && product.usage_count > 0 && (
                    <span className="text-xs text-muted-foreground">
                      ({product.usage_count}x)
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-1">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onEdit(product)}
                          className="h-8 w-8 text-primary hover:text-primary hover:bg-primary/10"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Redigera</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onDelete(product.id, product.type)}
                          className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Ta bort</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
