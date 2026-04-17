import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import Header from '@/components/Header';
import MedicineSearchBar from '@/components/MedicineSearchBar';
import AvailabilityCard from '@/components/AvailabilityCard';
import { Pill, AlertTriangle, Loader2, MapPin, Store } from 'lucide-react';
import { toast } from 'sonner';
import { useLocationContext } from '@/contexts/LocationContext';
import { haversineDistance, estimateTravelTime } from '@/hooks/useUserLocation';

// Raw result straight from Supabase — includes coordinates for distance calc
interface RawResult {
  id: string;
  price: number;
  stock_level: number;
  pharmacies: {
    id: string;
    name: string;
    address: string;
    phone: string;
    email: string;
    accepts_medical_aid: boolean;
    opening_time: string | null;
    closing_time: string | null;
    is_active: boolean;
    location: { coordinates: [number, number] } | null;
  };
  medicines: {
    id: string;
    name: string;
    description: string | null;
    category: string | null;
    dosage_form: string | null;
    strength: string | null;
  };
}

// ── Extract lat/lng from PostGIS GeoJSON response ─────────────────────────────
const parseCoords = (location: any): { lat: number; lng: number } | null => {
  if (!location) return null;

  // ── GeoJSON format: { type: "Point", coordinates: [lng, lat] } ──────────
  if (location.coordinates && Array.isArray(location.coordinates)) {
    const [lng, lat] = location.coordinates;
    if (typeof lat === "number" && typeof lng === "number") return { lat, lng };
  }

  // ── WKB hex format (PostGIS EWKB) ────────────────────────────────────────
  if (typeof location === "string" && /^[0-9A-Fa-f]+$/.test(location) && location.length >= 42) {
    try {
      const hex = location;
      const readDouble = (offset: number): number => {
        let bytes = "";
        for (let i = 7; i >= 0; i--) {
          bytes += hex.slice(offset + i * 2, offset + i * 2 + 2);
        }
        const buf = new ArrayBuffer(8);
        const view = new DataView(buf);
        for (let i = 0; i < 8; i++) {
          view.setUint8(i, parseInt(bytes.slice(i * 2, i * 2 + 2), 16));
        }
        return view.getFloat64(0, false);
      };

      const lng = readDouble(18);
      const lat = readDouble(34);
      if (isFinite(lat) && isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
        return { lat, lng };
      }
    } catch {
      // fall through
    }
  }

  return null;
};

// ── Enrich a raw result with distance from userLocation ───────────────────────
const enrichWithDistance = (
  raw: RawResult,
  userLocation: { latitude: number; longitude: number } | null
) => {
  const coords = parseCoords(raw.pharmacies.location);
  let distance  = '—';
  let travelTime = 0;

  if (userLocation && coords) {
    const dist = haversineDistance(
      userLocation.latitude,
      userLocation.longitude,
      coords.lat,
      coords.lng
    );
    distance   = dist.toFixed(1);
    travelTime = estimateTravelTime(dist);
  }

  return {
    id:       raw.id,
    price:    raw.price,
    quantity: raw.stock_level,
    status:   raw.stock_level > 10 ? 'in_stock'
            : raw.stock_level > 0  ? 'low_stock'
            : 'out_of_stock',
    pharmacy: {
      id:                  raw.pharmacies.id,
      name:                raw.pharmacies.name,
      address:             raw.pharmacies.address,
      phone:               raw.pharmacies.phone,
      accepts_medical_aid: raw.pharmacies.accepts_medical_aid,
      operatingHours:      `${raw.pharmacies.opening_time?.slice(0, 5) ?? '?'} - ${raw.pharmacies.closing_time?.slice(0, 5) ?? '?'}`,
      latitude:            coords?.lat ?? null,
      longitude:           coords?.lng ?? null,
      distance,
      travelTime,
    },
    medicineVariant: {
      id:          raw.medicines.id,
      brandName:   raw.medicines.name,
      genericName: raw.medicines.category,
      strength:    raw.medicines.strength,
      form:        raw.medicines.dosage_form,
    },
  };
};

const sortByDistance = (items: any[]) =>
  [...items].sort((a, b) => {
    if (a.pharmacy.distance === '—') return 1;
    if (b.pharmacy.distance === '—') return -1;
    return parseFloat(a.pharmacy.distance) - parseFloat(b.pharmacy.distance);
  });

