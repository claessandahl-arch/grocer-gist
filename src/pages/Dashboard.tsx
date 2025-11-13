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
              <h1 className="text-2xl font-bold text-foreground">Receipt Insights</h1>
            </div>
            <Button onClick={() => navigate("/upload")} className="gap-2">
              <Upload className="h-4 w-4" />
              Upload Receipt
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid w-full max-w-md grid-cols-3">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="stores">Stores</TabsTrigger>
            <TabsTrigger value="monthly">Monthly</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              <Card className="shadow-card">
                <CardHeader className="pb-2">
                  <CardDescription>This Month</CardDescription>
                  <CardTitle className="text-3xl">$847.32</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">+12% from last month</p>
                </CardContent>
              </Card>
              <Card className="shadow-card">
                <CardHeader className="pb-2">
                  <CardDescription>Avg per Receipt</CardDescription>
                  <CardTitle className="text-3xl">$56.49</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">15 receipts uploaded</p>
                </CardContent>
              </Card>
              <Card className="shadow-card">
                <CardHeader className="pb-2">
                  <CardDescription>Top Category</CardDescription>
                  <CardTitle className="text-2xl">Produce</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">$234.50 spent</p>
                </CardContent>
              </Card>
              <Card className="shadow-card">
                <CardHeader className="pb-2">
                  <CardDescription>Potential Savings</CardDescription>
                  <CardTitle className="text-3xl text-accent">$42.18</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">By comparing stores</p>
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
