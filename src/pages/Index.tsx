import { useEffect, useState } from 'react';
import { MapPin, Pill, Clock, Shield, ArrowRight, Search, Loader2, Navigation, Star, MessageSquare, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link, useNavigate } from 'react-router-dom';
import MedicineSearchBar from '@/components/MedicineSearchBar';
import Header from '@/components/Header';
import { supabase } from '@/integrations/supabase/client';
import { useLocationContext } from '@/contexts/LocationContext';
import { haversineDistance, estimateTravelTime } from '@/hooks/useUserLocation';
import { Badge } from '@/components/ui/badge';

// ── WKB hex parser (PostGIS returns geography as EWKB hex via JS client) ────────
const parseWKBCoords = (location: any): { lat: number; lng: number } | null => {
  if (!location) return null;
  // GeoJSON fallback
  if (location.coordinates && Array.isArray(location.coordinates)) {
    const [lng, lat] = location.coordinates;
    if (typeof lat === 'number' && typeof lng === 'number') return { lat, lng };
  }
  // EWKB hex: byte order(1) + type(4) + SRID(4) + X/lng(8) + Y/lat(8) = bytes
  if (typeof location === 'string' && /^[0-9A-Fa-f]+$/.test(location) && location.length >= 42) {
    try {
      const readDouble = (offset: number): number => {
        let bytes = '';
        for (let i = 7; i >= 0; i--) bytes += location.slice(offset + i * 2, offset + i * 2 + 2);
        const buf = new ArrayBuffer(8);
        const view = new DataView(buf);
        for (let i = 0; i < 8; i++) view.setUint8(i, parseInt(bytes.slice(i * 2, i * 2 + 2), 16));
        return view.getFloat64(0, false);
      };
      const lng = readDouble(18);
      const lat = readDouble(34);
      if (isFinite(lat) && isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng };
    } catch { /* fall through */ }
  }
  return null;
};

// ── Types ─────────────────────────────────────────────────────────────────────
interface NearbyPharmacy {
  id: string;
  name: string;
  address: string;
  phone: string;
  accepts_medical_aid: boolean;
  opening_time: string | null;
  closing_time: string | null;
  location: any;
  latitude: number | null;
  longitude: number | null;
  distance: string;
  travelTime: number;
}

interface FeaturedReview {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  pharmacy_name: string;
  patient_name: string;
}

// ── Static content ─────────────────────────────────────────────────────────────
const features = [
  {
    icon: Search,
    title: 'Find Medicines',
    description: 'Search by name or category and instantly see availability at nearby pharmacies.',
  },
  {
    icon: MapPin,
    title: 'Locate Pharmacies',
    description: 'Interactive map showing pharmacies near you with real distance and travel time.',
  },
  {
    icon: Clock,
    title: 'Reserve Instantly',
    description: 'Reserve your medicine and pick it up when ready — no more wasted trips.',
  },
  {
    icon: Shield,
    title: 'Verified & Trusted',
    description: 'All listed pharmacies are verified for accurate pricing and stock info.',
  },
];

const popularMeds = ['Panadol', 'Amoxicillin', 'Omeprazole', 'Ibuprofen'];

// ── Star Rating Display Component ─────────────────────────────────────────────
const StarRatingDisplay = ({ rating, size = 'sm' }: { rating: number; size?: 'xs' | 'sm' | 'md' }) => {
  const dims = size === 'xs' ? 'h-3 w-3' : size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(s => (
        <Star
          key={s}
          className={`${dims} ${
            s <= Math.round(rating)
              ? 'fill-warning text-warning'
              : 'text-muted-foreground/30'
          }`}
        />
      ))}
    </div>
  );
};

