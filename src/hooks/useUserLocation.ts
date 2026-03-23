import { useState, useEffect, useCallback } from 'react';

export interface UserLocation {
  latitude: number;
  longitude: number;
}

interface UseUserLocationReturn {
  location: UserLocation | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
}

/**
 * Haversine formula — returns distance in km between two lat/lng points.
 */
export const haversineDistance = (
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number => {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return parseFloat((R * c).toFixed(1));
};

/**
 * Estimates walking/driving travel time in minutes.
 * Assumes ~4 km/h walking speed for short distances.
 */
export const estimateTravelTime = (distanceKm: number): number => {
  const walkingSpeedKmh = 4;
  return Math.round((distanceKm / walkingSpeedKmh) * 60);
};

/**
 * Enriches a list of items that have latitude/longitude with
 * real distance and travel time from the user's location.
 */
export const usePharmaciesWithDistance = <
  T extends { latitude?: number | null; longitude?: number | null }
>(
  items: T[],
  userLocation: UserLocation | null
): (T & { distance: string; travelTime: number })[] => {
  if (!userLocation || !items.length) {
    return items.map((item) => ({
      ...item,
      distance: '—',
      travelTime: 0,
    }));
  }

  return items
    .map((item) => {
      if (item.latitude == null || item.longitude == null) {
        return { ...item, distance: '—', travelTime: 0 };
      }
      const dist = haversineDistance(
        userLocation.latitude,
        userLocation.longitude,
        item.latitude,
        item.longitude
      );
      return {
        ...item,
        distance: dist.toFixed(1),
        travelTime: estimateTravelTime(dist),
      };
    })
    .sort((a, b) => parseFloat(a.distance) - parseFloat(b.distance));
};

/**
 * Primary hook — two-stage location strategy:
 *
 * Stage 1 (fast): getCurrentPosition with enableHighAccuracy:false
 *   → gets a quick network/WiFi/IP-based fix in ~1s. Works on desktops
 *     and devices without GPS hardware.
 *
 * Stage 2 (accurate): getCurrentPosition with enableHighAccuracy:true
 *   → attempts a GPS fix. If it succeeds it replaces the coarse position.
 *     If it times out or fails, the coarse position from Stage 1 is kept.
 *     This stage is silently skipped on failure so the user always gets
 *     something rather than an error.
 */
export const useUserLocation = (): UseUserLocationReturn => {
  const [location, setLocation] = useState<UserLocation | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  const startWatch = useCallback(() => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    // ── Stage 1: fast coarse fix (network / WiFi / IP) ──────────────────────
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        setLoading(false);

        // ── Stage 2: refine with GPS if available (silent on failure) ──────
        navigator.geolocation.getCurrentPosition(
          (accuratePos) => {
            // Only update if the accurate fix is actually more precise
            if (accuratePos.coords.accuracy < pos.coords.accuracy) {
              setLocation({
                latitude:  accuratePos.coords.latitude,
                longitude: accuratePos.coords.longitude,
              });
            }
          },
          () => {
            // GPS unavailable (desktop, indoor, etc.) — silently keep Stage 1 result
            console.info('[useUserLocation] GPS unavailable, using coarse location');
          },
          { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 }
        );
      },
      (err) => {
        console.warn('[useUserLocation] Stage 1 error:', err.message);

        if (err.code === 1) {
          // Permission denied — nothing we can do
          setError('Location permission denied. Enable it in your browser settings.');
          setLoading(false);
          return;
        }

        // Stage 1 failed (e.g. no network location either) — try GPS directly
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            setLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
            setLoading(false);
          },
          (gpsErr) => {
            console.warn('[useUserLocation] Stage 2 error:', gpsErr.message);
            setError('Could not determine your location. Check browser permissions and try again.');
            setLoading(false);
          },
          { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 }
        );
      },
      // Stage 1 options: low accuracy = fast, works without GPS
      { enableHighAccuracy: false, timeout: 5_000, maximumAge: 30_000 }
    );
  }, []);

  useEffect(() => {
    startWatch();
  }, [startWatch]);

  return { location, loading, error, retry: startWatch };
};