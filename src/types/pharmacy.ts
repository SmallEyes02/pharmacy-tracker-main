export interface Pharmacy {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  phone: string;
  whatsapp?: string;
  verified: boolean;
  operatingHours: string;
  distance?: number;
  travelTime?: number;
}

export interface Medicine {
  id: string;
  genericName: string;
  atcCode: string;
  category: string;
  description?: string;
}

export interface MedicineVariant {
  id: string;
  medicineId: string;
  brandName: string;
  strength: string;
  form: string;
}

export interface InventoryItem {
  id: string;
  pharmacyId: string;
  medicineVariantId: string;
  price: number;
  quantity: number;
  status: 'in_stock' | 'low_stock' | 'out_of_stock';
  lastUpdated: string;
  pharmacy?: Pharmacy;
  medicineVariant?: MedicineVariant;
}

export interface Reservation {
  id: string;
  userId: string;
  pharmacyId: string;
  medicineVariantId: string;
  quantity: number;
  status: 'pending' | 'confirmed' | 'ready' | 'expired' | 'cancelled';
  requestedTime: string;
  confirmedTime?: string;
  expiryTime?: string;
}

export interface SearchResult {
  medicine: Medicine;
  variant: MedicineVariant;
  availability: InventoryItem[];
}

export type UserRole = 'patient' | 'pharmacist' | 'admin';
