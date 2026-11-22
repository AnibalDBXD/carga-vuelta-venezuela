# CargaRuta · Sistema de diseño

Documento de referencia de marca y UI. Todo lo visual del producto sale de aquí: logo, paleta,
tipografía, línea gráfica y aplicaciones. Si algo no está definido acá, se resuelve con la regla
más cercana de este documento antes de inventar un estilo nuevo.

- **Producto:** app para camioneros en Venezuela. Planificación de viajes con rutas reales (Mapbox),
  acomodo de carga en 3D, bolsa de viajes con espacio libre y pago móvil de la plataforma.
- **Promesa:** *Carga más. No regreses vacío.*
- **Concepto visual:** pavimento y señalización vial. Asfalto de noche, pintura amarilla de la
  línea central, blanco de borde y reflectores. Nada de camiones genéricos ni íconos de caja.

---

## 1. Logo

### 1.1 Símbolo — "La curva"

Una carretera en curva vista en planta: dos líneas continuas de borde y la línea central
discontinua. Se construye con tres arcos concéntricos sobre un lienzo de **64 × 64**.

| Elemento | Geometría |
|---|---|
| Centro del arco | `(58, 58)` |
| Borde exterior | radio `37`, de `(21,58)` a `(58,21)` |
| Borde interior | radio `15`, de `(43,58)` a `(58,43)` |
| Línea central | radio `26` (eje de la vía) |
| Grosor de los bordes | `5.6`, remates redondeados |
| Grosor de la discontinua | `4.4`, remates planos |
| Trazos discontinuos | **3**, siguiendo el arco: `stroke-dasharray="9 6.92"` |

Reglas del símbolo:

- La discontinua va **sobre el eje** (radio 26), nunca pegada a un borde.
- Se dibuja con `stroke-dasharray` sobre el arco, **no con rectángulos rotados**: un rectángulo es una
  cuerda recta sobre una curva y se ve como un trozo pegado.
- El patrón cierra exacto: el arco mide `π/2 × 26 = 40.84` = `3 × 9` de trazo + `2 × 6.92` de hueco.
  Si cambias el largo de los trazos, recalcula el hueco con `(40.84 − 3 × trazo) / 2`.
- La discontinua es más fina que los bordes (4.4 vs 5.6): así se lee como pintura y no como bloque.
- Continuas en amarillo, discontinua en blanco de borde (invertido respecto a la señalización real:
  es una decisión de marca, no un error).

```svg
<g transform="translate(342 252) scale(5)" fill="none" stroke-linecap="round">
  <path d="M21 58A37 37 0 0 1 58 21" stroke="#F7CE1E" stroke-width="5.6"/>
  <path d="M43 58A15 15 0 0 1 58 43" stroke="#F7CE1E" stroke-width="5.6"/>
  <path d="M32 58A26 26 0 0 1 58 32" stroke="#EFEDE3" stroke-width="4.4"
        stroke-linecap="butt" stroke-dasharray="9 6.92"/>
</g>
```

### 1.2 Wordmark

- Tipografía: **Saira Stencil One** (equivalente libre de Stencil, servida desde Google Fonts).
  El lockup de presentación se compuso con Stencil; para web se usa Saira Stencil One, que mantiene
  el corte de esténcil a partir de 40 px y se comporta como una condensada limpia por debajo.
- `CARGA` en Blanco de borde `#EFEDE3` · `RUTA` en Línea amarilla `#F7CE1E`.
- Sin espacio tipográfico entre las palabras: la separación la hace el color.
- Tracking `+0.03em`, mayúsculas siempre. En el header va a 17 px; el esténcil aparece a partir de 40 px.
- Peso único (la familia no tiene variantes): el contraste lo dan el color y el esténcil.

### 1.3 Lockup y proporciones

