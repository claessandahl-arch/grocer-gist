import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingDown, TrendingUp } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const StoreComparison = () => {
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

  // Group receipts by store
  const storeData: Record<string, { total: number; count: number }> = {};
  receipts?.forEach(receipt => {
    const store = receipt.store_name || 'Okänd butik';
    if (!storeData[store]) {
      storeData[store] = { total: 0, count: 0 };
    }
    storeData[store].total += Number(receipt.total_amount || 0);
    storeData[store].count += 1;
  });

  const stores = Object.entries(storeData)
    .map(([name, data]) => ({
      name,
      total: data.total,
      count: data.count,
      average: data.count > 0 ? data.total / data.count : 0,
    }))
    .sort((a, b) => b.total - a.total);

  if (isLoading) {
    return <div className="text-center py-8">Laddar...</div>;
  }

  if (stores.length === 0) {
    return (
      <Card className="shadow-card">
        <CardContent className="py-8 text-center text-muted-foreground">
          Ingen butiksdata tillgänglig ännu
        </CardContent>
      </Card>
    );
  }

  const lowestAvg = stores.reduce((min, s) => s.average < min ? s.average : min, stores[0]?.average || 0);
  const highestAvg = stores.reduce((max, s) => s.average > max ? s.average : max, stores[0]?.average || 0);

  return (
    <div className="space-y-6">
      <Card className="shadow-soft border-accent/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingDown className="h-5 w-5 text-accent" />
            Butiksjämförelse
          </CardTitle>
          <CardDescription>
            Översikt över dina utgifter per butik
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-lg font-semibold">
            {stores.length} {stores.length === 1 ? 'butik' : 'butiker'} besökta
          </p>
        </CardContent>
      </Card>

      {stores.map((store, idx) => (
        <Card key={idx} className="shadow-card">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="text-lg">{store.name}</CardTitle>
                <CardDescription>{store.count} kvitton</CardDescription>
              </div>
              {store.average === lowestAvg && stores.length > 1 && (
                <Badge variant="default" className="bg-accent">
                  <TrendingDown className="h-3 w-3 mr-1" />
                  Lägst snitt
                </Badge>
              )}
              {store.average === highestAvg && stores.length > 1 && lowestAvg !== highestAvg && (
                <Badge variant="destructive">
                  <TrendingUp className="h-3 w-3 mr-1" />
                  Högst snitt
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-sm text-muted-foreground">Total spenderat</p>
                <p className="text-2xl font-bold">{store.total.toLocaleString('sv-SE', { maximumFractionDigits: 0 })} kr</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Snitt per kvitto</p>
                <p className="text-2xl font-bold">{store.average.toLocaleString('sv-SE', { maximumFractionDigits: 0 })} kr</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
