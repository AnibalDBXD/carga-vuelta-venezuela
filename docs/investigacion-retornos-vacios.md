# Viajes de retorno vacíos en Venezuela y Latinoamérica

Investigación para dimensionar el problema que ataca CargaRuta. Fecha de corte: **noviembre 2026**.

## Resumen ejecutivo

- **Venezuela no tiene una estadística oficial reciente** de viajes de retorno vacíos. El único dato
  documentado y localizable es de **2005**: la Asociación Logística de Venezuela (ALV) estimó que
  **50% a 80% de los viajes de retorno se hacían vacíos**.
- En Latinoamérica, los datos más sólidos van de **33% a 69%** según el país y la métrica:
  **Colombia 69%** de viajes vacíos (registros RNDC), **Brasil 35,5%** (CNTA 2025),
  **México 30–40%** de camiones que regresan vacíos y **Argentina 65% de transportistas** que
  vuelven vacíos siempre o casi siempre.
- Para planificar CargaRuta en Venezuela, una **base conservadora es 50–65% de retornos vacíos**,
  con un punto medio de **~60%**. Es una estimación de trabajo, no un dato oficial: hay que
  validarla con datos propios del corredor.

## Comparación por país

| País | Métrica | Valor | Fuente y año | Nivel de evidencia |
|---|---|---:|---|---|
| **Colombia** | Viajes vacíos, camiones C2 | **69%** | Universidad de los Andes / GiroZero, datos RNDC 2019; publicado en La República (2024) | Alto: registro administrativo |
| **Colombia** | Viajes vacíos, tractomulas C3S3 | **66,37%** | Ibíd. | Alto |
| **Brasil** | Viajes sin mercancía | **35,5%** | CNTA, 2025; reportado por O Caminhoneiro Legal (2026) | Alto: asociación nacional |
| **Brasil** | Camiones circulando vacíos | **38%** | LogShare, 2026 (declaración sectorial) | Medio |
| **México** | Camiones que regresan vacíos | **30–40%** | El Financiero / Cheicargo, 2024 | Medio: estimación sectorial |
| **Argentina** | Transportistas que vuelven vacíos "siempre o la mayoría de las veces" | **65%** | Avancargo, encuesta 2026, n = 418 | Medio-alto: encuesta representativa del segmento |
| **Argentina** | Dueños-choferes con retornos vacíos frecuentes | **~80%** | Ibíd. | Medio-alto |
| **Chile** | Camiones que vuelven vacíos | **20–40%** | RutaLlena (plataforma), s/f | Bajo: estimación comercial |
| **Venezuela** | Viajes de retorno vacíos | **50–80%** | ALV, "Problemática del transporte terrestre de carga en Venezuela", enero 2005 | Bajo-medio: presentación gremial, no encuesta |
| **Unión Europea** | Kilómetros recorridos vacíos | **~20%** | Eurostat, 2020 | Alto: estadística oficial |
| **Mundial** | Camiones circulando vacíos entre entregas | **~35%** | Uber Freight, citado por Forbes (2026) | Medio |

**Promedio simple indicativo de los países de la tabla: ~50%.** No es un promedio ponderado ni una
métrica homogénea; sirve solo para mostrar el orden de magnitud.

## Venezuela: qué existe y qué no

### El dato disponible

Presentación **"Problemática del transporte terrestre de carga en Venezuela"**, de **Eduardo
Praselj, presidente de la Asociación Logística de Venezuela (ALV)**, enero de 2005:

> "Alto porcentaje de camiones vacíos en el flujo de vehículos: **50 a 80% de viajes de retorno
> vacíos**."

El mismo documento lo repite al hablar de costos:

> "Alto porcentaje de viajes de retorno vacío aumenta el costo promedio de transporte."

Enlace: <http://alv-logistica.org/docs/Problem%C3%A1ticaTransporteTerrestreCargaEnero2005.pdf>

### Limitaciones

- Es una **presentación gremial**, no una encuesta con muestra declarada ni un registro de viajes.
- Tiene **21 años**. El parque, los corredores y los costos cambiaron.
- No distingue por tipo de camión, corredor ni temporada.
- No se encontró una estadística pública del INE, MPPT o INTT sobre viajes vacíos. Tampoco un
  registro equivalente al RNDC colombiano.

