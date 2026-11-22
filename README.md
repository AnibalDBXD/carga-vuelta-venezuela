# CargaRuta

App de logística para camioneros en Venezuela (base Valencia). El objetivo: evitar viajes de regreso vacíos — el conductor planifica un viaje, optimiza la carga en 3D y comparte su espacio libre para el retorno.

## Stack

- TanStack Start (React 19, Vite, SSR)
- Tailwind CSS v4
- Supabase (local via Supabase CLI)
- three.js + @react-three/fiber para el visor 3D
- bun

## Setup

```sh
bun install
bun run db:start   # levanta Supabase local (requiere podman o docker)
bun run dev        # http://localhost:5173
```

Las variables de Supabase local ya están en `.env` (claves de desarrollo, sin secretos).

Sin docker/podman: cualquier runtime compatible con la API de Docker sirve (`DOCKER_HOST=unix:///run/user/$UID/podman/podman.sock`).

## Comandos

| Comando                        | Qué hace                                                        |
| ------------------------------ | --------------------------------------------------------------- |
| `bun run dev`                  | Dev server con SSR en :5173                                     |
| `bun run test`                 | Vitest                                                          |
| `bun run typecheck`            | `tsc --noEmit`                                                  |
| `bun run lint`                 | ESLint                                                          |
| `bun run build`                | Build de producción (nitro, preset cloudflare)                  |
| `bun run db:start` / `db:stop` | Levanta/apaga Supabase local                                    |
| `bun run db:types`             | Regenera `src/integrations/supabase/types.ts` desde la DB local |

Supabase local: API en `http://127.0.0.1:54321`, Studio en `http://127.0.0.1:54323`, correos de auth en Mailpit `:54324` (aunque las confirmaciones de email están desactivadas en dev).

## Migraciones

Las migraciones viven en `supabase/migrations/` y se aplican al arrancar `db:start` (o con `bunx supabase db reset`). Después de cambiar el esquema, corre `bun run db:types`.
