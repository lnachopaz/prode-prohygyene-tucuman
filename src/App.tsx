import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import AppLayout from "./components/AppLayout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Predictions from "./pages/Predictions";

import Ranking from "./pages/Ranking";
import Profile from "./pages/Profile";
import Admin from "./pages/Admin";
import Pending from "./pages/Pending";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/auth" element={<Auth />} />
          <Route path="/pending" element={<Pending />} />
          <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/predictions" element={<Predictions />} />
            
            <Route path="/ranking" element={<Ranking />} />
            <Route path="/profile" element={<Profile />} />
            <Route
              path="/admin"
              element={<ProtectedRoute requireAdmin><Admin /></ProtectedRoute>}
            />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
