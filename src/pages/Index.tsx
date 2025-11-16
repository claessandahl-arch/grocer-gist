import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, BarChart3, TrendingDown, Calendar, Database } from "lucide-react";
import { useNavigate } from "react-router-dom";

const Index = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-hero">
      {/* Hero Section */}
      <section className="container mx-auto px-4 py-20">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          <h1 className="text-5xl md:text-6xl font-bold text-foreground">
            Smart Grocery{" "}
            <span className="bg-gradient-primary bg-clip-text text-transparent">
              Receipt Tracking
            </span>
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Upload your grocery receipts and get instant insights into your spending habits, 
            compare prices across stores, and discover ways to save money.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button 
              size="lg" 
              onClick={() => navigate("/upload")}
              className="gap-2 shadow-soft"
            >
              Get Started
            </Button>
            <Button 
              size="lg" 
              variant="outline"
              onClick={() => navigate("/dashboard")}
            >
              View Dashboard
            </Button>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="container mx-auto px-4 py-16">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 max-w-6xl mx-auto">
          <Card className="shadow-card hover:shadow-soft transition-shadow">
            <CardHeader>
              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-2">
                <BarChart3 className="h-6 w-6 text-primary" />
              </div>
              <CardTitle>Category Breakdown</CardTitle>
              <CardDescription>
                Automatically categorize your purchases and see exactly where your money goes
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="shadow-card hover:shadow-soft transition-shadow">
            <CardHeader>
              <div className="h-12 w-12 rounded-lg bg-accent/10 flex items-center justify-center mb-2">
                <TrendingDown className="h-6 w-6 text-accent" />
              </div>
              <CardTitle>Price Comparison</CardTitle>
              <CardDescription>
                Compare prices across different grocery stores and find the best deals
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="shadow-card hover:shadow-soft transition-shadow">
            <CardHeader>
              <div className="h-12 w-12 rounded-lg bg-chart-3/20 flex items-center justify-center mb-2">
                <Calendar className="h-6 w-6 text-chart-3" />
              </div>
              <CardTitle>Monthly Summaries</CardTitle>
              <CardDescription>
                Track your spending trends over time with detailed monthly reports
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="shadow-card hover:shadow-soft transition-shadow cursor-pointer" onClick={() => navigate("/datamanagement")}>
            <CardHeader>
              <div className="h-12 w-12 rounded-lg bg-secondary/20 flex items-center justify-center mb-2">
                <Database className="h-6 w-6 text-secondary-foreground" />
              </div>
              <CardTitle>Data Management</CardTitle>
              <CardDescription>
                Manage product categories and organize your grocery data efficiently
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="shadow-card hover:shadow-soft transition-shadow cursor-pointer" onClick={() => navigate("/product-management")}>
            <CardHeader>
              <div className="h-12 w-12 rounded-lg bg-chart-4/20 flex items-center justify-center mb-2">
                <Upload className="h-6 w-6 text-chart-4" />
              </div>
              <CardTitle>Product Management</CardTitle>
              <CardDescription>
                Group similar products together and manage your product database
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </section>

      {/* CTA Section */}
      <section className="container mx-auto px-4 py-20">
        <Card className="max-w-3xl mx-auto shadow-soft border-2 border-primary/20">
          <CardHeader className="text-center">
            <CardTitle className="text-3xl">Ready to Start Saving?</CardTitle>
            <CardDescription className="text-lg">
              Upload your first receipt and see your spending insights in seconds
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button 
              size="lg" 
              onClick={() => navigate("/upload")}
              className="gap-2"
            >
              Get Started Now
            </Button>
          </CardContent>
        </Card>
      </section>
    </div>
  );
};

export default Index;
