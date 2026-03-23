-- 1. EXTENSIONS & ENUMS
CREATE EXTENSION IF NOT EXISTS postgis;
DO $$ BEGIN
    CREATE TYPE public.app_role AS ENUM ('patient', 'pharmacist', 'admin');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. IDENTITY TABLES (Profiles and Roles)
-- Supports user authentication and permission logic
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  phone TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'patient',
  UNIQUE (user_id, role)
);

-- 3. PHARMACY ONBOARDING (Applications)
-- Matches fields in PharmacySignupPage.tsx and AdminDashboard.tsx
CREATE TABLE IF NOT EXISTS public.pharmacy_applications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pharmacy_name TEXT NOT NULL,
  address TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  license_number TEXT NOT NULL,
  license_expiry_date DATE NOT NULL,
  issuing_authority TEXT NOT NULL,
  pharmacist_name TEXT NOT NULL,
  pharmacist_email TEXT NOT NULL,
  pharmacist_phone TEXT NOT NULL,
  opening_time TIME NOT NULL,
  closing_time TIME NOT NULL,
  accepts_medical_aid BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 4. CORE PHARMACY DATA
-- Supports SearchPage.tsx and MapPage.tsx
CREATE TABLE IF NOT EXISTS public.pharmacies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  location GEOGRAPHY(POINT) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  accepts_medical_aid BOOLEAN DEFAULT false,
  opening_time TIME,
  closing_time TIME,
  image_url TEXT,
  rating DECIMAL(3,2) DEFAULT 0.0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 5. MEDICINES & INVENTORY
-- Supports the medicine search and stock management
CREATE TABLE IF NOT EXISTS public.medicines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  dosage_form TEXT, -- e.g., Tablet, Syrup
  strength TEXT -- e.g., 500mg
);

CREATE TABLE IF NOT EXISTS public.pharmacy_inventory (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pharmacy_id UUID REFERENCES public.pharmacies(id) ON DELETE CASCADE,
  medicine_id UUID REFERENCES public.medicines(id) ON DELETE CASCADE,
  stock_level INTEGER DEFAULT 0,
  price DECIMAL(10,2),
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 6. RESERVATIONS
-- Supports the /reservations and /pharmacist routes
CREATE TABLE IF NOT EXISTS public.reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  pharmacy_id UUID REFERENCES public.pharmacies(id),
  medicine_id UUID REFERENCES public.medicines(id),
  quantity INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'ready', 'expired', 'cancelled')),
  requested_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  expiry_at TIMESTAMP WITH TIME ZONE
);