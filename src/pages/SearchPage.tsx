import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import Header from '@/components/Header';
import MedicineSearchBar from '@/components/MedicineSearchBar';
import AvailabilityCard from '@/components/AvailabilityCard';
import { Pill, AlertTriangle, Loader2, MapPin } from 'lucide-react';
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
  // Supabase returns geography columns as hex-encoded WKB when selected via JS.
  // Structure (little-endian): [1 byte order][4 type][4 SRID][8 X/lng][8 Y/lat]
  if (typeof location === "string" && /^[0-9A-Fa-f]+$/.test(location) && location.length >= 42) {
    try {
      const hex = location;
      const readDouble = (offset: number): number => {
        // Read 8 bytes as little-endian double
        let bytes = "";
        for (let i = 7; i >= 0; i--) {
          bytes += hex.slice(offset + i * 2, offset + i * 2 + 2);
        }
        const buf = new ArrayBuffer(8);
        const view = new DataView(buf);
        for (let i = 0; i < 8; i++) {
          view.setUint8(i, parseInt(bytes.slice(i * 2, i * 2 + 2), 16));
        }
        return view.getFloat64(0, false); // big-endian after manual reversal
      };

      // Byte 0: byte order. Bytes 1-4: type. Bytes 5-8: SRID. Bytes 9-16: X. Bytes 17-24: Y
      const lng = readDouble(18); // offset 9 bytes = 18 hex chars
      const lat = readDouble(34); // offset 17 bytes = 34 hex chars
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
  const query = searchParams.get('q') || '';

  const { userLocation } = useLocationContext();

  // Raw results from Supabase — fetched once per query
  const [rawResults, setRawResults] = useState<RawResult[]>([]);
  // Enriched results with distance — recalculated when location changes
  const [results, setResults]       = useState<any[]>([]);
  const [isLoading, setIsLoading]   = useState(false);

  // ── Step 1: Fetch from Supabase when query changes ────────────────────────
  useEffect(() => {
    if (!query.trim()) {
      setRawResults([]);
      setResults([]);
      return;
    }

    const fetch = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await (supabase
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
          `)
          .or(
            `name.ilike.%${query}%,category.ilike.%${query}%`,
            { foreignTable: 'medicines' as any }
          ) as any);

        if (error) throw error;

        const valid = (data || []).filter(
          (item: any) => item.pharmacies && item.medicines && item.pharmacies.is_active
        ) as RawResult[];

        setRawResults(valid);
      } catch (err: any) {
        console.error('[SearchPage] fetch error:', err);
        toast.error('Search failed: ' + err.message);
        setRawResults([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetch();
  }, [query]); // only re-fetch when query changes

  // ── Step 2: Recalculate distances when raw results OR location changes ─────
  // This runs instantly when location resolves — no extra network call
  useEffect(() => {
    if (!rawResults.length) { setResults([]); return; }
    const enriched = rawResults.map(r => enrichWithDistance(r, userLocation));
    setResults(sortByDistance(enriched));
  }, [rawResults, userLocation]);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container px-4 py-8">
        <div className="mx-auto max-w-2xl mb-8">
          <MedicineSearchBar />
        </div>

        {/* Location banner */}
        {!userLocation && query && !isLoading && (
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
            {query && results.length > 0 ? (
              <>
                <p className="mb-4 text-sm text-muted-foreground">
                  {results.length} result{results.length !== 1 ? 's' : ''} for &ldquo;{query}&rdquo;
                  {userLocation ? ' · sorted by distance' : ''}
                </p>
                <div className="grid gap-6 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                  {results.map((item) => (
                    <AvailabilityCard key={item.id} item={item} />
                  ))}
                </div>
              </>
            ) : query && !isLoading ? (
              <div className="mt-16 flex flex-col items-center text-center">
                <AlertTriangle className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-xl font-bold">No results for &ldquo;{query}&rdquo;</h3>
                <p className="text-muted-foreground">Try &ldquo;Panado&rdquo;, &ldquo;Amoxicillin&rdquo; or &ldquo;Vitamin C&rdquo;</p>
              </div>
            ) : !query ? (
              <div className="mt-20 flex flex-col items-center text-center opacity-70">
                <Pill className="h-16 w-16 mb-4 text-primary" />
                <h3 className="text-lg font-semibold">Search for Medicines</h3>
                <p>Find real-time stock and prices in Gaborone</p>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
};

export default SearchPage;
