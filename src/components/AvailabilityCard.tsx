import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { MapPin, Clock, Navigation } from 'lucide-react';

interface AvailabilityCardProps {
  item: any;
}

const statusConfig = {
  in_stock:     { label: 'In Stock',     className: 'bg-success/10 text-success border-success/20'         },
  low_stock:    { label: 'Low Stock',    className: 'bg-warning/10 text-warning border-warning/20'         },
  out_of_stock: { label: 'Out of Stock', className: 'bg-destructive/10 text-destructive border-destructive/20' },
};

const AvailabilityCard = ({ item }: AvailabilityCardProps) => {
  const { user }   = useAuth();
  const navigate   = useNavigate();
  const [loading, setLoading] = useState(false);

  const pharmacy = item.pharmacy;
  const variant  = item.medicineVariant;
  const status   = statusConfig[item.status as keyof typeof statusConfig] ?? statusConfig.out_of_stock;

  const handleReserve = async () => {
    if (!user) {
      toast.error('Please sign in to reserve medicines');
      navigate('/auth');
      return;
    }

    setLoading(true);
    const { error } = await supabase
      .from('reservations')
      .insert({
        user_id:             user.id,
        pharmacy_id:         pharmacy.id,
        medicine_id: variant.id,
        quantity:            1,
      } as any);
    setLoading(false);

    if (error) {
      toast.error('Failed to create reservation: ' + error.message);
    } else {
      toast.success('Reservation created! Check My Reservations for status.');
    }
  };

  /**
   * Opens the MapPage pre-focused on this pharmacy.
   * Passes lat/lng as query params so MapPage can fly to the marker.
   */
  const handleViewOnMap = () => {
    if (pharmacy.latitude != null && pharmacy.longitude != null) {
      navigate(
        `/map?lat=${pharmacy.latitude}&lng=${pharmacy.longitude}&id=${pharmacy.id}&name=${encodeURIComponent(pharmacy.name)}`
      );
    } else {
      // Fallback: open in Google Maps by address
      const q = encodeURIComponent(`${pharmacy.name}, ${pharmacy.address}`);
      window.open(`https://www.google.com/maps/search/?api=1&query=${q}`, '_blank');
    }
  };

  if (!pharmacy || !variant) return null;

  const hasCoords = pharmacy.latitude != null && pharmacy.longitude != null;
  const hasDistance = pharmacy.distance && pharmacy.distance !== '—';

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-card transition-all hover:shadow-elevated">
      {/* Medicine header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-heading font-semibold text-card-foreground">
            {variant.brandName}
            {variant.strength ? ` ${variant.strength}` : ''}
          </p>
          <p className="text-sm text-muted-foreground">
            {variant.form ?? 'Medicine'}
            {variant.genericName ? ` • ${variant.genericName}` : ''}
          </p>
        </div>
        <Badge variant="outline" className={status.className}>
          {status.label}
        </Badge>
      </div>

      {/* Pharmacy info + price */}
      <div className="mt-3 flex items-center justify-between">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-muted-foreground">{pharmacy.name}</p>

          {/* Distance row */}
          <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
            {hasDistance ? (
              <>
                <span className="flex items-center gap-1">
                  <Navigation className="h-3 w-3" />
                  {pharmacy.distance} km
                </span>
                {pharmacy.travelTime > 0 && (
                  <>
                    <span>·</span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      ~{pharmacy.travelTime} min walk
                    </span>
                  </>
                )}
              </>
            ) : (
              <span className="flex items-center gap-1 text-muted-foreground/60">
                <Navigation className="h-3 w-3" />
                Distance unavailable
              </span>
            )}
          </div>

          {/* Address */}
          <p className="mt-0.5 truncate text-xs text-muted-foreground/70">
            <MapPin className="mr-0.5 inline h-3 w-3" />
            {pharmacy.address}
          </p>
        </div>

        <div className="ml-3 shrink-0 text-right">
          <p className="font-heading text-lg font-bold text-foreground">
            P {Number(item.price).toFixed(2)}
          </p>
          <p className="text-xs text-muted-foreground">Qty: {item.quantity}</p>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-3 flex gap-2">
        {/* View on Map — always shown */}
        <Button
          size="sm"
          variant="outline"
          className="flex-1 gap-1"
          onClick={handleViewOnMap}
        >
          <MapPin className="h-3.5 w-3.5" />
          {hasCoords ? 'View on Map' : 'Open in Maps'}
        </Button>

        {/* Reserve — only when in/low stock */}
        {item.status !== 'out_of_stock' && (
          <Button
            size="sm"
            className="flex-1"
            onClick={handleReserve}
            disabled={loading}
          >
            {loading ? 'Reserving…' : 'Reserve'}
          </Button>
        )}
      </div>
    </div>
  );
};

export default AvailabilityCard;
