ALTER TABLE public.trips ADD COLUMN is_return boolean NOT NULL DEFAULT false;
ALTER TABLE public.trips ADD COLUMN parent_trip_id uuid REFERENCES public.trips(id);
CREATE TABLE public.trip_shares (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 trip_id uuid NOT NULL UNIQUE REFERENCES public.trips(id) ON DELETE CASCADE,
 active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.trip_shares TO authenticated;
GRANT ALL ON public.trip_shares TO service_role;
ALTER TABLE public.trip_shares ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner shares" ON public.trip_shares FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.trips t WHERE t.id = trip_id AND t.user_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM public.trips t WHERE t.id = trip_id AND t.user_id = auth.uid()));
CREATE TABLE public.package_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
 sender_name text NOT NULL,
 phone text NOT NULL,
 pickup_address text NOT NULL,
 delivery_address text NOT NULL,
 package jsonb NOT NULL,
 notes text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected')),
 created_at timestamptz NOT NULL DEFAULT now(),
 decided_at timestamptz
);
GRANT SELECT ON public.package_requests TO authenticated;
GRANT ALL ON public.package_requests TO service_role;
ALTER TABLE public.package_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner reads requests" ON public.package_requests FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.trips t WHERE t.id = trip_id AND t.user_id = auth.uid()));
CREATE INDEX package_requests_trip_idx ON public.package_requests(trip_id, created_at);
CREATE FUNCTION public.shared_trip(p_token uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE result jsonb;
BEGIN
 SELECT jsonb_build_object('origin',t.origin,'destination',t.destination,'departure_date',t.departure_date,'vehicle_kind',v.kind,'active',s.active) INTO result FROM public.trip_shares s JOIN public.trips t ON t.id=s.trip_id LEFT JOIN public.vehicles v ON v.id=t.vehicle_id WHERE s.id=p_token;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.shared_trip(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.shared_trip(uuid) TO anon, authenticated, service_role;
CREATE FUNCTION public.submit_package_request(p_token uuid, p_sender text, p_phone text, p_pickup text, p_delivery text, p_package jsonb, p_notes text DEFAULT '') RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target uuid; request_id uuid := gen_random_uuid(); field text;
BEGIN
 SELECT trip_id INTO target FROM public.trip_shares WHERE id=p_token AND active=true FOR SHARE;
 IF target IS NULL THEN RAISE EXCEPTION 'El enlace no admite solicitudes'; END IF;
 IF length(trim(p_sender)) NOT BETWEEN 2 AND 100 OR length(trim(p_phone)) NOT BETWEEN 7 AND 30 OR length(trim(p_pickup)) NOT BETWEEN 5 AND 500 OR length(trim(p_delivery)) NOT BETWEEN 5 AND 500 OR length(p_notes)>2000 THEN RAISE EXCEPTION 'Revisa el contacto y las direcciones'; END IF;
 IF jsonb_typeof(p_package) IS DISTINCT FROM 'object' OR length(trim(p_package->>'name')) NOT BETWEEN 2 AND 200 THEN RAISE EXCEPTION 'Descripción inválida'; END IF;
 FOREACH field IN ARRAY ARRAY['length','width','height','weight','qty'] LOOP
  IF jsonb_typeof(p_package->field) IS DISTINCT FROM 'number' OR (p_package->>field)::numeric <= 0 OR (p_package->>field)::numeric > 10000 THEN RAISE EXCEPTION 'Medidas o peso inválidos'; END IF;
 END LOOP;
 IF (p_package->>'qty')::numeric <> trunc((p_package->>'qty')::numeric) OR (p_package->>'qty')::numeric >100 OR jsonb_typeof(p_package->'fragile') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Cantidad o fragilidad inválida'; END IF;
 IF coalesce(p_package->>'deadline','') <> '' AND (p_package->>'deadline') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$' THEN RAISE EXCEPTION 'Plazo inválido'; END IF;
 INSERT INTO public.package_requests(id,trip_id,sender_name,phone,pickup_address,delivery_address,package,notes) VALUES(request_id,target,trim(p_sender),trim(p_phone),trim(p_pickup),trim(p_delivery),jsonb_build_object('id',request_id,'name',trim(p_package->>'name'),'length',(p_package->>'length')::numeric,'width',(p_package->>'width')::numeric,'height',(p_package->>'height')::numeric,'weight',(p_package->>'weight')::numeric,'qty',(p_package->>'qty')::integer,'fragile',(p_package->>'fragile')::boolean,'deadline',coalesce(p_package->>'deadline',''),'recipient',trim(p_delivery),'pickup',trim(p_pickup)),p_notes);
 RETURN request_id;
END $$;
REVOKE ALL ON FUNCTION public.submit_package_request(uuid,text,text,text,text,jsonb,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_package_request(uuid,text,text,text,text,jsonb,text) TO anon, authenticated, service_role;
CREATE FUNCTION public.decide_package_request(p_id uuid, p_accept boolean) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target uuid; r public.package_requests; owner_id uuid;
BEGIN
 SELECT trip_id INTO target FROM public.package_requests WHERE id=p_id;
 SELECT user_id INTO owner_id FROM public.trips WHERE id=target FOR UPDATE;
 IF auth.uid() IS NULL OR owner_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'No autorizado'; END IF;
 SELECT * INTO r FROM public.package_requests WHERE id=p_id FOR UPDATE;
 IF r.status <> 'pending' THEN RAISE EXCEPTION 'Esta solicitud ya fue revisada'; END IF;
 IF p_accept THEN UPDATE public.trips SET packages=packages || jsonb_build_array(r.package) WHERE id=target; END IF;
 UPDATE public.package_requests SET status=CASE WHEN p_accept THEN 'accepted' ELSE 'rejected' END, decided_at=now() WHERE id=p_id;
 RETURN CASE WHEN p_accept THEN 'accepted' ELSE 'rejected' END;
END $$;
REVOKE ALL ON FUNCTION public.decide_package_request(uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decide_package_request(uuid,boolean) TO authenticated;
