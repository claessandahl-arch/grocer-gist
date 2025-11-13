import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowUpRight, ArrowDownRight, Calendar } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { startOfMonth, endOfMonth, subMonths, format } from "date-fns";
import { sv } from "date-fns/locale";

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

export const MonthlySummary = () => {
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

  // Calculate data for last 3 months
  const getMonthData = (monthsAgo: number) => {
    const monthStart = startOfMonth(subMonths(new Date(), monthsAgo));
    const monthEnd = endOfMonth(subMonths(new Date(), monthsAgo));
    
    const monthReceipts = receipts?.filter(r => {
      if (!r.receipt_date) return false;
      const date = new Date(r.receipt_date);
      return date >= monthStart && date <= monthEnd;
    }) || [];

    const total = monthReceipts.reduce((sum, r) => sum + Number(r.total_amount || 0), 0);
    const count = monthReceipts.length;
    const avgPerTrip = count > 0 ? total / count : 0;

    // Get top category
    const categoryTotals: Record<string, number> = {};
    monthReceipts.forEach(receipt => {
      const items = receipt.items as any[] || [];
      items.forEach(item => {
        const category = item.category || 'other';
        categoryTotals[category] = (categoryTotals[category] || 0) + Number(item.price || 0);
      });
    });

    const topCategoryEntry = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1])[0];
    const topCategory = topCategoryEntry ? categoryNames[topCategoryEntry[0]] || 'Övrigt' : 'Ingen data';

    return {
      month: format(monthStart, 'MMMM yyyy', { locale: sv }),
      total,
      receipts: count,
      topCategory,
      avgPerTrip,
    };
  };

  const currentMonth = getMonthData(0);
  const lastMonth = getMonthData(1);
  const twoMonthsAgo = getMonthData(2);

  const calculateChange = (current: number, previous: number) => {
    if (previous === 0) return 0;
    return Math.round(((current - previous) / previous) * 100);
  };

  const monthlyData = [
    { ...currentMonth, change: calculateChange(currentMonth.total, lastMonth.total) },
    { ...lastMonth, change: calculateChange(lastMonth.total, twoMonthsAgo.total) },
    { ...twoMonthsAgo, change: 0 },
  ];

  if (isLoading) {
    return <div className="text-center py-8">Laddar...</div>;
  }

  if (!receipts || receipts.length === 0) {
    return (
      <Card className="shadow-card">
        <CardContent className="py-8 text-center text-muted-foreground">
          Inga kvitton uppladdade ännu. Ladda upp ditt första kvitto för att se statistik!
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {monthlyData.map((month, idx) => (
        <Card key={idx} className="shadow-card">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  {month.month}
                </CardTitle>
                <CardDescription className="mt-1">
                  {month.receipts} kvitton uppladdade
                </CardDescription>
              </div>
              <div className="text-right">
                <div className="text-3xl font-bold">{month.total.toLocaleString('sv-SE')} kr</div>
                <div className={`flex items-center justify-end gap-1 text-sm ${
                  month.change >= 0 ? 'text-destructive' : 'text-accent'
                }`}>
                  {month.change >= 0 ? (
                    <ArrowUpRight className="h-4 w-4" />
                  ) : (
                    <ArrowDownRight className="h-4 w-4" />
                  )}
                  {Math.abs(month.change)}% jämfört med förra månaden
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Topkategori</p>
                <p className="text-lg font-semibold">{month.topCategory}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Snitt per handla</p>
                <p className="text-lg font-semibold">{month.avgPerTrip.toLocaleString('sv-SE')} kr</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