// ── Component ──────────────────────────────────────────────────────────────────
const SearchPage = () => {
  const [searchParams] = useSearchParams();
  const query      = searchParams.get('q') || '';
  const pharmacyId = searchParams.get('pharmacy_id') || '';
  const pharmacyName = searchParams.get('pharmacy_name') || '';

  const { userLocation } = useLocationContext();

  // Raw results from Supabase — fetched once per query/pharmacy change
  const [rawResults, setRawResults]         = useState<RawResult[]>([]);
  // Enriched results with distance — recalculated when location changes
  const [results, setResults]               = useState<any[]>([]);
  const [isLoading, setIsLoading]           = useState(false);
  // Alternative medicines shown when all results are out of stock
  const [alternatives, setAlternatives]     = useState<{ id: string; name: string; strength: string | null; dosage_form: string | null; category: string | null }[]>([]);
  const [altLoading, setAltLoading]         = useState(false);

  // ── Step 1: Fetch from Supabase when query or pharmacy changes ──────────
  useEffect(() => {
    // If no query and no pharmacy selected, don't fetch anything
    if (!query.trim() && !pharmacyId) {
      setRawResults([]);
      setResults([]);
      setAlternatives([]);
      return;
    }

    const fetch = async () => {
      setIsLoading(true);
      try {
        // Start building the query
        let queryBuilder = (supabase
          .from('pharmacy_inventory' as any)
          .select(`
            id, price, stock_level,
            pharmacies:pharmacy_id (
              id, name, address, phone, email,
              accepts_medical_aid, opening_time, closing_time,
              is_active, location
            ),
            medicines:medicine_id (
              id, name, description, category, dosage_form, strength
            )
          `) as any);

        // Apply pharmacy filter if present
        if (pharmacyId) {
          queryBuilder = queryBuilder.eq('pharmacy_id', pharmacyId);
        }

        // Apply medicine search filter if present
        if (query.trim()) {
          queryBuilder = queryBuilder.or(
            `name.ilike.%${query}%,category.ilike.%${query}%`,
            { foreignTable: 'medicines' as any }
          );
        }

        const { data, error } = await queryBuilder;

        if (error) throw error;

        const valid = (data || []).filter(
          (item: any) => item.pharmacies && item.medicines && item.pharmacies.is_active
        ) as RawResult[];

        setRawResults(valid);

        // ── Fetch alternatives if all results are out of stock AND we have a query ──
        const allOutOfStock = valid.length > 0 && valid.every((r: any) => r.stock_level === 0);
        const noResults     = valid.length === 0;

        if ((allOutOfStock || noResults) && query.trim()) {
          setAltLoading(true);
          try {
            const { data: matchedMeds } = await (supabase as any)
              .from('medicines')
              .select('id')
              .or(`name.ilike.%${query}%,category.ilike.%${query}%`);

            if (matchedMeds?.length) {
              const medIds = matchedMeds.map((m: any) => m.id);
              const { data: altData } = await (supabase as any)
                .from('medicine_alternatives')
                .select('alternative_id, medicines!alternative_id(id, name, strength, dosage_form, category)')
                .in('medicine_id', medIds)
                .limit(6);

              const alts = (altData ?? [])
                .map((a: any) => a.medicines)
                .filter(Boolean)
                .filter((m: any, i: number, arr: any[]) => arr.findIndex(x => x.id === m.id) === i);

              setAlternatives(alts);
            } else {
              setAlternatives([]);
            }
          } catch {
            setAlternatives([]);
          } finally {
            setAltLoading(false);
          }
        } else {
          setAlternatives([]);
        }

      } catch (err: any) {
        console.error('[SearchPage] fetch error:', err);
        toast.error('Search failed: ' + err.message);
        setRawResults([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetch();
  }, [query, pharmacyId]); // Re-fetch when query OR pharmacy changes

  // ── Step 2: Recalculate distances when raw results OR location changes ─────
  useEffect(() => {
    if (!rawResults.length) { setResults([]); return; }
    const enriched = rawResults.map(r => enrichWithDistance(r, userLocation));
    setResults(sortByDistance(enriched));
  }, [rawResults, userLocation]);

  // Helper to determine what we're showing
  const hasPharmacyFilter = !!pharmacyId;
  const hasSearchQuery = !!query.trim();

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container px-3 sm:px-4 py-6 sm:py-8">
        <div className="w-full max-w-2xl mx-auto mb-6">
          <MedicineSearchBar />
        </div>

        {/* Pharmacy context banner — shown when filtering by pharmacy */}
        {hasPharmacyFilter && pharmacyName && (
          <div className="mx-auto max-w-4xl mb-6 flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
            <Store className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-bold text-primary">
                Showing stock at {pharmacyName}
              </p>
              <p className="text-sm text-muted-foreground mt-0.5">
                {hasSearchQuery 
                  ? `Results for "${query}" filtered to this pharmacy only.`
                  : `Browse all ${results.length} medicines available at this pharmacy.`}
              </p>
            </div>
            <Link 
              to={`/search?q=${encodeURIComponent(query)}`}
              className="text-sm font-semibold text-primary hover:underline shrink-0"
            >
              Search all pharmacies →
            </Link>
          </div>
        )}

        {/* Location banner */}
        {!userLocation && !isLoading && (hasSearchQuery || hasPharmacyFilter) && (
          <div className="mx-auto max-w-2xl mb-4 flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-4 py-2 text-sm text-warning">
            <MapPin className="h-4 w-4 shrink-0" />
            Enable location access to see real distances.
          </div>
        )}

        {isLoading ? (
          <div className="mt-20 flex flex-col items-center">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="mt-4 text-muted-foreground italic">Checking Gaborone pharmacies…</p>
          </div>
        ) : (
          <div>
            {((hasSearchQuery || hasPharmacyFilter) && results.length > 0) ? (
              <>
                <p className="mb-4 text-sm text-muted-foreground">
                  {hasPharmacyFilter && !hasSearchQuery 
                    ? `${results.length} medicine${results.length !== 1 ? 's' : ''} in stock at ${pharmacyName}`
                    : `${results.length} result${results.length !== 1 ? 's' : ''} for "${query}"${hasPharmacyFilter ? ` at ${pharmacyName}` : ''}`
                  }
                  {userLocation ? ' · sorted by distance' : ''}
                </p>
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                  {results.map((item) => (
                    <AvailabilityCard key={item.id} item={item} />
                  ))}
                </div>
              </>
            ) : (hasSearchQuery || hasPharmacyFilter) && !isLoading ? (
              <div className="mt-16 flex flex-col items-center text-center">
                <AlertTriangle className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-xl font-bold">
                  {hasPharmacyFilter && !hasSearchQuery
                    ? `No medicines found at ${pharmacyName}`
                    : hasPharmacyFilter
                    ? `No results for "${query}" at ${pharmacyName}`
                    : `No results for "${query}"`
                  }
                </h3>
                <p className="text-muted-foreground mt-2">
                  {hasPharmacyFilter
                    ? `Try a different search term or ${!hasSearchQuery ? 'search for a specific medicine' : 'browse all medicines at this pharmacy'}`
                    : 'Try "Panado", "Amoxicillin" or "Vitamin C"'
                  }
                </p>
                {hasPharmacyFilter && (
                  <Link 
                    to={`/search?q=${encodeURIComponent(query)}`}
                    className="mt-4 text-primary font-semibold hover:underline"
                  >
                    Search all pharmacies instead →
                  </Link>
                )}
              </div>
            ) : !hasSearchQuery && !hasPharmacyFilter ? (
              <div className="mt-20 flex flex-col items-center text-center opacity-70">
                <Pill className="h-16 w-16 mb-4 text-primary" />
                <h3 className="text-lg font-semibold">Search for Medicines</h3>
                <p>Find real-time stock and prices in Gaborone</p>
              </div>
            ) : null}

            {/* ── Alternative medicines suggestion (only shown when query exists) ── */}
            {!isLoading && hasSearchQuery && alternatives.length > 0 && (
              <div className="mt-10">
                <div className={`rounded-xl border p-4 mb-6 flex items-start gap-3 ${
                  results.length === 0
                    ? 'border-warning/30 bg-warning/8'
                    : 'border-destructive/30 bg-destructive/8'
                }`}>
                  <AlertTriangle className={`h-5 w-5 shrink-0 mt-0.5 ${
                    results.length === 0 ? 'text-warning' : 'text-destructive'
                  }`} />
                  <div>
                    <p className={`font-semibold text-sm ${
                      results.length === 0 ? 'text-warning' : 'text-destructive'
                    }`}>
                      {results.length === 0
                        ? `"${query}" was not found in any Gaborone pharmacy`
                        : `"${query}" is currently out of stock at all pharmacies`}
                    </p>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      The medicines below are recorded alternatives to{' '}
                      <span className="font-semibold text-foreground">{query}</span>.
                      They may have the same therapeutic effect — consult your pharmacist or doctor before switching.
                    </p>
                  </div>
                </div>

                <p className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <Pill className="h-4 w-4 text-primary" />
                  Suggested alternatives for &ldquo;{query}&rdquo;
                </p>

                {altLoading ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                    {alternatives.map(alt => (
                      <button
                        key={alt.id}
                        onClick={() => {
                          const params = new URLSearchParams(window.location.search);
                          params.set('q', alt.name);
                          if (pharmacyId) params.set('pharmacy_id', pharmacyId);
                          if (pharmacyName) params.set('pharmacy_name', pharmacyName);
                          window.location.search = params.toString();
                        }}
                        className="rounded-xl border border-border bg-card p-4 text-left transition-all hover:border-primary/50 hover:shadow-md group"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-heading font-semibold text-card-foreground group-hover:text-primary transition-colors truncate">
                              {alt.name}
                              {alt.strength ? ` ${alt.strength}` : ''}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {alt.dosage_form ?? 'Medicine'}
                              {alt.category ? ` • ${alt.category}` : ''}
                            </p>
                          </div>
                          <span className="shrink-0 text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full whitespace-nowrap">
                            Check stock →
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-2 border-t border-border/60 pt-2">
                          Alternative to <span className="font-semibold text-foreground">{query}</span> · tap to check pharmacy availability
                        </p>
                      </button>
                    ))}
                  </div>
                )}

                <p className="mt-4 text-xs text-muted-foreground text-center">
                  Always confirm with a licensed pharmacist before substituting any medication.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SearchPage;