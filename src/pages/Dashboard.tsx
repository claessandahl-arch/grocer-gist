import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SpendingChart } from "@/components/dashboard/SpendingChart";
import { CategoryBreakdown } from "@/components/dashboard/CategoryBreakdown";
import { StoreComparison } from "@/components/dashboard/StoreComparison";
import { MonthlySummary } from "@/components/dashboard/MonthlySummary";
import { Button } from "@/components/ui/button";
import { Upload, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

const Dashboard = () => {
  const navigate = useNavigate();

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
            <Button onClick={() => navigate("/upload")} className="gap-2">
              <Upload className="h-4 w-4" />
              Ladda upp kvitto
            </Button>
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
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              <Card className="shadow-card">
                <CardHeader className="pb-2">
                  <CardDescription>Denna månad</CardDescription>
                  <CardTitle className="text-3xl">8 473 kr</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">+12% från förra månaden</p>
                </CardContent>
              </Card>
              <Card className="shadow-card">
                <CardHeader className="pb-2">
                  <CardDescription>Snitt per kvitto</CardDescription>
                  <CardTitle className="text-3xl">565 kr</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">15 kvitton uppladdade</p>
                </CardContent>
              </Card>
              <Card className="shadow-card">
                <CardHeader className="pb-2">
                  <CardDescription>Topkategori</CardDescription>
                  <CardTitle className="text-2xl">Frukt och grönt</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">2 345 kr spenderat</p>
                </CardContent>
              </Card>
              <Card className="shadow-card">
                <CardHeader className="pb-2">
                  <CardDescription>Potentiella besparingar</CardDescription>
                  <CardTitle className="text-3xl text-accent">422 kr</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">Genom att jämföra butiker</p>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <SpendingChart />
              <CategoryBreakdown />
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
