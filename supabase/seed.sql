-- Datos de prueba para desarrollo local.
--
-- Corre automáticamente con `supabase db reset` (tras las migraciones) y se
-- puede reaplicar a mano sin borrar nada más:
--   podman exec -i supabase_db_cargaruta psql -U postgres -d postgres < supabase/seed.sql
--
-- Cuenta demo (ver las solicitudes del lado del conductor):
--   chofer@cargaruta.local / cargaruta123
--
-- El seed limpia las tablas de la app para que re-ejecutarlo sea determinista
-- (auth.users se conserva). Las fechas son relativas a now() para que los datos
-- nunca "venzan": las ofertas futuras siguen visibles y los viajes completados
-- siguen en el pasado.

BEGIN;

TRUNCATE public.push_subscriptions,
         public.package_requests,
         public.trip_shares,
         public.return_offers,
         public.trips,
         public.vehicles
RESTART IDENTITY CASCADE;

-- ---------------------------------------------------------------- usuarios --

-- Conductor demo dueño de los vehículos, viajes y solicitudes.
INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password,
                        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                        created_at, updated_at, confirmation_token, recovery_token,
                        email_change, email_change_token_new)
VALUES ('00000000-0000-0000-0000-000000000000',
        '11111111-1111-1111-1111-111111111111',
        'authenticated', 'authenticated', 'chofer@cargaruta.local',
        extensions.crypt('cargaruta123', extensions.gen_salt('bf')),
        now(), '{"provider":"email","providers":["email"]}', '{}',
        now(), now(), '', '', '', '')
ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.identities (id, provider_id, user_id, identity_data, provider,
                             last_sign_in_at, created_at, updated_at)
VALUES ('11111111-1111-1111-1111-111111111111',
        '11111111-1111-1111-1111-111111111111',
        '11111111-1111-1111-1111-111111111111',
        '{"sub":"11111111-1111-1111-1111-111111111111","email":"chofer@cargaruta.local"}',
        'email', now(), now(), now())
ON CONFLICT DO NOTHING;

-- --------------------------------------------------------------- vehículos --

-- Del conductor demo (dimensiones = VEHICLE_PRESETS de src/lib/venezuela.ts).
INSERT INTO public.vehicles (id, user_id, name, kind, brand, model, plate,
                             length_cm, width_cm, height_cm, max_kg)
VALUES
 ('22220000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
  'El Burro', 'camion350', 'Chevrolet', 'NPR', 'A45-CD92', 420, 200, 200, 3500),
 ('22220000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
  'La Bestia', 'camion750', 'Ford', 'F-750', 'B12-FG34', 650, 240, 240, 8000),
 ('22220000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111',
  'La Gorda', 'gandola', 'Freightliner', 'Cascadia', 'C78-HJ56', 1300, 245, 260, 30000);

-- ------------------------------------------------------------------ viajes --

-- Completados (completed_at marca el viaje terminado en la UI).
INSERT INTO public.trips (id, user_id, vehicle_id, origin, destination,
                          departure_date, departure_time, packages, notes,
                          is_return, parent_trip_id, completed_at)