// ── Pharmacy card ─────────────────────────────────────────────────────────────
const NearbyCard = ({ pharmacy }: { pharmacy: NearbyPharmacy }) => {
  const navigate = useNavigate();

  const isOpen = (() => {
    if (!pharmacy.opening_time || !pharmacy.closing_time) return null;
    const now   = new Date();
    const [oh, om] = pharmacy.opening_time.split(':').map(Number);
    const [ch, cm] = pharmacy.closing_time.split(':').map(Number);
    const mins  = now.getHours() * 60 + now.getMinutes();
    return mins >= oh * 60 + om && mins < ch * 60 + cm;
  })();

  const mapUrl = pharmacy.latitude != null
    ? `/map?lat=${pharmacy.latitude}&lng=${pharmacy.longitude}&id=${pharmacy.id}&name=${encodeURIComponent(pharmacy.name)}`
    : '/map';

  const inventoryUrl = `/search?pharmacy_id=${pharmacy.id}&pharmacy_name=${encodeURIComponent(pharmacy.name)}`;

  return (
    <div className="rounded-xl border border-border bg-card p-3 sm:p-4 shadow-card transition-all duration-300 hover:shadow-elevated hover:-translate-y-0.5 w-full flex flex-col">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-heading font-semibold text-sm sm:text-base text-card-foreground leading-snug line-clamp-2">
            {pharmacy.name}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2 leading-snug">{pharmacy.address}</p>
        </div>
        {isOpen !== null && (
          <Badge
            variant="outline"
            className={`shrink-0 text-[10px] px-1.5 ${
              isOpen
                ? 'bg-success/10 text-success border-success/20'
                : 'bg-destructive/10 text-destructive border-destructive/20'
            }`}
          >
            {isOpen ? 'Open' : 'Closed'}
          </Badge>
        )}
      </div>

      {/* Distance + medical aid */}
      <div className="mt-2.5 flex items-center justify-between text-xs text-muted-foreground flex-wrap gap-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          {pharmacy.distance !== '—' && (
            <span className="flex items-center gap-1 font-medium text-primary">
              <Navigation className="h-3 w-3" />
              {pharmacy.distance} km
            </span>
          )}
          {pharmacy.travelTime > 0 && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              ~{pharmacy.travelTime} min
            </span>
          )}
        </div>
        {pharmacy.accepts_medical_aid && (
          <Badge variant="outline" className="text-[10px] px-1.5 bg-blue-500/10 text-blue-600 border-blue-500/20">
            Medical Aid
          </Badge>
        )}
      </div>

      {pharmacy.opening_time && pharmacy.closing_time && (
        <p className="mt-1.5 text-xs text-muted-foreground">
          🕐 {pharmacy.opening_time.slice(0, 5)} – {pharmacy.closing_time.slice(0, 5)}
        </p>
      )}

      {/* Action buttons */}
      <div className="mt-3 grid grid-cols-2 gap-2 mt-auto pt-2">
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 text-xs w-full h-9 min-h-[36px]"
          onClick={() => navigate(inventoryUrl)}
        >
          <Search className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">View Stock</span>
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 text-xs w-full h-9 min-h-[36px]"
          onClick={() => navigate(mapUrl)}
        >
          <MapPin className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">View on Map</span>
        </Button>
      </div>
    </div>
  );
};

