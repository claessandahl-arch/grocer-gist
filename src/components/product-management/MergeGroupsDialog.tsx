import { useState, useMemo, useEffect } from "react";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Info, Search } from "lucide-react";
import { toast } from "sonner";

type ProductGroup = {
  name: string;
  products: { id: string; user_id: string | null }[];
  categories: Set<string>;
  types: Set<string>;
  totalPurchases: number;
  totalAmount: number;
};

interface MergeGroupsDialogProps {
  sourceGroup: ProductGroup | null;
  allGroups: ProductGroup[];
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function MergeGroupsDialog({
  sourceGroup,
  allGroups,
  open,
  onClose,
  onSuccess,
}: MergeGroupsDialogProps) {
  const [selectedTargetGroup, setSelectedTargetGroup] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const queryClient = useQueryClient();

  // Reset state when dialog opens with a new source group
  useEffect(() => {
    if (open && sourceGroup) {
      setSelectedTargetGroup("");
      setSearchQuery("");
    }
  }, [open, sourceGroup]);

  // Reset state when dialog closes
  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setSelectedTargetGroup("");
      setSearchQuery("");
      onClose();
    }
  };

  // Filter available groups (exclude source group and apply search)
  const availableGroups = useMemo(() => {
    if (!sourceGroup) return [];

    return allGroups
      .filter((g) => g.name !== sourceGroup.name)
      .filter((g) =>
        g.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
      .sort((a, b) => a.name.localeCompare(b.name, "sv"));
  }, [allGroups, sourceGroup, searchQuery]);

  const mergeMutation = useMutation({
    mutationFn: async ({
      sourceGroupName,
      targetGroupName,
      sourceProducts,
    }: {
      sourceGroupName: string;
      targetGroupName: string;
      sourceProducts: { id: string; user_id: string | null }[];
    }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Check if source group has any Global products
      const hasGlobalProducts = sourceProducts.some((p) => !p.user_id);
      if (hasGlobalProducts) {
        throw new Error(
          "Kan inte kombinera Global produktgrupper. Endast personliga grupper kan kombineras."
        );
      }

      // Get all user product IDs from source group
      const userProductIds = sourceProducts
        .filter((p) => p.user_id)
        .map((p) => p.id);

      if (userProductIds.length === 0) {
        throw new Error("Källgruppen har inga produkter att flytta");
      }

      // Update all user products to target group's name
      const { error: updateError } = await supabase
        .from("product_mappings")
        .update({ mapped_name: targetGroupName })
        .eq("user_id", user.id)
        .in("id", userProductIds);

      if (updateError) throw updateError;

      return { movedCount: userProductIds.length };
    },
    onSuccess: (data, variables) => {
      // Invalidate queries to refresh the UI
      queryClient.invalidateQueries({ queryKey: ["product-groups"] });
      queryClient.invalidateQueries({ queryKey: ["product-mappings"] });
      queryClient.invalidateQueries({ queryKey: ["receipts-all"] });

      toast.success(
        `${variables.sourceGroupName} kombinerad med ${variables.targetGroupName}. ${data.movedCount} produkt${data.movedCount !== 1 ? "er" : ""} flyttade.`
      );

      onSuccess();
    },
    onError: (error) => {
      toast.error(`Kunde inte kombinera grupper: ${(error as Error).message}`);
    },
  });

  const handleMerge = () => {
    if (!sourceGroup || !selectedTargetGroup) return;

    mergeMutation.mutate({
      sourceGroupName: sourceGroup.name,
      targetGroupName: selectedTargetGroup,
      sourceProducts: sourceGroup.products,
    });
  };

  if (!sourceGroup) return null;

  const selectedGroup = availableGroups.find((g) => g.name === selectedTargetGroup);
  const isSourceGlobal = sourceGroup.types.has("global") && !sourceGroup.types.has("user");
  const isTargetGlobal = selectedGroup?.types.has("global") && !selectedGroup?.types.has("user");

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Kombinera produktgrupper</DialogTitle>
          <DialogDescription>
            Du kombinerar: <strong>{sourceGroup.name}</strong> (
            {sourceGroup.products.length} produkt
            {sourceGroup.products.length !== 1 ? "er" : ""})
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
          {/* Search Field */}
          <div>
            <Label htmlFor="search">Välj produktgrupp att kombinera med:</Label>
            <div className="relative mt-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="search"
                placeholder="Sök produktgrupp..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {/* Available Groups List */}
          <div className="flex-1 overflow-hidden flex flex-col">
            <Label className="mb-2">
              Tillgängliga produktgrupper ({availableGroups.length}):
            </Label>
            <RadioGroup
              value={selectedTargetGroup}
              onValueChange={setSelectedTargetGroup}
              className="flex-1 overflow-y-auto border rounded-md p-2 space-y-1"
            >
              {availableGroups.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {searchQuery ? (
                    <p>Inga produktgrupper matchade din sökning</p>
                  ) : (
                    <p>Inga andra produktgrupper tillgängliga</p>
                  )}
                </div>
              ) : (
                availableGroups.map((group) => {
                  const isPersonal = group.types.has("user");
                  return (
                    <div
                      key={group.name}
                      className="flex items-center space-x-3 p-3 hover:bg-accent rounded-md transition-colors"
                    >
                      <RadioGroupItem value={group.name} id={group.name} />
                      <Label
                        htmlFor={group.name}
                        className="flex-1 cursor-pointer flex items-center justify-between"
                      >
                        <span className="font-medium">
                          {group.name}{" "}
                          <span className="text-muted-foreground font-normal">
                            ({group.products.length} produkt
                            {group.products.length !== 1 ? "er" : ""})
                          </span>
                        </span>
                        <Badge variant={isPersonal ? "outline" : "default"}>
                          {isPersonal ? "Personlig" : "Global"}
                        </Badge>
                      </Label>
                    </div>
                  );
                })
              )}
            </RadioGroup>
          </div>

          {/* Warning Messages */}
          <div className="space-y-2">
            {/* Main warning */}
            <Alert className="bg-orange-500/10 border-orange-500/20">
              <AlertCircle className="h-4 w-4 text-orange-500" />
              <AlertDescription className="text-orange-700 dark:text-orange-400">
                <strong>OBS:</strong> Efter kombinering kommer "
                {sourceGroup.name}" att försvinna och alla dess produkter flyttas
                till den valda gruppen.
              </AlertDescription>
            </Alert>

            {/* Global source warning */}
            {isSourceGlobal && (
              <Alert className="bg-red-500/10 border-red-500/20">
                <AlertCircle className="h-4 w-4 text-red-500" />
                <AlertDescription className="text-red-700 dark:text-red-400">
                  <strong>VARNING:</strong> Du kan inte kombinera Global
                  produktgrupper. Endast personliga grupper kan kombineras.
                </AlertDescription>
              </Alert>
            )}

            {/* Info about combining with Global group */}
            {selectedTargetGroup && isTargetGlobal && !isSourceGlobal && (
              <Alert className="bg-blue-500/10 border-blue-500/20">
                <Info className="h-4 w-4 text-blue-500" />
                <AlertDescription className="text-blue-700 dark:text-blue-400">
                  <strong>INFO:</strong> Du kombinerar med en Global grupp. Dina
                  produkter kommer att visas under det nya gruppnamnet men behålla
                  sin personliga karaktär.
                </AlertDescription>
              </Alert>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={mergeMutation.isPending}
          >
            Avbryt
          </Button>
          <Button
            onClick={handleMerge}
            disabled={
              !selectedTargetGroup || isSourceGlobal || mergeMutation.isPending
            }
          >
            {mergeMutation.isPending ? "Kombinerar..." : "Kombinera grupper"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
