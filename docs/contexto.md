# CargaRuta — contexto del proyecto

Documento de traspaso: qué es la app, qué se construyó a nivel visual y por qué. Si algo
contradice al código, manda el código; este archivo explica la intención.

- **Producto:** app de logística para camioneros en Venezuela, base Valencia.
- **Promesa:** *Carga más. No estés nunca vacío.*
- **Concepto visual:** pavimento y señalización vial. Asfalto de noche, amarillo de línea
  central, blanco de borde.
- **Idioma:** español (es-VE), tuteo, frases cortas.

---

## 1. La idea

Un camionero cobra por viaje, no por kilómetro vacío. Cada tramo sin carga es dinero que se
queda en la carretera, y del otro lado hay alguien que necesita mover una encomienda justo por
esa ruta.

CargaRuta resuelve las dos mitades del mismo problema:

1. **Planificar el viaje:** medidas del camión, paquetes, acomodo en 3D, ruta estimada, guía de
   montaje por capas.
2. **Llenar los tramos libres:** publicar el espacio que sobra y recibir solicitudes de carga de
   gente que va hacia la misma ciudad.

La narrativa pública pasó de "no estés nunca vacío" a **ida y vuelta**: no se trata solo del
viaje de vuelta, se aprovecha el recorrido completo.

## 2. El modelo de negocio

Dos lados, un mismo viaje:

| Lado | Qué aporta | Qué recibe |
|---|---|---|
| Conductor | Espacio en m³ y kg que ya va a recorrer | Flete por carga que no tenía |
| Cliente / embarcador | Carga y pago | Transporte en una ruta que ya existe |

Reglas del modelo vigente (rama `main`):

- El conductor fija el precio **en USD**; el cliente paga el **pago móvil de la plataforma** en
  bolívares a la tasa **BCV**, calculada solo en servidor.
- La plataforma cobra y luego liquida al conductor. El ciclo de una solicitud es
  `pending → awaiting_payment → payment_review → paid` (más `rejected` / `expired`).
- El comprobante se sube a un bucket privado y la verificación es simulada (~2 s).
- Notificaciones: correo (SMTP/Mailpit) y Web Push (VAPID), disparadas una sola vez por
  `notifyRequester`.
- La cara pública de la oferta es la **Bolsa de viajes** (`/bolsa`), no un tablero de "retornos".
- Regla de comunicación: **no hablar de "retorno" ni "regreso" al cliente final**; el conductor
  sigue viendo la idea de aprovechar el viaje completo.

## 3. Producto actual

| Ruta | Qué hace |
|---|---|
| `/` | Landing: demo 3D, el modelo, seis beneficios |
| `/auth` | Login y registro (email + Google) |
| `/viajes` | Historial de viajes |
| `/viajes/nuevo` | Origen, destino, fecha, vehículo y paquetes |
| `/viajes/$id` | Plan de carga: 3D, guía de montaje, filtro por capas, tabla de orden, solicitudes |
| `/vehiculos` | CRUD de vehículos con presets venezolanos y visor 3D |
| `/bolsa` | Bolsa pública de camiones con espacio libre |
| `/bolsa/$offerId` | Espacio del camión en 3D + formulario de solicitud |
| `/recogidas/$token` | Enlaces viejos: redirige a la oferta de la bolsa |
| `/pagos/$requestId` | Pago móvil, tasa BCV y comprobante |

Capacidades que sostienen los textos de la landing (verificadas en código):

- `packing.ts`: tope de peso, pesado antes que liviano, nada sobre frágil, soporte del 70 % de la
  base, lo de entrega más lejana al fondo, los frágiles coronan las pilas y los bultos rotan en
  cualquiera de las 6 orientaciones.
- `venezuela.ts`: matriz de rutas con km, horas (promedio 55 km/h), peajes y alcabalas
  aproximadas.
- `loading-guide.ts`: capas y pasos de montaje.
- `return_offers` + RPC de solicitudes: publicar espacio y recibir pedidos.
- Enlaces de WhatsApp con texto prellenado (`wa.me`).

## 4. Identidad visual

Sistema completo y detallado en **`design.md`** (existe en la rama `dev`; ver §7).

### 4.1 Concepto

Todo trazo grueso se dibuja como pintura sobre pavimento: remates redondeados, grosor constante,
sin textura ni bisel. El esténcil del wordmark y las líneas del símbolo son el mismo lenguaje.

