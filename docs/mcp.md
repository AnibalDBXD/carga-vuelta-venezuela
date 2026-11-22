# Servidor MCP de CargaRuta

CargaRuta expone un servidor **MCP** (Model Context Protocol) para que agentes
externos — otro modelo, un orquestador, un asistente propio — puedan usar el
mismo flujo que el bot de Telegram y la web: consultar ofertas de espacio en
camión, armar una solicitud, enviarla, consultar su estado y los datos de
pago; y, con clave de conductor, listar solicitudes pendientes y
aceptarlas/rechazarlas.

> **Recomendado:** si el consumidor es un agente, instala el skill
> [`cargaruta-mcp`](../.devin/skills/cargaruta-mcp/SKILL.md) en su proyecto —
> es la forma más fiable de inicializar la integración (ver
> [Skill para el agente consumidor](#skill-para-el-agente-consumidor-recomendado)).

## Endpoint

```
POST https://cargaruta.vercel.app/api/mcp      (en local: http://localhost:5173/api/mcp)
```

- Transporte: **Streamable HTTP** del protocolo MCP, modo **stateless**
  (sin sesiones: cada request es independiente, servidor y transporte nuevos
  por llamada).
- Headers obligatorios:
  - `Content-Type: application/json`
  - `Accept: application/json, text/event-stream` (ambos; sin esto responde 406)
- Header opcional: `Authorization: Bearer <clave>` — habilita las
  herramientas del conductor (ver abajo).

## Conectar desde clientes MCP

**Claude Desktop / cualquier cliente con HTTP transport** — en la config:

```json
{
  "mcpServers": {
    "cargaruta": {
      "url": "https://cargaruta.vercel.app/api/mcp",
      "headers": { "Authorization": "Bearer <clave-del-conductor>" }
    }
  }
}
```

Sin `Authorization` el servidor responde igual, solo con las herramientas
del solicitante.

**Clientes que solo hablan stdio** — puente con `mcp-remote`:

```sh
npx mcp-remote https://cargaruta.vercel.app/api/mcp \
  --header "Authorization: Bearer <clave-del-conductor>"
```

**Programático (SDK oficial)**:

```ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const client = new Client({ name: "mi-agente", version: "1.0.0" });
await client.connect(
  new StreamableHTTPClientTransport(new URL("https://cargaruta.vercel.app/api/mcp"), {
    requestInit: { headers: { Authorization: `Bearer ${process.env.CARGARUTA_KEY}` } },
  }),
);
const { tools } = await client.listTools();
const res = await client.callTool({
  name: "ver_oferta",
  arguments: { offer_id: "44440000-…" },
});
```

## Concepto clave: el borrador viaja contigo

El servidor **no guarda sesión**. El estado de la solicitud es un objeto
`draft` que el agente conserva y pasa completo en cada llamada:

```json
{
  "sender": "Luis Olivares",
  "phone": "0424…",
  "email": "…",
  "pickup": "…",
  "delivery": "…",
  "notes": "…",
  "packages": [
    {
      "name": "Caja de jugo",
      "length": 5,
      "width": 4,
      "height": 11,
      "weight": 0.25,
      "qty": 4,
      "fragile": true
    }
  ]
}
```

- Empieza vacío (u omite el argumento).
- Cada tool mutadora (`guardar_*`, `agregar_bulto`, `quitar_bulto`,
  `agregar_nota`) lo devuelve actualizado en `structuredContent.draft`.
- Pásalo tal cual en la siguiente llamada. `agregar_bulto` **reemplaza** un
  bulto con el mismo nombre (corregir no duplica).
- `guardar_direcciones` **valida** cada dirección: el geocodificador debe
  encontrarla y debe caer sobre el corredor del viaje; si la rechaza, el
  texto explica por qué ciudades pasa la ruta — reléyelo al usuario.

## Flujo del solicitante (sin clave)

1. `buscar_ofertas(origen?, destino?)` → lista de viajes con `offer_id`,
   ruta, fecha y espacio libre (acepta nombre o slug de ciudad).
2. `ver_oferta(offer_id)` → ruta, fecha, espacio libre.
3. Recolecta con lenguaje natural y guarda con las tools: contacto
   (`guardar_contacto`), recogida/entrega (`guardar_direcciones`), bultos
   (`agregar_bulto` — o foto → `estimar_bulto` con `imagen_url` o
   `imagen_base64` y confirma antes de agregar).
4. `ver_borrador(draft)` → resumen; **pide confirmación explícita**.
5. `enviar_solicitud(offer_id, draft)` → `request_id` + URL de pago.
6. `estado_solicitud(request_id)` → si queda `pending`, **sondea cada
   ~60–90 s hasta ~5 veces** en vez de parar a la primera: el conductor
   decide desde su panel/Telegram y puede tardar minutos. `awaiting_payment`
   → sigue; `rejected`/`expired` → informa y termina; si agota los intentos,
   deja al usuario su página `/pagos/<id>` (el estado cambia solo) para
   re-consultar luego. Al estar aceptada:
   `datos_de_pago(request_id)` → banco/teléfono/RIF, monto USD y Bs a tasa
   BCV, payload del QR de pago móvil.
7. `subir_comprobante(request_id, imagen_url|imagen_base64, mime_type)` →
   la foto del comprobante (jpg/png/webp ≤5 MB, por URL pública o base64) se
   guarda en el bucket privado y el pago se confirma igual que en la web/bot.

## Flujo del conductor (con clave)

1. El conductor genera la clave en `/panel/viajes` → botón **«API»** →
   «Nueva clave». El `id` mostrado **es** el bearer token (revocable ahí
   mismo).
2. Con `Authorization: Bearer <clave>` aparecen dos tools extra:
   - `solicitudes_pendientes()` → solicitudes `pending` de sus viajes.
   - `decidir_solicitud(request_id, accept, amount_usd?)` → acepta (con
     monto; el solicitante es avisado para pagar) o rechaza. Autorización
     real en base de datos: solo dueños del viaje.

## Skill para el agente consumidor (recomendado)

Para usar bien el MCP, **instala el skill en el agente que va a consumirlo**.
El `initialize` describe el flujo en una línea, pero el skill enseña el
comportamiento completo que hace que la integración funcione:

- **Disciplina del `draft`** — el error más común es perder el borrador entre
  llamadas; el skill lo marca como regla crítica.
- **Reglas de comportamiento** — nunca inventar datos, retransmitir los
  errores de validación de direcciones, pedir confirmación explícita antes de
  `enviar_solicitud`, confirmar la estimación por foto antes de agregar el
  bulto.
- **El sondeo de `estado_solicitud`** — sin la guía un agente suele parar en
  el primer `pending`; el skill le indica reintentar cada 60–90 s durante ~7
  min antes de dejar la página de pago al usuario.
- **Las herramientas del conductor** — cuándo y cómo pedir la clave Bearer.

### Instalación

El skill vive en `.devin/skills/cargaruta-mcp/SKILL.md` — es autónomo (no
depende de este documento). Copia la carpeta al proyecto del agente:

```bash
# Devin
cp -r .devin/skills/cargaruta-mcp <proyecto-del-agente>/.devin/skills/

# Agentes que leen .agents/skills/ (estándar abierto)
cp -r .devin/skills/cargaruta-mcp <proyecto-del-agente>/.agents/skills/
```

O descárgalo directo del repo:

```bash
mkdir -p .devin/skills/cargaruta-mcp
curl -fsSL https://raw.githubusercontent.com/AnibalDBXD/cargaruta/main/.devin/skills/cargaruta-mcp/SKILL.md \
  -o .devin/skills/cargaruta-mcp/SKILL.md
```

Con el skill instalado, el agente activa `cargaruta-mcp` y puede operar el
flujo completo — pedir espacio en un camión, seguir el pago, o gestionar
solicitudes como conductor — sin leer este documento ni las specs.

## Notas

- 16 tools: 14 del solicitante + 2 del conductor. Sin clave válida las del
  conductor ni siquiera aparecen en `tools/list`.
- `estimar_bulto` usa **el modelo del propio cliente** si este declara la
  capacidad `sampling` (le llega la foto por `sampling/createMessage`); si
  no, cae a la visión Gemini del servidor. El resultado indica `via:
"cliente" | "gemini"`.
- Los ids de oferta y solicitud son capabilities (como los enlaces
  `/bolsa/<id>` y `/pagos/<id>` de la web) — la clave solo gobierna acciones
  del conductor.
- Errores de herramienta llegan como `isError: true` con el mensaje en
  `content[0].text`; un rechazo de validación (p. ej. dirección fuera de
  ruta) llega como texto normal para retransmitir al usuario.