- Símbolo arriba, wordmark abajo, centrado óptico.
- Alto del símbolo ≈ **2.75×** la altura de mayúscula del wordmark.
- Separación símbolo ↔ wordmark ≈ **0.5× la altura del símbolo**.
- Área de respeto: **24 unidades** del lienzo 64 alrededor del conjunto (≈ 0.6 del radio del
  símbolo). Nada entra ahí: ni textos, ni bordes, ni fotos.

### 1.4 Tamaños mínimos

| Versión | Mínimo | Nota |
|---|---|---|
| Símbolo solo | 16 px | en 16 px las dos piezas blancas siguen leyéndose como línea discontinua |
| Lockup horizontal | 120 px de ancho | por debajo, usar símbolo + wordmark en una línea |
| Lockup vertical | 960 px de ancho de lámina | el usado en presentación |

### 1.5 Versiones autorizadas

1. **Principal:** símbolo + wordmark sobre Asfalto `#14161A`.
2. **Monocromo claro:** todo en `#EFEDE3` sobre asfalto (prensa, bordado, sellos).
3. **Monocromo oscuro:** todo en `#14161A` sobre fondo claro (facturas, documentos).
4. **Símbolo solo:** favicon, avatar, marca de agua, sello de estado.

### 1.6 Usos incorrectos

- No rotar, deformar, ni cambiar la proporción entre símbolo y wordmark.
- No aplicar degradados, sombras, biseles ni contornos.
- No usar el amarillo como fondo del wordmark blanco (contraste 1.3:1).
- No reordenar colores: continuas amarillas, discontinua blanca.
- No sustituir Stencil por otra fuente "parecida" sin aprobación: la marca pierde carácter.
- No poner el símbolo sobre fotografía sin un velo de asfalto al 60 %.

---

## 2. Paleta — Asfalto Nocturno

Cinco colores. Todo lo demás (estados, gráficos) se deriva de estos.

| Rol | Hex | oklch | Uso |
|---|---|---|---|
| Asfalto | `#14161A` | `oklch(0.200 0.009 264.4)` | fondo de la app, láminas, favicon |
| Calzada | `#232830` | `oklch(0.275 0.016 259.8)` | tarjetas, inputs, barra de navegación |
| Línea amarilla | `#F7CE1E` | `oklch(0.862 0.172 93.8)` | acciones primarias, acentos, datos clave |
| Blanco de borde | `#EFEDE3` | `oklch(0.945 0.013 97.4)` | texto principal, trazos del logo |
| Concreto | `#7A8088` | `oklch(0.597 0.014 255.5)` | texto secundario, bordes, iconos inactivos |

### 2.1 Contraste verificado (WCAG)

| Combinación | Ratio | Nivel |
|---|---|---|
| Blanco de borde / Asfalto | 15.43:1 | AAA |
| Blanco de borde / Calzada | 12.62:1 | AAA |
| Línea amarilla / Asfalto | 11.90:1 | AAA |
| Línea amarilla / Calzada | 9.74:1 | AAA |
| Asfalto / Línea amarilla (botón) | 11.90:1 | AAA |
| Concreto / Asfalto | 4.55:1 | AA (solo texto secundario) |

El Concreto **no** se usa para párrafos largos ni para texto por debajo de 14 px.

### 2.2 Estados (derivados)

| Estado | Hex | Nota |
|---|---|---|
| Éxito / viaje confirmado | `#3FBF7F` | sobre Calzada, 6.4:1 |
| Alerta / documento pendiente | `#F5A524` | avisos de fecha límite |
| Error / capacidad excedida | `#E4574C` | solo para errores reales, no decorativo |

### 2.3 Reglas de uso del color

- El amarillo es **acción y dato**, no decoración: botón primario, cifra destacada, estado activo.
  Máximo ~15 % del área de una pantalla.
- Fondo siempre Asfalto; Calzada solo para elevar superficies. No hay tema claro en esta versión.
- El amarillo nunca se usa como color de texto largo (más de 2 líneas).

