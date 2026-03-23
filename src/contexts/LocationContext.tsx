import { createContext, useContext, ReactNode } from 'react';
import {
  useUserLocation,
  usePharmaciesWithDistance,
  UserLocation,
} from '@/hooks/useUserLocation';

interface LocationContextType {
  userLocation: UserLocation | null;
  locationLoading: boolean;
  locationError: string | null;
  retryLocation: () => void;
}

const LocationContext = createContext<LocationContextType>({
  userLocation: null,
  locationLoading: true,
  locationError: null,
  retryLocation: () => {},
});

export const useLocationContext = () => useContext(LocationContext);

// Re-export the distance hook so consumers can use it directly
export { usePharmaciesWithDistance };

export const LocationProvider = ({ children }: { children: ReactNode }) => {
  const { location, loading, error, retry } = useUserLocation();

  return (
    <LocationContext.Provider
      value={{
        userLocation: location,
        locationLoading: loading,
        locationError: error,
        retryLocation: retry,
      }}
    >
      {children}
    </LocationContext.Provider>
  );
};