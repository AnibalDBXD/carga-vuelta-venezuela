# Despliegue de CargaRuta

Guía para publicar el backend en **Supabase hosted** y el frontend en **Vercel**, partiendo de este
repositorio. Está escrita para alguien que entra como **colaborador** del repo (no dueño), que es el
caso que más permisos exige.

Arquitectura del despliegue:

```
GitHub  ──push──▶  Vercel (TanStack Start + Nitro, SSR)
                        │
                        ├── Supabase Auth        (login)
                        ├── Supabase Postgres    (RLS + RPC)
                        └── Supabase Storage     (payment-proofs)
```

> Regla de oro: `SUPABASE_SECRET_KEY` y `VAPID_PRIVATE_KEY` viven **solo** en el servidor de Vercel.
> Nunca en una variable `VITE_*`, porque esa sí viaja al navegador.

---

## 0. Antes de empezar: permisos y cuentas

Necesitas:

- Acceso de lectura/escritura al repo de GitHub (colaborador).
- Cuenta en [Supabase](https://supabase.com/dashboard).
- Cuenta en [Vercel](https://vercel.com).
- Node 20.19+ / 22.12+ y Bun instalados para usar el CLI.
- Opcional: cuenta en un proveedor SMTP (Resend, Brevo, Postmark…) y dominio propio.

Aclaración importante sobre ser colaborador:

- **GitHub ≠ Supabase ≠ Vercel.** Ser colaborador del repo no te da acceso al proyecto Supabase ni
  al equipo de Vercel del dueño.
- Para usar el proyecto del dueño, pídele que te invite al **equipo de Supabase** (Organization →
  Members) y al **team de Vercel**.
- Si vas a desplegar tu propia instancia, crea tu proyecto Supabase y despliega un **fork** del repo
  o pide permiso para instalar la GitHub App de Vercel en el repo original (esa instalación requiere
  permisos de administrador del repo).

Rutas que vas a necesitar durante la guía:

- Ref. del proyecto Supabase: aparece en `https://supabase.com/dashboard/project/<ref>`.
- Contraseña de la base de datos: la defines al crear el proyecto. Guárdala; `db push` la pide.

---

## 1. Crear el proyecto de Supabase

1. Entra al dashboard → **New project**.
2. Elige organización, nombre (ej. `cargaruta-prod`) y una **contraseña de base de datos** fuerte.
3. Región: **South America (São Paulo)** es la más cercana a Venezuela; `us-east-1` es alternativa.
4. Plan: **Free** sirve para pruebas; para producción conviene **Pro** (backups y sin pausa por
   inactividad).
5. Espera a que termine el aprovisionamiento (1–2 minutos).

Guarda el **project ref**. Lo encuentras en la URL del dashboard o en **Settings → General**.

### Credenciales que debes copiar

En **Project Settings → API** (o **API Keys**):

| Dato                                      | Variable de la app                                           | Uso                             |
| ----------------------------------------- | ------------------------------------------------------------ | ------------------------------- |
| Project URL (`https://<ref>.supabase.co`) | `SUPABASE_URL` / `VITE_SUPABASE_URL`                         | API                             |
| Publishable key (`sb_publishable_...`)    | `SUPABASE_PUBLISHABLE_KEY` / `VITE_SUPABASE_PUBLISHABLE_KEY` | Navegador                       |
| Secret key (`sb_secret_...`)              | `SUPABASE_SECRET_KEY`                                        | Solo servidor                   |
| Contraseña de la DB                       | —                                                            | `supabase link` / `db push`     |
| Connection string                         | —                                                            | `psql` (solo si aplica el seed) |

Si tu proyecto todavía usa las llaves legacy, usa `anon` como publishable y `service_role` como
secret. La app soporta ambas.

---

## 2. Enlazar el repo local y aplicar migraciones

Desde la raíz del repo:

```powershell
bun install
bunx supabase login
bunx supabase link --project-ref <ref>
```

`link` te pedirá la contraseña de la base y dejará la referencia en `supabase/.temp/` (ignorado por
git, así que cada colaborador enlaza su propio proyecto).

Antes de aplicar, revisa qué va a correr:

```powershell
bunx supabase db push --remote --dry-run
```

Deben aparecer las **13 migraciones** de `supabase/migrations/`. Luego aplícalas:

```powershell
bunx supabase db push --remote
```

Verifica el historial:

```powershell
bunx supabase migration list --remote
```

Las migraciones ya crean:

- Tablas, RLS, RPCs (`submit_offer_request`, `decide_package_request`, `payment_summary`, etc.).
- El bucket privado `payment-proofs` con sus políticas, límite de 5 MB y tipos permitidos.
- Las restricciones y triggers del flujo de pagos y ofertas.

### Datos de prueba: solo en un entorno de staging

`supabase/seed.sql` **trunca** las tablas de la app y crea usuarios demo con contraseñas conocidas
(`chofer@cargaruta.local / cargaruta123`). No lo corras en producción.

Si quieres una demo con datos:

```powershell
bunx supabase db push --remote --include-seed
```

O manualmente con el connection string de **Settings → Database**:

```powershell
psql "<connection-string>" -f supabase/seed.sql
```

### Regenerar tipos (opcional, tras cambios de esquema)

```powershell
bunx supabase gen types typescript --remote > src/integrations/supabase/types.ts
```

---

## 3. Configurar Auth en el dashboard

`supabase/config.toml` es **solo para local**; el proyecto hosted se configura en el dashboard.

1. **Authentication → URL Configuration**
   - **Site URL:** `https://<tu-dominio-vercel>` (o el dominio propio).
   - **Redirect URLs:** agrega también `http://localhost:5173` para desarrollo.
   - Si usarás previews de Vercel, agrega el patrón permitido por Supabase para
     `https://*-<tu-team>.vercel.app/**`. Ten en cuenta que cada preview es un origen distinto.
2. **Authentication → Providers → Email**
   - Para una demo rápida: **Confirm email OFF** (así el registro entra de inmediato).
   - Para producción: **ON** y configura **SMTP propio**. El correo por defecto de Supabase tiene
     límites muy bajos y no sirve para usuarios reales.
3. **Authentication → Policies / Password**
   - Mantén mínimo de contraseña 6+ (el formulario ya exige `minLength={6}`).
4. Google OAuth es opcional: la pantalla actual solo tiene email/contraseña, así que no hace falta
   habilitarlo.

Los correos de la app (aviso al conductor, enlace de pago) **no** usan el SMTP de Supabase Auth:
salen del servidor con `SMTP_URL` (nodemailer). Configúralo en Vercel, no aquí.

---

## 4. Variables de entorno

### En Vercel

**Project → Settings → Environment Variables** (Production; agrega Preview solo si lo necesitas).
Marca como _sensitive_ las que son secretos.

| Variable                        | Valor                                             | Se expone al navegador  |
| ------------------------------- | ------------------------------------------------- | ----------------------- |
| `SUPABASE_URL`                  | `https://<ref>.supabase.co`                       | No (SSR)                |
| `SUPABASE_PUBLISHABLE_KEY`      | `sb_publishable_...`                              | No (SSR)                |
| `SUPABASE_SECRET_KEY`           | `sb_secret_...`                                   | **Nunca**               |
| `VITE_SUPABASE_URL`             | `https://<ref>.supabase.co`                       | Sí                      |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_...`                              | Sí (es pública)         |
| `APP_URL`                       | `https://<tu-dominio>`                            | No (enlaces en correos) |
| `VITE_MAPBOX_TOKEN`             | token `pk...`                                     | Sí                      |
| `MAPBOX_TOKEN`                  | mismo `pk...` o un `sk...`                        | No (servidor)           |
| `VITE_VAPID_PUBLIC_KEY`         | clave pública VAPID                               | Sí                      |
| `VAPID_PRIVATE_KEY`             | clave privada VAPID                               | **Nunca**               |
| `SMTP_URL`                      | `smtps://usuario:clave@smtp.proveedor.com:465`    | No                      |
| `BCV_FALLBACK_RATE`             | opcional, ej. `40`                                | No                      |
| `PAGO_MOVIL_BANK`               | banco que cobra                                   | No                      |
| `PAGO_MOVIL_PHONE`              | teléfono de pago                                  | No                      |
| `PAGO_MOVIL_DOCUMENT`           | cédula/RIF                                        | No                      |
| `PAGO_MOVIL_HOLDER`             | titular                                           | No                      |
| `TELEGRAM_BOT_TOKEN`            | token de @BotFather                               | **Nunca**               |
| `TELEGRAM_WEBHOOK_SECRET`       | secreto aleatorio que tú generas                  | **Nunca**               |
| `VITE_TELEGRAM_BOT`             | username del bot (sin `@`)                        | Sí (es público)         |
| `GEMINI_API_KEY`                | key de aistudio.google.com/apikey                 | **Nunca**               |
| `GEMINI_MODEL`                  | opcional, default `gemini-3.1-flash-lite-preview` | No                      |
| `GEMINI_VISION_MODEL`           | opcional, default = `GEMINI_MODEL`                | No                      |

Notas:

- Las `VITE_*` se insertan **en tiempo de build**. Si cambias una, hay que **redeploy**, no basta
  reiniciar.
- No configures `MAILPIT_URL` en producción (es solo para el Mailpit local).
- Genera VAPID con `bunx web-push generate-vapid-keys` si aún no tienes claves.
- `APP_URL` es el dominio público; los correos y enlaces de pago lo usan. Si queda en
  `localhost:5173`, los enlaces de producción apuntarán mal.
- Sin `TELEGRAM_BOT_TOKEN` el bot y los botones de Telegram no aparecen y las notificaciones por
  Telegram se omiten sin error — la app sigue funcionando solo con correo/push.
- Sin `GEMINI_API_KEY` el bot contesta "asistente no configurado": las notificaciones siguen, pero el
  chat conversacional no.

### Bot de Telegram (opcional, todo free tier)

Spec completo en `specs/003-telegram.md`. Resumen del alta:

1. En Telegram, habla con **@BotFather** → `/newbot` → te da el `TELEGRAM_BOT_TOKEN` y eliges el
   username (`VITE_TELEGRAM_BOT`, sin `@`).
2. Genera un secreto para el webhook, ej. `bun -e 'console.log(crypto.randomUUID())'` →
   `TELEGRAM_WEBHOOK_SECRET`.
3. Crea la key de Gemini en <https://aistudio.google.com/apikey> → `GEMINI_API_KEY`.
4. Con las cuatro variables ya desplegadas en Vercel, registra el webhook una sola vez:

   ```bash
   bun run bot:setup
   ```

   apunta a `APP_URL/api/telegram` y publica los comandos del bot (`/start`, `/estado`, …).

5. En local no hace falta túnel: `bun run bot:dev` hace polling de `getUpdates` con la misma lógica
   del webhook (y quita el webhook si había — vuelve a correr `bot:setup` al volver a prod).
6. El conductor conecta su chat desde `/panel/viajes` → **Conectar Telegram**.

### Servidor MCP (opcional)

`/api/mcp` expone las mismas tools a agentes externos (guía en `docs/mcp.md`). No requiere
variables nuevas: usa las `SUPABASE_*` ya desplegadas. Solo hay que aplicar la migración
`mcp_tokens` con `supabase db push` y el conductor genera sus claves desde `/panel/viajes` →
**API**.

### En local (`.env`)

Para probar la app contra el proyecto hosted, copia los mismos valores en `.env`. El archivo está
ignorado por git:

```powershell
Copy-Item .env.example .env
```

Y completa las variables. Para volver al Supabase local, usa los valores de
`bunx supabase status -o env`.

---

## 5. Conectar el repo a Vercel

El repo ya trae `vercel.json` con los comandos correctos:

```json
{
  "buildCommand": "bun run build",
  "installCommand": "bun install"
}
```

El build usa Nitro con preset `vercel` y genera `.vercel/output` (Build Output API). Vercel lo
detecta automáticamente; no hay que configurar `outputDirectory`.

### Opción A — desplegar un fork (recomendada si no administras el repo)

1. Crea un fork del repo en tu cuenta de GitHub.
2. En Vercel: **Add New → Project → Import Git Repository**.
3. Autoriza la **GitHub App de Vercel** y dale acceso a tu fork.
4. Importa el fork.
5. Confirma:
   - Install Command: `bun install` (lo toma de `vercel.json`).
   - Build Command: `bun run build`.
   - Node.js: 22.x si el build se queja de la versión.
6. Agrega las variables de entorno de la sección 4.
7. **Deploy**.

Cada push a la rama conectada redepliega automáticamente.

### Opción B — desplegar el repo original como colaborador

Puedes importar el repo original solo si:

- Tu cuenta de GitHub puede verlo, y
- puedes instalar la GitHub App de Vercel en ese repo (normalmente requiere ser **admin** del repo
  u organización).

Si el repo no aparece en la lista de importación:

1. Pide al dueño que instale la GitHub App de Vercel y le dé acceso a ese repo, **o**
2. pide que te invite al **team de Vercel** donde ya vive el proyecto, **o**
3. usa la Opción A con un fork.

### Conectar Supabase al repo (opcional)

La integración de GitHub de Supabase (branching/preview) **no es necesaria** para este despliegue:
las migraciones se aplican con `db push`. Si la quieres, requiere que un **owner** de la
organización instale la GitHub App de Supabase; como colaborador del repo probablemente no tengas
ese permiso. El flujo recomendado aquí es migraciones desde tu máquina con `db push` y commits
normales al repo.

---

## 6. Primer despliegue y ajuste del dominio

1. Vercel te asigna `https://<proyecto>.vercel.app`.
2. Vuelve a Supabase → **Authentication → URL Configuration** y pon ese dominio como **Site URL**.
   Agrega también `http://localhost:5173` en Redirect URLs.
3. En Vercel, actualiza `APP_URL` con ese dominio y **redeploy** (las variables de entorno se leen
   al construir/arrancar).
4. Si usas dominio propio, agrégalo en **Vercel → Domains**, espera el DNS y repite el paso 2 con el
   dominio final.

---

## 7. Verificación posterior al despliegue

Haz esta lista en el dominio publicado:

- [ ] La landing carga y el visor 3D aparece (sin errores en consola).
- [ ] El mapa muestra datos reales; si dice **“Mapa no disponible”**, falta
      `VITE_MAPBOX_TOKEN` en el build.
- [ ] Registro: si “Confirm email” está activo, llega el correo y el enlace vuelve al dominio.
- [ ] Login y `/panel` redirigen a `/panel/viajes`.
- [ ] Crear vehículo y viaje; verificar filas en **Table Editor** de Supabase.
- [ ] Publicar una oferta y abrir `/bolsa/<offer_id>` en incógnito.
- [ ] Enviar una solicitud de carga; si `SMTP_URL` está bien, llega el correo al conductor.
- [ ] Aceptar la solicitud, abrir `/pagos/<request_id>`, subir un comprobante JPG/PNG (< 5 MB) y
      confirmar el pago. El paquete debe aparecer en el viaje.
- [ ] Telegram (si está configurado): el conductor conecta su chat, llega la solicitud con botones
      ✅/❌, y el solicitante puede pedir espacio y pagar desde el bot.
- [ ] RLS: con un segundo usuario, confirmar que no ve vehículos, viajes ni solicitudes ajenas.
- [ ] PWA: el manifest carga y el service worker se registra.

---

## 8. Operación y seguridad

- **Nunca** ejecutes `supabase/seed.sql` en producción: trunca tablas.
- No edites el esquema desde el dashboard en prod. Cambia migraciones en local, prueba, y aplica con
  `db push`.
- Si expones una llave por error, rótala en **Settings → API Keys** y actualiza Vercel.
- Restringe el token público de Mapbox a tu dominio y a `localhost:5175`/`5173` en desarrollo.
- Configura backups (Pro) y alertas de uso.
- Usa un SMTP con dominio verificado (SPF/DKIM) para que los correos no caigan en spam.
- Mantén `SUPABASE_SECRET_KEY`, `VAPID_PRIVATE_KEY` y la contraseña de la DB fuera del repo y del
  navegador.
- Si el proyecto Free se pausa por inactividad, el primer request puede tardar; para producción usa
  Pro.

---

## 9. Problemas frecuentes

| Síntoma                                       | Causa probable                        | Solución                                                                                  |
| --------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------- |
| `supabase db push` pide login o falla con 401 | Sesión del CLI vencida                | `bunx supabase login` y repetir                                                           |
| `db push` no encuentra el proyecto            | Falta `link`                          | `bunx supabase link --project-ref <ref>`                                                  |
| “relation already exists” al migrar           | Esquema creado a mano en el dashboard | Revisa `migration list`; usa `supabase migration repair` con cuidado o recrea el proyecto |
| `new row violates row-level security policy`  | Sesión ausente o política incorrecta  | Verifica login y políticas de la tabla                                                    |
| Registro no permite entrar                    | Confirm email activo                  | Confirma el correo o desactiva “Confirm email” para la demo                               |
| No llegan correos de la app                   | `SMTP_URL` vacío o Mailpit en prod    | Configura SMTP real en Vercel y redeploy                                                  |
| “Mapa no disponible”                          | Falta `VITE_MAPBOX_TOKEN` en el build | Agrega la variable y redeploy                                                             |
| Error al subir comprobante                    | Bucket/políticas o límite 5 MB        | Revisa Storage y el tipo de archivo                                                       |
| Build falla por Node                          | Versión de Node en Vercel             | Fija Node.js 22.x en Settings                                                             |
| Preview de Vercel no autentica                | Redirect URL no permitida             | Agrega el patrón de preview en Supabase Auth                                              |

---

## 10. Resumen mínimo (checklist)

```text
[ ] Crear proyecto Supabase y guardar ref + contraseña
[ ] Copiar URL, publishable key y secret key
[ ] bunx supabase login && bunx supabase link --project-ref <ref>
[ ] bunx supabase db push --remote --dry-run
[ ] bunx supabase db push --remote
[ ] Configurar Site URL / Redirect URLs en Auth
[ ] Configurar Confirm email + SMTP (o desactivar para demo)
[ ] Cargar variables en Vercel (secretas fuera de VITE_*)
[ ] Importar repo/fork en Vercel y deployar
[ ] Actualizar APP_URL y Site URL con el dominio final
[ ] Probar registro, viaje, oferta, solicitud, pago y RLS
```

---

## 11. Presentación (deck) en línea

El deck vive como archivo estático dentro de `public/`:

```
public/presentacion.html          → https://<tu-dominio>/presentacion.html
public/presentacion-assets/       → imágenes y QR del deck
```

`bun run build` copia `public/` a `.vercel/output/static`, así que Vercel lo sirve directo, sin pasar
por SSR ni por autenticación. Para verlo:

- **Producción:** `https://<tu-dominio>/presentacion.html`
- **Local:** `http://localhost:5173/presentacion.html` (o el puerto que uses)

Navegación del deck: flechas `←`/`→`, `PageUp`/`PageDown`, espacio o `Enter`.

Si editas el deck, vuelve a desplegar (`git push` a la rama conectada). No necesita variables de
entorno nuevas.
