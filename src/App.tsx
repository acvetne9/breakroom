import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DeviceProvider } from "./contexts/DeviceContext";
import { AuthProvider } from "./contexts/AuthContext";
import { useSemanticSearchInit } from "./hooks/useSemanticSearchInit";
import { clearSearchCache } from "./services/unifiedSearch";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => {
  // Clear search cache and initialize semantic search on app load
  clearSearchCache();
  useSemanticSearchInit();
  
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <DeviceProvider>
            <Index />
          </DeviceProvider>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
