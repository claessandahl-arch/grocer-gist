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
  pageNumber?: number;
}

const Upload = () => {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [uploading, setUploading] = useState(false);
  const [converting, setConverting] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);
  const [previewFiles, setPreviewFiles] = useState<PreviewFile[]>([]);

  // Sanitize filename to remove special characters that cause storage issues
  const sanitizeFilename = (filename: string): string => {
    return filename
      .replace(/å/g, 'a')
      .replace(/ä/g, 'a')
      .replace(/ö/g, 'o')
      .replace(/Å/g, 'A')
      .replace(/Ä/g, 'A')
      .replace(/Ö/g, 'O')
      .replace(/\s+/g, '_')
      .replace(/[^a-zA-Z0-9_.-]/g, '_')
      .replace(/_{2,}/g, '_');
  };

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

  const convertPdfToJpg = async (file: File): Promise<Array<{ blob: Blob; preview: string }>> => {
    console.log('Converting PDF to JPG...');
    
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const totalPages = pdf.numPages;
    console.log(`PDF has ${totalPages} page(s)`);
    
    const results = [];
    
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      console.log(`Converting page ${pageNum} of ${totalPages}...`);
      const page = await pdf.getPage(pageNum);
      
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
      results.push({ blob, preview });
    }
    
    console.log(`All ${totalPages} page(s) converted successfully`);
    return results;
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
          const pages = await convertPdfToJpg(file);
          const baseName = file.name.replace(/\.(pdf)$/i, '');
          pages.forEach((pageData, index) => {
            newPreviews.push({
              name: `${baseName}${pages.length > 1 ? `_page${index + 1}` : ''}`,
              preview: pageData.preview,
              blob: pageData.blob,
              pageNumber: index + 1
            });
          });
        } else if (file.type.startsWith('image/')) {
          const reader = new FileReader();
          await new Promise<void>((resolve) => {
            reader.onload = (e) => {
              newPreviews.push({
                name: file.name,
                preview: e.target?.result as string,
                blob: file
              });
              resolve();
            };
            reader.readAsDataURL(file);
          });
        }
      }

      setPreviewFiles(prev => [...prev, ...newPreviews]);
    } catch (error) {
      console.error('Error processing file:', error);
      toast.error("Misslyckades med att bearbeta filen");
    } finally {
      setConverting(false);
    }
  };

  const handleUpload = async () => {
    if (!session || previewFiles.length === 0) return;

    setUploading(true);

    try {
      // Group preview files by original filename (remove _pageX suffix)
      const groupedBySource = previewFiles.reduce((acc, file) => {
        const baseFilename = file.name.replace(/_page\d+/, '');
        if (!acc[baseFilename]) {
          acc[baseFilename] = [];
        }
        acc[baseFilename].push(file);
        return acc;
      }, {} as Record<string, PreviewFile[]>);

      console.log('Grouped files:', Object.keys(groupedBySource).map(k => `${k}: ${groupedBySource[k].length} pages`));

      let successCount = 0;
      let duplicateCount = 0;
      let errorCount = 0;

      const uploadPromises = Object.entries(groupedBySource).map(async ([baseFilename, files]) => {
        try {
          // Sort files by page number to maintain correct order
          const sortedFiles = files.sort((a, b) => (a.pageNumber || 0) - (b.pageNumber || 0));
          
          // Upload all pages for this receipt
          const imageUrls = await Promise.all(
            sortedFiles.map(async (file, pageIndex) => {
              const sanitizedFilename = sanitizeFilename(baseFilename);
              const fileName = `${session.user.id}/${Date.now()}_${sanitizedFilename}_page${pageIndex}.jpg`;
              
              console.log(`Uploading: ${fileName}`);
              const { error: uploadError } = await supabase.storage
                .from('receipts')
                .upload(fileName, file.blob);

              if (uploadError) {
                console.error('Storage upload error:', uploadError);
                throw uploadError;
              }

              const { data: { publicUrl } } = supabase.storage
                .from('receipts')
                .getPublicUrl(fileName);

              return publicUrl;
            })
          );

          // Call AI once with all image URLs
          const { data: parsedData, error: functionError } = await supabase.functions.invoke('parse-receipt', {
            body: { imageUrls: imageUrls, originalFilename: baseFilename }
          });

          if (functionError || !parsedData) {
            errorCount++;
            toast.error(`Misslyckades: ${baseFilename}`);
            return;
          }

          // Check for duplicates
          const { data: existingReceipts } = await supabase
            .from('receipts')
            .select('id')
            .eq('user_id', session.user.id)
            .eq('store_name', parsedData.store_name)
            .eq('receipt_date', parsedData.receipt_date)
            .eq('total_amount', parsedData.total_amount);

          if (existingReceipts && existingReceipts.length > 0) {
            duplicateCount++;
            toast.warning(`Duplikat: ${parsedData.store_name} ${parsedData.receipt_date}`);
            return;
          }

          // Insert one receipt with multiple image URLs
          const { error: insertError } = await supabase.from('receipts').insert({
            user_id: session.user.id,
            image_url: imageUrls[0],
            image_urls: imageUrls,
            store_name: parsedData.store_name,
            total_amount: parsedData.total_amount,
            receipt_date: parsedData.receipt_date,
            items: parsedData.items
          });

          if (insertError) {
            errorCount++;
            toast.error(`Misslyckades spara: ${baseFilename}`);
            return;
          }

          successCount++;
        } catch (error) {
          errorCount++;
          console.error('Upload error for', baseFilename, ':', error);
          toast.error(`Fel: ${baseFilename}`);
        }
      });

      await Promise.all(uploadPromises);
      
      setPreviewFiles([]);
      
      // Show summary message
      if (successCount > 0) {
        toast.success(`${successCount} kvitto${successCount > 1 ? 'n' : ''} uppladdade!`);
        setUploadedFiles(prev => [...prev, ...Object.keys(groupedBySource).slice(0, successCount)]);
      }
      if (duplicateCount > 0) {
        toast.info(`${duplicateCount} duplikat hoppades över`);
      }
      if (errorCount > 0 && successCount === 0) {
        toast.error(`${errorCount} kvitton misslyckades`);
      }
    } catch (error) {
      console.error('Upload error:', error);
      toast.error("Något gick fel vid uppladdning");
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
