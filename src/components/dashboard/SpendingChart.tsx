import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { startOfMonth, endOfMonth, subMonths, format } from "date-fns";
import { sv } from "date-fns/locale";
import { categoryNames } from "@/lib/categoryConstants";
import { ReceiptItem } from "@/types/receipt";

interface SpendingChartProps {
  selectedCategory?: string | null;
}

export const SpendingChart = ({ selectedCategory }: SpendingChartProps) => {
  const { data: receipts, isLoading } = useQuery({
    queryKey: ['receipts'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('receipts')
        .select('*')
        .eq('user_id', user.id)
        .order('receipt_date', { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  // Fetch both user and global product mappings for category filtering
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

  // Get category for an item (matches logic from CategoryBreakdown)
  const getCategoryForItem = (itemName: string): string => {
    // Check manual mapping first
    const manualMapping = productMappings?.find(m => m.original_name === itemName);
    if (manualMapping?.category) {
      return manualMapping.category;
    }
    // Return empty string if no mapping found - will use receipt category
    return '';
  };

  // Calculate spending for last 6 months
  const data = Array.from({ length: 6 }, (_, i) => {
    const monthDate = subMonths(new Date(), 5 - i);
    const monthStart = startOfMonth(monthDate);
    const monthEnd = endOfMonth(monthDate);

    const monthReceipts = receipts?.filter(r => {
      if (!r.receipt_date) return false;
      const date = new Date(r.receipt_date);
      return date >= monthStart && date <= monthEnd;
    }) || [];

    let total = 0;

    if (selectedCategory) {
      // Calculate total for selected category only
      monthReceipts.forEach(receipt => {
        const items = (receipt.items as unknown as ReceiptItem[]) || [];
        items.forEach(item => {
          const mappedCategory = getCategoryForItem(item.name || '');
          const itemCategory = mappedCategory || item.category || 'other';

          if (itemCategory === selectedCategory) {
            total += Number(item.price || 0);
          }
        });
      });
    } else {
      // Calculate total for all categories (default behavior)
      total = monthReceipts.reduce((sum, r) => sum + Number(r.total_amount || 0), 0);
    }

    return {
      month: format(monthDate, 'MMM', { locale: sv }),
      amount: Math.round(total),
    };
  });

  const chartTitle = selectedCategory
    ? `Utgiftstrend - ${categoryNames[selectedCategory] || 'Övrigt'}`
    : 'Utgiftstrend';

  const chartDescription = selectedCategory
    ? `Utgifter för ${categoryNames[selectedCategory] || 'Övrigt'} de senaste 6 månaderna`
    : 'Dina matutgifter de senaste 6 månaderna';

  if (isLoading) {
    return (
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>{chartTitle}</CardTitle>
          <CardDescription>{chartDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] flex items-center justify-center text-muted-foreground">
            Laddar...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-card">
      <CardHeader>
        <CardTitle>{chartTitle}</CardTitle>
        <CardDescription>{chartDescription}</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis 
              dataKey="month" 
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
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
            <Line 
              type="monotone" 
              dataKey="amount" 
              stroke="hsl(var(--primary))" 
              strokeWidth={2}
              dot={{ fill: "hsl(var(--primary))" }}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};
