import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, AlertTriangle, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { categoryOptions } from "@/lib/categoryConstants";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface CorruptedProduct {
  id: string;
  original_name: string;
  mapped_name: string | null;
  category: string | null;
  type: 'user' | 'global';
  user_id?: string;
}

export default function DiagnosticTool() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [corruptedProducts, setCorruptedProducts] = useState<CorruptedProduct[]>([]);
  const [fixing, setFixing] = useState(false);
  const [selectedFixes, setSelectedFixes] = useState<Record<string, string>>({});

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate('/auth');
    }
  };

  const scanForCorruptedData = async () => {
    setLoading(true);
    const corrupted: CorruptedProduct[] = [];

    try {
      // Scan user mappings
      const { data: userMappings, error: userError } = await supabase
        .from('product_mappings')
        .select('*');

      if (userError) throw userError;

      userMappings?.forEach((mapping) => {
        if (mapping.category && mapping.category.includes(',')) {
          corrupted.push({
            id: mapping.id,
            original_name: mapping.original_name,
            mapped_name: mapping.mapped_name,
            category: mapping.category,
            type: 'user',
            user_id: mapping.user_id,
          });
        }
      });

      // Scan global mappings
      const { data: globalMappings, error: globalError } = await supabase
        .from('global_product_mappings')
        .select('*');

      if (globalError) throw globalError;

      globalMappings?.forEach((mapping) => {
        if (mapping.category && mapping.category.includes(',')) {
          corrupted.push({
            id: mapping.id,
            original_name: mapping.original_name,
            mapped_name: mapping.mapped_name,
            category: mapping.category,
            type: 'global',
          });
        }
      });

      setCorruptedProducts(corrupted);

      // Auto-suggest fixes based on first part before comma
      const autoFixes: Record<string, string> = {};
      corrupted.forEach((product) => {
        if (product.category) {
          const firstCategory = product.category.split(',')[0].trim();
          // Try to match with valid categories
          const validCategory = categoryOptions.find(
            (opt) => opt.label.toLowerCase() === firstCategory.toLowerCase() || opt.value === firstCategory
          );
          if (validCategory) {
            autoFixes[product.id] = validCategory.value;
          }
        }
      });
      setSelectedFixes(autoFixes);

    } catch (error) {
      console.error('Error scanning for corrupted data:', error);
      toast.error('Kunde inte skanna databasen');
    }

    setLoading(false);
  };

  useEffect(() => {
    checkAuth();
    scanForCorruptedData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fixProduct = async (product: CorruptedProduct) => {
    const newCategory = selectedFixes[product.id];
    if (!newCategory) {
      toast.error('Välj en kategori först');
      return;
    }

    try {
      const table = product.type === 'user' ? 'product_mappings' : 'global_product_mappings';
      const { error } = await supabase
        .from(table)
        .update({ category: newCategory })
        .eq('id', product.id);

      if (error) throw error;

      toast.success(`Fixad: ${product.original_name}`);
      // Remove from list
      setCorruptedProducts((prev) => prev.filter((p) => p.id !== product.id));
    } catch (error) {
      console.error('Error fixing product:', error);
      toast.error('Kunde inte fixa produkten');
    }
  };

  const fixAll = async () => {
    setFixing(true);
    let successCount = 0;
    let failCount = 0;

    for (const product of corruptedProducts) {
      const newCategory = selectedFixes[product.id];
      if (!newCategory) {
        failCount++;
        continue;
      }

      try {
        const table = product.type === 'user' ? 'product_mappings' : 'global_product_mappings';
        const { error } = await supabase
          .from(table)
          .update({ category: newCategory })
          .eq('id', product.id);

        if (error) throw error;
        successCount++;
      } catch (error) {
        console.error('Error fixing product:', product.id, error);
        failCount++;
      }
    }

    if (successCount > 0) {
      toast.success(`${successCount} produkter fixade!`);
    }
    if (failCount > 0) {
      toast.error(`${failCount} produkter kunde inte fixas`);
    }

    setFixing(false);
    scanForCorruptedData();
  };

  const deleteProduct = async (product: CorruptedProduct) => {
    try {
      const table = product.type === 'user' ? 'product_mappings' : 'global_product_mappings';
      const { error } = await supabase
        .from(table)
        .delete()
        .eq('id', product.id);

      if (error) throw error;

      toast.success('Produkt borttagen');
      setCorruptedProducts((prev) => prev.filter((p) => p.id !== product.id));
    } catch (error) {
      console.error('Error deleting product:', error);
      toast.error('Kunde inte ta bort produkten');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 p-6">
      <div className="max-w-7xl mx-auto">
        <Button
          variant="ghost"
          onClick={() => navigate('/dashboard')}
          className="mb-6"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Tillbaka till Dashboard
        </Button>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              Diagnostikverktyg - Korrupta kategorier
            </CardTitle>
            <CardDescription>
              Hittar och fixar produkter med flera kategorier (kommatecken i kategori-fältet)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-muted-foreground">Skannar databas...</p>
            ) : corruptedProducts.length === 0 ? (
              <Alert className="bg-green-500/10 border-green-500/20">
                <AlertDescription className="text-green-700 dark:text-green-400">
                  ✅ Inga korrupta produkter hittades! Alla kategorier är korrekta.
                </AlertDescription>
              </Alert>
            ) : (
              <div className="space-y-4">
                <Alert className="bg-orange-500/10 border-orange-500/20">
                  <AlertTriangle className="h-4 w-4 text-orange-500" />
                  <AlertDescription className="text-orange-700 dark:text-orange-400">
                    <strong>{corruptedProducts.length}</strong> produkter hittade med felaktiga kategorier (innehåller kommatecken)
                  </AlertDescription>
                </Alert>

                <div className="flex justify-end gap-2">
                  <Button
                    onClick={fixAll}
                    disabled={fixing || corruptedProducts.some((p) => !selectedFixes[p.id])}
                  >
                    <Wand2 className="h-4 w-4 mr-2" />
                    {fixing ? 'Fixar alla...' : 'Fixa alla automatiskt'}
                  </Button>
                </div>

                <div className="space-y-3">
                  {corruptedProducts.map((product) => (
                    <Card key={product.id} className="p-4">
                      <div className="space-y-3">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="font-semibold">{product.original_name}</h4>
                              <Badge variant={product.type === 'user' ? 'outline' : 'default'}>
                                {product.type === 'user' ? 'Personlig' : 'Global'}
                              </Badge>
                            </div>
                            {product.mapped_name && (
                              <p className="text-sm text-muted-foreground">
                                Grupp: {product.mapped_name}
                              </p>
                            )}
                            <div className="mt-2">
                              <p className="text-sm font-medium text-red-600 dark:text-red-400">
                                Felaktig kategori: "{product.category}"
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium shrink-0">Välj rätt kategori:</span>
                          <Select
                            value={selectedFixes[product.id] || ''}
                            onValueChange={(value) =>
                              setSelectedFixes((prev) => ({ ...prev, [product.id]: value }))
                            }
                          >
                            <SelectTrigger className="flex-1">
                              <SelectValue placeholder="Välj kategori..." />
                            </SelectTrigger>
                            <SelectContent>
                              {categoryOptions.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            size="sm"
                            onClick={() => fixProduct(product)}
                            disabled={!selectedFixes[product.id]}
                          >
                            Fixa
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => deleteProduct(product)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
