-- Peticiones desde la bolsa de viajes: las ofertas resuelven a un viaje de
-- regreso real para que las solicitudes entren al mismo inbox y, al aceptarse,
-- se añadan a la carga del tramo correcto.

-- Helper compartido: validación + insert. Sin GRANT EXECUTE: solo lo llaman
-- las RPCs públicas (SECURITY DEFINER), nunca el cliente.
CREATE FUNCTION public.insert_package_request(p_trip uuid, p_sender text, p_phone text, p_pickup text, p_delivery text, p_package jsonb, p_notes text DEFAULT '') RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE request_id uuid := gen_random_uuid(); field text;
BEGIN
 IF length(trim(p_sender)) NOT BETWEEN 2 AND 100 OR length(trim(p_phone)) NOT BETWEEN 7 AND 30 OR length(trim(p_pickup)) NOT BETWEEN 5 AND 500 OR length(trim(p_delivery)) NOT BETWEEN 5 AND 500 OR length(p_notes)>2000 THEN RAISE EXCEPTION 'Revisa el contacto y las direcciones'; END IF;
 IF jsonb_typeof(p_package) IS DISTINCT FROM 'object' OR length(trim(p_package->>'name')) NOT BETWEEN 2 AND 200 THEN RAISE EXCEPTION 'Descripción inválida'; END IF;
 FOREACH field IN ARRAY ARRAY['length','width','height','weight','qty'] LOOP
  IF jsonb_typeof(p_package->field) IS DISTINCT FROM 'number' OR (p_package->>field)::numeric <= 0 OR (p_package->>field)::numeric > 10000 THEN RAISE EXCEPTION 'Medidas o peso inválidos'; END IF;
 END LOOP;
 IF (p_package->>'qty')::numeric <> trunc((p_package->>'qty')::numeric) OR (p_package->>'qty')::numeric >100 OR jsonb_typeof(p_package->'fragile') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Cantidad o fragilidad inválida'; END IF;
 IF coalesce(p_package->>'deadline','') <> '' AND (p_package->>'deadline') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$' THEN RAISE EXCEPTION 'Plazo inválido'; END IF;
 INSERT INTO public.package_requests(id,trip_id,sender_name,phone,pickup_address,delivery_address,package,notes) VALUES(request_id,p_trip,trim(p_sender),trim(p_phone),trim(p_pickup),trim(p_delivery),jsonb_build_object('id',request_id,'name',trim(p_package->>'name'),'length',(p_package->>'length')::numeric,'width',(p_package->>'width')::numeric,'height',(p_package->>'height')::numeric,'weight',(p_package->>'weight')::numeric,'qty',(p_package->>'qty')::integer,'fragile',(p_package->>'fragile')::boolean,'deadline',coalesce(p_package->>'deadline',''),'recipient',trim(p_delivery),'pickup',trim(p_pickup)),p_notes);
 RETURN request_id;
END $$;
REVOKE ALL ON FUNCTION public.insert_package_request(uuid,text,text,text,text,jsonb,text) FROM PUBLIC, anon, authenticated;

-- El RPC por token queda como wrapper del helper.
CREATE OR REPLACE FUNCTION public.submit_package_request(p_token uuid, p_sender text, p_phone text, p_pickup text, p_delivery text, p_package jsonb, p_notes text DEFAULT '') RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target uuid;
BEGIN
 SELECT trip_id INTO target FROM public.trip_shares WHERE id=p_token AND active=true FOR SHARE;
 IF target IS NULL THEN RAISE EXCEPTION 'El enlace no admite solicitudes'; END IF;
 RETURN public.insert_package_request(target,p_sender,p_phone,p_pickup,p_delivery,p_package,p_notes);
END $$;

-- Petición anónima contra una oferta de la bolsa: resuelve el viaje de regreso.
CREATE FUNCTION public.submit_offer_request(p_offer uuid, p_sender text, p_phone text, p_pickup text, p_delivery text, p_package jsonb, p_notes text DEFAULT '') RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target uuid;
BEGIN
 SELECT trip_id INTO target FROM public.return_offers WHERE id=p_offer AND active=true FOR SHARE;
 IF target IS NULL THEN RAISE EXCEPTION 'Este viaje no admite solicitudes'; END IF;
 RETURN public.insert_package_request(target,p_sender,p_phone,p_pickup,p_delivery,p_package,p_notes);
END $$;
REVOKE ALL ON FUNCTION public.submit_offer_request(uuid,text,text,text,text,jsonb,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_offer_request(uuid,text,text,text,text,jsonb,text) TO anon, authenticated, service_role;

-- Backfill: cada oferta activa debe apuntar a un viaje de regreso (is_return).
DO $$
DECLARE o record; new_trip uuid; parent record;
BEGIN
 FOR o IN SELECT ro.id, ro.trip_id, ro.user_id, ro.origin, ro.destination, ro.available_date FROM public.return_offers ro WHERE ro.active
 LOOP
  CONTINUE WHEN o.trip_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.trips t WHERE t.id=o.trip_id AND t.is_return);
  -- Reutiliza el regreso ya planeado para la ida, si existe; si no, lo crea.
  SELECT t.id INTO new_trip FROM public.trips t WHERE t.parent_trip_id=o.trip_id AND t.is_return LIMIT 1;
  IF new_trip IS NULL THEN
   SELECT id, vehicle_id INTO parent FROM public.trips WHERE id=o.trip_id;
   INSERT INTO public.trips(user_id,vehicle_id,origin,destination,departure_date,is_return,parent_trip_id)
    VALUES(o.user_id,parent.vehicle_id,o.origin,o.destination,o.available_date,true,parent.id)
    RETURNING id INTO new_trip;
  END IF;
  UPDATE public.return_offers SET trip_id=new_trip WHERE id=o.id;
 END LOOP;
END $$;

-- El teléfono del conductor ya no es el canal de contacto: deja de ser público.
REVOKE SELECT ON public.return_offers FROM anon;
GRANT SELECT (id, origin, destination, available_date, vehicle_kind, free_m3, free_kg, driver_name, notes, active, created_at) ON public.return_offers TO anon;
