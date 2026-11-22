-- Hora estimada de salida: el conductor la fija al planear el viaje y se
-- propaga a la oferta pública de la bolsa para que salga en lo que se comparte.
ALTER TABLE public.trips ADD COLUMN departure_time time;
ALTER TABLE public.return_offers ADD COLUMN available_time time;

-- La lectura pública de la oferta es por columnas: hay que añadir la nueva.
GRANT SELECT (available_time) ON public.return_offers TO anon;
