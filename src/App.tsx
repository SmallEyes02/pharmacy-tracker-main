import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { LocationProvider } from "@/contexts/LocationContext";
import Index from "./pages/Index";
import SearchPage from "./pages/SearchPage";
import MapPage from "./pages/MapPage";
import ReservationsPage from "./pages/ReservationsPage";
import PharmacistDashboard from "./pages/PharmacistDashboard";
import PharmacySignupPage from "./pages/PharmacySignupPage";
import AdminDashboard from "./pages/AdminDashboard";
import AuthPage from "./pages/AuthPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import SetPassword from "./pages/SetPassword";
import NotFound from "./pages/NotFound";
import ReviewsPage from './pages/ReviewsPage';

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <LocationProvider>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/search" element={<SearchPage />} />
              <Route path="/map" element={<MapPage />} />
              <Route path="/reservations" element={<ReservationsPage />} />
              <Route path="/pharmacist" element={<PharmacistDashboard />} />
              <Route path="/pharmacy-signup" element={<PharmacySignupPage />} />
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="/auth" element={<AuthPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route path="/set-password" element={<SetPassword />} />
              <Route path="*" element={<NotFound />} />
              <Route path="/reviews" element={<ReviewsPage />} />
            </Routes>
          </LocationProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;