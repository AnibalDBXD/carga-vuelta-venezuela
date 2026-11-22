# Spec: Vistas 3D del camión

Contrato visual que siguen **todas** las vistas 3D de la app (`/`, `/panel/vehiculos`, `/panel/viajes/$id`, `/bolsa/$offerId` y cualquier uso futuro). La única implementación es `src/components/Truck3D.tsx`; no se crean escenas paralelas.

## Carga y SSR

- Siempre se monta vía `Truck3DView` (`src/components/Truck3DLazy.tsx`): `ClientOnly` + `lazy()` — three.js **nunca** corre durante SSR.
- El fallback de carga es transparente (sin `bg`): solo el texto "Cargando modelo 3D…" en `text-muted-foreground`.

## Escena (look "flotante")

- Canvas transparente: `gl={{ alpha: true }}`. **Sin** `<color attach="background">`, **sin** plano de suelo y **sin** `gridHelper` — el camión flota sobre la página.
- El contenedor tampoco lleva marco: nada de `border`, `rounded-*` ni `bg-*` en el `className` del `Truck3DView`; el consumidor solo fija la altura (`h-[380px]`, etc.).
- Luces fijas: `ambientLight 0.5`, `directionalLight [5,10,5] int. 1.4 castShadow` y `Environment` (res 64) con dos `Lightformer` (cenital int. 2 y lateral int. 1).
- Cámara: `fov 40`, posición proporcional al `span` (`[span*0.9, span*0.55, span*0.9]`) con `FitCamera` que ajusta al conjunto. `OrbitControls` con `target [0,1,0]` y `maxPolarAngle π/2.05` (no se puede ir por debajo del eje del suelo).

## Vehículo

- GLB por `VehicleKind` (`MODELS`), precargados con `useGLTF.preload`; `ModelBoundary` cae al fallback procedural (`Body` + `Wheels`) si el GLB falla.
- Cuando hay bultos (`boxes.length > 0`), el modelo se vuelve fantasma: `transparent`, `opacity 0.22`, `depthWrite false` (en la gandola el tractor se queda sólido).
- El espacio de carga es una caja wireframe con `Edges` amarillo `#f2c230` y piso madera `#5b4a36` (más translúcido en pickup/auto).

## Bultos

- Colores por paquete según `PALETTE`/`BOX_COLORS` (`#f2c230`, `#4aa3df`, `#5cc88a`, `#e57a44`, `#c86bd4`, `#e0e0e0`, `#ff6b6b`, `#8fd3c8`), indexados por `colorKeys`; el orden visual coincide con la tabla de la página.
- Cada bulto se dibuja 1 cm más pequeño (gap entre cajas) y lleva `Edges`: rojo `#ff3b3b` si es frágil, `#f2c230` si es el paso resaltado (`highlightedOrder`), `#1a1a1a` el resto. Con `highlightedOrder`, los demás bultos bajan a `opacity 0.3`.
- Etiqueta `PUERTA ▸` (o `MALETERO ▸` en auto) en `Html` con IBM Plex Mono y color `#f2c230`: marca el lado por donde se carga.

## Verificación

- `bun run typecheck` tras tocar el componente; revisión visual en `/panel/vehiculos` (sin bultos) y `/panel/viajes/$id` (con bultos, guía paso a paso y filtro de capas).
