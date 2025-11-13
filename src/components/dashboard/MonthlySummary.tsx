import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowUpRight, ArrowDownRight, Calendar } from "lucide-react";

const monthlyData = [
  {
    month: "Juni 2024",
    total: 8473.2,
    change: 12,
    receipts: 15,
    topCategory: "Frukt och grönt",
    avgPerTrip: 564.9,
  },
  {
    month: "Maj 2024",
    total: 7561.5,
    change: -8,
    receipts: 14,
    topCategory: "Mejeri",
    avgPerTrip: 540.1,
  },
  {
    month: "April 2024",
    total: 8234.7,
    change: 5,
    receipts: 16,
    topCategory: "Kött, fågel, chark",
    avgPerTrip: 514.7,
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
                  {month.receipts} kvitton uppladdade
                </CardDescription>
              </div>
              <div className="text-right">
                <div className="text-3xl font-bold">{month.total.toLocaleString('sv-SE')} kr</div>
                <div className={`flex items-center justify-end gap-1 text-sm ${
                  month.change >= 0 ? 'text-destructive' : 'text-accent'
                }`}>
                  {month.change >= 0 ? (
                    <ArrowUpRight className="h-4 w-4" />
                  ) : (
                    <ArrowDownRight className="h-4 w-4" />
                  )}
                  {Math.abs(month.change)}% jämfört med förra månaden
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Topkategori</p>
                <p className="text-lg font-semibold">{month.topCategory}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Snitt per handla</p>
                <p className="text-lg font-semibold">{month.avgPerTrip.toLocaleString('sv-SE')} kr</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
