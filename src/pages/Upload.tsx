import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload as UploadIcon, ArrowLeft, FileText, CheckCircle2, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import type { Session } from "@supabase/supabase-js";
import * as pdfjsLib from 'pdfjs-dist';

interface PreviewFile {
  name: string;
  preview: string;
  blob: Blob;
}

const Upload = () => {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [uploading, setUploading] = useState(false);
  const [converting, setConverting] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);
  const [previewFiles, setPreviewFiles] = useState<PreviewFile[]>([]);

  useEffect(() => {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate("/auth");
      } else {
        setSession(session);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) {
        navigate("/auth");
      } else {
        setSession(session);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const convertPdfToJpg = async (file: File): Promise<{ blob: Blob; preview: string }> => {
    console.log('Converting PDF to JPG...');
    
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const page = await pdf.getPage(1);
    
    const scale = 2.0;
    const viewport = page.getViewport({ scale });
    
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not get canvas context');
    
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    
    await page.render({
      canvasContext: context,
      viewport: viewport,
    } as any).promise;
    
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Failed to convert canvas to blob'));
        },
        'image/jpeg',
        0.95
      );
    });

    const preview = canvas.toDataURL('image/jpeg', 0.95);
    console.log('PDF converted to JPG successfully');
    
    return { blob, preview };
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !session) return;

    setConverting(true);
    const newPreviews: PreviewFile[] = [];

    try {
      for (const file of Array.from(files)) {
        console.log('Processing file:', file.name, 'Type:', file.type);
        
        if (file.type === 'application/pdf') {
          const { blob, preview } = await convertPdfToJpg(file);
          newPreviews.push({
            name: file.name,
            preview,
            blob
          });
        } else {
          const preview = URL.createObjectURL(file);
          newPreviews.push({
            name: file.name,
            preview,
            blob: file
          });
        }
      }
      
      setPreviewFiles(newPreviews);
      toast.success(`${newPreviews.length} file(s) ready for upload`);
    } catch (error) {
      console.error('Preview generation failed:', error);
      toast.error('Failed to process files');
    } finally {
      setConverting(false);
    }
  };

  const handleUpload = async () => {
    if (!session || previewFiles.length === 0) return;

    setUploading(true);
    let duplicateCount = 0;
    let successCount = 0;
    
    try {
      const uploadPromises = previewFiles.map(async (previewFile, index) => {
        const fileName = `${session.user.id}/${Date.now()}_${index}.jpg`;
        
        console.log('Uploading:', fileName);
        const { error: uploadError } = await supabase.storage
          .from('receipts')
          .upload(fileName, previewFile.blob);

        if (uploadError) {
          console.error('Upload error:', uploadError);
          throw uploadError;
        }

        const { data: { publicUrl } } = supabase.storage
          .from('receipts')
          .getPublicUrl(fileName);

        console.log('Parsing with AI:', publicUrl);
        const { data: parsedData, error: parseError } = await supabase.functions.invoke('parse-receipt', {
          body: { imageUrl: publicUrl }
        });

        if (parseError) {
          console.error('Parse error:', parseError);
          throw new Error(`AI parsing failed: ${parseError.message}`);
        }

        console.log('Receipt parsed:', parsedData);

        // Check for duplicates before inserting
        const { data: existingReceipts } = await supabase
          .from('receipts')
          .select('id')
          .eq('user_id', session.user.id)
          .eq('store_name', parsedData.store_name)
          .eq('receipt_date', parsedData.receipt_date)
          .eq('total_amount', parsedData.total_amount)
          .limit(1);

        if (existingReceipts && existingReceipts.length > 0) {
          console.log('Duplicate receipt detected, skipping:', parsedData);
          duplicateCount++;
          return null; // Skip this receipt
        }

        const { error: dbError } = await supabase
          .from('receipts')
          .insert({
            user_id: session.user.id,
            image_url: publicUrl,
            store_name: parsedData.store_name,
            total_amount: parsedData.total_amount,
            receipt_date: parsedData.receipt_date,
            items: parsedData.items
          });

        if (dbError) {
          console.error('Database error:', dbError);
          throw dbError;
        }

        successCount++;
        return previewFile.name;
      });

      const results = await Promise.all(uploadPromises);
      const fileNames = results.filter((name): name is string => name !== null);
      setUploadedFiles(prev => [...prev, ...fileNames]);
      setPreviewFiles([]);
      
      // Show appropriate message based on results
      if (successCount > 0 && duplicateCount > 0) {
        toast.success(`Processed ${successCount} receipt${successCount > 1 ? 's' : ''}. ${duplicateCount} duplicate${duplicateCount > 1 ? 's' : ''} ignored.`);
      } else if (successCount > 0) {
        toast.success(`Successfully processed ${successCount} receipt${successCount > 1 ? 's' : ''}!`);
      } else if (duplicateCount > 0) {
        toast.info(`${duplicateCount} duplicate receipt${duplicateCount > 1 ? 's' : ''} ignored - already uploaded.`);
      }
    } catch (error) {
      console.error('Upload error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to process receipt');
    } finally {
      setUploading(false);
    }
  };

  const removePreview = (index: number) => {
    setPreviewFiles(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="min-h-screen bg-gradient-hero">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-2xl font-bold text-foreground">Upload Receipts</h1>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-12">
        <div className="max-w-2xl mx-auto space-y-6">
          <Card className="shadow-soft border-2 border-dashed border-primary/30 hover:border-primary/60 transition-colors">
            <CardHeader>
              <CardTitle>Upload Your Receipts</CardTitle>
              <CardDescription>
                Upload images or PDFs - PDFs will be converted to JPG for preview
              </CardDescription>
            </CardHeader>
            <CardContent>
              <label 
                htmlFor="file-upload" 
                className="flex flex-col items-center justify-center w-full h-64 cursor-pointer bg-secondary/50 rounded-lg hover:bg-secondary transition-colors"
              >
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <UploadIcon className="h-12 w-12 text-primary mb-4" />
                  <p className="mb-2 text-sm font-medium text-foreground">
                    Click to select files
                  </p>
                  <p className="text-xs text-muted-foreground">
                    PNG, JPG, or PDF (MAX. 10MB)
                  </p>
                </div>
                <input 
                  id="file-upload" 
                  type="file" 
                  className="hidden" 
                  multiple 
                  accept="image/png,image/jpeg,image/jpg,application/pdf"
                  onChange={handleFileSelect}
                  disabled={converting || uploading}
                />
              </label>

              {converting && (
                <div className="mt-4 flex flex-col items-center justify-center gap-4">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">Converting PDF to JPG...</p>
                </div>
              )}
            </CardContent>
          </Card>

          {previewFiles.length > 0 && (
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle>Preview & Confirm</CardTitle>
                <CardDescription>Review converted images before uploading</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4">
                  {previewFiles.map((file, index) => (
                    <div key={index} className="relative border rounded-lg p-4">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute top-2 right-2"
                        onClick={() => removePreview(index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                      <p className="text-sm font-medium mb-2">{file.name}</p>
                      <img 
                        src={file.preview} 
                        alt={file.name}
                        className="max-w-full h-auto rounded border"
                      />
                    </div>
                  ))}
                </div>
                <Button 
                  onClick={handleUpload} 
                  className="w-full"
                  disabled={uploading}
                >
                  {uploading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    `Upload ${previewFiles.length} file${previewFiles.length > 1 ? 's' : ''}`
                  )}
                </Button>
              </CardContent>
            </Card>
          )}

          {uploadedFiles.length > 0 && (
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-accent" />
                  Uploaded Receipts
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {uploadedFiles.map((file, idx) => (
                    <li key={idx} className="flex items-center gap-3 p-3 bg-secondary/50 rounded-lg">
                      <FileText className="h-5 w-5 text-primary flex-shrink-0" />
                      <span className="text-sm text-foreground flex-1">{file}</span>
                      <CheckCircle2 className="h-5 w-5 text-accent flex-shrink-0" />
                    </li>
                  ))}
                </ul>
                <Button 
                  onClick={() => navigate("/dashboard")} 
                  className="w-full mt-4"
                >
                  View Dashboard
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
};

export default Upload;
