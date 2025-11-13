import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { startOfMonth, endOfMonth } from "date-fns";

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
  thisMonthReceipts.forEach(receipt => {
    const items = receipt.items as any[] || [];
    items.forEach(item => {
      const category = item.category || 'other';
      categoryTotals[category] = (categoryTotals[category] || 0) + Number(item.price || 0);
    });
  });

  const data = Object.entries(categoryTotals)
    .map(([key, amount]) => ({
      category: categoryNames[key] || 'Övrigt',
      amount: Math.round(amount),
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10);

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
            <Bar dataKey="amount" fill="hsl(var(--chart-2))" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};
