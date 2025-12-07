
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
} from "@/components/ui/sheet";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { Loader2, TrendingDown, Store, AlertCircle, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";

type PriceHistoryItem = {
    receipt_id: string;
    receipt_date: string;
    store_name: string;
    original_name: string;
    price: number;
    quantity: number;
    effective_amount: number;
    unit_price: number;
    is_ignored: boolean;
    item_index: number;
};

interface PriceHistorySheetProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    productName: string;
    unit: string;
}

export function PriceHistorySheet({
    isOpen,
    onOpenChange,
    productName,
    unit,
}: PriceHistorySheetProps) {
    const queryClient = useQueryClient();

    const { data: history, isLoading } = useQuery({
        queryKey: ['price-history', productName, unit],
        enabled: isOpen && !!productName,
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase.rpc as any)('get_product_price_history', {
                target_mapped_name: productName,
                target_unit: unit
            });

            if (error) throw error;
            return data as PriceHistoryItem[];
        },
    });

    const toggleIgnoreMutation = useMutation({
        mutationFn: async ({ receiptId, itemIndex, currentIgnored }: { receiptId: string, itemIndex: number, currentIgnored: boolean }) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase.rpc as any)('toggle_receipt_item_ignore', {
                target_receipt_id: receiptId,
                target_item_index: itemIndex,
                set_ignored: !currentIgnored
            });

            if (error) throw error;
            return !currentIgnored;
        },
        onSuccess: (newIgnoredState) => {
            toast.success(newIgnoredState ? "Pris exkluderat från statistik" : "Pris inkluderat i statistik");
            // Invalidate both history and the main list to update stats
            queryClient.invalidateQueries({ queryKey: ['price-history'] });
            queryClient.invalidateQueries({ queryKey: ['price-comparison'] });
        },
        onError: (error) => {
            console.error('Failed to toggle ignore:', error);
            toast.error("Kunde inte uppdatera status");
        }
    });

    return (
        <Sheet open={isOpen} onOpenChange={onOpenChange}>
            <SheetContent className="w-full sm:max-w-xl overflow-hidden flex flex-col">
                <SheetHeader className="mb-4">
                    <SheetTitle className="text-xl flex items-center gap-2">
                        {productName}
                        <Badge variant="outline" className="ml-2 font-normal">
                            kr/{unit}
                        </Badge>
                    </SheetTitle>
                    <SheetDescription>
                        Historik över alla köp och enhetspriser
                    </SheetDescription>
                </SheetHeader>

                {isLoading ? (
                    <div className="flex justify-center items-center flex-1">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                ) : (
                    <ScrollArea className="flex-1 pr-4 -mr-4">
                        <div className="space-y-4 pb-8">
                            {history?.length === 0 ? (
                                <div className="text-center text-muted-foreground py-8">
                                    Ingen historik hittades.
                                </div>
                            ) : (
                                history?.map((item) => (
                                    <div
                                        key={`${item.receipt_id}-${item.item_index}`}
                                        className={`
                      p-4 rounded-lg border transition-all
                      ${item.is_ignored
                                                ? "bg-muted/50 border-muted opacity-60"
                                                : "bg-card border-border shadow-sm hover:shadow-md"
                                            }
                    `}
                                    >
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="flex items-center gap-2 font-medium">
                                                <Store className="h-4 w-4 text-primary" />
                                                {item.store_name}
                                            </div>
                                            <div className="text-sm text-muted-foreground">
                                                {format(new Date(item.receipt_date), 'd MMM yyyy', { locale: sv })}
                                            </div>
                                        </div>

                                        <div className="flex justify-between items-center mb-4">
                                            <div className="space-y-1">
                                                <div className="text-sm text-muted-foreground">
                                                    {item.original_name}
                                                </div>
                                                <div className="text-xs text-muted-foreground/80">
                                                    {item.quantity} st × {item.price} kr
                                                    {item.effective_amount !== 1 && ` (${item.effective_amount} ${unit}/st)`}
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-lg font-bold">
                                                    {item.unit_price.toFixed(2)}:-
                                                    <span className="text-xs font-normal text-muted-foreground ml-1">/{unit}</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex justify-end pt-2 border-t border-border/50">
                                            <Button
                                                variant={item.is_ignored ? "outline" : "ghost"}
                                                size="sm"
                                                className={`
                          gap-2 text-xs
                          ${item.is_ignored ? "text-muted-foreground" : "text-destructive hover:text-destructive hover:bg-destructive/10"}
                        `}
                                                onClick={() => toggleIgnoreMutation.mutate({
                                                    receiptId: item.receipt_id,
                                                    itemIndex: item.item_index,
                                                    currentIgnored: item.is_ignored
                                                })}
                                                disabled={toggleIgnoreMutation.isPending}
                                            >
                                                {toggleIgnoreMutation.isPending ? (
                                                    <Loader2 className="h-3 w-3 animate-spin" />
                                                ) : item.is_ignored ? (
                                                    <>
                                                        <Eye className="h-3 w-3" /> Inkludera i statistik
                                                    </>
                                                ) : (
                                                    <>
                                                        <EyeOff className="h-3 w-3" /> Exkludera (felaktigt pris)
                                                    </>
                                                )}
                                            </Button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </ScrollArea>
                )}
            </SheetContent>
        </Sheet>
    );
}
