import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { toast } from "sonner";

type ProductGroup = {
  name: string;
  products: { id: string; user_id: string | null; original_name: string }[];
  categories: Set<string>;
  types: Set<string>;
  totalPurchases: number;
  totalAmount: number;
};

interface RenameGroupDialogProps {
  group: ProductGroup | null;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function RenameGroupDialog({
  group,
  open,
  onClose,
  onSuccess,
}: RenameGroupDialogProps) {
  const [newName, setNewName] = useState("");
  const queryClient = useQueryClient();

  // Update input field whenever group changes or dialog opens
  useEffect(() => {
    if (open && group) {
      setNewName(group.name);
    }
  }, [group, open]);

  // Handle dialog close
  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      onClose();
    }
  };

  const renameMutation = useMutation({
    mutationFn: async ({
      oldName,
      newName,
      products,
    }: {
      oldName: string;
      newName: string;
      products: { id: string; user_id: string | null }[];
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Separate user and global products
      const userProducts = products.filter((p) => p.user_id);
      const globalProducts = products.filter((p) => !p.user_id);

      let userUpdateSuccess = false;
      let globalUpdateSuccess = false;
      const errors: string[] = [];

      // Update user-specific mappings if any exist
      if (userProducts.length > 0) {
        const { error: userError } = await supabase
          .from("product_mappings")
          .update({ mapped_name: newName })
          .eq("user_id", user.id)
          .eq("mapped_name", oldName);

        if (userError) {
          errors.push(`Användar-mappningar: ${userError.message}`);
        } else {
          userUpdateSuccess = true;
        }
      }

      // Update global mappings if any exist
      if (globalProducts.length > 0) {
        const { data, error: globalError } = await supabase
          .from("global_product_mappings")
          .update({ mapped_name: newName })
          .eq("mapped_name", oldName)
          .select();

        if (globalError) {
          errors.push(`Globala mappningar: ${globalError.message}`);
        } else if (!data || data.length === 0) {
          errors.push(
            `Globala mappningar: Ingen behörighet att uppdatera (RLS blockerade)`
          );
        } else {
          globalUpdateSuccess = true;
        }
      }

      // If we had errors, throw them
      if (errors.length > 0) {
        throw new Error(errors.join("; "));
      }

      return {
        userUpdateSuccess,
        globalUpdateSuccess,
        userCount: userProducts.length,
        globalCount: globalProducts.length,
      };
    },
    onSuccess: (result, variables) => {
      // Invalidate queries to refresh the UI
      queryClient.invalidateQueries({ queryKey: ["product-groups"] });
      queryClient.invalidateQueries({ queryKey: ["product-mappings"] });
      queryClient.invalidateQueries({ queryKey: ["receipts-all"] });

      // Show appropriate success message
      if (result.userUpdateSuccess && result.globalUpdateSuccess) {
        toast.success(
          `Produktgrupp omdöpt till "${variables.newName}" (${result.userCount} användar + ${result.globalCount} globala)`
        );
      } else if (result.userUpdateSuccess) {
        toast.success(
          `Produktgrupp omdöpt till "${variables.newName}" (${result.userCount} mappningar)`
        );
      } else if (result.globalUpdateSuccess) {
        toast.success(
          `Produktgrupp omdöpt till "${variables.newName}" (${result.globalCount} globala mappningar)`
        );
      }

      onSuccess();
    },
    onError: (error) => {
      toast.error(`Kunde inte byta namn: ${(error as Error).message}`);
    },
  });

  const handleRename = () => {
    if (!group) return;

    const trimmedName = newName.trim();

    // Validation
    if (!trimmedName) {
      toast.error("Gruppnamn får inte vara tomt");
      return;
    }

    if (trimmedName === group.name) {
      toast.error("Nytt namn är samma som det nuvarande namnet");
      return;
    }

    // Execute rename
    renameMutation.mutate({
      oldName: group.name,
      newName: trimmedName,
      products: group.products,
    });
  };

  if (!group) return null;

  const isGlobalGroup = group.types.has("global") && !group.types.has("user");
  const isMixedGroup = group.types.has("global") && group.types.has("user");

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Byt namn på produktgrupp</DialogTitle>
          <DialogDescription>
            Ändra namnet på produktgruppen och dess tillhörande produkter
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Current Name */}
          <div>
            <Label className="text-muted-foreground">Nuvarande namn:</Label>
            <p className="font-semibold mt-1">{group.name}</p>
          </div>

          {/* New Name Input */}
          <div>
            <Label htmlFor="new-name">Nytt namn:</Label>
            <Input
              id="new-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Ange nytt namn..."
              className="mt-1"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleRename();
                }
              }}
            />
          </div>

          {/* Products in Group */}
          <div>
            <Label>Produkter i denna grupp ({group.products.length}):</Label>
            <ul className="list-disc pl-5 text-sm text-muted-foreground mt-1 max-h-32 overflow-y-auto">
              {group.products.map((p) => (
                <li key={p.id}>{p.original_name}</li>
              ))}
            </ul>
          </div>

          {/* Warning for Global Groups */}
          {isGlobalGroup && (
            <Alert className="bg-orange-500/10 border-orange-500/20">
              <AlertCircle className="h-4 w-4 text-orange-500" />
              <AlertDescription className="text-orange-700 dark:text-orange-400">
                <strong>OBS:</strong> Detta är en Global produktgrupp. Ditt
                namnbyte kommer att påverka <strong>alla användare</strong> som
                använder denna grupp.
              </AlertDescription>
            </Alert>
          )}

          {/* Warning for Mixed Groups */}
          {isMixedGroup && (
            <Alert className="bg-blue-500/10 border-blue-500/20">
              <AlertCircle className="h-4 w-4 text-blue-500" />
              <AlertDescription className="text-blue-700 dark:text-blue-400">
                <strong>OBS:</strong> Denna grupp innehåller både personliga och
                globala produkter. Namnbytet kommer att påverka alla produkter i
                gruppen.
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={renameMutation.isPending}>
            Avbryt
          </Button>
          <Button
            onClick={handleRename}
            disabled={!newName.trim() || renameMutation.isPending}
          >
            {renameMutation.isPending ? "Sparar..." : "Spara ändringar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