### 4.2 Símbolo — la curva

Carretera en curva vista en planta, lienzo 64 × 64:

| Elemento | Valor |
|---|---|
| Centro del arco | `(58, 58)` |
| Borde exterior | radio `37` |
| Borde interior | radio `15` |
| Línea central | radio `26` |
| Bordes | trazo `5.6`, remates redondeados, amarillo |
| Discontinua | trazo `4.4`, remates planos, `stroke-dasharray="9 6.92"` → exactamente 3 trazos, blancos |

Reglas: la discontinua va sobre el eje, se dibuja con `dasharray` sobre el arco (nunca con
rectángulos rotados), y el patrón cierra en los extremos. Si cambia el largo de los trazos, el
hueco se recalcula como `(40.84 − 3 × trazo) / 2`.

### 4.3 Wordmark

- **Saira Stencil One** en web (equivalente libre de Stencil), mayúsculas, tracking `+0.03em`.
- `CARGA` en blanco de borde, `RUTA` en línea amarilla; sin espacio entre palabras, la separación
  la hace el color.
- En el header va a 17 px; el corte de esténcil se aprecia desde ~40 px.

### 4.4 Paleta Asfalto Nocturno

| Rol | Hex | oklch |
|---|---|---|
| Asfalto | `#14161A` | `oklch(0.200 0.009 264.4)` |
| Calzada | `#232830` | `oklch(0.275 0.016 259.8)` |
| Línea amarilla | `#F7CE1E` | `oklch(0.862 0.172 93.8)` |
| Blanco de borde | `#EFEDE3` | `oklch(0.945 0.013 97.4)` |
| Concreto | `#7A8088` | `oklch(0.597 0.014 255.5)` |

Estados: éxito `#3FBF7F`, alerta `#F5A524`, error `#E4574C`.
Contrastes: texto/asfalto 15.4:1, amarillo/asfalto 11.9:1, concreto/asfalto 4.55:1 (solo
secundario, nunca párrafos).

Escalera de superficies: fondo `0.200` → tarjeta `0.275` → muted `0.305` → secondary `0.330` →
accent `0.350`. Cualquier superficie nueva tiene que caer dentro de esa escalera.

Regla de uso: el amarillo es acción y dato, nunca decoración; máximo ~15 % de una pantalla.

### 4.5 Tipografía

| Rol | Familia | Uso |
|---|---|---|
| Marca | Saira Stencil One | solo el wordmark |
| Interfaz | Space Grotesk | títulos, cuerpo, botones |
| Datos | IBM Plex Mono | medidas, patentes, etiquetas, hex |

Escala: display 56–64, H1 40 / 1.1 / −0.02em, H2 24, cuerpo 16, etiqueta 12 mono mayúsculas
`+0.12em`. Cifras críticas con `tabular-nums`.

### 4.6 Línea gráfica

- Franja hazard (`hazard-stripe`) solo en el borde superior del header; **no** en el footer ni
  dentro de tarjetas: satura la lectura y compite con la discontinua del símbolo.
- Retícula de asfalto (`grid-asphalt`) solo en heroes.
- Radios: `0.375rem` controles, `0.5rem` tarjetas. Bordes de 1 px en `--border`.
- Iconos Lucide, 20–24 px, trazo por defecto.
- Movimiento: 120–200 ms, sin rebotes. El visor 3D del landing gira lento (`autoRotate` 0.35) y
  sigue siendo arrastrable; en planificación no gira.
- Nada de ilustraciones con degradados ni numeritos como marcadores de sección: se usan iconos.

### 4.7 Piezas construidas (rama `dev`)

| Archivo | Contenido |
|---|---|
| `design.md` | sistema de diseño completo, geometría, tokens, usos incorrectos |
| `src/components/Logo.tsx` | `<LogoMark />`, `<LogoWordmark />`, `<Logo />` |
| `src/components/AppFooter.tsx` | footer de marca, sin franja hazard |
| `public/favicon.svg` | símbolo sobre asfalto, 64 × 64 |
| `public/propuesta-2-curva-asfalto-nocturno.svg` / `.png` | lockup principal 1080 × 1080 |
| `public/paleta-asfalto-nocturno.svg` / `.png` | lámina de paleta |
| `public/tipografia-opciones.png` | referencia de tipografías evaluadas (descartable) |
| `src/styles.css` | tokens de §4.4, `color-scheme: dark`, `--font-brand` |

