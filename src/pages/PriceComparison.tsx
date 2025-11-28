import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Search, ArrowLeft, TrendingDown, TrendingUp, Store } from "lucide-react";
import { useNavigate } from "react-router-dom";

type PriceComparisonItem = {
  mapped_name: string;
  quantity_unit: string;
  min_price_per_unit: number;
  avg_price_per_unit: number;
  max_price_per_unit: number;
  best_store_name: string;
  data_points: number;
};

export default function PriceComparison() {
  const [searchTerm, setSearchTerm] = useState("");
  const navigate = useNavigate();

  const { data: items, isLoading } = useQuery({
    queryKey: ['price-comparison', new Date().toISOString().split('T')[0]], // Add date to force daily refresh
    queryFn: async () => {
      const { data, error } = await supabase
        .from('view_price_comparison')
        .select('*')
        .order('data_points', { ascending: false }); // Show most popular items first

      if (error) throw error;
      return data as PriceComparisonItem[];
    },
    staleTime: 0, // Always fetch fresh data
    gcTime: 0, // Don't cache
  });

  const filteredItems = items?.filter(item =>
    item.mapped_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="container mx-auto p-4 space-y-6 max-w-6xl pb-20">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent">
            Prisjämförelse
          </h1>
          <p className="text-muted-foreground">Hitta bästa priset per enhet för dina varor</p>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Sök produkt (t.ex. Kaffe, Smör)..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10 bg-card/50 backdrop-blur-sm"
        />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="h-40 bg-muted/20 animate-pulse rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredItems?.map((item) => (
            <Card key={`${item.mapped_name}-${item.quantity_unit}`} className="hover:shadow-md transition-shadow border-l-4 border-l-primary">
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <CardTitle className="text-lg font-semibold">{item.mapped_name}</CardTitle>
                  <Badge variant="secondary" className="font-mono">
                    kr/{item.quantity_unit}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-green-500/10 text-green-700 dark:text-green-400 p-3 rounded-md flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Store className="h-4 w-4" />
                    <span className="font-medium truncate max-w-[120px]" title={item.best_store_name}>
                      {item.best_store_name}
                    </span>
                  </div>
                  <span className="text-lg font-bold">
                    {item.min_price_per_unit.toFixed(2)}:-
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex flex-col p-2 bg-muted/30 rounded">
                    <span className="text-muted-foreground text-xs flex items-center gap-1">
                      <TrendingDown className="h-3 w-3" /> Snittpris
                    </span>
                    <span className="font-medium">{item.avg_price_per_unit.toFixed(2)}:-</span>
                  </div>
                  <div className="flex flex-col p-2 bg-muted/30 rounded">
                    <span className="text-muted-foreground text-xs flex items-center gap-1">
                      <TrendingUp className="h-3 w-3" /> Maxpris
                    </span>
                    <span className="font-medium">{item.max_price_per_unit.toFixed(2)}:-</span>
                  </div>
                </div>

                <div className="text-xs text-muted-foreground text-right">
                  Baserat på {item.data_points} köp
                </div>
              </CardContent>
            </Card>
          ))}

          {filteredItems?.length === 0 && (
            <div className="col-span-full text-center py-12 text-muted-foreground">
              Inga produkter hittades som matchar din sökning.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
