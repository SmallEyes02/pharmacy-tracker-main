import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '@/components/Header';
import { Clock, Package, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// Updated interface to include joined data
interface Reservation {
  id: string;
  pharmacy_id: string;
  medicine_id: string;
  quantity: number;
  status: string;
  requested_at: string;
  expiry_at: string | null;
  reference: string | null;
  // Joined tables
  pharmacies?: {
    name: string;
    address: string;
  };
  medicines?: {
    name: string;
    strength: string;
  };
}

const statusConfig = {
  pending:   { label: 'Pending',          icon: Clock,        className: 'bg-warning/10 text-warning border-warning/20'             },
  confirmed: { label: 'Ready for Pickup', icon: Package,      className: 'bg-blue-500/10 text-blue-600 border-blue-500/20'          },
  ready:     { label: 'Ready for Pickup', icon: Package,      className: 'bg-blue-500/10 text-blue-600 border-blue-500/20'          },
  expired:   { label: 'Expired',          icon: XCircle,      className: 'bg-muted text-muted-foreground border-border'             },
  cancelled: { label: 'Cancelled',        icon: XCircle,      className: 'bg-destructive/10 text-destructive border-destructive/20' },
  fulfilled: { label: 'Collected',        icon: CheckCircle,  className: 'bg-primary/10 text-primary border-primary/20' },
};

// Returns a human-readable expiry string
const formatExpiry = (expiryAt: string | null, status: string): { text: string; urgent: boolean } | null => {
  if (!expiryAt) return null;
  if (['expired','cancelled','confirmed','ready','fulfilled'].includes(status)) return null;

  const diff = new Date(expiryAt).getTime() - Date.now();
  if (diff <= 0) return { text: 'Expired', urgent: true };

  const hours   = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (hours < 1)  return { text: `Expires in ${minutes}m`, urgent: true };
  if (hours < 2)  return { text: `Expires in ${hours}h ${minutes}m`, urgent: true };
  return { text: `Expires in ${hours}h`, urgent: false };
};

const ReservationsPage = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [user, authLoading, navigate]);

  const fetchReservations = async () => {
    if (!user) return;
    
    // UPDATED QUERY: Joining pharmacy and medicine tables
    const { data, error } = await (supabase
      .from('reservations' as any)
      .select(`
        *,
        pharmacies:pharmacy_id (name, address),
        medicines:medicine_id (name, strength)
      `)
      .eq('user_id', user.id)
      .order('requested_at', { ascending: false }) as any);

    if (error) {
      console.error("Fetch error:", error);
      toast.error("Could not load your reservations");
    } else if (data) {
      setReservations(data as Reservation[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (user) fetchReservations();
  }, [user]);

  const handleCancel = async (id: string) => {
    const { error } = await supabase
      .from('reservations')
      .update({ status: 'cancelled' })
      .eq('id', id);

    if (error) {
      toast.error('Failed to cancel reservation');
    } else {
      toast.success('Reservation cancelled');
      setReservations((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status: 'cancelled' } : r))
      );
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container py-20 flex flex-col items-center justify-center">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="mt-4 text-muted-foreground italic">Fetching your reservations...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container py-8 max-w-4xl">
        <h1 className="font-heading text-3xl font-bold text-foreground">My Reservations</h1>
        <p className="mt-2 text-muted-foreground">Track and manage your medicine reservations in Gaborone</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Reservations are held for <strong>2 hours</strong> and automatically expire if not collected.
        </p>

        {reservations.length === 0 ? (
          <div className="mt-16 text-center">
            <Package className="h-16 w-16 text-muted-foreground/20 mx-auto" />
            <p className="mt-4 text-muted-foreground text-lg">No reservations found.</p>
            <Button className="mt-6" onClick={() => navigate('/')}>Find Medicine</Button>
          </div>
        ) : (
          <div className="mt-8 space-y-4">
            {reservations.map((res) => {
              const config = statusConfig[res.status as keyof typeof statusConfig] || statusConfig.pending;
              const StatusIcon = config.icon;
              
              // Now we use res.medicines and res.pharmacies from our JOIN query
              const medicineName = res.medicines?.name || 'Unknown Medicine';
              const medicineStrength = res.medicines?.strength || '';
              const pharmacyName = res.pharmacies?.name || 'Unknown Pharmacy';

              return (
                <div
                  key={res.id}
                  className="rounded-xl border border-border bg-card p-5 shadow-sm transition-all hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="font-heading font-semibold text-lg text-card-foreground">
                        {medicineName} {medicineStrength}
                      </h3>
                      <p className="mt-1 text-sm font-medium text-primary">
                        {pharmacyName}
                      </p>
                      <div className="mt-1.5 flex items-center gap-3 flex-wrap">
                        <p className="text-xs text-muted-foreground">Qty: {res.quantity}</p>
                        {res.reference && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 font-mono text-xs font-bold text-primary tracking-wider">
                            🎫 {res.reference}
                          </span>
                        )}
                      </div>
                    </div>
                    <Badge variant="outline" className={`${config.className} px-3 py-1 flex items-center gap-1.5`}>
                      <StatusIcon className="h-3.5 w-3.5" />
                      {config.label}
                    </Badge>
                  </div>

                  <div className="mt-4 pt-4 border-t border-border/50 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Requested: {new Date(res.requested_at).toLocaleString()}
                    </span>
                    {(() => {
                      const expiry = formatExpiry(res.expiry_at, res.status);
                      if (!expiry) return null;
                      return (
                        <span className={`flex items-center gap-1 font-medium ${expiry.urgent ? 'text-destructive' : 'text-warning'}`}>
                          <XCircle className="h-3 w-3" />
                          {expiry.text}
                        </span>
                      );
                    })()}
                  </div>

                  {res.status === 'pending' && (
                    <div className="mt-4 flex justify-end">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => handleCancel(res.id)}
                      >
                        Cancel Reservation
                      </Button>
                    </div>
                  )}
                  {res.status === 'confirmed' && (
                    <div className="mt-4 rounded-lg bg-blue-500/8 border border-blue-500/20 px-3 py-2.5 text-xs text-blue-700 dark:text-blue-400 flex items-center gap-2">
                      <Package className="h-3.5 w-3.5 shrink-0" />
                      Your medicine has been set aside and is ready. Please collect it at the pharmacy.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default ReservationsPage;