VALUES
 ('33330000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
  '22220000-0000-0000-0000-000000000001', 'valencia', 'caracas',
  CURRENT_DATE - 14, '05:30',
  '[{"id":"seed-t1-1","name":"Cajas de repuestos","length":80,"width":60,"height":50,"weight":35,"qty":6,"fragile":false,"deadline":"","recipient":"Repuestos El Faro, Caracas"},
    {"id":"seed-t1-2","name":"Bombillos y accesorios","length":50,"width":40,"height":30,"weight":8,"qty":10,"fragile":true,"deadline":"","recipient":"Distribuidora Luz"}]'::jsonb,
  'Entrega en La Yaguara, cobrar al recibir', false, NULL,
  (CURRENT_DATE - 14 + interval '8 hours')),
 ('33330000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
  '22220000-0000-0000-0000-000000000003', 'caracas', 'maracaibo',
  CURRENT_DATE - 9, '04:00',
  '[{"id":"seed-t2-1","name":"Tarimas de alimento balanceado","length":120,"width":100,"height":90,"weight":420,"qty":8,"fragile":false,"deadline":"","recipient":"Agropecuaria del Zulia"},
    {"id":"seed-t2-2","name":"Bidones de aceite","length":60,"width":60,"height":90,"weight":50,"qty":12,"fragile":false,"deadline":"","recipient":"Aceites Mara"},
    {"id":"seed-t2-3","name":"Cajas de veterinaria","length":70,"width":50,"height":40,"weight":18,"qty":5,"fragile":true,"deadline":"","recipient":"Vet-Zulia"}]'::jsonb,
  'Viaje largo: parada en Agua Viva para revisar frenos', false, NULL,
  (CURRENT_DATE - 9 + interval '14 hours')),
 ('33330000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111',
  '22220000-0000-0000-0000-000000000002', 'puerto-cabello', 'valencia',
  CURRENT_DATE - 5, '07:00',
  '[{"id":"seed-t3-1","name":"Contenedor descargado en puerto","length":240,"width":200,"height":110,"weight":2600,"qty":1,"fragile":false,"deadline":"","recipient":"Galpón Los Guayos"}]'::jsonb,
  'Carga del puerto, papeles en el tablero', false, NULL,
  (CURRENT_DATE - 5 + interval '4 hours'));

-- Pendientes: dos viajes normales + dos de regreso que salen en la bolsa.
INSERT INTO public.trips (id, user_id, vehicle_id, origin, destination,
                          departure_date, departure_time, packages, notes,
                          is_return, parent_trip_id, completed_at)
VALUES
 ('33330000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111',
  '22220000-0000-0000-0000-000000000002', 'valencia', 'san-cristobal',
  CURRENT_DATE + 2, '05:00',
  '[{"id":"seed-t4-1","name":"Cemento y ferretería","length":100,"width":80,"height":60,"weight":90,"qty":20,"fragile":false,"deadline":"","recipient":"Ferretería Andina"},
    {"id":"seed-t4-2","name":"Motores reparados","length":90,"width":70,"height":70,"weight":110,"qty":3,"fragile":false,"deadline":"","recipient":"Taller San José"}]'::jsonb,
  'Salir temprano por la cola de La Pedrera', false, NULL, NULL),
 ('33330000-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111',
  '22220000-0000-0000-0000-000000000003', 'valencia', 'maturin',
  CURRENT_DATE + 4, '06:30',
  '[{"id":"seed-t5-1","name":"Tubería PVC en atados","length":300,"width":60,"height":60,"weight":45,"qty":10,"fragile":false,"deadline":"","recipient":"Construcciones Monagas"},
    {"id":"seed-t5-2","name":"Válvulas y conexiones","length":60,"width":50,"height":45,"weight":28,"qty":6,"fragile":true,"deadline":"","recipient":"Suministros Orinoco"}]'::jsonb,
  'Cliente paga contra entrega', false, NULL, NULL),
 -- Regreso 1: este viaje tiene la oferta grande de gandola en la bolsa.
 ('33330000-0000-0000-0000-000000000006', '11111111-1111-1111-1111-111111111111',
  '22220000-0000-0000-0000-000000000003', 'caracas', 'valencia',
  CURRENT_DATE + 3, '14:00',
  '[{"id":"seed-t6-0","name":"Herramientas y repuestos propios","length":120,"width":80,"height":60,"weight":150,"qty":1,"fragile":false,"deadline":"","recipient":"Taller propio"},
    {"id":"55550000-0000-0000-0000-000000000006-1","name":"Repuestos de moto","length":70,"width":50,"height":45,"weight":30,"qty":2,"fragile":false,"deadline":"","recipient":"Valencia, Av. Bolívar Norte, MotoMarket","pickup":"Caracas, San Martín, calle 9"},
    {"id":"55550000-0000-0000-0000-000000000007-1","name":"Café empacado 46kg","length":90,"width":60,"height":70,"weight":190,"qty":4,"fragile":false,"deadline":"","recipient":"Valencia, Zona Industrial Municipal, Tostaduría Los Andes","pickup":"Caracas, Mercado de Coche, local 14"}]'::jsonb,
  'Regreso con carga de la bolsa: 2 solicitudes pagas entran aquí',
  true, '33330000-0000-0000-0000-000000000001', NULL),
 -- Regreso 2: oferta del camión 350.
 ('33330000-0000-0000-0000-000000000007', '11111111-1111-1111-1111-111111111111',
  '22220000-0000-0000-0000-000000000001', 'maracay', 'valencia',
  CURRENT_DATE + 5, '08:00',
  '[]'::jsonb, 'Regreso casi vacío del mercado de Maracay',
  true, '33330000-0000-0000-0000-000000000001', NULL);

