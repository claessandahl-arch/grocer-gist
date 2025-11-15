import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { ArrowLeft, Save, Trash2, RefreshCw } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProductMerge } from "@/components/dashboard/ProductMerge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { categories, categoryNames } from "@/lib/categoryConstants";
import { logger } from "@/lib/logger";

interface Receipt {
  id: string;
  store_name: string;
  total_amount: number;
  receipt_date: string;
  items: any;
  image_url: string;
}

interface ReceiptItem {
  name: string;
  price: number;
  quantity: number;
  category: string;
  discount?: number;
}

export default function Training() {
  const navigate = useNavigate();
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [selectedReceipt, setSelectedReceipt] = useState<Receipt | null>(null);
  const [editedData, setEditedData] = useState<any>(null);
  const [correctionNotes, setCorrectionNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [monthToDelete, setMonthToDelete] = useState<{ key: string; receipts: Receipt[] } | null>(null);
  const [isDeletingMonth, setIsDeletingMonth] = useState(false);

  useEffect(() => {
    checkAuth();
    fetchReceipts();
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate('/auth');
    }
  };

  const fetchReceipts = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) return;

    const { data, error } = await supabase
      .from('receipts')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      toast.error('Failed to load receipts');
      logger.error(error);
    } else {
      setReceipts(data || []);
    }
    setLoading(false);
  };

  const handleSelectReceipt = (receipt: Receipt) => {
    setSelectedReceipt(receipt);
    setEditedData({
      store_name: receipt.store_name,
      total_amount: receipt.total_amount,
      receipt_date: receipt.receipt_date,
      items: receipt.items || []
    });
    setCorrectionNotes("");
  };

  const updateItem = (index: number, field: string, value: any) => {
    const newItems = [...editedData.items];
    newItems[index] = { ...newItems[index], [field]: value };
    setEditedData({ ...editedData, items: newItems });
  };

  const addItem = () => {
    setEditedData({
      ...editedData,
      items: [...editedData.items, { name: '', price: 0, quantity: 1, category: 'other', discount: 0 }]
    });
  };

  const removeItem = (index: number) => {
    const newItems = editedData.items.filter((_: any, i: number) => i !== index);
    setEditedData({ ...editedData, items: newItems });
  };

  const saveCorrection = async () => {
    if (!selectedReceipt || !editedData) return;
    
    logger.debug('Saving correction with data:', editedData);

    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      toast.error('You must be logged in');
      setSaving(false);
      return;
    }

    // Save correction to database
    const { error: correctionError } = await supabase
      .from('receipt_corrections')
      .insert({
        receipt_id: selectedReceipt.id,
        user_id: user.id,
        original_data: {
          store_name: selectedReceipt.store_name,
          total_amount: selectedReceipt.total_amount,
          receipt_date: selectedReceipt.receipt_date,
          items: selectedReceipt.items
        },
        corrected_data: editedData,
        correction_notes: correctionNotes
      });

    if (correctionError) {
      toast.error('Failed to save correction');
      logger.error(correctionError);
      setSaving(false);
      return;
    }

    // Update the receipt with corrected data
    const { error: updateError } = await supabase
      .from('receipts')
      .update({
        store_name: editedData.store_name,
        total_amount: editedData.total_amount,
        receipt_date: editedData.receipt_date,
        items: editedData.items
      })
      .eq('id', selectedReceipt.id);

    if (updateError) {
      toast.error('Failed to update receipt');
      logger.error(updateError);
      setSaving(false);
      return;
    }

    // Update store pattern
    await updateStorePattern(editedData.store_name, editedData);

    toast.success('Correction saved successfully!');
    setSaving(false);
    fetchReceipts();
    setSelectedReceipt(null);
    setEditedData(null);
  };

  const updateStorePattern = async (storeName: string, data: any) => {
    // Fetch existing pattern or create new one
    const { data: existingPattern, error } = await supabase
      .from('store_patterns')
      .select('*')
      .eq('store_name', storeName)
      .maybeSingle();
    
    if (error) {
      logger.error('Error fetching store pattern:', error);
    }

    const patternData = {
      item_patterns: data.items.map((item: ReceiptItem) => ({
        category: item.category,
        name_pattern: item.name.toLowerCase()
      })),
      last_updated: new Date().toISOString()
    };

    if (existingPattern) {
      logger.debug('Updating existing pattern for:', storeName);
      const { error: updateError } = await supabase
        .from('store_patterns')
        .update({
          pattern_data: patternData,
          usage_count: existingPattern.usage_count + 1
        })
        .eq('store_name', storeName);
      
      if (updateError) {
        logger.error('Error updating store pattern:', updateError);
        toast.error('Kunde inte uppdatera inlärningsmönster');
      } else {
        logger.debug('Store pattern updated successfully');
      }
    } else {
      logger.debug('Creating new pattern for:', storeName);
      const { error: insertError } = await supabase
        .from('store_patterns')
        .insert({
          store_name: storeName,
          pattern_data: patternData,
          usage_count: 1
        });
      
      if (insertError) {
        logger.error('Error inserting store pattern:', insertError);
        toast.error('Kunde inte spara inlärningsmönster');
      } else {
        logger.debug('Store pattern created successfully');
      }
    }
  };

  const groupReceiptsByMonth = (receipts: Receipt[]) => {
    const grouped: Record<string, Receipt[]> = {};
    
    receipts.forEach(receipt => {
      const date = new Date(receipt.receipt_date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      if (!grouped[monthKey]) {
        grouped[monthKey] = [];
      }
      grouped[monthKey].push(receipt);
    });
    
    // Sort receipts within each month
    Object.keys(grouped).forEach(key => {
      grouped[key].sort((a, b) => 
        new Date(b.receipt_date).getTime() - new Date(a.receipt_date).getTime()
      );
    });
    
    return grouped;
  };

  const formatMonthYear = (monthKey: string) => {
    const [year, month] = monthKey.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString('sv-SE', { year: 'numeric', month: 'long' });
  };

  const calculateMonthTotal = (receipts: Receipt[]) => {
    return receipts.reduce((sum, receipt) => sum + (receipt.total_amount || 0), 0);
  };

  const deleteReceipt = async (receipt: Receipt) => {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      toast.error('Du måste vara inloggad');
      return;
    }

    // Delete the receipt from database
    const { error: deleteError } = await supabase
      .from('receipts')
      .delete()
      .eq('id', receipt.id)
      .eq('user_id', user.id);

    if (deleteError) {
      toast.error('Kunde inte ta bort kvittot');
      logger.error(deleteError);
      return;
    }

    // Delete the image from storage
    if (receipt.image_url) {
      const imagePath = receipt.image_url.split('/receipts/')[1];
      if (imagePath) {
        await supabase.storage.from('receipts').remove([imagePath]);
      }
    }

    toast.success('Kvitto borttaget');
    fetchReceipts();
    if (selectedReceipt?.id === receipt.id) {
      setSelectedReceipt(null);
      setEditedData(null);
    }
  };

  const deleteAllReceiptsForMonth = async (receipts: Receipt[]) => {
    setIsDeletingMonth(true);
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      toast.error('Du måste vara inloggad');
      setIsDeletingMonth(false);
      return;
    }

    let successCount = 0;
    let failCount = 0;

    // Delete each receipt
    for (const receipt of receipts) {
      // Delete from database
      const { error: deleteError } = await supabase
        .from('receipts')
        .delete()
        .eq('id', receipt.id)
        .eq('user_id', user.id);

      if (deleteError) {
        logger.error('Failed to delete receipt:', receipt.id, deleteError);
        failCount++;
        continue;
      }

      // Delete image from storage
      if (receipt.image_url) {
        const imagePath = receipt.image_url.split('/receipts/')[1];
        if (imagePath) {
          await supabase.storage.from('receipts').remove([imagePath]);
        }
      }

      successCount++;
    }

    // Show results
    if (successCount > 0) {
      toast.success(`${successCount} kvitton borttagna`);
    }
    if (failCount > 0) {
      toast.error(`${failCount} kvitton kunde inte tas bort`);
    }

    // Refresh and cleanup
    fetchReceipts();
    if (selectedReceipt && receipts.some(r => r.id === selectedReceipt.id)) {
      setSelectedReceipt(null);
      setEditedData(null);
    }
    
    setMonthToDelete(null);
    setIsDeletingMonth(false);
  };

  const groupedReceipts = groupReceiptsByMonth(receipts);
  const sortedMonthKeys = Object.keys(groupedReceipts).sort((a, b) => b.localeCompare(a));

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 p-6">
      <div className="max-w-7xl mx-auto">
        <Button
          variant="ghost"
          onClick={() => navigate('/dashboard')}
          className="mb-6"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Dashboard
        </Button>

        <Tabs defaultValue="receipts" className="space-y-6">
          <TabsList>
            <TabsTrigger value="receipts">Kvitton</TabsTrigger>
            <TabsTrigger value="products">Produkter</TabsTrigger>
          </TabsList>

          <TabsContent value="receipts" className="space-y-0">
            <div className="grid md:grid-cols-3 gap-6">
              {/* Receipt List */}
          <Card>
            <CardHeader>
              <CardTitle>Your Receipts</CardTitle>
              <CardDescription>Select a receipt to review and correct</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {loading ? (
                <p className="text-sm text-muted-foreground">Loading...</p>
              ) : receipts.length === 0 ? (
                <p className="text-sm text-muted-foreground">No receipts found</p>
              ) : (
                <Accordion type="multiple" defaultValue={[sortedMonthKeys[0]]} className="w-full">
                  {sortedMonthKeys.map((monthKey) => {
                    const monthReceipts = groupedReceipts[monthKey];
                    const monthTotal = calculateMonthTotal(monthReceipts);
                    
                    return (
                      <AccordionItem key={monthKey} value={monthKey}>
                        <AccordionTrigger className="hover:no-underline">
                          <div className="flex justify-between items-center w-full pr-4">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold capitalize">
                                {formatMonthYear(monthKey)}
                              </span>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setMonthToDelete({ key: monthKey, receipts: monthReceipts });
                                }}
                                className="text-destructive hover:text-destructive hover:bg-destructive/10 h-7 px-2"
                              >
                                <Trash2 className="h-4 w-4 mr-1" />
                                Ta bort alla
                              </Button>
                            </div>
                            <span className="text-sm text-muted-foreground">
                              {monthReceipts.length} kvitton • {monthTotal.toFixed(2)} kr
                            </span>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="space-y-2 pt-2">
                            {monthReceipts.map((receipt) => (
                              <div key={receipt.id} className="flex gap-2">
                                <Button
                                  variant={selectedReceipt?.id === receipt.id ? "default" : "outline"}
                                  className="flex-1 justify-start"
                                  onClick={() => handleSelectReceipt(receipt)}
                                >
                                  <div className="text-left w-full">
                                    <div className="font-semibold">{receipt.store_name || 'Unknown Store'}</div>
                                    <div className="text-xs opacity-70 flex justify-between">
                                      <span>{receipt.receipt_date || 'No date'}</span>
                                      <span>{receipt.total_amount?.toFixed(2)} kr</span>
                                    </div>
                                  </div>
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => deleteReceipt(receipt)}
                                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    );
                  })}
                </Accordion>
              )}
            </CardContent>
          </Card>

          {/* Editing Panel */}
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>Review & Correct</CardTitle>
              <CardDescription>
                Fix any parsing errors to improve future accuracy
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!selectedReceipt ? (
                <p className="text-muted-foreground">Select a receipt to start reviewing</p>
              ) : (
                <div className="space-y-6">
                  {/* Total Savings */}
                  {editedData?.items && editedData.items.length > 0 && (
                    <Card className="bg-primary/5 border-primary/20">
                      <CardContent className="pt-6">
                        <div className="flex justify-between items-center">
                          <span className="text-lg font-semibold">Totala besparingar:</span>
                          <span className="text-2xl font-bold text-primary">
                            {editedData.items
                              .reduce((sum: number, item: ReceiptItem) => sum + (item.discount || 0), 0)
                              .toFixed(2)} kr
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Receipt Image */}
                  <div>
                    <Label>Receipt Image</Label>
                    <a 
                      href={selectedReceipt.image_url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="block mt-2 cursor-pointer hover:opacity-80 transition-opacity"
                    >
                      <img 
                        src={selectedReceipt.image_url} 
                        alt="Receipt" 
                        className="w-full max-h-64 object-contain border rounded-lg"
                      />
                      <p className="text-xs text-muted-foreground mt-1 text-center">Klicka för att öppna i nytt fönster</p>
                    </a>
                  </div>

                  {/* Store Info */}
                  <div className="grid md:grid-cols-3 gap-4">
                    <div>
                      <Label>Store Name</Label>
                      <Input
                        value={editedData?.store_name || ''}
                        onChange={(e) => setEditedData({ ...editedData, store_name: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Total Amount</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={editedData?.total_amount || 0}
                        onChange={(e) => setEditedData({ ...editedData, total_amount: parseFloat(e.target.value) })}
                      />
                    </div>
                    <div>
                      <Label>Date</Label>
                      <Input
                        type="date"
                        value={editedData?.receipt_date || ''}
                        onChange={(e) => setEditedData({ ...editedData, receipt_date: e.target.value })}
                      />
                    </div>
                  </div>

                  {/* Items */}
                  <div>
                    <div className="flex justify-between items-center mb-4">
                      <Label>Items</Label>
                      <Button size="sm" onClick={addItem}>Add Item</Button>
                    </div>
                    
                    <div className="space-y-4 max-h-96 overflow-y-auto">
                      {editedData?.items?.map((item: ReceiptItem, index: number) => (
                        <Card key={index} className="p-4">
                          <div className="space-y-3">
                            <div>
                              <Label htmlFor={`item-name-${index}`}>Produktnamn</Label>
                              <Input
                                id={`item-name-${index}`}
                                placeholder="Produktnamn"
                                value={item.name}
                                onChange={(e) => updateItem(index, 'name', e.target.value)}
                              />
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                              <div>
                                <Label htmlFor={`item-price-${index}`}>Pris (kr)</Label>
                                <Input
                                  id={`item-price-${index}`}
                                  type="number"
                                  step="0.01"
                                  placeholder="Pris"
                                  value={item.price}
                                  onChange={(e) => updateItem(index, 'price', parseFloat(e.target.value))}
                                />
                              </div>
                              <div>
                                <Label htmlFor={`item-quantity-${index}`}>Antal</Label>
                                <Input
                                  id={`item-quantity-${index}`}
                                  type="number"
                                  placeholder="Antal"
                                  value={item.quantity}
                                  onChange={(e) => updateItem(index, 'quantity', parseInt(e.target.value))}
                                />
                              </div>
                              <div>
                                <Label htmlFor={`item-discount-${index}`}>Rabatt (kr)</Label>
                                <Input
                                  id={`item-discount-${index}`}
                                  type="number"
                                  step="0.01"
                                  placeholder="0"
                                  value={item.discount || 0}
                                  onChange={(e) => updateItem(index, 'discount', parseFloat(e.target.value) || 0)}
                                />
                              </div>
                            </div>
                            <div>
                              <Label htmlFor={`item-category-${index}`}>Kategori</Label>
                              <Select
                                value={item.category}
                                onValueChange={(value) => updateItem(index, 'category', value)}
                              >
                                <SelectTrigger id={`item-category-${index}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {categories.map((cat) => (
                                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => removeItem(index)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Ta bort
                            </Button>
                          </div>
                        </Card>
                      ))}
                    </div>
                  </div>

                  {/* Notes */}
                  <div>
                    <Label>Correction Notes (Optional)</Label>
                    <Textarea
                      placeholder="Add notes about what was wrong or tips for this store..."
                      value={correctionNotes}
                      onChange={(e) => setCorrectionNotes(e.target.value)}
                    />
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <Button onClick={saveCorrection} disabled={saving} className="flex-1">
                      {saving ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                      Save Correction
                    </Button>
                    <Button variant="outline" onClick={() => setSelectedReceipt(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
            </div>
          </TabsContent>

          <TabsContent value="products">
            <ProductMerge />
          </TabsContent>
        </Tabs>

        <AlertDialog open={!!monthToDelete} onOpenChange={() => setMonthToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Är du säker?</AlertDialogTitle>
              <AlertDialogDescription>
                Detta kommer permanent ta bort alla {monthToDelete?.receipts.length} kvitton från{' '}
                {monthToDelete && formatMonthYear(monthToDelete.key)}.
                <br /><br />
                Totalt belopp: {monthToDelete && calculateMonthTotal(monthToDelete.receipts).toFixed(2)} kr
                <br /><br />
                <strong>Denna åtgärd kan inte ångras.</strong>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeletingMonth}>Avbryt</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => monthToDelete && deleteAllReceiptsForMonth(monthToDelete.receipts)}
                disabled={isDeletingMonth}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {isDeletingMonth ? 'Tar bort...' : 'Ta bort alla'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