### Conclusión para Venezuela

El dato de 2005 es el único publicado y localizable, pero **no debe presentarse como una cifra
actual**. Para CargaRuta:

- Escenario conservador: **50% de retornos vacíos**.
- Escenario base: **60%**.
- Escenario alto: **65–80%**.

La cifra de 60% es coherente con el rango venezolano de 2005 y con los datos actuales de Argentina
(65%) y Colombia (66–69%).

## Cómo convertir el porcentaje en volumen

Con una sola fórmula:

```text
retornos vacíos al mes = viajes de ida al mes × % de retorno vacío
km vacíos al mes       = retornos vacíos al mes × km promedio del retorno
```

Ejemplo aritmético (no es un dato de mercado): 1.000 viajes de ida al mes en un corredor y 60% de
retornos vacíos:

- 600 retornos vacíos/mes.
- Si el retorno promedio es Valencia–Caracas (165 km): **99.000 km vacíos/mes**.
- A 2,5 km/L de diésel: **~39.600 L/mes** quemados sin carga.

Ese es el tipo de volumen que CargaRuta puede capturar si llena una parte de esos retornos.

## Advertencias metodológicas

No mezclar estas tres métricas:

1. **% de viajes vacíos**: proporción de viajes que no llevan carga (Colombia, Brasil).
2. **% de kilómetros vacíos**: proporción de km sin carga (Europa). Suele ser menor que el % de
   viajes, porque los retornos vacíos suelen ser más cortos o largos según el corredor.
3. **% de transportistas que vuelven vacíos con frecuencia**: percepción declarada (Argentina).

Una empresa puede volver vacía "casi siempre" y aun así recorrer pocos km vacíos, o al revés.
Para un pitch, lo más defendible es citar la métrica exacta y su fuente, no cambiarla de nombre.

## Fuentes

1. **La República (Colombia), 5/03/2024.** "Casi 70% de los viajes de camiones se hacen sin carga".
   <https://www.larepublica.co/economia/viajes-de-transporte-vacios-y-sin-carga-se-ubican-en-69-incrementa-la-huella-co2-3814605>
2. **GiroZero / Universidad de los Andes (2022).** Modelo para reducir viajes vacíos con datos del
   RNDC 2019.
   <https://girozero.uniandes.edu.co/modelo-matematico-para-reducir-viajes-vacios/>
3. **Avancargo (2026).** Estudio de impacto y sustentabilidad en el transporte de cargas, 5.ª
   edición, 418 respuestas. Sección "Viajes vacíos".
   <https://reportes.avancargo.com/sustentabilidad-en-el-transporte-2026.html>
4. **O Caminhoneiro Legal (2026).** "Um terço das viagens de caminhão termina com retorno vazio",
   con datos de CNTA: 35,5% de viajes y 10.000 millones de km vacíos de 30.000 millones.
   <https://ocaminhoneirolegal.com.br/2026/07/14/rodando-no-vazio/>
5. **Transligue (2026).** Retorno vacío en Brasil: 38% de camiones; cita a Uber Freight/Forbes para
   el ~35% global.
   <https://www.transligue.com.br/blog/frete-de-retorno-vazio-um-custo-que-gera-perdas-bilionarias-no-transporte-rodoviario/>
6. **El Financiero, vía Hanakua (24/09/2024).** "Regresan vacíos 4 de 10 camiones": 30–40% en
   México.
   <https://web.hanakua.mx/Notas/?id=202409240452249814&temaid=10001906>
7. **Milenio (2018).** "El 30% del transporte de carga opera vacío".
   <https://www.milenio.com/negocios/30-transporte-carga-opera-vacio-experto>
8. **ALV, Eduardo Praselj (enero 2005).** "Problemática del transporte terrestre de carga en
   Venezuela": 50–80% de viajes de retorno vacíos.
   <http://alv-logistica.org/docs/Problem%C3%A1ticaTransporteTerrestreCargaEnero2005.pdf>
