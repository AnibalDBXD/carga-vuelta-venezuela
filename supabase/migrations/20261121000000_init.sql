CREATE TABLE public.vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'camion',
  brand text, model text, plate text,
  length_cm int NOT NULL, width_cm int NOT NULL, height_cm int NOT NULL,
  max_kg int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicles TO authenticated;
GRANT ALL ON public.vehicles TO service_role;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own vehicles" ON public.vehicles FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  origin text NOT NULL, destination text NOT NULL,
  departure_date date NOT NULL,
  packages jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trips TO authenticated;
GRANT ALL ON public.trips TO service_role;
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own trips" ON public.trips FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.return_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  trip_id uuid REFERENCES public.trips(id) ON DELETE CASCADE,
  driver_name text NOT NULL,
  phone text NOT NULL,
  origin text NOT NULL, destination text NOT NULL,
  available_date date NOT NULL,
  vehicle_kind text NOT NULL,
  free_m3 numeric NOT NULL,
  free_kg int NOT NULL,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.return_offers TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.return_offers TO authenticated;
GRANT ALL ON public.return_offers TO service_role;
ALTER TABLE public.return_offers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read active" ON public.return_offers FOR SELECT TO anon, authenticated USING (active OR auth.uid() = user_id);
CREATE POLICY "own insert" ON public.return_offers FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own update" ON public.return_offers FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own delete" ON public.return_offers FOR DELETE TO authenticated USING (auth.uid() = user_id);