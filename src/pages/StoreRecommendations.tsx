import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
    ArrowLeft, 
    Store, 
    TrendingDown, 
    Sparkles,
    ShoppingCart,
    PiggyBank,
    ChevronRight,
    AlertCircle
} from "lucide-react";
import { useNavigate } from "react-router-dom";

type Recommendation = {
    product_name: string;
    purchase_count: number;
    current_avg_price: number;
    cheapest_store_name: string;
    cheapest_price: number;
    savings_per_unit: number;
    potential_total_savings: number;
    savings_percent: number;
};

type StoreSummary = {
    store_name: string;
    products_cheapest_at: number;
    total_potential_savings: number;
    avg_savings_percent: number;
};

export default function StoreRecommendations() {
    const navigate = useNavigate();
    const [selectedStore, setSelectedStore] = useState<string | null>(null);

    // Fetch savings summary per store
    const { data: storeSummary, isLoading: summaryLoading } = useQuery({
        queryKey: ['store-savings-summary'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('view_store_savings_summary' as any)
                .select('*');

            if (error) throw error;
            return (data as unknown as StoreSummary[]) || [];
        },
    });

    // Fetch detailed recommendations
    const { data: recommendations, isLoading: recsLoading } = useQuery({
        queryKey: ['store-recommendations'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('view_store_recommendations' as any)
                .select('*')
                .order('potential_total_savings', { ascending: false })
                .limit(50);

            if (error) throw error;
            return (data as unknown as Recommendation[]) || [];
        },
    });

    const isLoading = summaryLoading || recsLoading;
    
    const totalPotentialSavings = recommendations?.reduce(
        (sum, r) => sum + (r.potential_total_savings || 0), 
        0
    ) || 0;

    const filteredRecommendations = selectedStore 
        ? recommendations?.filter(r => r.cheapest_store_name === selectedStore)
        : recommendations;

    const uniqueStores = [...new Set(recommendations?.map(r => r.cheapest_store_name) || [])];

    return (
        <div className="container mx-auto p-4 space-y-6 max-w-6xl pb-20">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
                    <ArrowLeft className="h-5 w-5" />
                </Button>
                <div>
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-green-600 bg-clip-text text-transparent">
                        Butiksrekommendationer
                    </h1>
                    <p className="text-muted-foreground">
                        Optimera dina inköp och spara pengar
                    </p>
                </div>
            </div>

            {isLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="h-32 bg-muted/20 animate-pulse rounded-lg" />
                    ))}
                </div>
            ) : recommendations && recommendations.length === 0 ? (
                <Card className="border-dashed">
                    <CardContent className="py-12 text-center">
                        <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                        <h3 className="text-lg font-semibold mb-2">Inte tillräckligt med data</h3>
                        <p className="text-muted-foreground mb-4">
                            Du behöver handla samma produkter på flera butiker för att få rekommendationer.
                            <br />
                            Fortsätt ladda upp kvitton så kommer vi snart kunna hjälpa dig spara pengar!
                        </p>
                        <Button onClick={() => navigate('/upload')}>
                            Ladda upp kvitto
                        </Button>
                    </CardContent>
                </Card>
            ) : (
                <>
                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Card className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950 dark:to-green-900 border-green-200 dark:border-green-800">
                            <CardHeader className="pb-2">
                                <CardTitle className="flex items-center gap-2 text-green-700 dark:text-green-300">
                                    <PiggyBank className="h-5 w-5" />
                                    Potentiell besparing
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-3xl font-bold text-green-700 dark:text-green-300">
                                    {totalPotentialSavings.toFixed(0)} kr
                                </p>
                                <p className="text-sm text-green-600 dark:text-green-400">
                                    baserat på dina köpvanor
                                </p>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="flex items-center gap-2">
                                    <ShoppingCart className="h-5 w-5" />
                                    Produkter analyserade
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-3xl font-bold">
                                    {recommendations?.length || 0}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                    med besparingsmöjlighet
                                </p>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="flex items-center gap-2">
                                    <Store className="h-5 w-5" />
                                    Butiker jämförda
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-3xl font-bold">
                                    {uniqueStores.length}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                    baserat på dina kvitton
                                </p>
                            </CardContent>
                        </Card>
                    </div>

                    <Tabs defaultValue="by-product" className="space-y-4">
                        <TabsList>
                            <TabsTrigger value="by-product">Per produkt</TabsTrigger>
                            <TabsTrigger value="by-store">Per butik</TabsTrigger>
                        </TabsList>

                        <TabsContent value="by-product" className="space-y-4">
                            {/* Store filter */}
                            <div className="flex gap-2 flex-wrap">
                                <Button 
                                    variant={selectedStore === null ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => setSelectedStore(null)}
                                >
                                    Alla butiker
                                </Button>
                                {uniqueStores.map(store => (
                                    <Button
                                        key={store}
                                        variant={selectedStore === store ? "default" : "outline"}
                                        size="sm"
                                        onClick={() => setSelectedStore(store)}
                                    >
                                        {store}
                                    </Button>
                                ))}
                            </div>

                            {/* Recommendations list */}
                            <div className="space-y-3">
                                {filteredRecommendations?.map((rec, idx) => (
                                    <Card 
                                        key={`${rec.product_name}-${idx}`}
                                        className="hover:shadow-md transition-shadow"
                                    >
                                        <CardContent className="py-4">
                                            <div className="flex items-center justify-between gap-4">
                                                <div className="flex-1 min-w-0">
                                                    <h3 className="font-semibold truncate">
                                                        {rec.product_name}
                                                    </h3>
                                                    <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                                                        <span>Köpt {rec.purchase_count} gånger</span>
                                                        <span>•</span>
                                                        <span>Snitt: {rec.current_avg_price} kr</span>
                                                    </div>
                                                </div>
                                                
                                                <div className="flex items-center gap-3">
                                                    <div className="text-right">
                                                        <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
                                                            <TrendingDown className="h-4 w-4" />
                                                            <span className="font-semibold">
                                                                -{rec.savings_percent}%
                                                            </span>
                                                        </div>
                                                        <p className="text-xs text-muted-foreground">
                                                            Spara {rec.savings_per_unit} kr/st
                                                        </p>
                                                    </div>
                                                    
                                                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                                    
                                                    <Badge variant="secondary" className="whitespace-nowrap">
                                                        <Store className="h-3 w-3 mr-1" />
                                                        {rec.cheapest_store_name}
                                                    </Badge>
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        </TabsContent>

                        <TabsContent value="by-store" className="space-y-4">
                            {storeSummary && storeSummary.length > 0 ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {storeSummary.map((store, idx) => (
                                        <Card 
                                            key={store.store_name}
                                            className={`cursor-pointer hover:shadow-md transition-all ${
                                                idx === 0 ? 'border-green-500 border-2' : ''
                                            }`}
                                            onClick={() => {
                                                setSelectedStore(store.store_name);
                                                // Switch to product tab
                                                const tabTrigger = document.querySelector('[data-state="inactive"][value="by-product"]') as HTMLButtonElement;
                                                tabTrigger?.click();
                                            }}
                                        >
                                            <CardHeader>
                                                <div className="flex items-center justify-between">
                                                    <CardTitle className="flex items-center gap-2">
                                                        <Store className="h-5 w-5" />
                                                        {store.store_name}
                                                    </CardTitle>
                                                    {idx === 0 && (
                                                        <Badge className="bg-green-500">
                                                            <Sparkles className="h-3 w-3 mr-1" />
                                                            Bäst val
                                                        </Badge>
                                                    )}
                                                </div>
                                                <CardDescription>
                                                    Billigast för {store.products_cheapest_at} produkter
                                                </CardDescription>
                                            </CardHeader>
                                            <CardContent>
                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                                                            {store.total_potential_savings?.toFixed(0) || 0} kr
                                                        </p>
                                                        <p className="text-sm text-muted-foreground">
                                                            potentiell besparing
                                                        </p>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="text-lg font-semibold">
                                                            ~{store.avg_savings_percent?.toFixed(0) || 0}%
                                                        </p>
                                                        <p className="text-sm text-muted-foreground">
                                                            snittbesparing
                                                        </p>
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    ))}
                                </div>
                            ) : (
                                <Card className="border-dashed">
                                    <CardContent className="py-8 text-center text-muted-foreground">
                                        Ingen butiksdata att visa
                                    </CardContent>
                                </Card>
                            )}
                        </TabsContent>
                    </Tabs>

                    {/* Smart Shopping Tip */}
                    {storeSummary && storeSummary.length >= 2 && (
                        <Card className="bg-gradient-to-r from-primary/10 to-purple-500/10 border-primary/20">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Sparkles className="h-5 w-5 text-primary" />
                                    Smart shoppingtips
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-muted-foreground">
                                    Baserat på dina köpvanor skulle du spara mest genom att handla på{' '}
                                    <strong className="text-foreground">{storeSummary[0]?.store_name}</strong>
                                    {storeSummary.length > 1 && (
                                        <>
                                            {' '}för de flesta produkter, men{' '}
                                            <strong className="text-foreground">{storeSummary[1]?.store_name}</strong>
                                            {' '}är billigare för {storeSummary[1]?.products_cheapest_at} produkter.
                                        </>
                                    )}
                                </p>
                            </CardContent>
                        </Card>
                    )}
                </>
            )}
        </div>
    );
}