9. **Eurostat (2021).** "A fifth of road freight kilometres by empty vehicles": ~20% en la UE.
   <https://ec.europa.eu/eurostat/web/products-eurostat-news/-/ddn-20211210-1>

## Recomendación para el pitch

Frase defendible:

> "En Latinoamérica, entre un tercio y dos tercios de los viajes de carga se hacen sin mercancía.
> En Venezuela el último dato publicado habla de 50–80% de retornos vacíos; para nuestro modelo
> usamos 60% como escenario base."

Evitar:

- "El 80% de los camiones venezolanos vuelve vacío" como si fuera un dato actual.
- Mezclar porcentaje de viajes con porcentaje de kilómetros.
- Presentar el promedio regional como si fuera una medición ponderada.

Para convertir la estimación en dato propio, CargaRuta debería registrar en cada viaje: origen,
destino, km, si el retorno se publicó, si se llenó y cuántos km se hicieron vacíos. Con tres meses
de operación en un corredor se puede reportar una tasa propia, que vale más que cualquier proxy.

---

# Anexo: interés en una promoción del 40% en el envío

## Respuesta corta

**No existe un estudio publicado que pregunte exactamente “¿aceptaría 40% de descuento en su envío?”
para Venezuela ni para Latinoamérica.** Cualquier cifra directa sería inventada. Lo que sí existe es
evidencia sobre sensibilidad al precio, al costo de envío y a los descuentos. Triangulando esa
evidencia:

| Perfil | Interés declarado estimado | Conversión real estimada (solicitud/pago) |
|---|---:|---:|
| Consumidor ocasional que envía un paquete | **80–90%** | **25–35%** |
| Comercio/embarcador pyme (cliente típico de CargaRuta) | **70–80%** | **20–30%** |
| Empresa con logística establecida y contratos | **50–65%** | **10–20%** |
| **Promedio ponderado razonable para CargaRuta** | **~75–80%** | **~25–30%** |

Estas cifras son **estimaciones de trabajo**, no mediciones. La única forma de convertirlas en dato
real es encuestar y testear (ver el final).

## Evidencia disponible

### Latinoamérica

| Dato | Valor | Fuente |
|---|---:|---|
| Consumidores que planifican sus compras en función de descuentos y ofertas | **43%** | Estudio regional de personalización retail, 2025 (Difundido por Forbes Centroamérica / El Informador / Delfino) |
| Consumidores que consideran necesario un **descuento mínimo del 30%** para percibir una promoción como atractiva | **37%** | Ibíd. |
| Consumidores que dicen que el precio ganó importancia frente al año anterior | **73%** | SKIM, 2025 (difundido por PRODU) |
| Consumidores que dicen que las promociones ganaron relevancia | **67%** | Ibíd. |
| Chilenos que basan su decisión en precio y promociones (vs. 23% fieles a la marca) | **60%** | Encuesta citada por La Tercera, 2025 |

Lectura: **40% supera el umbral del 30%** que exige el 37% de los compradores para considerar
atractiva una promoción. Eso empuja el interés declarado muy por encima de ese 37%.

### Venezuela

| Dato | Valor | Fuente |
|---|---:|---|
| Consumidores que han dejado de comprar un producto por su precio | **81,3%** | More Consulting, *Radiografía del Nuevo Consumidor Venezolano*, 2026 |
| Consumidores que comparan precios siempre o casi siempre | **69,6%** | Ibíd. |
| Consumidores que analizan mucho más antes de comprar | **72,8%** | Ibíd. |
| Consumidores que basan su decisión de compra en el precio | **60%** | Análisis de consumo citado por Banca y Negocios / Qué Pasa |
| Personas que creen que es difícil o muy difícil encontrar descuentos reales | **51%** | Datanálisis, sondeo citado por J. Rivasa, 2025 |

Lectura: la sensibilidad al precio en Venezuela es **más alta** que el promedio regional, pero hay
un problema de confianza: la mitad cree que los descuentos no son reales. Una promoción del 40%
tiene alta atracción potencial, pero exige demostrar que el precio base no está inflado.

### Costo de envío y cupones

