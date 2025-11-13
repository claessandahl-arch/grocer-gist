import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { startOfMonth, endOfMonth } from "date-fns";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const categoryNames: Record<string, string> = {
  frukt_gront: 'Frukt och grönt',
  mejeri: 'Mejeri',
  kott_fagel_chark: 'Kött, fågel, chark',
  brod_bageri: 'Bröd och bageri',
  drycker: 'Drycker',
  sotsaker_snacks: 'Sötsaker och snacks',
  fardigmat: 'Färdigmat',
  hushall_hygien: 'Hushåll och hygien',
  delikatess: 'Delikatess',
  pant: 'Pant',
  other: 'Övrigt',
};

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

  // Use selected month or default to current month
  const monthToUse = selectedMonth || new Date();
  const thisMonthStart = startOfMonth(monthToUse);
  const thisMonthEnd = endOfMonth(monthToUse);
  
  const thisMonthReceipts = receipts?.filter(r => {
    if (!r.receipt_date) return false;
    const date = new Date(r.receipt_date);
    return date >= thisMonthStart && date <= thisMonthEnd;
  }) || [];

  // Calculate category totals
  const categoryTotals: Record<string, number> = {};
  const itemsByCategory: Record<string, Record<string, { total: number; quantity: number }>> = {};
  
  thisMonthReceipts.forEach(receipt => {
    const items = receipt.items as any[] || [];
    items.forEach(item => {
      const category = item.category || 'other';
      const itemName = item.name || 'Okänd produkt';
      const price = Number(item.price || 0);
      
      categoryTotals[category] = (categoryTotals[category] || 0) + price;
      
      if (!itemsByCategory[category]) {
        itemsByCategory[category] = {};
      }
      if (!itemsByCategory[category][itemName]) {
        itemsByCategory[category][itemName] = { total: 0, quantity: 0 };
      }
      itemsByCategory[category][itemName].total += price;
      itemsByCategory[category][itemName].quantity += Number(item.quantity || 1);
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
      .map(([name, data]) => ({
        name,
        total: Math.round(data.total),
        quantity: data.quantity,
      }))
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
