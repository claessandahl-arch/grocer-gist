import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Activity, Trash2, AlertTriangle, CheckCircle, Sparkles, Clock } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export default function Diagnostics() {
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    // Fetch current user
    const { data: user } = useQuery({
        queryKey: ['current-user'],
        queryFn: async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                navigate('/auth');
                throw new Error("Not authenticated");
            }
            return user;
        }
    });

    // Fetch empty mappings count (both user and global)
    const { data: emptyMappings = [], isLoading: loadingEmptyMappings } = useQuery({
        queryKey: ['diagnostics-empty-mappings', user?.id],
        queryFn: async () => {
            if (!user) return [];

            // Fetch user mappings
            const { data: userMappings, error: userError } = await supabase
                .from('product_mappings')
                .select('*')
                .eq('user_id', user.id);

            if (userError) throw userError;

            // Fetch global mappings with empty mapped_name
            const { data: globalMappings, error: globalError } = await supabase
                .from('global_product_mappings')
                .select('*');

            if (globalError) throw globalError;

            // Combine and filter for empty or whitespace-only mapped_names
            const userEmpty = (userMappings || []).filter(m => !m.mapped_name || m.mapped_name.trim() === '').map(m => ({ ...m, source: 'user' }));
            const globalEmpty = (globalMappings || []).filter(m => !m.mapped_name || m.mapped_name.trim() === '').map(m => ({ ...m, source: 'global' }));

            return [...userEmpty, ...globalEmpty];
        },
        enabled: !!user,
    });

    // Fetch ALL user mappings for manual inspection
    const { data: allUserMappings = [], isLoading: loadingAllMappings } = useQuery({
        queryKey: ['diagnostics-all-mappings', user?.id],
        queryFn: async () => {
            if (!user) return [];
            const { data, error } = await supabase
                .from('product_mappings')
                .select('*')
                .eq('user_id', user.id)
                .order('original_name');

            if (error) throw error;
            return data;
        },
        enabled: !!user,
    });

    // Fetch recent auto-mapped products
    const { data: recentAutoMapped = [], isLoading: loadingAutoMapped } = useQuery({
        queryKey: ['diagnostics-recent-auto-mapped', user?.id],
        queryFn: async () => {
            if (!user) return [];
            const { data, error } = await supabase
                .from('product_mappings')
                .select('*')
                .eq('user_id', user.id)
                .eq('auto_mapped', true)
                .order('created_at', { ascending: false })
                .limit(50);

            if (error) throw error;
            return data;
        },
        enabled: !!user,
    });

    // Fetch receipt count
    const { data: receiptCount = 0, isLoading: loadingReceipts } = useQuery({
        queryKey: ['diagnostics-receipt-count', user?.id],
        queryFn: async () => {
            if (!user) return 0;
            const { count, error } = await supabase
                .from('receipts')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', user.id);

            if (error) throw error;
            return count || 0;
        },
        enabled: !!user,
    });

    // Mutation to delete all receipts (current user only)
    const deleteAllReceipts = useMutation({
        mutationFn: async () => {
            if (!user) throw new Error("Not authenticated");

            const { error } = await supabase
                .from('receipts')
                .delete()
                .eq('user_id', user.id);

            if (error) throw error;
        },
        onSuccess: () => {
            toast.success("Alla kvitton har raderats!");
            queryClient.invalidateQueries({ queryKey: ['diagnostics-receipt-count'] });
            queryClient.invalidateQueries({ queryKey: ['receipts-all'] });
            queryClient.invalidateQueries({ queryKey: ['receipts'] });
        },
        onError: (error) => {
            toast.error("Kunde inte radera kvitton: " + error.message);
        }
    });

    // 🔥 GOD MODE: Delete ALL receipts from ALL users
    const deleteAllReceiptsGodMode = useMutation({
        mutationFn: async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error("Not authenticated");

            const response = await supabase.functions.invoke('admin-delete-all', {
                body: { action: 'delete-all-receipts' }
            });

            if (response.error) throw response.error;
            return response.data;
        },
        onSuccess: (data) => {
            toast.success(`🔥 GOD MODE: ${data.deletedCount} kvitton raderade från alla användare!`);
            queryClient.invalidateQueries({ queryKey: ['diagnostics-receipt-count'] });
            queryClient.invalidateQueries({ queryKey: ['receipts-all'] });
            queryClient.invalidateQueries({ queryKey: ['receipts'] });
        },
        onError: (error) => {
            toast.error("God Mode misslyckades: " + error.message);
        }
    });

    // Mutation to delete a single mapping by ID
    const deleteSingleMapping = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase
                .from('product_mappings')
                .delete()
                .eq('id', id);
            if (error) throw error;
        },
        onSuccess: () => {
            toast.success("Koppling borttagen");
            queryClient.invalidateQueries({ queryKey: ['diagnostics-empty-mappings'] });
            queryClient.invalidateQueries({ queryKey: ['diagnostics-all-mappings'] });
            queryClient.invalidateQueries({ queryKey: ['user-product-mappings'] });
        },
        onError: (error) => {
            toast.error("Kunde inte ta bort: " + error.message);
        }
    });



    // Mutation to delete empty mappings
    const deleteEmptyMappings = useMutation({
        mutationFn: async () => {
            if (!user) throw new Error("Not authenticated");

            if (emptyMappings.length === 0) return;

            // Separate user and global mappings
            const userIds = emptyMappings.filter((m: any) => m.source === 'user').map(m => m.id);
            const globalIds = emptyMappings.filter((m: any) => m.source === 'global').map(m => m.id);

            // Delete user mappings
            if (userIds.length > 0) {
                const { error: userError } = await supabase
                    .from('product_mappings')
                    .delete()
                    .in('id', userIds);

                if (userError) throw userError;
            }

            // Delete global mappings
            if (globalIds.length > 0) {
                const { error: globalError } = await supabase
                    .from('global_product_mappings')
                    .delete()
                    .in('id', globalIds);

                if (globalError) throw globalError;
            }
        },
        onSuccess: () => {
            toast.success("Tomma kopplingar har rensats bort!");
            queryClient.invalidateQueries({ queryKey: ['diagnostics-empty-mappings'] });
            queryClient.invalidateQueries({ queryKey: ['user-product-mappings'] });
            queryClient.invalidateQueries({ queryKey: ['global-product-mappings'] });
        },
        onError: (error) => {
            console.error("Cleanup error:", error);
            toast.error("Kunde inte rensa kopplingar: " + error.message);
        }
    });

    return (
        <div className="min-h-screen bg-gradient-subtle">
            <div className="container mx-auto px-4 py-8">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-4">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => navigate('/dashboard')}
                        >
                            <ArrowLeft className="h-4 w-4 mr-2" />
                            Tillbaka
                        </Button>
                        <div className="flex items-center gap-2">
                            <Activity className="h-6 w-6 text-primary" />
                            <h1 className="text-3xl font-bold text-foreground">Systemdiagnostik</h1>
                        </div>
                    </div>
                </div>

                <div className="grid gap-6">
                    {/* Cleanup Tool Card */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Trash2 className="h-5 w-5 text-orange-500" />
                                Städverktyg
                            </CardTitle>
                            <CardDescription>
                                Verktyg för att rensa upp felaktig eller gammal data.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center justify-between p-4 border rounded-lg bg-card/50">
                                <div className="space-y-1">
                                    <h3 className="font-medium">Rensa tomma kopplingar</h3>
                                    <p className="text-sm text-muted-foreground">
                                        Tar bort produkt kopplingar (både personliga och globala) som saknar gruppnamn. Dessa visas som "Ungrouped Products" även efter att kvitton raderats.
                                    </p>
                                    {loadingEmptyMappings ? (
                                        <p className="text-xs text-muted-foreground">Laddar status...</p>
                                    ) : (
                                        <div className="flex items-center gap-2 mt-2">
                                            {emptyMappings.length > 0 ? (
                                                <span className="text-sm font-medium text-orange-600 flex items-center gap-1">
                                                    <AlertTriangle className="h-3 w-3" />
                                                    {emptyMappings.length} felaktiga kopplingar hittades
                                                </span>
                                            ) : (
                                                <span className="text-sm font-medium text-green-600 flex items-center gap-1">
                                                    <CheckCircle className="h-3 w-3" />
                                                    Systemet är rent (0 felaktiga kopplingar)
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>

                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <Button
                                            variant="destructive"
                                            disabled={loadingEmptyMappings || emptyMappings.length === 0 || deleteEmptyMappings.isPending}
                                        >
                                            {deleteEmptyMappings.isPending ? "Rensar..." : "Rensa nu"}
                                        </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>Är du säker?</AlertDialogTitle>
                                            <AlertDialogDescription>
                                                Detta kommer att permanent radera {emptyMappings.length} produktkopplingar som saknar gruppnamn.
                                                Detta går inte att ångra, men det påverkar inte dina kvitton eller korrekta grupper.
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel>Avbryt</AlertDialogCancel>
                                            <AlertDialogAction onClick={() => deleteEmptyMappings.mutate()}>
                                                Ja, rensa bort dem
                                            </AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            </div>

                            {/* Receipt Count Check */}
                            <div className="flex items-center justify-between p-4 border rounded-lg bg-card/50 mt-4">
                                <div className="space-y-1">
                                    <h3 className="font-medium">Radera alla kvitton</h3>
                                    <p className="text-sm text-muted-foreground">
                                        Raderar alla dina kvitton. Produktkopplingar påverkas inte.
                                    </p>
                                    <div className="flex items-center gap-2 mt-2">
                                        {loadingReceipts ? (
                                            <p className="text-xs text-muted-foreground">Laddar...</p>
                                        ) : receiptCount > 0 ? (
                                            <span className="text-sm font-medium text-orange-600 flex items-center gap-1">
                                                <AlertTriangle className="h-3 w-3" />
                                                {receiptCount} kvitton finns i databasen
                                            </span>
                                        ) : (
                                            <span className="text-sm font-medium text-green-600 flex items-center gap-1">
                                                <CheckCircle className="h-3 w-3" />
                                                0 kvitton (Systemet är tomt)
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <Button
                                            variant="destructive"
                                            disabled={loadingReceipts || receiptCount === 0 || deleteAllReceipts.isPending}
                                        >
                                            {deleteAllReceipts.isPending ? "Raderar..." : "Radera alla"}
                                        </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>Radera alla kvitton?</AlertDialogTitle>
                                            <AlertDialogDescription>
                                                Detta kommer att permanent radera {receiptCount} kvitton från databasen.
                                                Detta går inte att ångra.
                                                <br /><br />
                                                <strong>OBS:</strong> Dina produktkopplingar bevaras (så du inte förlorar ditt grupperingsarbete),
                                                men produkter från raderade kvitton kommer att visas som "ungrouped" i ProductManagement tills du tar bort kopplingsarna manuellt.
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel>Avbryt</AlertDialogCancel>
                                            <AlertDialogAction onClick={() => deleteAllReceipts.mutate()}>
                                                Ja, radera allt
                                            </AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                            </div>

                            {/* 🔥 GOD MODE: Delete ALL receipts from ALL users */}
                            <div className="flex items-center justify-between p-4 border-2 border-red-500 rounded-lg bg-red-950/20 mt-4">
                                <div className="space-y-1">
                                    <h3 className="font-medium text-red-400 flex items-center gap-2">
                                        🔥 GOD MODE: Radera ALLA kvitton
                                    </h3>
                                    <p className="text-sm text-muted-foreground">
                                        Raderar alla kvitton från <strong>ALLA användare</strong> i hela systemet.
                                        Använd detta för att börja helt från början efter uppdateringar.
                                    </p>
                                    <p className="text-xs text-red-400 mt-1">
                                        ⚠️ Detta påverkar alla användare, inte bara dig!
                                    </p>
                                </div>

                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <Button
                                            variant="destructive"
                                            className="bg-red-600 hover:bg-red-700"
                                            disabled={deleteAllReceiptsGodMode.isPending}
                                        >
                                            {deleteAllReceiptsGodMode.isPending ? "🔥 Raderar..." : "🔥 GOD MODE"}
                                        </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent className="border-red-500">
                                        <AlertDialogHeader>
                                            <AlertDialogTitle className="text-red-500">🔥 GOD MODE: Radera ALLT?</AlertDialogTitle>
                                            <AlertDialogDescription>
                                                <span className="text-red-400 font-bold">VARNING!</span> Detta kommer att permanent radera 
                                                ALLA kvitton från ALLA användare i hela systemet.
                                                <br /><br />
                                                Detta går inte att ångra. Produktkopplingar och inställningar bevaras.
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel>Avbryt</AlertDialogCancel>
                                            <AlertDialogAction 
                                                className="bg-red-600 hover:bg-red-700"
                                                onClick={() => deleteAllReceiptsGodMode.mutate()}
                                            >
                                                🔥 Ja, radera ALLT
                                            </AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            </div>

                            {/* Corrupted Categories Tool (Migrated from old DiagnosticTool) */}
                            <div className="flex items-center justify-between p-4 border rounded-lg bg-card/50 mt-4">
                                <div className="space-y-1">
                                    <h3 className="font-medium">Korrupta kategorier</h3>
                                    <p className="text-sm text-muted-foreground">
                                        Hittar produkter som har flera kategorier (kommatecken i fältet), vilket kan ställa till det för statistiken.
                                    </p>
                                    <div className="flex items-center gap-2 mt-2">
                                        <span className="text-sm font-medium text-blue-600 flex items-center gap-1">
                                            <CheckCircle className="h-3 w-3" />
                                            Funktionalitet kommer snart (migreras)
                                        </span>
                                    </div>
                                </div>
                                <Button variant="outline" disabled>
                                    Kommer snart
                                </Button>
                            </div>

                            {/* Recent Auto-Mapped Products */}
                            <div className="mt-8 pt-8 border-t">
                                <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
                                    <Sparkles className="h-5 w-5 text-purple-500" />
                                    Senaste AI-mappningar
                                </h3>
                                <p className="text-sm text-muted-foreground mb-4">
                                    Produkter som automatiskt mappats av AI (senaste 50).
                                </p>
                                {loadingAutoMapped ? (
                                    <p className="text-sm text-muted-foreground">Laddar...</p>
                                ) : recentAutoMapped.length === 0 ? (
                                    <div className="text-center py-8 text-muted-foreground">
                                        <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                        <p>Inga AI-mappade produkter ännu.</p>
                                        <p className="text-xs mt-1">Ladda upp ett kvitto eller använd "Mappa alla automatiskt" i Produkthantering.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                            <CheckCircle className="h-4 w-4 text-green-500" />
                                            <span>{recentAutoMapped.length} AI-mappade produkter</span>
                                        </div>
                                        <div className="border rounded-md overflow-hidden max-h-[400px] overflow-y-auto">
                                            <table className="w-full text-sm text-left">
                                                <thead className="bg-muted sticky top-0">
                                                    <tr>
                                                        <th className="p-2">Originalnamn</th>
                                                        <th className="p-2">Grupp</th>
                                                        <th className="p-2">Kategori</th>
                                                        <th className="p-2">Tid</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y">
                                                    {recentAutoMapped.map((m) => (
                                                        <tr key={m.id} className="hover:bg-muted/50">
                                                            <td className="p-2 font-medium">{m.original_name}</td>
                                                            <td className="p-2">
                                                                <Badge variant="secondary">{m.mapped_name}</Badge>
                                                            </td>
                                                            <td className="p-2 text-xs text-muted-foreground">
                                                                {m.category || '-'}
                                                            </td>
                                                            <td className="p-2 text-xs text-muted-foreground">
                                                                <span className="flex items-center gap-1">
                                                                    <Clock className="h-3 w-3" />
                                                                    {new Date(m.created_at).toLocaleString('sv-SE', {
                                                                        month: 'short',
                                                                        day: 'numeric',
                                                                        hour: '2-digit',
                                                                        minute: '2-digit'
                                                                    })}
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Raw Data Inspector */}
                            <div className="mt-8 pt-8 border-t">
                                <h3 className="text-lg font-semibold mb-4">Manuell Inspektion (Raw Data)</h3>
                                <p className="text-sm text-muted-foreground mb-4">
                                    Här visas ALLA dina personliga produktkopplingar direkt från databasen.
                                    Om du ser produkter här som du vill ta bort, klicka på soptunnan.
                                </p>

                                {loadingAllMappings ? (
                                    <p>Laddar...</p>
                                ) : (
                                    <div className="border rounded-md overflow-hidden">
                                        <table className="w-full text-sm text-left">
                                            <thead className="bg-muted">
                                                <tr>
                                                    <th className="p-2">Originalnamn</th>
                                                    <th className="p-2">Mappat namn (Grupp)</th>
                                                    <th className="p-2">Åtgärd</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y">
                                                {allUserMappings.map((m) => (
                                                    <tr key={m.id} className="hover:bg-muted/50">
                                                        <td className="p-2 font-medium">{m.original_name}</td>
                                                        <td className="p-2 font-mono text-xs">
                                                            {m.mapped_name === null ? 'NULL' : `"${m.mapped_name}"`}
                                                        </td>
                                                        <td className="p-2">
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-100"
                                                                onClick={() => {
                                                                    if (confirm(`Ta bort "${m.original_name}" permanent?`)) {
                                                                        deleteSingleMapping.mutate(m.id);
                                                                    }
                                                                }}
                                                            >
                                                                <Trash2 className="h-4 w-4" />
                                                            </Button>
                                                        </td>
                                                    </tr>
                                                ))}
                                                {allUserMappings.length === 0 && (
                                                    <tr>
                                                        <td colSpan={3} className="p-4 text-center text-muted-foreground">
                                                            Inga personliga kopplingar hittades.
                                                        </td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