### 2.4 Mapeo a `src/styles.css`

La app ya usa oklch. Esta es la correspondencia propuesta (los valores actuales están a una
milésima de distancia; el ajuste es cosmético y debe hacerse en un solo commit):

| Token | Variable | Valor de marca |
|---|---|---|
| `--background` | fondo | `oklch(0.200 0.009 264.4)` |
| `--card`, `--popover` | superficies | `oklch(0.275 0.016 259.8)` |
| `--primary`, `--ring` | acción | `oklch(0.862 0.172 93.8)` |
| `--primary-foreground` | texto sobre primario | `oklch(0.200 0.009 264.4)` |
| `--foreground` | texto | `oklch(0.945 0.013 97.4)` |
| `--muted-foreground` | texto secundario | `oklch(0.597 0.014 255.5)` |
| `--muted` | fondo sutil | `oklch(0.305 0.012 260)` |
| `--secondary` | superficie de botón secundario | `oklch(0.330 0.014 260)` |
| `--accent` | hover / selección | `oklch(0.350 0.016 260)` |
| `--border`, `--input` | bordes | `oklch(0.320 0.010 260)` |

Escalera de superficies, de abajo hacia arriba: Asfalto `0.200` → Calzada `0.275` → muted `0.305`
→ secondary `0.330` → accent `0.350`. Cualquier superficie nueva debe caer dentro de esa escalera;
si queda por debajo de la tarjeta, desaparece.

---

## 3. Tipografía

Tres familias, tres funciones. No se agrega una cuarta.

| Rol | Familia | Uso |
|---|---|---|
| Marca | **Stencil** | únicamente el wordmark del logo |
| Interfaz | **Space Grotesk** | títulos, cuerpo, botones, formularios |
| Datos | **IBM Plex Mono** | cifras de peso/medidas, patentes, etiquetas, hex |

### 3.1 Wordmark

La web renderiza el wordmark con **Saira Stencil One** desde Google Fonts (ver §1.2), aplicada por
`--font-brand` en `src/styles.css` y encapsulada en `src/components/Logo.tsx`. El lockup vectorial
con Stencil sigue siendo la referencia para impresión: **pendiente vectorizar** el wordmark para
que impresión y web sean idénticas.

### 3.2 Escala de interfaz (Space Grotesk)

| Rol | Tamaño / línea | Peso | Tracking |
|---|---|---|---|
| Display | 56–64 / 1.05 | 700 | −0.02em |
| H1 | 40 / 1.1 | 700 | −0.02em |
| H2 | 24 / 1.2 | 600 | −0.01em |
| Cuerpo | 16 / 1.55 | 400 | 0 |
| Cuerpo denso | 14 / 1.45 | 400 | 0 |
| Etiqueta | 12 mono mayúsculas | 500 | +0.12em |

### 3.3 Reglas

- Etiquetas y unidades siempre en IBM Plex Mono, mayúsculas, tracking amplio: es el "código de
  ruta" de la marca (`3500 KG`, `VALENCIA · CARACAS`, `#F7CE1E`).
- Nunca usar Stencil en la UI: es solo marca.
- Cifras críticas (peso total, m³ libres) usan `font-variant-numeric: tabular-nums`.

---

## 4. Línea gráfica

### 4.1 Principio: pintura vial

Todo trazo grueso se dibuja como pintura sobre pavimento: remates redondeados, grosor constante,
sin textura ni bisel. El esténcil del wordmark y las líneas del símbolo son el mismo lenguaje.

- **Grosor de trazo:** bordes 5.6/64 y discontinua 4.4/64 en el símbolo; en UI, bordes de 1 px
  `#232830` (nunca más).
- **Radios:** `0.375rem` en controles, `0.5rem` en tarjetas.
- **Franja de peligro:** el `hazard-stripe` que ya existe en `styles.css` se usa solo como borde
  superior de sección, nunca dentro de una tarjeta ni en el logo.