| Dato | Valor | Fuente |
|---|---:|---|
| Compradores que abandonan el carrito por costos de envío altos | **41%** | Encuesta citada por Eshow Magazine, 2025 |
| Abandono de carrito por costo de envío en México | **49%** | T1, 2026 (blog sectorial; dato secundario) |
| Compradores online que buscan cupones antes de comprar | **64%** | Capital One Shopping, 2026 (global, principalmente EE. UU.) |
| Tasa media de canje de cupones digitales | **7%** | Capital One Shopping / benchmarks de cupones |
| Canje de cupones de “envío gratis” | **18–22%** | Orbit Engine (benchmark comercial, evidencia baja) |
| Aceptación de 40% off vs. 25% off en flujos de retención | **8,7% vs. 3,3%** (≈2,6×) | Churnkey 2025, vía ChurnStop (contexto de suscripciones, no de fletes) |
| Descuentos superiores al 60% pueden reducir la conversión | — | Uxitt / literatura de descuentos profundos |

Lectura: un descuento del 40% está en la zona donde los benchmarks de descuentos profundos
muestran la mayor aceptación antes de que descuentos más agresivos empiecen a penalizar la
percepción. Pero el canje real de cupones es **muy inferior** al interés declarado.

## Por qué 75–80% de interés declarado es una estimación razonable

1. **El 40% supera el umbral del 30%** que exige el 37% de los compradores latinoamericanos.
2. **43% ya planifica compras alrededor de descuentos** y 67% dice que las promociones son más
   relevantes.
3. **El costo de envío es un factor de abandono** para 41–49% de los compradores.
4. **Venezuela es un mercado extremadamente sensible al precio** (81% ha dejado de comprar por
   precio).
5. **En carga B2B, el precio es el criterio #1 o #2** para elegir transportista (Ti/project44).

Pero “interesado” no es “compra”. La conversión real será menor por:

- Desconfianza en descuentos “inflados” (51% en Venezuela).
- En B2B, la confiabilidad pesa tanto como el precio (67% de embarcadores prioriza nivel de
  servicio).
- Un descuento del 40% puede leerse como señal de baja calidad si no se explica bien.
- El canje promedio de cupones ronda el 7%; incluso los de envío gratis llegan a 18–22%.

## Cuidado con el margen: 40% puede ser pérdida

La regla es simple: **el descuento máximo sostenible es el margen bruto**.

Ejemplo:

- Flete de **USD 1.000**.
- Margen bruto del **15%** = USD 150.
- Descuento del **40%** = USD 400.
- Contribución resultante: **–USD 250** por envío.

Por eso una promo del 40% solo tiene sentido si:

- Se aplica a **capacidad de retorno que igual iba vacía** (costo marginal bajo), no a toda la
  operación.
- Es **limitada en tiempo y volumen** (captación, no precio permanente).
- Se mide el **margen incremental**, no solo las ventas.

Si el margen es 15%, el descuento de equilibrio es 15%. Para regalar 40% necesitas un margen de
40% o un retorno que de otro modo sería cero.

## Cómo medirlo de verdad

### Encuesta de intención

Pregunta con escala de 5 puntos y escalera de precios:

> “Si tu envío costara hoy USD 1.000, ¿qué probabilidad hay de que lo contrates con estos descuentos?”
> 0%, 10%, 20%, 30%, 40%, 50%.

Calcula **top-2-box** (probable + muy probable). Con 300–400 respuestas por segmento tienes un
margen de error de ±5 pp al 95%.

### Test A/B de la promo

Tres brazos:

- **Control:** precio normal.
- **20% off.**
- **40% off.**

Métrica principal: **envíos pagados / cotizaciones vistas**. Secundarias: solicitud de cotización,
abandono, margen por envío, recompra a 30 días.

Con ~400 impresiones por brazo detectas diferencias de ~5 pp. Si el volumen es menor, corre el test
más tiempo y prioriza el intervalo de confianza sobre el punto.

### Instrumentación en la app

- Código de promo y canal de origen.
- Ruta, km y si el retorno estaba vacío.
- Descuento aplicado y margen resultante.
- Conversión a pago y recompra.

