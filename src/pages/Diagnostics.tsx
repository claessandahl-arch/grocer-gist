import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Activity, Trash2, AlertTriangle, CheckCircle } from "lucide-react";
import { toast } from "sonner";
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

    // Fetch empty mappings count
    const { data: emptyMappings = [], isLoading: loadingEmptyMappings } = useQuery({
        queryKey: ['diagnostics-empty-mappings', user?.id],
        queryFn: async () => {
            if (!user) return [];

            // Find mappings where mapped_name is null or empty string
            const { data, error } = await supabase
                .from('product_mappings')
                .select('*')
                .eq('user_id', user.id)
                .or('mapped_name.is.null,mapped_name.eq.""');

            if (error) throw error;
            return data;
        },
        enabled: !!user,
    });

    // Mutation to delete empty mappings
    const deleteEmptyMappings = useMutation({
        mutationFn: async () => {
            if (!user) throw new Error("Not authenticated");

            const { error } = await supabase
                .from('product_mappings')
                .delete()
                .eq('user_id', user.id)
                .or('mapped_name.is.null,mapped_name.eq.""');

            if (error) throw error;
        },
        onSuccess: () => {
            toast.success("Tomma kopplingar har rensats bort!");
            queryClient.invalidateQueries({ queryKey: ['diagnostics-empty-mappings'] });
            // Also invalidate product management queries to reflect changes there
            queryClient.invalidateQueries({ queryKey: ['user-product-mappings'] });
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
                                        Tar bort produktkopplingar som saknar gruppnamn. Dessa visas ofta som "Ungrouped Products" även efter att kvitton raderats.
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
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
