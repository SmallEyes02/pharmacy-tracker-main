
-- Allow pharmacists to view all reservations
CREATE POLICY "Pharmacists can view all reservations"
ON public.reservations
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'pharmacist'));

-- Allow pharmacists to update any reservation (confirm, mark ready, etc.)
CREATE POLICY "Pharmacists can update all reservations"
ON public.reservations
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'pharmacist'));