Con tres meses de datos propios se puede reemplazar el 75–80% estimado por una tasa real.

## Fuentes del anexo

1. **More Consulting (2026).** *Radiografía del Nuevo Consumidor Venezolano*: 81,3% dejó de comprar
   por precio; 69,6% compara precios; 72,8% analiza más.
   <https://www.bancaynegocios.com/more-consulting-81coma3-porciento-de-los-consumidores-deja-de-comprar-productos-por-su-precio/>
2. **Banca y Negocios (2025).** “El 60% de los consumidores venezolanos basan su decisión de compra
   en precios”.
   <https://www.bancaynegocios.com/el-60-porciento-de-los-consumidores-venezolanos-basan-su-decision-de-compra-en-precios/>
3. **Datanálisis (2025), citado por J. Rivasa.** “Un 51% cree que es difícil o muy difícil encontrar
   descuentos reales en Venezuela”.
   <https://jrivasa.com/2025/12/02/sondeo-datanalisis-un-51-cree-que-es-dificil-o-muy-dificil-encontrar-descuentos-reales-en-venezuela/>
4. **Estudio regional de retail/personalización (2025).** 43% planifica compras por descuentos;
   37% exige al menos 30% para considerar atractiva una promo.
   <https://vidadigital.com.pa/el-70-de-las-consumidoras-en-latinoamerica-sigue-prefiriendo-las-tiendas-fisicas-para-comprar-ropa-pero-el-canal-digital-gana-protagonismo/>
5. **La Tercera (2026).** 60% de consumidores decide por precio y promociones; 23% es fiel a la
   marca.
   <https://www.latercera.com/que-pasa/noticia/encuesta-revela-que-prefiere-la-gente-si-del-precio-o-la-marca/3ZSC5FWVKJD6PC3ZGTTJEXNKL4/>
6. **Eshow Magazine (2025).** 41% abandona el carrito por gastos de envío elevados.
   <https://eshowmagazine.com/noticias-de-actualidad/consumidores-abandonan-carrito-elevados-gastos-compra/>
7. **T1 (2026).** Costo de envío alto y abandono de carrito en México (49%).
   <https://www.t1.com/us/blog/costo-envio-alto-abandono-carrito-2026>
8. **Capital One Shopping (2026).** 64% busca cupones; canje promedio de cupones digitales ~7%.
   <https://capitaloneshopping.com/research/coupon-statistics>
9. **Orbit Engine.** Canje de cupones de envío gratis 18–22% (benchmark comercial).
   <https://www.orbitengine.cloud/tool/coupon-redemption-rate-calculator/>
10. **Churnkey 2025, vía ChurnStop (2026).** Aceptación de 40% off (8,7%) vs. 25% off (3,3%).
    <https://churnstop.org/blog/discount-depth>
11. **Uxitt.** Descuentos profundos (>60%) pueden reducir la conversión.
    <https://www.uxitt.com/insights/big-discounts-backfire>
12. **Transport Intelligence / project44 (2022).** El precio es el factor principal para elegir
    transportista; confiabilidad y visibilidad le siguen.
    <https://talkbusiness.net/2022/04/shipper-survey-highlights-importance-of-pricing-and-timely-shipments-visibility-systems/>
13. **SKIM (2025).** *Precio y promoción: decisiones críticas para el crecimiento y el valor de
    marca*: 7.232 consumidores, 1.505 en América Latina; 73% dice que el precio ganó importancia y
    67% que las promociones ganaron relevancia.
    <https://www.produ.com/mercadeo/noticias/estudio-de-skim-calidad-y-precio-lideraron-decisiones-de-compra-en-america-latina/>

## Frase defendible para el pitch

> “En Latinoamérica, 43% de los compradores planifica sus compras alrededor de descuentos y 37%
> exige al menos 30% para considerar atractiva una promoción. En Venezuela, 81% ha dejado de comprar
> por precio. Por eso estimamos que una promo del 40% en el envío genera interés en 75–80% de los
> clientes; la conversión real la mediremos con un test A/B antes de escalarla.”

No decir “el 80% compraría”: decir “al 80% le interesaría”, que es distinto.

