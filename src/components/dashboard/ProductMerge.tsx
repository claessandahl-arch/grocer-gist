import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Trash2, Plus, Sparkles } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

// Calculate similarity score between two strings (0-1)
const calculateSimilarity = (str1: string, str2: string): number => {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();
  
  // If strings are identical, return 1
  if (s1 === s2) return 1;
  
  // Check if one string contains the other
  if (s1.includes(s2) || s2.includes(s1)) return 0.8;
  
  // Simple token-based similarity
  const tokens1 = s1.split(/\s+/);
  const tokens2 = s2.split(/\s+/);
  
  const commonTokens = tokens1.filter(t => tokens2.includes(t)).length;
  const totalTokens = Math.max(tokens1.length, tokens2.length);
  
  if (commonTokens > 0) {
    return commonTokens / totalTokens;
  }
  
  // Levenshtein distance for similar strings
  const maxLen = Math.max(s1.length, s2.length);
  if (maxLen === 0) return 1;
  
  const distance = levenshteinDistance(s1, s2);
  return 1 - distance / maxLen;
};

// Calculate Levenshtein distance between two strings
const levenshteinDistance = (str1: string, str2: string): number => {
  const matrix: number[][] = [];
  
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  
  return matrix[str2.length][str1.length];
};

type SuggestedMerge = {
  products: string[];
  score: number;
  suggestedName: string;
};

