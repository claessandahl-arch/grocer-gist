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
}

const categories = [
  'frukt_och_gront',
  'mejeri', 
  'kott_fagel_chark',
  'fisk_skaldjur',
  'brod_bageri',
  'skafferi',
  'frysvaror',
  'drycker',
  'sotsaker_snacks',
  'fardigmat',
  'hushall_hygien',
  'pant',
  'other'
];

export default function Training() {
  const navigate = useNavigate();
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [selectedReceipt, setSelectedReceipt] = useState<Receipt | null>(null);
  const [editedData, setEditedData] = useState<any>(null);
  const [correctionNotes, setCorrectionNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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
      console.error(error);
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
      items: [...editedData.items, { name: '', price: 0, quantity: 1, category: 'other' }]
    });
  };

  const removeItem = (index: number) => {
    const newItems = editedData.items.filter((_: any, i: number) => i !== index);
    setEditedData({ ...editedData, items: newItems });
  };

  const saveCorrection = async () => {
    if (!selectedReceipt || !editedData) return;

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
      console.error(correctionError);
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
      console.error(updateError);
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
    const { data: existingPattern } = await supabase
      .from('store_patterns')
      .select('*')
      .eq('store_name', storeName)
      .single();

    const patternData = {
      item_patterns: data.items.map((item: ReceiptItem) => ({
        category: item.category,
        name_pattern: item.name.toLowerCase()
      })),
      last_updated: new Date().toISOString()
    };

    if (existingPattern) {
      await supabase
        .from('store_patterns')
        .update({
          pattern_data: patternData,
          usage_count: existingPattern.usage_count + 1
        })
        .eq('store_name', storeName);
    } else {
      await supabase
        .from('store_patterns')
        .insert({
          store_name: storeName,
          pattern_data: patternData,
          usage_count: 1
        });
    }
  };

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
                receipts.map((receipt) => (
                  <Button
                    key={receipt.id}
                    variant={selectedReceipt?.id === receipt.id ? "default" : "outline"}
                    className="w-full justify-start"
                    onClick={() => handleSelectReceipt(receipt)}
                  >
                    <div className="text-left">
                      <div className="font-semibold">{receipt.store_name || 'Unknown Store'}</div>
                      <div className="text-xs opacity-70">{receipt.receipt_date || 'No date'}</div>
                    </div>
                  </Button>
                ))
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
                  {/* Receipt Image */}
                  <div>
                    <Label>Receipt Image</Label>
                    <img 
                      src={selectedReceipt.image_url} 
                      alt="Receipt" 
                      className="w-full max-h-64 object-contain border rounded-lg mt-2"
                    />
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
                          <div className="grid grid-cols-12 gap-2">
                            <div className="col-span-5">
                              <Input
                                placeholder="Item name"
                                value={item.name}
                                onChange={(e) => updateItem(index, 'name', e.target.value)}
                              />
                            </div>
                            <div className="col-span-2">
                              <Input
                                type="number"
                                step="0.01"
                                placeholder="Price"
                                value={item.price}
                                onChange={(e) => updateItem(index, 'price', parseFloat(e.target.value))}
                              />
                            </div>
                            <div className="col-span-1">
                              <Input
                                type="number"
                                placeholder="Qty"
                                value={item.quantity}
                                onChange={(e) => updateItem(index, 'quantity', parseInt(e.target.value))}
                              />
                            </div>
                            <div className="col-span-3">
                              <Select
                                value={item.category}
                                onValueChange={(value) => updateItem(index, 'category', value)}
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {categories.map((cat) => (
                                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="col-span-1">
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => removeItem(index)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
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
      </div>
    </div>
  );
}
