import { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  MapContainer, TileLayer, Marker, Popup, useMap, Polyline,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { supabase } from '@/integrations/supabase/client';
import Header from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  MapPin, List, Locate, X, Clock, Phone, CreditCard,
  Loader2, AlertTriangle, Navigation, ChevronDown, ChevronUp,
  RotateCcw, Footprints,
} from 'lucide-react';
import { useLocationContext } from '@/contexts/LocationContext';
import { haversineDistance, estimateTravelTime } from '@/hooks/useUserLocation';
import { toast } from 'sonner';

// ── WKB hex parser (PostGIS returns geography as EWKB hex via JS client) ────────
const parseWKBCoords = (location: any): { lat: number; lng: number } | null => {
  if (!location) return null;
  if (location.coordinates && Array.isArray(location.coordinates)) {
    const [lng, lat] = location.coordinates;
    if (typeof lat === 'number' && typeof lng === 'number') return { lat, lng };
  }
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

// ── Leaflet icon fix ─────────────────────────────────────────────────────────
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl:       'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl:     'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// ── Custom icons ─────────────────────────────────────────────────────────────
const makePharmacyIcon = (selected: boolean) =>
  new L.DivIcon({
    html: `
      <div style="position:relative;width:${selected ? 40 : 32}px;height:${selected ? 40 : 32}px">
        <div style="
          background:${selected ? 'hsl(12,80%,55%)' : 'hsl(165,70%,36%)'};
          width:100%;height:100%;
          border-radius:50% 50% 50% 0;
          transform:rotate(-45deg);
          border:3px solid white;
          box-shadow:0 2px ${selected ? 16 : 8}px rgba(0,0,0,${selected ? 0.5 : 0.3});
        "></div>
        ${selected ? `<div style="
          position:absolute;top:-6px;left:-6px;right:-6px;bottom:-6px;
          border-radius:50% 50% 50% 0;transform:rotate(-45deg);
          border:2px solid rgba(220,90,60,0.4);
          animation:pulsering 1.5s infinite;
        "></div>` : ''}
      </div>
      <style>
        @keyframes pulsering {
          0%,100% { opacity:1; transform:rotate(-45deg) scale(1); }
          50%      { opacity:0.4; transform:rotate(-45deg) scale(1.25); }
        }
      </style>
    `,
    iconSize:    [selected ? 40 : 32, selected ? 40 : 32],
    iconAnchor:  [selected ? 20 : 16, selected ? 40 : 32],
    popupAnchor: [0, selected ? -44 : -34],
    className:   '',
  });

const userIcon = new L.DivIcon({
  html: `
    <div style="position:relative;width:20px;height:20px">
      <div style="background:hsl(217,91%,60%);width:20px;height:20px;border-radius:50%;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3)"></div>
      <div style="position:absolute;top:-6px;left:-6px;width:32px;height:32px;border-radius:50%;background:rgba(59,130,246,0.2);animation:ripple 2s infinite"></div>
    </div>
    <style>@keyframes ripple{0%{transform:scale(0.8);opacity:1}100%{transform:scale(2);opacity:0}}</style>
  `,
  iconSize:   [20, 20],
  iconAnchor: [10, 10],
  className:  '',
});

// ── Types ────────────────────────────────────────────────────────────────────
interface PharmacyRow {
  id: string;
  name: string;
  address: string;
  phone: string;
  email: string;
  accepts_medical_aid: boolean;
  opening_time: string | null;
  closing_time: string | null;
  is_active: boolean;
  location: any;
  latitude: number | null;
  longitude: number | null;
  distance: string;
  travelTime: number;
}

interface RouteStep {
  instruction: string;
  distance: string;
}

interface RouteInfo {
  polyline: [number, number][];
  steps: RouteStep[];
  totalDistance: string;
  totalDuration: string;
}

// ── Map controller ────────────────────────────────────────────────────────────
const MapController = ({
  flyTo,
  userPosition,
  routeBounds,
}: {
  flyTo: [number, number] | null;
  userPosition: [number, number] | null;
  routeBounds: [[number, number], [number, number]] | null;
}) => {
  const map = useMap();

  useEffect(() => {
    if (routeBounds) {
      map.fitBounds(routeBounds, { padding: [80, 80], maxZoom: 16, duration: 1.2 } as any);
    }
  }, [routeBounds, map]);

  useEffect(() => {
    if (flyTo && !routeBounds) {
      map.flyTo(flyTo, 16, { duration: 1.2 });
    }
  }, [flyTo, routeBounds, map]);

  useEffect(() => {
    if (userPosition) {
      map.flyTo(userPosition, 14, { duration: 1.5 });
    }
  }, [userPosition, map]);

  return null;
};

// ── OSRM routing (free, no API key) ─────────────────────────────────────────
const fetchOSRMRoute = async (
  from: { latitude: number; longitude: number },
  to:   { latitude: number; longitude: number }
): Promise<RouteInfo | null> => {
  try {
    const url =
      `https://router.project-osrm.org/route/v1/foot/` +
      `${from.longitude},${from.latitude};${to.longitude},${to.latitude}` +
      `?overview=full&geometries=geojson&steps=true`;

    const res = await fetch(url);
    if (!res.ok) throw new Error('Routing API request failed');

    const data = await res.json();
    if (data.code !== 'Ok' || !data.routes?.length) throw new Error('No route found');

    const route = data.routes[0];

    // GeoJSON coords are [lng, lat] — flip to Leaflet's [lat, lng]
    const polyline: [number, number][] = route.geometry.coordinates.map(
      ([lng, lat]: [number, number]) => [lat, lng]
    );

    // Build human-readable turn instructions
    const steps: RouteStep[] = [];
    for (const leg of route.legs) {
      for (const step of leg.steps) {
        const type     = step.maneuver?.type ?? '';
        const modifier = step.maneuver?.modifier ?? '';
        const road     = step.name || 'the road';
        const distM    = step.distance as number;

        let instruction = '';
        if (type === 'depart')                              instruction = `Head out on ${road}`;
        else if (type === 'arrive')                         instruction = `Arrive at your destination`;
        else if (type === 'turn' && modifier)               instruction = `Turn ${modifier} onto ${road}`;
        else if (type === 'new name')                       instruction = `Continue onto ${road}`;
        else if (type === 'continue')                       instruction = `Continue on ${road}`;
        else if (type === 'roundabout' || type === 'rotary') instruction = `Take the roundabout onto ${road}`;
        else if (type === 'fork')                           instruction = `Keep ${modifier} at the fork onto ${road}`;
        else if (type === 'merge')                          instruction = `Merge onto ${road}`;
        else                                                instruction = `Continue on ${road}`;

        const distLabel = distM >= 1000
          ? `${(distM / 1000).toFixed(1)} km`
          : `${Math.round(distM)} m`;

        if (distM > 5) steps.push({ instruction, distance: distLabel });
      }
    }

    const totalM = route.distance as number;
    const totalS = route.duration as number;

    return {
      polyline,
      steps,
      totalDistance: totalM >= 1000 ? `${(totalM / 1000).toFixed(1)} km` : `${Math.round(totalM)} m`,
      totalDuration: totalS >= 3600
        ? `${Math.floor(totalS / 3600)}h ${Math.floor((totalS % 3600) / 60)} min`
        : `${Math.round(totalS / 60)} min`,
    };
  } catch (err) {
    console.error('[OSRM]', err);
    return null;
  }
};

// ── Main component ────────────────────────────────────────────────────────────
const GABORONE_CENTER: [number, number] = [-24.6282, 25.9231];

const MapPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const { userLocation, locationLoading, locationError, retryLocation } =
    useLocationContext();

  const [pharmacies, setPharmacies]       = useState<PharmacyRow[]>([]);
  const [dataLoading, setDataLoading]     = useState(true);
  const [selectedId, setSelectedId]       = useState<string | null>(null);
  const [showList, setShowList]           = useState(false);

  const [flyToPos, setFlyToPos]           = useState<[number, number] | null>(null);
  const [flyToUser, setFlyToUser]         = useState<[number, number] | null>(null);

  // Routing
  const [route, setRoute]                 = useState<RouteInfo | null>(null);
  const [routeLoading, setRouteLoading]   = useState(false);
  const [showSteps, setShowSteps]         = useState(false);
  const [routeBounds, setRouteBounds]     = useState<[[number,number],[number,number]] | null>(null);

  // ── Fetch pharmacies ───────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      setDataLoading(true);
      const { data, error } = await (supabase
        .from('pharmacies' as any)
        .select('id,name,address,phone,email,accepts_medical_aid,opening_time,closing_time,is_active,location')
        .eq('is_active', true) as any);

      if (error) { toast.error('Failed to load pharmacies'); setDataLoading(false); return; }

      const enriched: PharmacyRow[] = (data ?? []).map((row: any) => {
        const coords = parseWKBCoords(row.location);
        const lat    = coords?.lat ?? null;
        const lng    = coords?.lng ?? null;
        let distance = '—';
        let travelTime = 0;
        if (userLocation && lat != null && lng != null) {
          const d  = haversineDistance(userLocation.latitude, userLocation.longitude, lat, lng);
          distance = d.toFixed(1);
          travelTime = estimateTravelTime(d);
        }
        return { ...row, latitude: lat, longitude: lng, distance, travelTime };
      }).sort((a: PharmacyRow, b: PharmacyRow) => {
        if (a.distance === '—') return 1;
        if (b.distance === '—') return -1;
        return parseFloat(a.distance) - parseFloat(b.distance);
      });

      setPharmacies(enriched);
      setDataLoading(false);
    };
    load();
  }, []); // fetch once — distance recalculated in separate effect

  // ── Recalculate distances when location resolves ───────────────────────────
  useEffect(() => {
    if (!pharmacies.length || !userLocation) return;
    setPharmacies(prev => {
      const updated = prev.map(p => {
        if (p.latitude == null || p.longitude == null) return p;
        const d = haversineDistance(userLocation.latitude, userLocation.longitude, p.latitude, p.longitude);
        return { ...p, distance: d.toFixed(1), travelTime: estimateTravelTime(d) };
      });
      return [...updated].sort((a, b) => {
        if (a.distance === '—') return 1;
        if (b.distance === '—') return -1;
        return parseFloat(a.distance) - parseFloat(b.distance);
      });
    });
  }, [userLocation]);

  // ── URL params (from SearchPage "View on Map") ─────────────────────────────
  useEffect(() => {
    const lat = parseFloat(searchParams.get('lat') ?? '');
    const lng = parseFloat(searchParams.get('lng') ?? '');
    const id  = searchParams.get('id');
    if (!isNaN(lat) && !isNaN(lng)) setFlyToPos([lat, lng]);
    if (id) setSelectedId(id);
  }, [searchParams]);

  // ── Clear route when pharmacy selection changes ────────────────────────────
  useEffect(() => {
    setRoute(null);
    setShowSteps(false);
    setRouteBounds(null);
  }, [selectedId]);

  // ── Get walking directions via OSRM ───────────────────────────────────────
  // Accepts an optional pharmacyOverride so the popup button can pass the
  // pharmacy directly — bypassing the stale-closure problem with selectedId.
  const handleGetDirections = useCallback(async (pharmacyOverride?: PharmacyRow) => {
    const pharmacy = pharmacyOverride ?? pharmacies.find((p) => p.id === selectedId);
    if (!pharmacy || pharmacy.latitude == null || pharmacy.longitude == null) return;

    if (!userLocation) {
      toast.error('Enable location access to get directions');
      retryLocation();
      return;
    }

    setRouteLoading(true);
    const result = await fetchOSRMRoute(userLocation, {
      latitude:  pharmacy.latitude,
      longitude: pharmacy.longitude,
    });
    setRouteLoading(false);

    if (!result) {
      toast.error('Could not calculate route — try Google Maps instead');
      return;
    }

    setRoute(result);
    setShowSteps(true);

    // Fit map to show both origin and destination
    const lats = result.polyline.map(([lat]) => lat);
    const lngs = result.polyline.map(([, lng]) => lng);
    setRouteBounds([
      [Math.min(...lats), Math.min(...lngs)],
      [Math.max(...lats), Math.max(...lngs)],
    ]);
  }, [selectedId, pharmacies, userLocation, retryLocation]);

  const handleClearRoute = useCallback(() => {
    setRoute(null);
    setShowSteps(false);
    setRouteBounds(null);
    const p = pharmacies.find((ph) => ph.id === selectedId);
    if (p?.latitude != null && p?.longitude != null) setFlyToPos([p.latitude, p.longitude]);
  }, [pharmacies, selectedId]);

  const handleGoogleMaps = useCallback((pharmacy: PharmacyRow) => {
    const dest   = pharmacy.latitude != null
      ? `${pharmacy.latitude},${pharmacy.longitude}`
      : encodeURIComponent(pharmacy.address);
    const origin = userLocation
      ? `${userLocation.latitude},${userLocation.longitude}`
      : '';
    window.open(
      origin
        ? `https://www.google.com/maps/dir/${origin}/${dest}`
        : `https://www.google.com/maps/search/?api=1&query=${dest}`,
      '_blank'
    );
  }, [userLocation]);

  const selectedPharmacy = pharmacies.find((p) => p.id === selectedId) ?? null;
  const mapCenter: [number, number] = userLocation
    ? [userLocation.latitude, userLocation.longitude]
    : GABORONE_CENTER;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <div className="relative flex flex-1">

        {/* ── Sidebar ── */}
        <div className={`
          ${showList ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          absolute inset-y-0 left-0 z-20 w-full max-w-sm
          border-r border-border bg-card transition-transform lg:relative lg:block
        `}>
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="font-heading text-base font-bold text-foreground">
              {dataLoading ? 'Loading…' : `Pharmacies (${pharmacies.length})`}
            </h2>
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setShowList(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {locationError && (
            <div className="mx-3 mt-3 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <div>
                <p>{locationError}</p>
                <button className="mt-1 font-medium underline" onClick={retryLocation}>Try again</button>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2 overflow-y-auto p-3" style={{ maxHeight: 'calc(100vh - 8rem)' }}>
            {dataLoading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading…
              </div>
            ) : pharmacies.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No active pharmacies found.</p>
            ) : (
              pharmacies.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setSelectedId(p.id);
                    if (p.latitude != null && p.longitude != null) setFlyToPos([p.latitude, p.longitude]);
                    setShowList(false);
                  }}
                  className={`
                    w-full rounded-lg border p-3 text-left transition-all
                    ${selectedId === p.id
                      ? 'border-primary bg-primary/5 shadow-sm ring-1 ring-primary/20'
                      : 'border-border bg-background hover:border-primary/40 hover:bg-accent/40'}
                  `}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold leading-tight text-foreground">{p.name}</p>
                    {p.distance !== '—' && (
                      <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                        {p.distance} km
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{p.address}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {p.opening_time && p.closing_time && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {p.opening_time.slice(0,5)} – {p.closing_time.slice(0,5)}
                      </span>
                    )}
                    {p.travelTime > 0 && (
                      <span className="flex items-center gap-1">
                        <Footprints className="h-3 w-3" />
                        ~{p.travelTime} min
                      </span>
                    )}
                  </div>
                  {p.accepts_medical_aid && (
                    <Badge variant="outline" className="mt-1.5 h-4 px-1.5 py-0 text-[10px] bg-success/10 text-success border-success/20">
                      Medical Aid
                    </Badge>
                  )}
                </button>
              ))
            )}
          </div>
        </div>

        {/* ── Map ── */}
        <div className="relative flex-1">
          <MapContainer
            center={mapCenter}
            zoom={13}
            className="h-full w-full"
            style={{ minHeight: 'calc(100vh - 4rem)' }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            <MapController flyTo={flyToPos} userPosition={flyToUser} routeBounds={routeBounds} />

            {/* Walking route polyline */}
            {route && (
              <Polyline
                positions={route.polyline}
                pathOptions={{
                  color: '#3b82f6',
                  weight: 5,
                  opacity: 0.85,
                  lineCap: 'round',
                  lineJoin: 'round',
                }}
              />
            )}

            {/* User location marker */}
            {userLocation && (
              <Marker position={[userLocation.latitude, userLocation.longitude]} icon={userIcon}>
                <Popup>
                  <p className="font-semibold text-sm">📍 You are here</p>
                </Popup>
              </Marker>
            )}

            {/* Pharmacy markers */}
            {pharmacies.map((p) => {
              if (p.latitude == null || p.longitude == null) return null;
              const isSelected = selectedId === p.id;
              return (
                <Marker
                  key={p.id}
                  position={[p.latitude, p.longitude]}
                  icon={makePharmacyIcon(isSelected)}
                  eventHandlers={{
                    click: () => {
                      setSelectedId(p.id);
                      setFlyToPos([p.latitude!, p.longitude!]);
                      setShowList(false);
                    },
                  }}
                >
                  <Popup>
                    <div className="min-w-[210px] space-y-1.5 py-1">
                      <p className="font-semibold text-sm leading-tight">{p.name}</p>
                      <p className="text-xs text-gray-500">{p.address}</p>
                      {p.opening_time && p.closing_time && (
                        <p className="text-xs">🕐 {p.opening_time.slice(0,5)} – {p.closing_time.slice(0,5)}</p>
                      )}
                      {p.phone && <p className="text-xs">📞 {p.phone}</p>}
                      {p.distance !== '—' && (
                        <p className="text-xs font-semibold text-emerald-600">
                          📍 {p.distance} km away · ~{p.travelTime} min walk
                        </p>
                      )}
                      {p.accepts_medical_aid && (
                        <p className="text-xs font-medium text-emerald-600">✓ Accepts Medical Aid</p>
                      )}
                      {/* Directions button inside popup — passes pharmacy directly
                          to avoid stale-closure issues with selectedId state */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedId(p.id);
                          handleGetDirections(p); // pass p directly, no setTimeout needed
                        }}
                        className="mt-2 w-full rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-700 active:scale-95"
                      >
                        🗺️ Get Directions
                      </button>
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>

          {/* ── Map controls ── */}
          <div className="absolute right-4 top-4 z-[1000] flex flex-col gap-2">
            <Button
              size="icon" variant="outline" title="My location"
              className="bg-card shadow-md"
              onClick={() => {
                if (userLocation) setFlyToUser([userLocation.latitude, userLocation.longitude]);
                else retryLocation();
              }}
              disabled={locationLoading}
            >
              {locationLoading
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Locate className="h-4 w-4" />
              }
            </Button>

            {route && (
              <Button
                size="icon" variant="outline" title="Clear route"
                className="bg-card shadow-md text-destructive hover:text-destructive"
                onClick={handleClearRoute}
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            )}

            <Button
              size="icon" variant="outline"
              className="bg-card shadow-md lg:hidden"
              onClick={() => setShowList(true)}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>

          {/* ── Bottom panel: pharmacy info + directions ── */}
          {selectedPharmacy && (
            <div className="absolute bottom-4 left-1/2 z-[1000] w-[calc(100%-2rem)] max-w-md -translate-x-1/2">
              <div className="overflow-hidden rounded-xl border border-border bg-card shadow-elevated">

                {/* Pharmacy header */}
                <div className="flex items-start justify-between gap-2 p-4 pb-2">
                  <div className="min-w-0">
                    <p className="font-heading font-bold text-foreground truncate">
                      {selectedPharmacy.name}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {selectedPharmacy.address}
                    </p>
                  </div>
                  <button
                    onClick={() => { setSelectedId(null); handleClearRoute(); }}
                    className="mt-0.5 shrink-0 rounded p-1 hover:bg-accent"
                  >
                    <X className="h-4 w-4 text-muted-foreground" />
                  </button>
                </div>

                {/* Info chips */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 pb-3 text-xs text-muted-foreground">
                  {selectedPharmacy.opening_time && selectedPharmacy.closing_time && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {selectedPharmacy.opening_time.slice(0,5)} – {selectedPharmacy.closing_time.slice(0,5)}
                    </span>
                  )}
                  {selectedPharmacy.phone && (
                    <a
                      href={`tel:${selectedPharmacy.phone}`}
                      className="flex items-center gap-1 hover:text-foreground"
                    >
                      <Phone className="h-3 w-3" />
                      {selectedPharmacy.phone}
                    </a>
                  )}
                  {selectedPharmacy.distance !== '—' && (
                    <span className="flex items-center gap-1 font-medium text-primary">
                      <MapPin className="h-3 w-3" />
                      {selectedPharmacy.distance} km · ~{selectedPharmacy.travelTime} min walk
                    </span>
                  )}
                  {selectedPharmacy.accepts_medical_aid && (
                    <span className="flex items-center gap-1 text-success">
                      <CreditCard className="h-3 w-3" /> Medical Aid
                    </span>
                  )}
                </div>

                {/* Route summary (appears after directions are fetched) */}
                {route && (
                  <div className="mx-4 mb-3 flex items-center justify-between rounded-lg bg-blue-500/10 px-3 py-2">
                    <div className="flex items-center gap-2 text-sm font-semibold text-blue-600 dark:text-blue-400">
                      <Navigation className="h-4 w-4" />
                      <span>{route.totalDistance}</span>
                      <span className="font-normal text-muted-foreground">·</span>
                      <span>{route.totalDuration} walking</span>
                    </div>
                    <button
                      onClick={() => setShowSteps((s) => !s)}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      {showSteps ? 'Hide' : 'Steps'}
                      {showSteps ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </button>
                  </div>
                )}

                {/* Turn-by-turn steps list */}
                {route && showSteps && (
                  <div className="mx-4 mb-3 max-h-44 overflow-y-auto rounded-lg border border-border bg-background">
                    {route.steps.map((step, i) => (
                      <div
                        key={i}
                        className={`flex items-start gap-2.5 px-3 py-2 text-xs ${
                          i !== route.steps.length - 1 ? 'border-b border-border' : ''
                        }`}
                      >
                        <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[9px] font-bold text-primary">
                          {i + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="text-foreground leading-snug">{step.instruction}</p>
                          <p className="text-muted-foreground">{step.distance}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex gap-2 p-4 pt-0">
                  {!route ? (
                    <>
                      <Button
                        size="sm"
                        className="flex-1 gap-1.5"
                        onClick={() => handleGetDirections()}
                        disabled={routeLoading || !userLocation}
                        title={!userLocation ? 'Enable location to get directions' : undefined}
                      >
                        {routeLoading
                          ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Calculating…</>
                          : <><Navigation className="h-3.5 w-3.5" /> Get Directions</>
                        }
                      </Button>
                      <Button
                        size="sm" variant="outline" className="flex-1 gap-1.5"
                        onClick={() => handleGoogleMaps(selectedPharmacy)}
                      >
                        <MapPin className="h-3.5 w-3.5" /> Google Maps
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        size="sm" variant="outline"
                        className="flex-1 gap-1.5 text-destructive hover:text-destructive"
                        onClick={handleClearRoute}
                      >
                        <RotateCcw className="h-3.5 w-3.5" /> Clear Route
                      </Button>
                      <Button
                        size="sm" variant="outline" className="flex-1 gap-1.5"
                        onClick={() => handleGoogleMaps(selectedPharmacy)}
                      >
                        <MapPin className="h-3.5 w-3.5" /> Google Maps
                      </Button>
                    </>
                  )}
                </div>

                {/* Location disabled warning */}
                {!userLocation && !locationLoading && (
                  <p className="px-4 pb-3 text-center text-xs text-muted-foreground">
                    ⚠ Enable browser location to get walking directions
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MapPage;
