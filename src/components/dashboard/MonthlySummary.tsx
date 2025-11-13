import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowUpRight, ArrowDownRight, Calendar } from "lucide-react";

const monthlyData = [
  {
    month: "June 2024",
    total: 847.32,
    change: 12,
    receipts: 15,
    topCategory: "Produce",
    avgPerTrip: 56.49,
  },
  {
    month: "May 2024",
    total: 756.15,
    change: -8,
    receipts: 14,
    topCategory: "Dairy",
    avgPerTrip: 54.01,
  },
  {
    month: "April 2024",
    total: 823.47,
    change: 5,
    receipts: 16,
    topCategory: "Meat",
    avgPerTrip: 51.47,
  },
];

export const MonthlySummary = () => {
  return (
    <div className="space-y-6">
      {monthlyData.map((month, idx) => (
        <Card key={idx} className="shadow-card">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  {month.month}
                </CardTitle>
                <CardDescription className="mt-1">
                  {month.receipts} receipts uploaded
                </CardDescription>
              </div>
              <div className="text-right">
                <div className="text-3xl font-bold">${month.total.toFixed(2)}</div>
                <div className={`flex items-center justify-end gap-1 text-sm ${
                  month.change >= 0 ? 'text-destructive' : 'text-accent'
                }`}>
                  {month.change >= 0 ? (
                    <ArrowUpRight className="h-4 w-4" />
                  ) : (
                    <ArrowDownRight className="h-4 w-4" />
                  )}
                  {Math.abs(month.change)}% vs previous month
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Top Category</p>
                <p className="text-lg font-semibold">{month.topCategory}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Average per Trip</p>
                <p className="text-lg font-semibold">${month.avgPerTrip.toFixed(2)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
