import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DeviceProvider } from "./contexts/DeviceContext";
import { AuthProvider } from "./contexts/AuthContext";
import { ConnectionProvider } from "./contexts/ConnectionContext";
import { clearSearchCache } from "./services/unifiedSearch";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => {
  // Clear search cache on app load
  clearSearchCache();
  
  return (
    <QueryClientProvider client={queryClient}>
      <ConnectionProvider>
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <DeviceProvider>
              <Index />
            </DeviceProvider>
          </TooltipProvider>
        </AuthProvider>
      </ConnectionProvider>
    </QueryClientProvider>
  );
};

export default App;