export const ProductMerge = () => {
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [mergedName, setMergedName] = useState("");
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [groupMergeName, setGroupMergeName] = useState("");
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

  // Filter out products that are already mapped
  const mappedOriginalNames = new Set(mappings?.map(m => m.original_name) || []);
  const unmappedProducts = productList.filter(p => !mappedOriginalNames.has(p));

  // Generate suggested merges based on similarity
  const suggestedMerges: SuggestedMerge[] = [];
  const processed = new Set<string>();
  
  unmappedProducts.forEach((product, i) => {
    if (processed.has(product)) return;
    
    const similar: string[] = [product];
    
    for (let j = i + 1; j < unmappedProducts.length; j++) {
      const other = unmappedProducts[j];
      if (processed.has(other)) continue;
      
      const similarity = calculateSimilarity(product, other);
      
      if (similarity >= 0.6) {
        similar.push(other);
        processed.add(other);
      }
    }
    
    if (similar.length > 1) {
      processed.add(product);
      // Use the shortest name as suggested name
      const suggestedName = similar.reduce((a, b) => a.length <= b.length ? a : b);
      suggestedMerges.push({
        products: similar,
        score: similar.length > 2 ? 0.9 : 0.7,
        suggestedName,
      });
    }
  });

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

  const handleAcceptSuggestion = async (suggestion: SuggestedMerge) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const mappingsToCreate = suggestion.products.map(product => ({
        user_id: user.id,
        original_name: product,
        mapped_name: suggestion.suggestedName,
      }));

      const { error } = await supabase
        .from('product_mappings')
        .insert(mappingsToCreate);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['product-mappings'] });
      toast.success("Produkter sammanslagna!");
    } catch (error) {
      toast.error("Kunde inte slå ihop produkter: " + (error as Error).message);
    }
  };

  // Merge selected groups mutation
  const mergeGroups = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Update all mappings in selected groups to the new merged name
      const { error } = await supabase
        .from('product_mappings')
        .update({ mapped_name: groupMergeName })
        .in('mapped_name', selectedGroups)
        .eq('user_id', user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-mappings'] });
      setSelectedGroups([]);
      setGroupMergeName("");
      toast.success("Produktgrupper sammanslagna!");
    },
    onError: (error) => {
      toast.error("Kunde inte slå ihop grupper: " + error.message);
    },
  });

  const handleGroupToggle = (groupName: string) => {
    setSelectedGroups(prev =>
      prev.includes(groupName)
        ? prev.filter(g => g !== groupName)
        : [...prev, groupName]
    );
  };

  const handleMergeGroups = () => {
    if (selectedGroups.length < 2) {
      toast.error("Välj minst 2 grupper att slå ihop");
      return;
    }
    if (!groupMergeName.trim()) {
      toast.error("Ange ett namn för den sammanslagna gruppen");
      return;
    }
    mergeGroups.mutate();
  };

  // Group mappings by mapped_name
  const groupedMappings = mappings?.reduce((acc, mapping) => {
    if (!acc[mapping.mapped_name]) {
      acc[mapping.mapped_name] = [];
    }
    acc[mapping.mapped_name].push(mapping);
    return acc;
  }, {} as Record<string, Array<typeof mappings[number]>>);

  return (
    <div className="space-y-6">
      {/* Suggested merges */}
      {suggestedMerges.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              Föreslagna sammanslagningar
            </CardTitle>
            <CardDescription>
              Produkter som verkar vara liknande baserat på namn
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {suggestedMerges.map((suggestion, idx) => (
                <div key={idx} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">
                          {Math.round(suggestion.score * 100)}% match
                        </Badge>
                        <span className="text-sm font-medium">
                          {suggestion.products.length} produkter
                        </span>
                      </div>
                      <div className="text-sm text-muted-foreground space-y-1">
                        {suggestion.products.map((product, i) => (
                          <div key={i}>• {product}</div>
                        ))}
                      </div>
                      <div className="text-sm">
                        <span className="font-medium">Föreslaget namn: </span>
                        <span className="text-muted-foreground">{suggestion.suggestedName}</span>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleAcceptSuggestion(suggestion)}
                      disabled={createMapping.isPending}
                    >
                      Acceptera
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

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
              {unmappedProducts.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Alla produkter är redan sammanslagna
                </p>
              ) : (
                unmappedProducts.map(product => (
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
                ))
              )}
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

      {/* Show existing mappings with merge option */}
      {!mappingsLoading && groupedMappings && Object.keys(groupedMappings).length > 0 && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Aktiva sammanslagningar</CardTitle>
              <CardDescription>
                Produkter du har slagit ihop. Välj grupper för att slå ihop dem ytterligare.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {Object.entries(groupedMappings).map(([mappedName, items]: [string, any[]]) => (
                  <div key={mappedName} className="border rounded-md p-4">
                    <div className="flex items-start gap-3 mb-2">
                      <Checkbox
                        id={`group-${mappedName}`}
                        checked={selectedGroups.includes(mappedName)}
                        onCheckedChange={() => handleGroupToggle(mappedName)}
                      />
                      <div className="flex-1">
                        <label htmlFor={`group-${mappedName}`} className="font-medium cursor-pointer">
                          {mappedName}
                        </label>
                        <p className="text-sm text-muted-foreground">
                          {items.length} {items.length === 1 ? 'produkt' : 'produkter'}
                        </p>
                      </div>
                    </div>
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

          {/* Merge groups section */}
          {selectedGroups.length > 1 && (
            <Card>
              <CardHeader>
                <CardTitle>Slå ihop valda grupper</CardTitle>
                <CardDescription>
                  Sammanslå {selectedGroups.length} produktgrupper till en
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Valda grupper ({selectedGroups.length}):
                  </label>
                  <div className="text-sm text-muted-foreground border rounded-md p-2">
                    {selectedGroups.join(", ")}
                  </div>
                </div>

                <div className="space-y-2">
                  <label htmlFor="group-merge-name" className="text-sm font-medium">
                    Namn för sammanslagna gruppen:
                  </label>
                  <Input
                    id="group-merge-name"
                    placeholder="T.ex. Coca-Cola"
                    value={groupMergeName}
                    onChange={(e) => setGroupMergeName(e.target.value)}
                  />
                </div>

                <Button
                  onClick={handleMergeGroups}
                  disabled={!groupMergeName.trim() || mergeGroups.isPending}
                  className="w-full"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Slå ihop {selectedGroups.length} grupper
                </Button>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
};
