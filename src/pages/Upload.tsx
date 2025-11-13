import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload as UploadIcon, ArrowLeft, FileText, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { Session } from "@supabase/supabase-js";

const Upload = () => {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);

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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !session) return;

    setUploading(true);
    
    try {
      const uploadPromises = Array.from(files).map(async (file) => {
        const fileExt = file.name.split('.').pop();
        const fileName = `${session.user.id}/${Date.now()}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('receipts')
          .upload(fileName, file);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('receipts')
          .getPublicUrl(fileName);

        const { data: parsedData, error: parseError } = await supabase.functions.invoke('parse-receipt', {
          body: { imageUrl: publicUrl }
        });

        if (parseError) throw parseError;

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

        if (dbError) throw dbError;

        return file.name;
      });

      const fileNames = await Promise.all(uploadPromises);
      setUploadedFiles(prev => [...prev, ...fileNames]);
      toast.success(`Successfully uploaded and parsed ${files.length} receipt${files.length > 1 ? 's' : ''}`);
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Failed to upload receipt. Please try again.');
    } finally {
      setUploading(false);
    }
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
                Upload your receipt images and let AI extract all the details automatically
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
                    Click to upload or drag and drop
                  </p>
                  <p className="text-xs text-muted-foreground">
                    PNG or JPG images only (MAX. 10MB)
                  </p>
                </div>
                <input 
                  id="file-upload" 
                  type="file" 
                  className="hidden" 
                  multiple 
                  accept="image/png,image/jpeg,image/jpg"
                  onChange={handleFileUpload}
                  disabled={uploading}
                />
              </label>

              {uploading && (
                <div className="mt-4 flex flex-col items-center justify-center gap-4">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">Uploading and parsing receipt...</p>
                </div>
              )}
            </CardContent>
          </Card>

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
