import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Trash2, Plus } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const ProductMerge = () => {
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [mergedName, setMergedName] = useState("");
  const queryClient = useQueryClient();

  // Fetch all unique products from receipts
  const { data: receipts } = useQuery({
    queryKey: ['receipts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('receipts')
        .select('*')
        .order('receipt_date', { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  // Fetch existing mappings
  const { data: mappings, isLoading: mappingsLoading } = useQuery({
    queryKey: ['product-mappings'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from('product_mappings')
        .select('*')
        .eq('user_id', user.id)
        .order('mapped_name');
      
      if (error) throw error;
      return data;
    },
  });

  // Get unique product names from all receipts
  const uniqueProducts = new Set<string>();
  receipts?.forEach(receipt => {
    const items = receipt.items as any[] || [];
    items.forEach(item => {
      if (item.name) uniqueProducts.add(item.name);
    });
  });
  const productList = Array.from(uniqueProducts).sort();

  // Create mapping mutation
  const createMapping = useMutation({
    mutationFn: async (products: string[]) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const mappingsToCreate = products.map(product => ({
        user_id: user.id,
        original_name: product,
        mapped_name: mergedName,
      }));

      const { error } = await supabase
        .from('product_mappings')
        .insert(mappingsToCreate);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-mappings'] });
      setSelectedProducts([]);
      setMergedName("");
      toast.success("Produkter sammanslagna!");
    },
    onError: (error) => {
      toast.error("Kunde inte slå ihop produkter: " + error.message);
    },
  });

  // Delete mapping mutation
  const deleteMapping = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('product_mappings')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-mappings'] });
      toast.success("Mappning borttagen!");
    },
    onError: (error) => {
      toast.error("Kunde inte ta bort mappning: " + error.message);
    },
  });

  const handleProductToggle = (product: string) => {
    setSelectedProducts(prev =>
      prev.includes(product)
        ? prev.filter(p => p !== product)
        : [...prev, product]
    );
  };

  const handleMerge = () => {
    if (selectedProducts.length < 2) {
      toast.error("Välj minst 2 produkter att slå ihop");
      return;
    }
    if (!mergedName.trim()) {
      toast.error("Ange ett namn för den sammanslagna produkten");
      return;
    }
    createMapping.mutate(selectedProducts);
  };

  // Group mappings by mapped_name
  const groupedMappings = mappings?.reduce((acc, mapping) => {
    if (!acc[mapping.mapped_name]) {
      acc[mapping.mapped_name] = [];
    }
    acc[mapping.mapped_name].push(mapping);
    return acc;
  }, {} as Record<string, typeof mappings>);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Slå ihop produkter</CardTitle>
          <CardDescription>
            Välj produkter som ska räknas som samma vara och ange vad de ska heta tillsammans
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Välj produkter att slå ihop:</label>
            <div className="max-h-64 overflow-y-auto border rounded-md p-4 space-y-2">
              {productList.map(product => (
                <div key={product} className="flex items-center space-x-2">
                  <Checkbox
                    id={product}
                    checked={selectedProducts.includes(product)}
                    onCheckedChange={() => handleProductToggle(product)}
                  />
                  <label htmlFor={product} className="text-sm cursor-pointer">
                    {product}
                  </label>
                </div>
              ))}
            </div>
          </div>

          {selectedProducts.length > 0 && (
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Valda produkter ({selectedProducts.length}):
              </label>
              <div className="text-sm text-muted-foreground border rounded-md p-2">
                {selectedProducts.join(", ")}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="merged-name" className="text-sm font-medium">
              Namn för sammanslagna produkten:
            </label>
            <Input
              id="merged-name"
              placeholder="T.ex. Coca-Cola"
              value={mergedName}
              onChange={(e) => setMergedName(e.target.value)}
            />
          </div>

          <Button
            onClick={handleMerge}
            disabled={selectedProducts.length < 2 || !mergedName.trim() || createMapping.isPending}
            className="w-full"
          >
            <Plus className="h-4 w-4 mr-2" />
            Slå ihop valda produkter
          </Button>
        </CardContent>
      </Card>

      {/* Show existing mappings */}
      {!mappingsLoading && groupedMappings && Object.keys(groupedMappings).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Aktiva sammanslagningar</CardTitle>
            <CardDescription>
              Produkter du har slagit ihop manuellt
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {Object.entries(groupedMappings).map(([mappedName, items]) => (
                <div key={mappedName} className="border rounded-md p-4">
                  <h3 className="font-medium mb-2">{mappedName}</h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Originalnamn</TableHead>
                        <TableHead className="w-[100px]">Åtgärd</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map(item => (
                        <TableRow key={item.id}>
                          <TableCell>{item.original_name}</TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => deleteMapping.mutate(item.id)}
                              disabled={deleteMapping.isPending}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
