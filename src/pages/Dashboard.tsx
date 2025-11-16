import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SpendingChart } from "@/components/dashboard/SpendingChart";
import { CategoryBreakdown } from "@/components/dashboard/CategoryBreakdown";
import { StoreComparison } from "@/components/dashboard/StoreComparison";
import { MonthlySummary } from "@/components/dashboard/MonthlySummary";
import { Button } from "@/components/ui/button";
import { Upload, ArrowLeft, ChevronLeft, ChevronRight, Package } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { startOfMonth, endOfMonth, format, addMonths, subMonths } from "date-fns";
import { sv } from "date-fns/locale";
import { useState } from "react";
import type { ReceiptItem } from "@/types/receipt";

const Dashboard = () => {
  const navigate = useNavigate();
  const [selectedMonth, setSelectedMonth] = useState(new Date());

  // Fetch current month's receipts
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

  // Calculate selected month's stats
  const thisMonthStart = startOfMonth(selectedMonth);
  const thisMonthEnd = endOfMonth(selectedMonth);
  
  const thisMonthReceipts = receipts?.filter(r => {
    if (!r.receipt_date) return false;
    const date = new Date(r.receipt_date);
    return date >= thisMonthStart && date <= thisMonthEnd;
  }) || [];

  const thisMonthTotal = thisMonthReceipts.reduce((sum, r) => sum + Number(r.total_amount || 0), 0);
  const thisMonthCount = thisMonthReceipts.length;
  const avgPerReceipt = thisMonthCount > 0 ? thisMonthTotal / thisMonthCount : 0;

  const handlePreviousMonth = () => setSelectedMonth(prev => subMonths(prev, 1));
  const handleNextMonth = () => setSelectedMonth(prev => addMonths(prev, 1));
  const isCurrentMonth = format(selectedMonth, 'yyyy-MM') === format(new Date(), 'yyyy-MM');

  // Get top category this month
  const categoryTotals: Record<string, number> = {};
  thisMonthReceipts.forEach(receipt => {
    const items = (receipt.items as unknown as ReceiptItem[]) || [];
    items.forEach(item => {
      const category = item.category || 'other';
      categoryTotals[category] = (categoryTotals[category] || 0) + Number(item.price || 0);
    });
  });

  const topCategory = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1])[0];
  
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

  return (
    <div className="min-h-screen bg-gradient-hero">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <h1 className="text-2xl font-bold text-foreground">Kvittoinsikter</h1>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => navigate("/product-management")} className="gap-2">
                <Package className="h-4 w-4" />
                Produkthantering
              </Button>
              <Button onClick={() => navigate("/upload")} className="gap-2">
                <Upload className="h-4 w-4" />
                Ladda upp kvitto
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid w-full max-w-md grid-cols-3">
            <TabsTrigger value="overview">Översikt</TabsTrigger>
            <TabsTrigger value="stores">Butiker</TabsTrigger>
            <TabsTrigger value="monthly">Månadsvis</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handlePreviousMonth}
                  aria-label="Föregående månad"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <h2 className="text-xl font-semibold min-w-[200px] text-center">
                  {format(selectedMonth, 'MMMM yyyy', { locale: sv })}
                </h2>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleNextMonth}
                  disabled={isCurrentMonth}
                  aria-label="Nästa månad"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              {!isCurrentMonth && (
                <Button variant="ghost" onClick={() => setSelectedMonth(new Date())}>
                  Gå till aktuell månad
                </Button>
              )}
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              <Card className="shadow-card">
                <CardHeader className="pb-2">
                  <CardDescription>Vald månad</CardDescription>
                  <CardTitle className="text-3xl">
                    {isLoading ? '...' : `${thisMonthTotal.toLocaleString('sv-SE', { maximumFractionDigits: 0 })} kr`}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {format(selectedMonth, 'MMMM yyyy', { locale: sv })}
                  </p>
                </CardContent>
              </Card>
              <Card className="shadow-card">
                <CardHeader className="pb-2">
                  <CardDescription>Snitt per kvitto</CardDescription>
                  <CardTitle className="text-3xl">
                    {isLoading ? '...' : `${avgPerReceipt.toLocaleString('sv-SE', { maximumFractionDigits: 0 })} kr`}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{thisMonthCount} kvitton uppladdade</p>
                </CardContent>
              </Card>
              <Card className="shadow-card">
                <CardHeader className="pb-2">
                  <CardDescription>Topkategori</CardDescription>
                  <CardTitle className="text-2xl">
                    {isLoading ? '...' : (topCategory ? categoryNames[topCategory[0]] || 'Övrigt' : 'Ingen data')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {topCategory ? `${topCategory[1].toLocaleString('sv-SE', { maximumFractionDigits: 0 })} kr spenderat` : '-'}
                  </p>
                </CardContent>
              </Card>
              <Card className="shadow-card">
                <CardHeader className="pb-2">
                  <CardDescription>Totalt antal kvitton</CardDescription>
                  <CardTitle className="text-3xl text-accent">
                    {isLoading ? '...' : receipts?.length || 0}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">Alla uppladdade kvitton</p>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <SpendingChart />
              <CategoryBreakdown selectedMonth={selectedMonth} />
            </div>
          </TabsContent>

          <TabsContent value="stores">
            <StoreComparison />
          </TabsContent>

          <TabsContent value="monthly">
            <MonthlySummary />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Dashboard;
