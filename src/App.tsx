import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import ErrorBoundary from "./components/ErrorBoundary";
import { Navigation } from "./components/Navigation";
import { Loader2 } from "lucide-react";

// Lazy load route components for code splitting
const Index = lazy(() => import("./pages/Index"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Upload = lazy(() => import("./pages/Upload"));
const Training = lazy(() => import("./pages/Training"));
const DataManagement = lazy(() => import("./pages/DataManagement"));
const ProductManagement = lazy(() => import("./pages/ProductManagement"));
const PriceComparison = lazy(() => import("./pages/PriceComparison"));
const StoreRecommendations = lazy(() => import("./pages/StoreRecommendations"));
const Diagnostics = lazy(() => import("./pages/Diagnostics")); // Changed from DiagnosticTool to Diagnostics
const Auth = lazy(() => import("./pages/Auth"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

// Loading fallback component
const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center">
    <Loader2 className="h-8 w-8 animate-spin text-primary" />
  </div>
);

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Navigation />
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/upload" element={<Upload />} />
              <Route path="/training" element={<Training />} />
              <Route path="/datamanagement" element={<DataManagement />} />
              <Route path="/product-management" element={<ProductManagement />} />
              <Route path="/price-comparison" element={<PriceComparison />} />
              <Route path="/store-recommendations" element={<StoreRecommendations />} />
              <Route path="/diagnostics" element={<Diagnostics />} /> {/* Changed route path and component */}
              <Route path="/auth" element={<Auth />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
