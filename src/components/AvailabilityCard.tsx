import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { RatingBadge } from '@/components/PharmacyReviews';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import {
  MapPin, Clock, Navigation, ShoppingBag,
  Building2, Pill, CalendarClock, CheckCircle,
  MessageCircle, ShieldCheck, Star,
  AlertTriangle, ArrowRight,
} from 'lucide-react';

interface AvailabilityCardProps {
  item: any;
}

const statusConfig = {
  in_stock:     { label: 'In Stock',     className: 'bg-success/10 text-success border-success/20'             },
  low_stock:    { label: 'Low Stock',    className: 'bg-warning/10 text-warning border-warning/20'             },
  out_of_stock: { label: 'Out of Stock', className: 'bg-destructive/10 text-destructive border-destructive/20' },
};

// Pickup window: 24 hours from now formatted readably
const getPickupWindow = () => {
  const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return expiry.toLocaleString('en-BW', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

// Converts a last_updated ISO string into "X minutes/hours/days ago"
const getStockAge = (lastUpdated: string | null | undefined): string | null => {
  if (!lastUpdated) return null;
  const diffMs = Date.now() - new Date(lastUpdated).getTime();
  const mins   = Math.floor(diffMs / 60_000);
  const hours  = Math.floor(diffMs / 3_600_000);
  const days   = Math.floor(diffMs / 86_400_000);
  if (mins < 1)   return 'just now';
  if (mins < 60)  return `${mins} minute${mins !== 1 ? 's' : ''} ago`;
  if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  return `${days} day${days !== 1 ? 's' : ''} ago`;
};

const AvailabilityCard = ({ item }: AvailabilityCardProps) => {
  const { user }   = useAuth();
  const navigate   = useNavigate();
  const [loading, setLoading]             = useState(false);
  const [showConfirm, setShowConfirm]     = useState(false);
  const [showSuccess, setShowSuccess]     = useState(false);
  const [reference, setReference]         = useState<string | null>(null);
  const [qty, setQty]                     = useState(1);
  const [showAltContext, setShowAltContext] = useState(false);

  const pharmacy     = item.pharmacy;
  const variant      = item.medicineVariant;
  const status       = statusConfig[item.status as keyof typeof statusConfig] ?? statusConfig.out_of_stock;
  const isOutOfStock = item.status === 'out_of_stock';
  const hasCoords    = pharmacy.latitude != null && pharmacy.longitude != null;
  const hasDistance  = pharmacy.distance && pharmacy.distance !== '—';
  const stockAge     = getStockAge(item.lastUpdated);
  const whatsappNum  = pharmacy.whatsapp?.replace(/[^0-9+]/g, '');
  const maxQty       = Math.min(item.quantity, 10);
  const totalPrice   = (Number(item.price) * qty).toFixed(2);

  // ── Open confirmation dialog ───────────────────────────────────────────────
  const handleReserveClick = () => {
    if (!user) {
      toast.error('Please sign in to reserve medicines');
      navigate('/auth');
      return;
    }
    setQty(1);
    setShowConfirm(true);
  };

  // ── Confirmed — submit to Supabase ─────────────────────────────────────────
  const handleConfirm = async () => {
    setLoading(true);
    const { data, error } = await (supabase
      .from('reservations')
      .insert({
        user_id:     user!.id,
        pharmacy_id: pharmacy.id,
        medicine_id: variant.id,
        quantity:    qty,
      } as any)
      .select('reference')
      .single() as any);
    setLoading(false);

    if (error) {
      setShowConfirm(false);
      toast.error('Failed to create reservation: ' + error.message);
    } else {
      setReference(data?.reference ?? null);
      setShowConfirm(false);
      setShowSuccess(true);
    }
  };

  const handleViewOnMap = () => {
    if (hasCoords) {
      navigate(`/map?lat=${pharmacy.latitude}&lng=${pharmacy.longitude}&id=${pharmacy.id}&name=${encodeURIComponent(pharmacy.name)}`);
    } else {
      window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${pharmacy.name}, ${pharmacy.address}`)}`, '_blank');
    }
  };

  if (!pharmacy || !variant) return null;

  return (
    <>
      {/* ── Search result card ── */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-card transition-all hover:shadow-elevated">

        {/* Medicine header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-heading font-semibold text-card-foreground">
              {variant.brandName}{variant.strength ? ` ${variant.strength}` : ''}
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

        {/* Pharmacy + distance + price */}
        <div className="mt-3 flex items-center justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
            <p className="truncate text-sm font-medium text-muted-foreground">{pharmacy.name}</p>
            <RatingBadge pharmacyId={pharmacy.id} />
          </div>
            <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
              {hasDistance ? (
                <>
                  <span className="flex items-center gap-1">
                    <Navigation className="h-3 w-3" />{pharmacy.distance} km
                  </span>
                  {pharmacy.travelTime > 0 && (
                    <><span>·</span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />~{pharmacy.travelTime} min walk
                    </span></>
                  )}
                </>
              ) : (
                <span className="flex items-center gap-1 text-muted-foreground/60">
                  <Navigation className="h-3 w-3" /> Distance unavailable
                </span>
              )}
            </div>
            <p className="mt-0.5 truncate text-xs text-muted-foreground/70">
              <MapPin className="mr-0.5 inline h-3 w-3" />{pharmacy.address}
            </p>
            {stockAge && (
              <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground/80">
                <ShieldCheck className="h-3 w-3 text-success shrink-0" />
                Stock last verified <span className="font-semibold text-foreground ml-0.5">{stockAge}</span>
              </p>
            )}
          </div>
          <div className="ml-3 shrink-0 text-right">
            <p className="font-heading text-lg font-bold text-foreground">
              P {Number(item.price).toFixed(2)}
            </p>
            <p className="text-xs text-muted-foreground">Qty: {item.quantity}</p>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-3 flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" className="flex-1 gap-1 min-w-[80px]" onClick={handleViewOnMap}>
            <MapPin className="h-3.5 w-3.5" />
            {hasCoords ? 'Map' : 'Maps'}
          </Button>
          {whatsappNum && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 px-3 border-green-600/40 text-green-700 hover:bg-green-50 hover:border-green-600"
              onClick={() => window.open(
                `https://wa.me/${whatsappNum}?text=${encodeURIComponent(
                  `Hi, I'm enquiring about ${variant.brandName}${variant.strength ? ' ' + variant.strength : ''} at ${pharmacy.name}`
                )}`,
                '_blank'
              )}
            >
              <MessageCircle className="h-3.5 w-3.5" />
              WhatsApp
            </Button>
          )}
          {!isOutOfStock && (
            <Button size="sm" className="flex-1 gap-1 min-w-[80px]" onClick={handleReserveClick}>
              <ShoppingBag className="h-3.5 w-3.5" /> Reserve
            </Button>
          )}
        </div>

        {/* Out of stock nudge */}
        {isOutOfStock && (
          <div className="mt-3">
            {!showAltContext ? (
              <p className="text-center text-xs text-muted-foreground">
                Out of stock at this pharmacy.{' '}
                <button
                  className="text-primary underline hover:no-underline font-semibold"
                  onClick={() => setShowAltContext(true)}
                >
                  See alternatives →
                </button>
              </p>
            ) : (
              <div className="rounded-lg border border-destructive/25 bg-destructive/5 p-3 space-y-2.5">
                {/* Header */}
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-bold text-destructive leading-snug">
                      {variant.brandName}{variant.strength ? ` ${variant.strength}` : ''} is out of stock here
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      The options below are recorded alternatives — they may have a similar therapeutic effect.
                      Always confirm with your pharmacist before switching.
                    </p>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex flex-col gap-1.5">
                  <button
                    onClick={() => navigate(`/search?q=${encodeURIComponent(variant.brandName)}&outOfStock=1`)}
                    className="flex items-center justify-between w-full rounded-md border border-border bg-card px-3 py-2 text-left text-xs font-semibold text-foreground hover:border-primary/50 hover:text-primary transition-colors group"
                  >
                    <span>
                      Find <span className="font-bold">{variant.brandName}</span> at other pharmacies
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover:text-primary transition-colors" />
                  </button>

                  <button
                    onClick={() => navigate(`/search?q=${encodeURIComponent(variant.genericName || variant.brandName)}&alternatives=1&for=${encodeURIComponent(variant.brandName)}`)}
                    className="flex items-center justify-between w-full rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-left text-xs font-semibold text-primary hover:bg-primary/10 transition-colors group"
                  >
                    <span>
                      Search alternatives to <span className="font-bold">{variant.brandName}</span>
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0" />
                  </button>
                </div>

                <button
                  onClick={() => setShowAltContext(false)}
                  className="text-[11px] text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2 w-full text-center"
                >
                  Dismiss
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Confirmation Dialog ── */}
      <Dialog open={showConfirm} onOpenChange={o => { if (!o) setShowConfirm(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <ShoppingBag className="h-5 w-5 text-primary" />
              Confirm Reservation
            </DialogTitle>
            <DialogDescription>
              Review your reservation details before confirming.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-1">

            {/* Medicine */}
            <div className="flex items-start gap-3 rounded-lg bg-muted/50 p-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <Pill className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-sm text-foreground">
                  {variant.brandName}{variant.strength ? ` ${variant.strength}` : ''}
                </p>
                <p className="text-xs text-muted-foreground">
                  {variant.form ?? 'Medicine'}{variant.genericName ? ` • ${variant.genericName}` : ''}
                </p>
              </div>
            </div>

            {/* Pharmacy */}
            <div className="flex items-start gap-3 rounded-lg bg-muted/50 p-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <Building2 className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-sm text-foreground">{pharmacy.name}</p>
                <p className="text-xs text-muted-foreground truncate">{pharmacy.address}</p>
                {pharmacy.operatingHours && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    <Clock className="h-3 w-3 inline mr-0.5" />{pharmacy.operatingHours}
                  </p>
                )}
              </div>
            </div>

            {/* Quantity selector */}
            <div className="rounded-lg border border-border p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-foreground">Quantity</p>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setQty(q => Math.max(1, q - 1))}
                    disabled={qty <= 1}
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-border font-bold text-lg hover:bg-accent disabled:opacity-30 transition-colors"
                  >
                    −
                  </button>
                  <span className="w-8 text-center font-bold text-xl text-foreground">{qty}</span>
                  <button
                    type="button"
                    onClick={() => setQty(q => Math.min(maxQty, q + 1))}
                    disabled={qty >= maxQty}
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-border font-bold text-lg hover:bg-accent disabled:opacity-30 transition-colors"
                  >
                    +
                  </button>
                </div>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {item.quantity} unit{item.quantity !== 1 ? 's' : ''} available · max 10 per reservation
              </p>
            </div>

            {/* Price breakdown */}
            <div className="rounded-lg border border-border p-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Unit price</span>
                <span className="font-medium">P {Number(item.price).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Quantity</span>
                <span className="font-medium">× {qty}</span>
              </div>
              <div className="flex justify-between items-center border-t border-border pt-2">
                <span className="font-semibold text-foreground">Total estimate</span>
                <span className="font-bold text-xl text-primary">P {totalPrice}</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                * Final price confirmed at pharmacy. Medical aid discounts may apply.
              </p>
            </div>

            {/* Pickup window */}
            <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/5 p-3">
              <CalendarClock className="h-5 w-5 text-warning shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-warning">24-Hour Pickup Window</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Your reservation will be held until:
                </p>
                <p className="text-sm font-bold text-foreground mt-1">{getPickupWindow()}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Reservation expires automatically if not collected in time.
                </p>
              </div>
            </div>

          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowConfirm(false)} disabled={loading}>
              Cancel
            </Button>
            <Button onClick={handleConfirm} disabled={loading} className="gap-1.5">
              <CheckCircle className="h-4 w-4" />
              {loading ? 'Confirming…' : 'Confirm Reservation'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Reservation Success Dialog ── */}
      <Dialog open={showSuccess} onOpenChange={o => { if (!o) setShowSuccess(false); }}>
        <DialogContent className="max-w-sm text-center">
          <DialogHeader>
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-success/10">
              <CheckCircle className="h-7 w-7 text-success" />
            </div>
            <DialogTitle className="text-xl">Reservation Confirmed!</DialogTitle>
            <DialogDescription>
              Your medicine has been reserved. Show this reference at the pharmacy.
            </DialogDescription>
          </DialogHeader>

          <div className="py-3 space-y-4">
            {/* Reference code */}
            <div className="rounded-xl border-2 border-primary/30 bg-primary/5 px-6 py-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">
                Reservation Reference
              </p>
              <p className="font-mono text-3xl font-bold tracking-widest text-primary">
                {reference}
              </p>
            </div>

            {/* Summary */}
            <div className="rounded-lg bg-muted/50 p-3 text-left space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Medicine</span>
                <span className="font-medium text-foreground truncate ml-2 max-w-[160px]">
                  {variant.brandName}{variant.strength ? ` ${variant.strength}` : ''}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Quantity</span>
                <span className="font-medium text-foreground">{qty}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Pharmacy</span>
                <span className="font-medium text-foreground truncate ml-2 max-w-[160px]">{pharmacy.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Est. Total</span>
                <span className="font-bold text-primary">P {totalPrice}</span>
              </div>
              <div className="flex justify-between border-t border-border pt-1.5 mt-1">
                <span className="text-muted-foreground flex items-center gap-1">
                  <CalendarClock className="h-3.5 w-3.5" /> Pick up by
                </span>
                <span className="font-semibold text-warning text-xs">{getPickupWindow()}</span>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Screenshot or write down your reference number.
              You can also view it in <strong>My Reservations</strong>.
            </p>
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button className="w-full" onClick={() => { setShowSuccess(false); navigate('/reservations'); }}>
              View My Reservations
            </Button>
            <Button variant="outline" className="w-full" onClick={() => setShowSuccess(false)}>
              Continue Searching
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AvailabilityCard;
