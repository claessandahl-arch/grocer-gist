import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Search, TrendingDown, Store, Package } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type PriceComparisonRow = {
  mapped_name: string | null;
  quantity_unit: string | null;
  min_price_per_unit: number | null;
  avg_price_per_unit: number | null;
  max_price_per_unit: number | null;
  best_store_name: string | null;
  data_points: number | null;
};

export default function PriceComparison() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"savings" | "name" | "price">("savings");

  // Fetch price comparison data
  const { data: priceData, isLoading } = useQuery({
    queryKey: ["price-comparison"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("view_price_comparison")
        .select("*")
        .order("mapped_name");

      if (error) throw error;
      return data as PriceComparisonRow[];
    },
  });

  // Filter and sort data
  const processedData = useMemo(() => {
    if (!priceData) return [];

    // Filter by search query
    let filtered = priceData.filter(
      (item) =>
        item.mapped_name &&
        item.mapped_name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Calculate savings percentage for each item
    const withSavings = filtered.map((item) => {
      const savingsPercent =
        item.avg_price_per_unit && item.min_price_per_unit
          ? ((item.avg_price_per_unit - item.min_price_per_unit) /
              item.avg_price_per_unit) *
            100
          : 0;
      return { ...item, savingsPercent };
    });

    // Sort
    const sorted = [...withSavings].sort((a, b) => {
      if (sortBy === "savings") {
        return b.savingsPercent - a.savingsPercent;
      } else if (sortBy === "name") {
        return (a.mapped_name || "").localeCompare(b.mapped_name || "");
      } else if (sortBy === "price") {
        return (a.min_price_per_unit || 0) - (b.min_price_per_unit || 0);
      }
      return 0;
    });

    return sorted;
  }, [priceData, searchQuery, sortBy]);

  // Calculate summary stats
  const stats = useMemo(() => {
    if (!processedData.length) return { totalProducts: 0, avgSavings: 0, bestStores: [] };

    const totalProducts = processedData.length;
    const avgSavings =
      processedData.reduce((sum, item) => sum + item.savingsPercent, 0) / totalProducts;

    const storeCount: Record<string, number> = {};
    processedData.forEach((item) => {
      if (item.best_store_name) {
        storeCount[item.best_store_name] = (storeCount[item.best_store_name] || 0) + 1;
      }
    });

    const bestStores = Object.entries(storeCount)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([name, count]) => ({ name, count }));

    return { totalProducts, avgSavings, bestStores };
  }, [processedData]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <Button
            variant="ghost"
            onClick={() => navigate("/dashboard")}
            className="mb-4"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Tillbaka
          </Button>
          <h1 className="text-4xl font-bold mb-2 bg-gradient-primary bg-clip-text text-transparent">
            Prisjämförelse
          </h1>
          <p className="text-muted-foreground">
            Hitta bästa butiken för varje produkt och spara pengar
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-3 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Totalt produkter</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalProducts}</div>
              <p className="text-xs text-muted-foreground">
                Med prisjämförelse
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Genomsnittlig besparing</CardTitle>
              <TrendingDown className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {stats.avgSavings.toFixed(1)}%
              </div>
              <p className="text-xs text-muted-foreground">
                Jämfört med snittpris
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Bästa butikerna</CardTitle>
              <Store className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {stats.bestStores.map((store, idx) => (
                  <div key={store.name} className="flex justify-between text-sm">
                    <span className="font-medium">
                      {idx + 1}. {store.name}
                    </span>
                    <span className="text-muted-foreground">{store.count} produkter</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search and Filter */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Sök och filtrera</CardTitle>
            <CardDescription>Hitta specifika produkter eller sortera efter besparing</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Sök efter produkt..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={sortBy} onValueChange={(value: any) => setSortBy(value)}>
                <SelectTrigger className="w-full sm:w-[200px]">
                  <SelectValue placeholder="Sortera efter..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="savings">Störst besparing</SelectItem>
                  <SelectItem value="name">Produktnamn</SelectItem>
                  <SelectItem value="price">Lägsta pris</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Results Table */}
        <Card>
          <CardHeader>
            <CardTitle>Prisjämförelse</CardTitle>
            <CardDescription>
              {processedData.length} produkter hittade
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">
                Laddar prisjämförelse...
              </div>
            ) : processedData.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Inga produkter hittades
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produkt</TableHead>
                      <TableHead>Enhet</TableHead>
                      <TableHead>Bästa butiken</TableHead>
                      <TableHead className="text-right">Lägsta pris</TableHead>
                      <TableHead className="text-right">Snittpris</TableHead>
                      <TableHead className="text-right">Besparing</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {processedData.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-medium">
                          {item.mapped_name || "Okänd produkt"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-mono">
                            {item.quantity_unit || "—"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className="bg-primary/10 text-primary hover:bg-primary/20">
                            {item.best_store_name || "—"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {item.min_price_per_unit
                            ? `${item.min_price_per_unit.toFixed(2)} kr/${item.quantity_unit || "enhet"}`
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {item.avg_price_per_unit
                            ? `${item.avg_price_per_unit.toFixed(2)} kr/${item.quantity_unit || "enhet"}`
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          {item.savingsPercent > 0 ? (
                            <Badge className="bg-green-500/10 text-green-700 hover:bg-green-500/20 dark:text-green-400">
                              Spara {item.savingsPercent.toFixed(0)}%
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
