import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { startOfMonth, endOfMonth } from "date-fns";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { categoryNames } from "@/lib/categoryConstants";

export const CategoryBreakdown = ({ selectedMonth }: { selectedMonth?: Date }) => {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  
  const { data: receipts, isLoading } = useQuery({
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

  // Fetch both user and global product mappings
  const { data: productMappings } = useQuery({
    queryKey: ['product-mappings', 'with-global'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Fetch user mappings
      const { data: userMappings, error: userError } = await supabase
        .from('product_mappings')
        .select('*')
        .eq('user_id', user?.id || '');
      
      if (userError) throw userError;
      
      // Fetch global mappings
      const { data: globalMappings, error: globalError } = await supabase
        .from('global_product_mappings')
        .select('*');
      
      if (globalError) throw globalError;
      
      // Combine both - user mappings take precedence
      const userMappingNames = new Set((userMappings || []).map(m => m.original_name));
      const combined = [
        ...(userMappings || []),
        ...(globalMappings || [])
          .filter(gm => !userMappingNames.has(gm.original_name))
          .map(gm => ({
            ...gm,
            user_id: null,
            isGlobal: true
          }))
      ];
      
      return combined;
    },
  });

  // Use selected month or default to current month
  const monthToUse = selectedMonth || new Date();
  const thisMonthStart = startOfMonth(monthToUse);
  const thisMonthEnd = endOfMonth(monthToUse);
  
  const thisMonthReceipts = receipts?.filter(r => {
    if (!r.receipt_date) return false;
    const date = new Date(r.receipt_date);
    return date >= thisMonthStart && date <= thisMonthEnd;
  }) || [];

  // Normalize product names to merge similar items
  const normalizeProductName = (name: string): { normalizedName: string; category?: string } => {
    // First check if there's a manual mapping
    const manualMapping = productMappings?.find(m => m.original_name === name);
    if (manualMapping) {
      return {
        normalizedName: manualMapping.mapped_name.toLowerCase(),
        category: manualMapping.category || undefined
      };
    }

    // Otherwise use automatic normalization
    return {
      normalizedName: name
        .toLowerCase()
        .replace(/\s+/g, ' ') // normalize whitespace
        .replace(/\d+p\b/gi, '') // remove pack sizes like "4p", "6p"
        .replace(/\bz\b/gi, 'zero') // normalize "z" to "zero"
        .replace(/\bzero\b/gi, 'zero') // normalize all zero variants
        .replace(/\bbrygg\s*kaffe\b/gi, 'bryggkaffe') // normalize brewed coffee
        .replace(/\s+/g, ' ') // clean up double spaces
        .trim()
    };
  };

  // Calculate category totals
  const categoryTotals: Record<string, number> = {};
  const itemsByCategory: Record<string, Record<string, { total: number; quantity: number; originalNames: Set<string> }>> = {};
  
  thisMonthReceipts.forEach(receipt => {
    const items = receipt.items as any[] || [];
    items.forEach(item => {
      const itemName = item.name || 'Okänd produkt';
      const normalizedData = normalizeProductName(itemName);
      const normalizedName = normalizedData.normalizedName;
      
      // Use category from mapping if available, otherwise use item category
      const category = normalizedData.category || item.category || 'other';
      const price = Number(item.price || 0);
      
      categoryTotals[category] = (categoryTotals[category] || 0) + price;
      
      if (!itemsByCategory[category]) {
        itemsByCategory[category] = {};
      }
      if (!itemsByCategory[category][normalizedName]) {
        itemsByCategory[category][normalizedName] = { total: 0, quantity: 0, originalNames: new Set() };
      }
      itemsByCategory[category][normalizedName].total += price;
      itemsByCategory[category][normalizedName].quantity += Number(item.quantity || 1);
      itemsByCategory[category][normalizedName].originalNames.add(itemName);
    });
  });

  const data = Object.entries(categoryTotals)
    .map(([key, amount]) => ({
      category: categoryNames[key] || 'Övrigt',
      categoryKey: key,
      amount: Math.round(amount),
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10);

  // Get item details for selected category
  const getItemDetails = (categoryKey: string) => {
    const items = itemsByCategory[categoryKey] || {};
    return Object.entries(items)
      .map(([normalizedName, data]) => {
        // Use the normalized/mapped name (capitalized) as the display name
        const displayName = normalizedName.split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
        
        return {
          name: displayName,
          total: Math.round(data.total),
          quantity: data.quantity,
        };
      })
      .sort((a, b) => b.total - a.total);
  };

  const handleBarClick = (data: any) => {
    setSelectedCategory(data.categoryKey);
  };

  const handleBack = () => {
    setSelectedCategory(null);
  };

  if (isLoading) {
    return (
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Kategorier</CardTitle>
          <CardDescription>Utgifter per produktkategori denna månad</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] flex items-center justify-center text-muted-foreground">
            Laddar...
          </div>
        </CardContent>
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Kategorier</CardTitle>
          <CardDescription>Utgifter per produktkategori denna månad</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] flex items-center justify-center text-muted-foreground">
            Ingen data för denna månad
          </div>
        </CardContent>
      </Card>
    );
  }

  // Show detailed view for selected category
  if (selectedCategory) {
    const itemDetails = getItemDetails(selectedCategory);
    const categoryName = categoryNames[selectedCategory] || 'Övrigt';
    const itemChartData = itemDetails.slice(0, 10);

    return (
      <Card className="shadow-card">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={handleBack}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <CardTitle>{categoryName}</CardTitle>
              <CardDescription>Produkter i denna kategori</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={itemChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis 
                dataKey="name" 
                stroke="hsl(var(--muted-foreground))"
                fontSize={11}
                angle={-45}
                textAnchor="end"
                height={100}
              />
              <YAxis 
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
              />
              <Tooltip 
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "var(--radius)",
                }}
              />
              <Bar dataKey="total" fill="hsl(var(--chart-1))" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produkt</TableHead>
                  <TableHead className="text-right">Antal</TableHead>
                  <TableHead className="text-right">Totalt</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {itemDetails.map((item, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell className="text-right">{item.quantity}</TableCell>
                    <TableCell className="text-right">{item.total} kr</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-card">
      <CardHeader>
        <CardTitle>Kategorier</CardTitle>
        <CardDescription>Utgifter per produktkategori denna månad</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis 
              dataKey="category" 
              stroke="hsl(var(--muted-foreground))"
              fontSize={11}
              angle={-45}
              textAnchor="end"
              height={80}
            />
            <YAxis 
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
            />
            <Tooltip 
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "var(--radius)",
              }}
            />
            <Bar 
              dataKey="amount" 
              fill="hsl(var(--chart-2))" 
              radius={[8, 8, 0, 0]}
              onClick={handleBarClick}
              cursor="pointer"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} className="hover:opacity-80 transition-opacity" />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};
