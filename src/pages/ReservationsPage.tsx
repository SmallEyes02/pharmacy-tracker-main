import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '@/components/Header';
import { Clock, Package, CheckCircle, XCircle, Loader2, Star } from 'lucide-react';
import ReviewDialog from '@/components/ReviewDialog';
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
  pending: { label: 'Pending', icon: Clock, className: 'bg-warning/10 text-warning border-warning/20' },
  confirmed: { label: 'Confirmed', icon: CheckCircle, className: 'bg-success/10 text-success border-success/20' },
  ready: { label: 'Ready', icon: Package, className: 'bg-info/10 text-info border-info/20' },
  expired: { label: 'Expired', icon: XCircle, className: 'bg-muted text-muted-foreground border-border' },
  cancelled: { label: 'Cancelled', icon: XCircle, className: 'bg-destructive/10 text-destructive border-destructive/20' },
};

const ReservationsPage = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [reservations, setReservations]   = useState<Reservation[]>([]);
  const [loading, setLoading]             = useState(true);
  const [reviewTarget, setReviewTarget]   = useState<{ pharmacyId: string; pharmacyName: string; reservationId: string } | null>(null);

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
        <p className="mt-2 text-muted-foreground">Track and manage your medicine reservations</p>

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
              
              // Now my boy we use res.medicines and res.pharmacies from our JOIN query
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
                      <p className="mt-1 text-xs text-muted-foreground">Qty Reserved: {res.quantity}</p>
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
                    {res.expiry_at && (
                      <span className="text-warning flex items-center gap-1">
                        <XCircle className="h-3 w-3" />
                        Expires: {new Date(res.expiry_at).toLocaleString()}
                      </span>
                    )}
                  </div>

                  {(res.status === 'pending' || res.status === 'confirmed') && (
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
                  {res.status === 'fulfilled' && (
                    <div className="mt-4 flex justify-end">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        onClick={() => setReviewTarget({
                          pharmacyId:   res.pharmacy_id,
                          pharmacyName: res.pharmacies?.name ?? 'Pharmacy',
                          reservationId: res.id,
                        })}
                      >
                        <Star className="h-3.5 w-3.5 text-warning" />
                        Leave a Review
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {reviewTarget && (
        <ReviewDialog
          open={!!reviewTarget}
          onClose={() => setReviewTarget(null)}
          pharmacyId={reviewTarget.pharmacyId}
          pharmacyName={reviewTarget.pharmacyName}
          reservationId={reviewTarget.reservationId}
          onSubmitted={() => setReviewTarget(null)}
        />
      )}
    </div>
  );
};

export default ReservationsPage;