-- Viajes de otros conductores (respaldan sus ofertas de la bolsa; user_id no
-- tiene FK a auth.users, así que basta un uuid por conductor).
INSERT INTO public.trips (id, user_id, vehicle_id, origin, destination,
                          departure_date, departure_time, packages, is_return)
VALUES
 ('33330000-0000-0000-0000-000000000009', '99990000-0000-0000-0000-000000000001', NULL,
  'maracaibo', 'valencia', CURRENT_DATE + 1, '05:30', '[]'::jsonb, true),
 ('33330000-0000-0000-0000-000000000010', '99990000-0000-0000-0000-000000000002', NULL,
  'san-cristobal', 'caracas', CURRENT_DATE + 2, '06:00', '[]'::jsonb, true),
 ('33330000-0000-0000-0000-000000000011', '99990000-0000-0000-0000-000000000003', NULL,
  'puerto-ordaz', 'caracas', CURRENT_DATE + 2, '04:30', '[]'::jsonb, true),
 ('33330000-0000-0000-0000-000000000012', '99990000-0000-0000-0000-000000000004', NULL,
  'coro', 'maracay', CURRENT_DATE + 4, '07:00', '[]'::jsonb, true),
 ('33330000-0000-0000-0000-000000000013', '99990000-0000-0000-0000-000000000005', NULL,
  'maturin', 'caracas', CURRENT_DATE + 6, '05:00', '[]'::jsonb, true),
 ('33330000-0000-0000-0000-000000000014', '99990000-0000-0000-0000-000000000006', NULL,
  'cumana', 'barcelona', CURRENT_DATE + 7, '09:00', '[]'::jsonb, true),
 ('33330000-0000-0000-0000-000000000015', '99990000-0000-0000-0000-000000000007', NULL,
  'merida', 'barquisimeto', CURRENT_DATE + 8, '06:30', '[]'::jsonb, true),
 ('33330000-0000-0000-0000-000000000016', '99990000-0000-0000-0000-000000000008', NULL,
  'acarigua', 'valencia', CURRENT_DATE + 9, '07:30', '[]'::jsonb, true);

-- --------------------------------------------------------- bolsa de viajes --

INSERT INTO public.return_offers (id, user_id, trip_id, driver_name, phone,
                                 origin, destination, available_date, available_time,
                                 vehicle_kind, free_m3, free_kg, notes, active)
