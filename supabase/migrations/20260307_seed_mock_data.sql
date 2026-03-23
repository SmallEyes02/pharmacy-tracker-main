-- 1. SEED PHARMACIES (Gaborone Locations)
-- Added 'email' column to satisfy the NOT NULL constraint
INSERT INTO public.pharmacies (id, name, address, phone, email, location, is_active, opening_time, closing_time)
VALUES 
  ('a1b2c3d4-e5f6-47a8-9b0c-1d2e3f4a5b6c', 'Kalafi Pharmacy', 'Plot 21104, Buchbuch Road Village, Gaborone', '+267 311 5929', 'info@kalafi.bw', ST_SetSRID(ST_MakePoint(3.0588, 36.7538), 4326), true, '08:00:00', '22:00:00'),
  ('b2c3d4e5-f6a7-48b9-0c1d-2e3f4a5b6c7d', 'Tlokweng Pharmacy', 'Plot 10114, Bordergate Mall, Tlokweng', '+267 313 2223', 'contact@tlokwengpharm.bw', ST_SetSRID(ST_MakePoint(3.0500, 36.7600), 4326), true, '08:30:00', '20:00:00'),
  ('c3d4e5f6-a7b8-49c0-1d2e-3f4a5b6c7d8e', 'Pulse Pharmacy', '18116 Mahuhumetsa, Gaborone', '+267 311 2345', 'admin@pulse.bw', ST_SetSRID(ST_MakePoint(3.0650, 36.7480), 4326), true, '09:00:00', '21:00:00'),
  ('d4e5f6a7-b8c9-40d1-1e2f-3a4b5c6d7e8f', 'Main Mall Pharmacy', 'Plot 145, Main Mall, Gaborone', '+267 395 1234', 'mainmall@pharmacy.bw', ST_SetSRID(ST_MakePoint(3.0550, 36.7510), 4326), true, '08:00:00', '18:00:00'),
  ('e5f6a7b8-c9d0-41e2-af2a-3b4c5d6e7f80', 'Airport Junction Pharmacy', 'Shop 42, Airport Junction Mall', '+267 393 4567', 'aj@pharmacy.bw', ST_SetSRID(ST_MakePoint(3.0700, 36.7700), 4326), true, '09:00:00', '22:00:00');

-- 2. SEED MEDICINES (Brand Names / Variants)
INSERT INTO public.medicines (id, name, category, dosage_form, strength)
VALUES 
  ('11111111-1111-1111-1111-111111111111', 'Panadol', 'Analgesics', 'Tablet', '500mg'),
  ('22222222-2222-2222-2222-222222222222', 'Amoxil', 'Antibiotics', 'Capsule', '250mg'),
  ('33333333-3333-3333-3333-333333333333', 'Zyrtec', 'Antihistamines', 'Tablet', '10mg');

-- 3. SEED INVENTORY (Linking Pharmacies and Medicines)
INSERT INTO public.pharmacy_inventory (pharmacy_id, medicine_id, price, stock_level)
VALUES 
  ('a1b2c3d4-e5f6-47a8-9b0c-1d2e3f4a5b6c', '11111111-1111-1111-1111-111111111111', 150.00, 45),
  ('b2c3d4e5-f6a7-48b9-0c1d-2e3f4a5b6c7d', '11111111-1111-1111-1111-111111111111', 160.00, 12),
  ('a1b2c3d4-e5f6-47a8-9b0c-1d2e3f4a5b6c', '22222222-2222-2222-2222-222222222222', 280.00, 20);