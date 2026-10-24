import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DeviceProvider } from "./contexts/DeviceContext";
import { ConnectionProvider } from "./contexts/ConnectionContext";
import { CityProvider } from "./contexts/CityContext";
import { PostsProvider } from "./components/PostsProvider";
import MobileApp from "./components/MobileApp";

const App = () => (
  <ConnectionProvider>
    <DeviceProvider>
      <CityProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <PostsProvider>
            <MobileApp />
          </PostsProvider>
        </TooltipProvider>
      </CityProvider>
    </DeviceProvider>
  </ConnectionProvider>
);

export default App;