VALUES
 -- Las dos del conductor demo: reciben las solicitudes sembradas.
 ('44440000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
  '33330000-0000-0000-0000-000000000006', 'José Rodríguez', '0414-555-0183',
  'caracas', 'valencia', CURRENT_DATE + 3, '14:00',
  'gandola', 45, 14000,
  'Salgo de Caracas después del mediodía, paso por Maracay. Espacio de sobra en la gandola.', true),
 ('44440000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
  '33330000-0000-0000-0000-000000000007', 'José Rodríguez', '0414-555-0183',
  'maracay', 'valencia', CURRENT_DATE + 5, '08:00',
  'camion350', 10, 2200,
  'Regreso casi vacío, recojo en el centro de Maracay.', true),
 -- Otros conductores por todo el país.
 ('44440000-0000-0000-0000-000000000003', '99990000-0000-0000-0000-000000000001',
  '33330000-0000-0000-0000-000000000009', 'Ramón Guillén — Transportes del Zulia', '0416-555-2201',
  'maracaibo', 'valencia', CURRENT_DATE + 1, '05:30',
  'gandola', 30, 9000,
  'Paso el Puente de noche, llego a Valencia en la mañana.', true),
 ('44440000-0000-0000-0000-000000000004', '99990000-0000-0000-0000-000000000002',
  '33330000-0000-0000-0000-000000000010', 'Yordan Molina', '0424-555-7712',
  'san-cristobal', 'caracas', CURRENT_DATE + 2, '06:00',
  'camion750', 18, 5000,
  'Troncal 5 directo, puedo recoger en La Fría o El Vigía.', true),
 ('44440000-0000-0000-0000-000000000005', '99990000-0000-0000-0000-000000000003',
  '33330000-0000-0000-0000-000000000011', 'Luis Alcántara — CVG Carga', '0286-555-9034',
  'puerto-ordaz', 'caracas', CURRENT_DATE + 2, '04:30',
  'gandola', 50, 18000,
  'Gandola vacía de la siderúrgica, acepto carga paletizada.', true),
 ('44440000-0000-0000-0000-000000000006', '99990000-0000-0000-0000-000000000004',
  '33330000-0000-0000-0000-000000000012', 'Oswaldo Peña', '0412-555-6650',
  'coro', 'maracay', CURRENT_DATE + 4, '07:00',
  'camion350', 12, 2800,
  'Bajo por Morón–Tucacas, puedo desviar a Tucacas puerto.', true),
 ('44440000-0000-0000-0000-000000000007', '99990000-0000-0000-0000-000000000005',
  '33330000-0000-0000-0000-000000000013', 'Transporte Oriente C.A.', '0291-555-4408',
  'maturin', 'caracas', CURRENT_DATE + 6, '05:00',
  'camion750', 22, 6000,
  'Unidad con cava disponible si avisan con tiempo.', true),
 ('44440000-0000-0000-0000-000000000008', '99990000-0000-0000-0000-000000000006',
  '33330000-0000-0000-0000-000000000014', 'Nelly Suárez', '0414-555-3317',
  'cumana', 'barcelona', CURRENT_DATE + 7, '09:00',
  'pickup', 1.2, 500,
  'Camioneta con espacio, ideal para encomiendas pequeñas.', true),
 ('44440000-0000-0000-0000-000000000009', '99990000-0000-0000-0000-000000000007',
  '33330000-0000-0000-0000-000000000015', 'Andes Express', '0274-555-8829',
  'merida', 'barquisimeto', CURRENT_DATE + 8, '06:30',
  'furgon', 4, 800,
  'Furgoneta cerrada, nada de carga suelta pesada.', true),
 ('44440000-0000-0000-0000-000000000010', '99990000-0000-0000-0000-000000000008',
  '33330000-0000-0000-0000-000000000016', 'Pedro Linares', '0426-555-1145',
  'acarigua', 'valencia', CURRENT_DATE + 9, '07:30',
  'camion350', 9, 2500,
  'Todos los lunes hago esta corrida.', true);

-- -------------------------------------------------------------- solicitudes --

-- Sobre el regreso Caracas→Valencia (oferta de gandola del demo).
INSERT INTO public.package_requests (id, trip_id, sender_name, phone, email,
                                   pickup_address, delivery_address, package, notes,
                                   status, created_at, decided_at, amount_usd, total_usd,
                                   proof_path, proof_submitted_at, paid_at,
                                   payment_expires_at)
