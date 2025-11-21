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
import { startOfMonth, format, addMonths, subMonths } from "date-fns";
import { sv } from "date-fns/locale";
import { useState } from "react";
import { MonthlyStat, CategoryBreakdown as CategoryBreakdownType } from "@/types/dashboardTypes";
import { categoryNames } from "@/lib/categoryConstants";

const Dashboard = () => {
  const navigate = useNavigate();
  const [selectedMonth, setSelectedMonth] = useState(new Date());

  const monthStart = format(startOfMonth(selectedMonth), 'yyyy-MM-dd');

  // Fetch monthly stats from view
  const { data: monthlyStats, isLoading: statsLoading } = useQuery({
    queryKey: ['monthly-stats', monthStart],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('view_monthly_stats' as any)
        .select('*')
        .eq('user_id', user.id)
        .eq('month_start', monthStart)
        .maybeSingle();

      if (error) throw error;
      return data as unknown as MonthlyStat | null;
    },
  });

  // Fetch category breakdown from view
  const { data: categoryStats, isLoading: categoriesLoading } = useQuery({
    queryKey: ['category-breakdown', monthStart],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data, error } = await supabase
        .from('view_category_breakdown' as any)
        .select('*')
        .eq('user_id', user.id)
        .eq('month_start', monthStart)
        .order('total_spend', { ascending: false });

      if (error) throw error;
      return data as unknown as CategoryBreakdownType[] || [];
    },
  });

  const isLoading = statsLoading || categoriesLoading;

  const handlePreviousMonth = () => setSelectedMonth(prev => subMonths(prev, 1));
  const handleNextMonth = () => setSelectedMonth(prev => addMonths(prev, 1));
  const isCurrentMonth = format(selectedMonth, 'yyyy-MM') === format(new Date(), 'yyyy-MM');

  const topCategory = categoryStats && categoryStats.length > 0 ? categoryStats[0] : null;

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
                    {isLoading ? '...' : `${(monthlyStats?.total_spend || 0).toLocaleString('sv-SE', { maximumFractionDigits: 0 })} kr`}
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
                    {isLoading ? '...' : `${(monthlyStats?.avg_per_receipt || 0).toLocaleString('sv-SE', { maximumFractionDigits: 0 })} kr`}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{monthlyStats?.receipt_count || 0} kvitton uppladdade</p>
                </CardContent>
              </Card>
              <Card className="shadow-card">
                <CardHeader className="pb-2">
                  <CardDescription>Topkategori</CardDescription>
                  <CardTitle className="text-2xl">
                    {isLoading ? '...' : (topCategory ? categoryNames[topCategory.category] || 'Övrigt' : 'Ingen data')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {topCategory ? `${topCategory.total_spend.toLocaleString('sv-SE', { maximumFractionDigits: 0 })} kr spenderat` : '-'}
                  </p>
                </CardContent>
              </Card>
              <Card className="shadow-card">
                <CardHeader className="pb-2">
                  <CardDescription>Totalt antal kvitton</CardDescription>
                  <CardTitle className="text-3xl text-accent">
                    {/* Note: This is total for the month now, not all time. If all time is needed, we need a separate query. */}
                    {isLoading ? '...' : monthlyStats?.receipt_count || 0}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">Kvitton denna månad</p>
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