// ── Main page ─────────────────────────────────────────────────────────────────
const Index = () => {
  const { userLocation } = useLocationContext();
  const [rawPharmacies, setRawPharmacies] = useState<any[]>([]);
  const [pharmacies, setPharmacies]       = useState<NearbyPharmacy[]>([]);
  const [pharmaLoading, setPharmaLoading] = useState(true);
  const [featuredReviews, setFeaturedReviews] = useState<FeaturedReview[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(true);

  // Step 1: Fetch pharmacies once — no location dependency
  useEffect(() => {
    const load = async () => {
      setPharmaLoading(true);
      const { data, error } = await (supabase
        .from('pharmacies' as any)
        .select('id, name, address, phone, accepts_medical_aid, opening_time, closing_time, location')
        .eq('is_active', true) as any);

      if (error) { setPharmaLoading(false); return; }
      setRawPharmacies(data ?? []);
      setPharmaLoading(false);
    };
    load();
  }, []); // fetch once on mount

  // Step 2: Fetch featured reviews
  useEffect(() => {
    const fetchFeaturedReviews = async () => {
      setReviewsLoading(true);
      
      const { data, error } = await (supabase
        .from('reviews' as any)
        .select(`
          id,
          rating,
          comment,
          created_at,
          pharmacy_id,
          user_id
        `)
        .order('created_at', { ascending: false })
        .limit(6) as any);

      if (error) {
        console.error('Error fetching reviews:', error);
        setReviewsLoading(false);
        return;
      }

      if (!data || data.length === 0) {
        setReviewsLoading(false);
        return;
      }

      // Get pharmacy names
      const pharmacyIds = [...new Set(data.map((r: any) => r.pharmacy_id))];
      const { data: pharmacies } = await (supabase
        .from('pharmacies' as any)
        .select('id, name')
        .in('id', pharmacyIds) as any);

      const pharmacyMap: Record<string, string> = {};
      (pharmacies ?? []).forEach((p: any) => { pharmacyMap[p.id] = p.name; });

      // Get patient names using the RPC function
      const userIds = [...new Set(data.map((r: any) => r.user_id))];
      const { data: patientNames, error: namesError } = await (supabase
        .rpc('get_patient_names' as any, { user_ids: userIds }));

      if (namesError) {
        console.error('Error fetching patient names:', namesError);
      }

      const profileMap: Record<string, string> = {};
      (patientNames ?? []).forEach((p: any) => {
        profileMap[p.user_id] = p.full_name || 'Patient';
      });

      const enriched = data.map((r: any) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        created_at: r.created_at,
        pharmacy_name: pharmacyMap[r.pharmacy_id] || 'Pharmacy',
        patient_name: profileMap[r.user_id] || 'Patient',
      }));

      setFeaturedReviews(enriched);
      setReviewsLoading(false);
    };

    fetchFeaturedReviews();
  }, []);

  // Step 3: Recalculate distances when raw data OR location changes
  useEffect(() => {
    if (!rawPharmacies.length) return;

    const enriched: NearbyPharmacy[] = rawPharmacies.map((row: any) => {
      const coords   = parseWKBCoords(row.location);
      const lat      = coords?.lat ?? null;
      const lng      = coords?.lng ?? null;
      let distance   = '—';
      let travelTime = 0;

      if (userLocation && lat != null && lng != null) {
        const d   = haversineDistance(userLocation.latitude, userLocation.longitude, lat, lng);
        distance  = d.toFixed(1);
        travelTime = estimateTravelTime(d);
      }

      return { ...row, latitude: lat, longitude: lng, distance, travelTime };
    });

    const sorted = [...enriched].sort((a, b) => {
      if (a.distance === '—') return 1;
      if (b.distance === '—') return -1;
      return parseFloat(a.distance) - parseFloat(b.distance);
    });

    setPharmacies(sorted.slice(0, 3));
  }, [rawPharmacies, userLocation]);

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* ── Hero ── */}
      <section className="relative overflow-hidden bg-gradient-hero">
        <div className="container py-20 md:py-28">
          <div className="mx-auto max-w-3xl text-center animate-fade-in-up">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary">
              <Pill className="h-4 w-4" />
              Your pharmacy companion in Gaborone
            </div>
            <h1 className="font-heading text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl md:text-6xl">
              Find Your Medicine,{' '}
              <span className="text-gradient-primary">Anytime, Anywhere</span>
            </h1>
            <p className="mt-5 text-lg text-muted-foreground md:text-xl">
              Search for medicines, compare prices across Gaborone pharmacies, check
              real-time availability, and reserve for pickup.
            </p>
          </div>

          <div className="mx-auto mt-10 max-w-2xl animate-fade-in-up-delay">
            <MedicineSearchBar large />
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-sm text-muted-foreground">
              <span>Popular:</span>
              {popularMeds.map((med) => (
                <Link
                  key={med}
                  to={`/search?q=${med}`}
                  className="rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
                >
                  {med}
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* Decorative blobs */}
        <div className="pointer-events-none absolute -left-40 -top-40 h-80 w-80 rounded-full bg-primary/5 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 -right-40 h-80 w-80 rounded-full bg-accent/5 blur-3xl" />
      </section>

      {/* ── Features ── */}
      <section className="container py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-heading text-3xl font-bold text-foreground">
            Everything You Need
          </h2>
          <p className="mt-3 text-muted-foreground">
            From search to pickup, PharmacyTracker streamlines your pharmacy experience.
          </p>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((feature, i) => (
            <div
              key={feature.title}
              className="group rounded-xl border border-border bg-card p-6 shadow-card transition-all duration-300 hover:shadow-elevated hover:-translate-y-1 animate-fade-in-up"
              style={{ animationDelay: `${i * 0.1}s` }}
            >
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10">
                <feature.icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="font-heading font-semibold text-card-foreground">{feature.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Nearby Pharmacies ── */}
      <section className="border-t border-border bg-secondary/30 py-10 sm:py-16 md:py-20">
        <div className="container px-4 sm:px-6">
          <div className="flex items-end justify-between mb-5 sm:mb-8">
            <div>
              <h2 className="font-heading text-3xl font-bold text-foreground">
                Nearby Pharmacies
              </h2>
              <p className="mt-2 text-muted-foreground">
                {userLocation
                  ? 'Sorted by distance from your location'
                  : 'Enable location to sort by distance'}
              </p>
            </div>
            <Link to="/map">
              <Button variant="hero-outline" size="sm" className="hidden sm:flex">
                View Map <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </Link>
          </div>

          {pharmaLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Loading nearby pharmacies…
            </div>
          ) : pharmacies.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              <MapPin className="mx-auto h-10 w-10 mb-3 opacity-30" />
              <p className="font-medium">No active pharmacies found.</p>
              <p className="text-sm mt-1">Pharmacies will appear here once approved.</p>
            </div>
          ) : (
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {pharmacies.map((pharmacy) => (
                <NearbyCard key={pharmacy.id} pharmacy={pharmacy} />
              ))}
            </div>
          )}

          <Link to="/map" className="mt-6 block sm:hidden">
            <Button variant="hero-outline" className="w-full">
              View All on Map <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>

      {/* ── Featured Reviews Section ── */}
      <section className="container py-16">
        <div className="text-center mb-10">
          <h2 className="font-heading text-3xl font-bold text-foreground">
            What Other People Are Saying
          </h2>
          <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">
            Real reviews from real people about their pharmacy experiences
          </p>
        </div>

        {reviewsLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : featuredReviews.length === 0 ? (
          <div className="text-center py-12">
            <MessageSquare className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground">No reviews yet. Be the first to leave one!</p>
          </div>
        ) : (
          <>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {featuredReviews.map((review) => (
                <div
                  key={review.id}
                  className="rounded-xl border border-border bg-card p-5 shadow-card transition-all duration-300 hover:shadow-elevated hover:-translate-y-1 group"
                >
                  {/* Stars */}
                  <div className="mb-3">
                    <StarRatingDisplay rating={review.rating} size="sm" />
                  </div>

                  {/* Comment */}
                  <p className="text-sm text-card-foreground leading-relaxed line-clamp-3">
                    &ldquo;{review.comment || 'No comment provided.'}&rdquo;
                  </p>

                  {/* Patient & Pharmacy */}
                  <div className="mt-4 pt-3 border-t border-border/50">
                    <p className="text-sm font-semibold text-foreground">
                      {review.patient_name}
                    </p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <span>at</span>
                      <span className="font-medium text-primary">{review.pharmacy_name}</span>
                    </p>
                    <p className="text-[10px] text-muted-foreground/60 mt-1">
                      {new Date(review.created_at).toLocaleDateString('en-BW', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* View all link */}
            <div className="text-center mt-8">
              <Link to="/reviews">
                <Button variant="ghost" className="gap-1 text-primary hover:text-primary">
                  Read all patient reviews
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </>
        )}
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-border bg-card py-10">
        <div className="container">
          <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-primary">
                <Pill className="h-4 w-4 text-primary-foreground" />
              </div>
              <span className="font-heading font-bold text-foreground">PharmacyTracker</span>
            </div>
            <p className="text-sm text-muted-foreground">
              © 2026 PharmacyTracker. Making pharmacy accessible for everyone.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;