VALUES
 -- Pendientes de revisión.
 ('55550000-0000-0000-0000-000000000001', '33330000-0000-0000-0000-000000000006',
  'Distribuidora El Motor C.A.', '0412-555-9021', 'pedidos@elmotor.com.ve',
  'Caracas, Catia, Av. Sucre, galpón 4', 'Valencia, Los Guayos, calle 2, local B',
  '[{"id":"55550000-0000-0000-0000-000000000001-1","name":"Cajas de repuestos","length":60,"width":45,"height":40,"weight":22,"qty":3,"fragile":false,"deadline":"","recipient":"Valencia, Los Guayos, calle 2, local B","pickup":"Caracas, Catia, Av. Sucre, galpón 4"}]'::jsonb,
  'Son cajas cerradas, factura al día.', 'pending', now() - interval '3 hours',
  NULL, NULL, NULL, NULL, NULL, NULL, NULL),
 ('55550000-0000-0000-0000-000000000002', '33330000-0000-0000-0000-000000000006',
  'Molinos Caroní', '0286-555-3477', 'logistica@molinoscaroni.com',
  'Caracas, Palo Verde, calle Aragua', 'Valencia, Zona Industrial Norte, muelle 7',
  '[{"id":"55550000-0000-0000-0000-000000000002-1","name":"Sacos de harina de maíz","length":90,"width":60,"height":55,"weight":50,"qty":8,"fragile":false,"deadline":"","recipient":"Valencia, Zona Industrial Norte, muelle 7","pickup":"Caracas, Palo Verde, calle Aragua"}]'::jsonb,
  'Sacas de 50kg, se apilan de a dos.', 'pending', now() - interval '8 hours',
  NULL, NULL, NULL, NULL, NULL, NULL, NULL),
 ('55550000-0000-0000-0000-000000000003', '33330000-0000-0000-0000-000000000007',
  'Inversiones Marval', '0414-555-6630', 'envios@marval.com.ve',
  'Maracay, San Jacinto, carrera 5', 'Valencia, Prebo, cc El Bosque',
  '[{"id":"55550000-0000-0000-0000-000000000003-1","name":"Encomienda de documentos","length":40,"width":30,"height":25,"weight":4,"qty":1,"fragile":true,"deadline":"","recipient":"Valencia, Prebo, cc El Bosque","pickup":"Maracay, San Jacinto, carrera 5"}]'::jsonb,
  'Sobre sellado, entregar a recepción.', 'pending', now() - interval '1 hour',
  NULL, NULL, NULL, NULL, NULL, NULL, NULL),
 -- Aceptada, esperando el pago del solicitante.
 ('55550000-0000-0000-0000-000000000004', '33330000-0000-0000-0000-000000000006',
  'Textiles Andina', '0424-555-1198', 'despacho@textilesandina.com',
  'Caracas, Propatria, edif. Bodegas L2', 'Valencia, La Quizanda, galpón 18',
  '[{"id":"55550000-0000-0000-0000-000000000004-1","name":"Fardos de ropa","length":80,"width":60,"height":60,"weight":38,"qty":4,"fragile":false,"deadline":"","recipient":"Valencia, La Quizanda, galpón 18","pickup":"Caracas, Propatria, edif. Bodegas L2"}]'::jsonb,
  'Fardos comprimidos, sin líquidos.', 'awaiting_payment', now() - interval '6 hours',
  now() - interval '6 hours', 45.00, 56.25, NULL, NULL, NULL,
  now() + interval '18 hours'),
 -- Comprobante subido: el viaje del conductor lo confirmará al abrirlo.
 ('55550000-0000-0000-0000-000000000005', '33330000-0000-0000-0000-000000000006',
  'Cerámica Bolívar', '0416-555-7840', 'ventas@ceramicabolivar.com',
  'Caracas, Los Cortijos, transversal 3', 'Valencia, San Diego, Av. Don Julio Centeno',
  '[{"id":"55550000-0000-0000-0000-000000000005-1","name":"Cajas de cerámica","length":50,"width":40,"height":35,"weight":26,"qty":5,"fragile":true,"deadline":"","recipient":"Valencia, San Diego, Av. Don Julio Centeno","pickup":"Caracas, Los Cortijos, transversal 3"}]'::jsonb,
  'Frágil: nada encima por favor.', 'payment_review', now() - interval '1 day',
  now() - interval '1 day', 30.00, 37.50,
  '55550000-0000-0000-0000-000000000005/seed-comprobante.jpg',
  now() - interval '5 minutes', NULL, now() + interval '23 hours'),
 -- Pagas: sus bultos ya están en trips.packages del viaje.
 ('55550000-0000-0000-0000-000000000006', '33330000-0000-0000-0000-000000000006',
  'MotoMarket C.A.', '0414-555-2274', 'almacen@motomarket.net',
  'Caracas, San Martín, calle 9', 'Valencia, Av. Bolívar Norte, MotoMarket',
  '[{"id":"55550000-0000-0000-0000-000000000006-1","name":"Repuestos de moto","length":70,"width":50,"height":45,"weight":30,"qty":2,"fragile":false,"deadline":"","recipient":"Valencia, Av. Bolívar Norte, MotoMarket","pickup":"Caracas, San Martín, calle 9"}]'::jsonb,
  '', 'paid', now() - interval '2 days', now() - interval '2 days',
  25.00, 31.25, '55550000-0000-0000-0000-000000000006/seed-comprobante.jpg',
  now() - interval '1 day' - interval '4 hours', now() - interval '1 day',
  now() - interval '1 day' + interval '20 hours'),
 ('55550000-0000-0000-0000-000000000007', '33330000-0000-0000-0000-000000000006',
  'Tostaduría Los Andes', '0212-555-4463', 'compras@tostaduriaandes.com',
  'Caracas, Mercado de Coche, local 14', 'Valencia, Zona Industrial Municipal',
  '[{"id":"55550000-0000-0000-0000-000000000007-1","name":"Café empacado 46kg","length":90,"width":60,"height":70,"weight":190,"qty":4,"fragile":false,"deadline":"","recipient":"Valencia, Zona Industrial Municipal, Tostaduría Los Andes","pickup":"Caracas, Mercado de Coche, local 14"}]'::jsonb,
  'Bultos de 46kg cada uno, carretilla recomendada.', 'paid',
  now() - interval '3 days', now() - interval '3 days', 60.00, 75.00,
  '55550000-0000-0000-0000-000000000007/seed-comprobante.jpg',
  now() - interval '2 days' - interval '6 hours', now() - interval '2 days',
  now() - interval '2 days' + interval '18 hours'),
 -- Rechazada y vencida.
 ('55550000-0000-0000-0000-000000000008', '33330000-0000-0000-0000-000000000007',
  'Cauchos El Paso', '0243-555-5519', 'contacto@cauchoselpaso.com',
  'Maracay, Los Samanes, av. intercomunal', 'Valencia, El Recreo, calle 12',
  '[{"id":"55550000-0000-0000-0000-000000000008-1","name":"Cauchos sueltos","length":65,"width":65,"height":25,"weight":12,"qty":8,"fragile":false,"deadline":"","recipient":"Valencia, El Recreo, calle 12","pickup":"Maracay, Los Samanes, av. intercomunal"}]'::jsonb,
  'Cauchos usados para reventa.', 'rejected', now() - interval '2 days',
  now() - interval '1 day', NULL, NULL, NULL, NULL, NULL, NULL),
 ('55550000-0000-0000-0000-000000000009', '33330000-0000-0000-0000-000000000007',
  'Vajillas San Jacinto', '0412-555-9035', 'pedidos@vajillassj.com',
  'Maracay, Centro, calle Santos Michelena', 'Valencia, Cedeño, cc Galerías',
  '[{"id":"55550000-0000-0000-0000-000000000009-1","name":"Cajas de vajilla","length":45,"width":35,"height":30,"weight":15,"qty":4,"fragile":true,"deadline":"","recipient":"Valencia, Cedeño, cc Galerías","pickup":"Maracay, Centro, calle Santos Michelena"}]'::jsonb,
  '', 'expired', now() - interval '4 days', now() - interval '4 days',
  20.00, 25.00, NULL, NULL, NULL, now() - interval '3 days');

COMMIT;