- **Retícula de asfalto** (`grid-asphalt`): solo en heroes y bloques de apertura; no en formularios.

### 4.2 Iconografía

- Librería: **Lucide** (la que ya usa el proyecto).
- Trazo 1.75, tamaños 16 / 20 / 24.
- Color: Concreto por defecto; Línea amarilla solo si el icono representa la acción primaria.
- Un icono nunca sustituye una etiqueta en acciones destructivas.

### 4.3 Aplicación en componentes

| Componente | Especificación |
|---|---|
| Header | Asfalto 90 % + blur, franja hazard de 4 px arriba, símbolo 32 px |
| Footer | Borde superior de 1 px, marca + tagline, columna "Navegar" y barra inferior en mono; el layout usa `min-h-dvh` + `flex-1` para que quede al pie en páginas cortas. Sin franja hazard: competía con la línea discontinua del símbolo |
| Botón primario | Línea amarilla, texto Asfalto, radio 6 px, peso 600 |
| Botón secundario | Borde `#232830`, texto Blanco de borde |
| Tarjeta | Calzada, borde 1 px `#232830`, radio 8 px, padding 24 px |
| Tabla de carga | Mono para medidas, filas separadas por borde 1 px, sin cebras |
| Estado vacío | Símbolo monocromo al 12 % de opacidad + texto en Concreto |
| Gráficos | Serie 1 amarillo · serie 2 Concreto · serie 3 Éxito |

### 4.4 Movimiento

- Duración 120–200 ms, `ease-out`. Sin rebotes ni parallax.
- La única animación permitida del logo es un fade de 200 ms al cargar.
- El visor 3D del landing gira solo y lento (`autoRotate`, velocidad 0.35) y sigue siendo arrastrable; en las vistas de planificación no gira.
- En la landing la carga se monta caja por caja: 120 ms entre bultos, cada uno cae 50 cm y crece en 300 ms. Con `prefers-reduced-motion` se muestran todas de inmediato.

---

## 5. Voz y microcopy

- Español venezolano, tuteo, frases cortas y concretas.
- Se habla de **carga, viaje y espacio libre**, no de "soluciones logísticas". En la cara pública
  del cliente manda la **bolsa de viajes**; el "retorno" es un concepto interno del conductor.
- Cifras siempre con unidad y separador de miles: `3.500 kg`, `12,4 m³`, `420 × 200 × 200 cm`.
- Los estados se nombran por lo que el camionero gana: "espacio libre", "solicitud de recogida",
  "pago confirmado".

---

## 6. Accesibilidad

- Contraste mínimo AA en todo texto (ver §2.1). Concreto solo ≥ 14 px.
- Foco visible: anillo de 2 px en Línea amarilla con offset de 2 px.
- No comunicar estado solo con color: acompañar con icono o texto.
- Área táctil mínima 44 × 44 px.

---

## 7. Archivos y pendientes

Assets actuales en `public/`:

| Archivo | Contenido |
|---|---|
| `propuesta-2-curva-asfalto-nocturno.svg` / `.png` | lockup principal, 1080 × 1080 |
| `paleta-asfalto-nocturno.svg` / `.png` | lámina de paleta, 1080 × 1080 |
| `public/favicon.svg` | símbolo sobre Asfalto, 64 × 64 |
| `tipografia-opciones.png` | referencia de tipografías evaluadas (descartable) |
| `src/components/Logo.tsx` | `<LogoMark />`, `<LogoWordmark />`, `<Logo />` |

Pendientes técnicos:

1. **Vectorizar el wordmark** (Stencil → curvas) para impresión; la web ya usa Saira Stencil One.
2. **Tokens**: §2.4 ya aplicado en `src/styles.css` (incluye `color-scheme: dark` para los
   desplegables nativos).
3. **Controles nativos**: los `<select>` deben usar `bg-card`, no `bg-background`; si no, se
   confunden con el fondo de la página.
