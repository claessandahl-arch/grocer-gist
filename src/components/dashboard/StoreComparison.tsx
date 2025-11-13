import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingDown, TrendingUp } from "lucide-react";

const storeData = [
  {
    item: "Organic Milk (1 Gallon)",
    stores: [
      { name: "Whole Foods", price: 6.99, badge: "highest" },
      { name: "Trader Joe's", price: 4.99, badge: "lowest" },
      { name: "Safeway", price: 5.49, badge: null },
    ]
  },
  {
    item: "Bananas (per lb)",
    stores: [
      { name: "Whole Foods", price: 0.79, badge: null },
      { name: "Trader Joe's", price: 0.69, badge: "lowest" },
      { name: "Safeway", price: 0.89, badge: "highest" },
    ]
  },
  {
    item: "Ground Beef (per lb)",
    stores: [
      { name: "Whole Foods", price: 8.99, badge: "highest" },
      { name: "Trader Joe's", price: 6.99, badge: null },
      { name: "Safeway", price: 5.99, badge: "lowest" },
    ]
  },
];

export const StoreComparison = () => {
  return (
    <div className="space-y-6">
      <Card className="shadow-soft border-accent/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingDown className="h-5 w-5 text-accent" />
            Price Comparison Insights
          </CardTitle>
          <CardDescription>
            Save money by shopping at the right stores for each product
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold text-accent">Save up to $42.18/month</p>
          <p className="text-sm text-muted-foreground mt-1">
            By purchasing items at the stores with the lowest prices
          </p>
        </CardContent>
      </Card>

      {storeData.map((item, idx) => (
        <Card key={idx} className="shadow-card">
          <CardHeader>
            <CardTitle className="text-lg">{item.item}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {item.stores.map((store, storeIdx) => (
                <div 
                  key={storeIdx}
                  className="flex items-center justify-between p-3 bg-secondary/50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-medium">{store.name}</span>
                    {store.badge === "lowest" && (
                      <Badge variant="default" className="bg-accent">
                        <TrendingDown className="h-3 w-3 mr-1" />
                        Best Price
                      </Badge>
                    )}
                    {store.badge === "highest" && (
                      <Badge variant="destructive">
                        <TrendingUp className="h-3 w-3 mr-1" />
                        Highest
                      </Badge>
                    )}
                  </div>
                  <span className="text-lg font-bold">${store.price.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