Footer: marca + tagline + columna "Navegar" + barra legal en mono, con `min-h-dvh` + `flex-1`
para que quede al pie en páginas cortas.

## 5. Decisiones y descartes

| Se probó | Resultado |
|---|---|
| Camión de Lucide en cuadro amarillo | Descartado: genérico, no cuenta la historia |
| Tres propuestas: línea central, caja con ruta, chevrones | Descartadas frente a la curva |
| Logo con 2 trazos rectos sobre el arco | Se veía como cuerdas rectas; se pasó a trazos curvos |
| 4–5 trazos en la discontinua | Se leían como puntos; quedaron 3 trazos largos |
| Continuas blancas / discontinua amarilla | Invertido: continuas amarillas, discontinua blanca |
| Numeritos `01…06` como marcadores | Descartados por artificiales; se usan iconos |
| Franja hazard en el footer | Eliminada: saturaba |
| Diagrama ilustrado del modelo (conductor + cliente) | Dibujado, probado y **descartado**; quedó solo el texto |
| Tipografía DIN vial (Bahnschrift) | Buena, pero es fuente de sistema; se eligió esténcil |

## 6. Copy

- Titular: **Carga más. No estés nunca vacío.**
- Sección modelo: **Dos lados, el mismo viaje.**
- Beneficios: **Carga en los dos sentidos.** con seis ítems: compartir el viaje, cobrar el tramo
  sin carga, la carga que ya va para allá, lo que de verdad cabe, flete cotizado, cargar una sola
  vez.
- Cifras con unidad y separador de miles: `3.500 kg`, `12,4 m³`, `420 × 200 × 200 cm`.
- En la cara al cliente: bolsa de viajes, espacio libre, encomienda. Nunca "retorno".

## 7. Estado del repositorio

Hay dos líneas de trabajo y **no están fusionadas**:

| Rama | Último commit | Contenido |
|---|---|---|
| `main` | `10d5bb2` Bolsa de viajes, pago móvil y promo compartible del regreso | Producto nuevo: `/bolsa`, `/pagos`, pagos, push. Conserva el diseño **antiguo** |
| `dev` | `2234620` feat: visor 3d & texts | Todo el trabajo visual descrito acá, sobre el producto anterior |

Consecuencias:

- En `main` la landing sigue con las tres tarjetas y el camión de Lucide, y `styles.css` conserva
  la paleta vieja (`background 0.17`, `card 0.21`).
- `design.md`, `Logo.tsx`, `AppFooter.tsx`, `favicon.svg` y las láminas viven **solo en `dev`**.
- `npx tsc --noEmit` pasa limpio en `main`.

## 8. Pendientes y conflictos a resolver

1. **Fusionar o reaplicar el diseño sobre `main`.** El trabajo visual está en 4 commits de `dev`
   (`d1ceacb`, `b1656c9`, `d609af7`, `2234620`). Al hacerlo, actualizar los enlaces del header y
   del footer a `/bolsa`.
2. **Reescribir el copy de la landing.** El texto de `dev` dice "la app no retiene el pago ni
   cobra comisión", y el producto de `main` cobra por pago móvil y liquida al conductor. Hay que
   contar el flujo real: precio en USD, pago en Bs a tasa BCV, comprobante y confirmación.
3. **Sustituir "retorno/regreso" por "bolsa de viajes"** en la navegación pública.
4. **Vectorizar el wordmark** (Stencil → curvas) para impresión y para no depender de Google Fonts.
5. **Aplicar en `main`**: `color-scheme: dark`, `--font-brand`, tokens de §4.4 y los `<select>` de
   filtros sobre `bg-card` (hoy usan `bg-background` y se confunden con la página).
6. **Regenerar las láminas** cuando el copy cambie, para que las piezas de marca no digan algo
   distinto a la app.

## 9. Cómo correr y verificar

```bash
npm install
npx vite dev --port 8081     # la app en http://localhost:8081
npx tsc --noEmit             # typecheck
npm test                     # vitest
```

Supabase local según `AGENTS.md` (`npm run db:start`, `npm run db:types`). La carpeta
`supabase/migrations/` no se edita a mano desde Lovable; en local sí hay migraciones versionadas.
