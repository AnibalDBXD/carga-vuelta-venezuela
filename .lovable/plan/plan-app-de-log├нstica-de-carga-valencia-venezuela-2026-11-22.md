# Plan: App de logística de carga (Valencia, Venezuela)

## Objetivo
App para camioneros que planifican viajes (ej. Valencia → Caracas), describen su vehículo, cargan paquetes, ven la carga optimizada en 3D y publican su disponibilidad para el viaje de regreso.

## Contexto Venezuela (investigación aplicada)
- Corredor principal: Autopista Regional del Centro (ARC) Valencia–Maracay–Caracas (~170 km, 2.5–4 h), alcabalas frecuentes, tráfico en La Encrucijada y Tazón.
- Otras rutas desde Valencia: Puerto Cabello (puerto principal), Barquisimeto, Maracaibo, San Cristóbal, Puerto La Cruz, Barcelona.
- Vehículos típicos: camioneta pickup, furgón 350/NPR, camión 750, Toronto/gandola (rígido y semirremolque).
- Problema clave: viajes de retorno vacíos → bolsa de cargas de retorno.
- Costos en USD, documentos (guía SADA/guía de movilización), coordinación por WhatsApp.

## Pantallas
1. **Inicio** – propuesta de valor, acceso.
2. **Login / registro** del camionero.
3. **Mis vehículos** – formulario (tipo, marca, modelo, placa, medidas internas largo/ancho/alto, carga máx. kg) con presets venezolanos y **visor 3D** del vehículo.
4. **Nuevo viaje** – origen/destino (ciudades venezolanas), fecha, vehículo, lista de paquetes (medidas, peso, cantidad, frágil, apilable, fecha/hora límite de entrega, destinatario).
5. **Optimización** – vista 3D del espacio de carga con cajas colocadas, % volumen y peso usados, paquetes que no caben, orden de carga (último en entregar, primero en cargar), frágiles arriba, pesados abajo. Ruta estimada (distancia, tiempo, peajes/alcabalas aproximadas).
6. **Compartir retorno** – botón que publica "Disponible Caracas → Valencia, fecha X, espacio libre Y m³/kg" + enlace público y compartir por WhatsApp.
7. **Bolsa de cargas de retorno** – listado público de camioneros disponibles por ruta/fecha, con contacto.
8. **Historial** – reutilizar/duplicar viajes, vehículos y plantillas de paquetes para rutas recurrentes.

## Diseño
Estilo industrial-logístico: tonos asfalto oscuro con amarillo señalización, tipografía robusta (Space Grotesk / IBM Plex), en español.

## Detalles técnicos
- Lovable Cloud: auth, tablas `vehicles`, `trips`, `packages`, `return_offers` (públicas lectura), con RLS por usuario y GRANTs.
- 3D con three.js + @react-three/fiber/drei (carga solo en cliente). Modelo del vehículo generado con primitivas (cabina + caja) escalado a las medidas.
- Algoritmo de empaque 3D heurístico (bin packing por capas/extreme points) con restricciones: rotación, frágil no apilable debajo, peso máximo, orden por plazo de entrega. Tests unitarios del algoritmo.
- Rutas: matriz precargada de distancias/tiempos entre ciudades principales de Venezuela (sin API de mapas externa en la primera versión).
- Rutas de la app con TanStack, área privada bajo `_authenticated`.
