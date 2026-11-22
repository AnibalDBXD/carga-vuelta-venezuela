-- Endurece el flujo de pago y la bolsa:
-- * submit_payment_proof exige que el objeto exista en storage (antes solo se
--   chequeaba el prefijo del path: se podía pasar a payment_review sin subir nada).
-- * submit_offer_request rechaza ofertas con fecha pasada (quedaban activas y
--   seguían recibiendo solicitudes).
-- * El bucket payment-proofs limita tamaño (5 MB) y tipos (jpg/png/webp), igual
--   que la validación del cliente.

CREATE OR REPLACE FUNCTION public.submit_payment_proof(p_request uuid, p_path text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.package_requests;
BEGIN
 SELECT * INTO r FROM public.package_requests WHERE id=p_request FOR UPDATE;
 IF r.id IS NULL THEN RAISE EXCEPTION 'Solicitud no encontrada'; END IF;
 IF r.status='awaiting_payment' AND r.payment_expires_at < now() THEN
  UPDATE public.package_requests SET status='expired' WHERE id=p_request;
  RAISE EXCEPTION 'El plazo para pagar venció';
 END IF;
 IF r.status <> 'awaiting_payment' THEN RAISE EXCEPTION 'Esta solicitud no espera pago'; END IF;
 IF p_path IS NULL OR length(p_path) > 300 OR p_path NOT LIKE p_request::text || '/%' THEN RAISE EXCEPTION 'Comprobante inválido'; END IF;
 IF NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id='payment-proofs' AND name=p_path) THEN RAISE EXCEPTION 'El comprobante no llegó al servidor'; END IF;
 UPDATE public.package_requests SET status='payment_review', proof_path=p_path, proof_submitted_at=now() WHERE id=p_request;
END $$;

CREATE OR REPLACE FUNCTION public.submit_offer_request(p_offer uuid, p_sender text, p_phone text, p_pickup text, p_delivery text, p_package jsonb, p_notes text DEFAULT '', p_email text DEFAULT '') RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target uuid;
BEGIN
 SELECT trip_id INTO target FROM public.return_offers WHERE id=p_offer AND active=true AND available_date >= current_date FOR SHARE;
 IF target IS NULL THEN RAISE EXCEPTION 'Este viaje no admite solicitudes'; END IF;
 RETURN public.insert_package_request(target,p_sender,p_phone,p_pickup,p_delivery,p_package,p_notes,p_email);
END $$;

UPDATE storage.buckets
  SET file_size_limit = 5242880,
      allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp']
  WHERE id = 'payment-proofs';
