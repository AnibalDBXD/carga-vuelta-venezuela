-- Solicitudes con varios paquetes: package_requests.package pasa a ser un
-- arreglo de bultos (los registros viejos con objeto se normalizan al leer).
CREATE OR REPLACE FUNCTION public.insert_package_request(p_trip uuid, p_sender text, p_phone text, p_pickup text, p_delivery text, p_package jsonb, p_notes text DEFAULT '', p_email text DEFAULT '') RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE request_id uuid := gen_random_uuid(); field text; elems jsonb; el record; ord int := 0; pkgs jsonb := '[]'::jsonb;
BEGIN
 IF length(trim(p_sender)) NOT BETWEEN 2 AND 100 OR length(trim(p_phone)) NOT BETWEEN 7 AND 30 OR length(trim(p_pickup)) NOT BETWEEN 5 AND 500 OR length(trim(p_delivery)) NOT BETWEEN 5 AND 500 OR length(p_notes)>2000 THEN RAISE EXCEPTION 'Revisa el contacto y las direcciones'; END IF;
 IF length(p_email) > 254 OR trim(p_email) !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN RAISE EXCEPTION 'Correo inválido'; END IF;
 elems := CASE WHEN jsonb_typeof(p_package)='array' THEN p_package WHEN jsonb_typeof(p_package)='object' THEN jsonb_build_array(p_package) ELSE NULL END;
 IF elems IS NULL OR jsonb_array_length(elems) NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'Cantidad de bultos inválida'; END IF;
 FOR el IN SELECT value AS pkg FROM jsonb_array_elements(elems) LOOP
  ord := ord + 1;
  IF jsonb_typeof(el.pkg) IS DISTINCT FROM 'object' OR length(trim(el.pkg->>'name')) NOT BETWEEN 2 AND 200 THEN RAISE EXCEPTION 'Descripción inválida'; END IF;
  FOREACH field IN ARRAY ARRAY['length','width','height','weight','qty'] LOOP
   IF jsonb_typeof(el.pkg->field) IS DISTINCT FROM 'number' OR (el.pkg->>field)::numeric <= 0 OR (el.pkg->>field)::numeric > 10000 THEN RAISE EXCEPTION 'Medidas o peso inválidos'; END IF;
  END LOOP;
  IF (el.pkg->>'qty')::numeric <> trunc((el.pkg->>'qty')::numeric) OR (el.pkg->>'qty')::numeric >100 OR jsonb_typeof(el.pkg->'fragile') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Cantidad o fragilidad inválida'; END IF;
  IF coalesce(el.pkg->>'deadline','') <> '' AND (el.pkg->>'deadline') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$' THEN RAISE EXCEPTION 'Plazo inválido'; END IF;
  pkgs := pkgs || jsonb_build_array(jsonb_build_object('id',request_id::text||'-'||ord,'name',trim(el.pkg->>'name'),'length',(el.pkg->>'length')::numeric,'width',(el.pkg->>'width')::numeric,'height',(el.pkg->>'height')::numeric,'weight',(el.pkg->>'weight')::numeric,'qty',(el.pkg->>'qty')::integer,'fragile',(el.pkg->>'fragile')::boolean,'deadline',coalesce(el.pkg->>'deadline',''),'recipient',trim(p_delivery),'pickup',trim(p_pickup)));
 END LOOP;
 INSERT INTO public.package_requests(id,trip_id,sender_name,phone,email,pickup_address,delivery_address,package,notes) VALUES(request_id,p_trip,trim(p_sender),trim(p_phone),lower(trim(p_email)),trim(p_pickup),trim(p_delivery),pkgs,p_notes);
 RETURN request_id;
END $$;
REVOKE ALL ON FUNCTION public.insert_package_request(uuid,text,text,text,text,jsonb,text,text) FROM PUBLIC, anon, authenticated;

-- confirm_payment añade todos los bultos de la solicitud (objeto legado o arreglo).
CREATE OR REPLACE FUNCTION public.confirm_payment(p_request uuid) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.package_requests;
BEGIN
 SELECT * INTO r FROM public.package_requests WHERE id=p_request FOR UPDATE;
 IF r.id IS NULL THEN RETURN 'not_found'; END IF;
 IF r.status='paid' THEN RETURN 'paid'; END IF;
 IF r.status='awaiting_payment' AND r.payment_expires_at < now() THEN
  UPDATE public.package_requests SET status='expired' WHERE id=p_request;
  RETURN 'expired';
 END IF;
 IF r.status='payment_review' AND r.proof_submitted_at IS NOT NULL AND now() - r.proof_submitted_at >= interval '2 seconds' THEN
  PERFORM 1 FROM public.trips WHERE id=r.trip_id FOR UPDATE;
  UPDATE public.package_requests SET status='paid', paid_at=now() WHERE id=p_request;
  UPDATE public.trips SET packages=packages || CASE WHEN jsonb_typeof(r.package)='array' THEN r.package ELSE jsonb_build_array(r.package) END WHERE id=r.trip_id;
  RETURN 'paid';
 END IF;
 RETURN r.status;
END $$;
