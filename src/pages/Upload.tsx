import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload as UploadIcon, ArrowLeft, FileText, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

const Upload = () => {
  const navigate = useNavigate();
  const [uploading, setUploading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    setUploading(true);
    
    // Simulate upload process
    setTimeout(() => {
      const fileNames = Array.from(files).map(f => f.name);
      setUploadedFiles(prev => [...prev, ...fileNames]);
      setUploading(false);
      toast.success(`${files.length} receipt(s) uploaded successfully!`);
    }, 1500);
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
                Drag and drop your receipt images or PDFs, or click to browse
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
                    PNG, JPG, PDF (MAX. 10MB)
                  </p>
                </div>
                <input 
                  id="file-upload" 
                  type="file" 
                  className="hidden" 
                  multiple 
                  accept="image/*,.pdf"
                  onChange={handleFileUpload}
                  disabled={uploading}
                />
              </label>

              {uploading && (
                <div className="mt-4 text-center">
                  <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
                  <p className="mt-2 text-sm text-muted-foreground">Processing receipts...</p>
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
                      <FileText className="h-5 w-5 text-primary" />
                      <span className="text-sm text-foreground">{file}</span>
                    </li>
                  ))}
                </ul>
                <Button 
                  className="w-full mt-4" 
                  onClick={() => navigate("/dashboard")}
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
