import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type StatsCardProps = {
  title: string;
  value: number;
  subtitle?: string;
  loading?: boolean;
  variant?: 'default' | 'warning' | 'success' | 'info';
};

export function StatsCard({
  title,
  value,
  subtitle,
  loading,
  variant = 'default',
}: StatsCardProps) {
  const variantStyles = {
    default: 'border-border',
    warning: 'border-destructive/20 bg-destructive/5',
    success: 'border-primary/20 bg-primary/5',
    info: 'border-accent/20 bg-accent/5',
  };

  if (loading) {
    return (
      <Card className={variantStyles[variant]}>
        <CardHeader className="pb-2">
          <Skeleton className="h-4 w-24" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-8 w-16" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("shadow-sm", variantStyles[variant])}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value.toLocaleString('sv-SE')}</div>
        {subtitle && (
          <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
        )}
      </CardContent>
    </Card>
  );
}
