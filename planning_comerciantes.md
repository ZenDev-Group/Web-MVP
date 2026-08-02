# Plan de Negocio y Estrategia de Producto — comerciantes.com.ar

> Transcripción y síntesis de `Planning-comerciantes.pdf` (documento fuente del cliente, 39 páginas). Sirve como referencia central del proyecto: acá está el modelo de negocio, la estructura de planes real, la estrategia de escalabilidad multi-ciudad y la especificación de producto/UX que todavía no está implementada en el código.

---

## Parte 1 — Planning estratégico de negocio

### 1. Resumen ejecutivo y propuesta de valor

- **Proyecto:** comerciantes.com.ar — "La Guía Digital de tu Ciudad".
- **Misión:** ser la plataforma digital de referencia que conecta a consumidores locales y turistas con la totalidad de los comercios y servicios de cada ciudad de Argentina.
- **Propuesta de valor (para el comercio):** una vidriera digital profesional, centralizada y de bajo costo, diseñada para generar contacto directo (clicks a WhatsApp, web o mapa).
- **Propuesta de valor (para el usuario):** el "Google" local — un único sitio (ej. `colon.comerciantes.com.ar`) donde encontrar todos los teléfonos, horarios y servicios de la ciudad de forma rápida y fiable.

### 2. Modelo de negocio y estructura de planes

SaaS de **directorio hiperlocal**. El eje del negocio es la suscripción, con valor incremental claro en cada nivel.

| Característica | **Freemium** (el anzuelo) | **Básico** (el comerciante) | **Premium** (el destacado) |
|---|---|---|---|
| Objetivo | Población masiva del directorio | Producto principal para pymes | Alto margen (gastronomía, hotelería) |
| Características | Nombre, dirección, teléfono, 1 rubro | Todo Freemium + ficha completa, galería de 10 fotos, links (WhatsApp/IG/web), 5 rubros, mapa | Todo Básico + galería/video ilimitado, logo en listado, 1 cupón/promoción mensual |
| Posicionamiento | Posición baja, sin links | Posición media, sobre Freemium | Top 3 fijo + aparición en Home |
| Precio mensual | Gratis | $12.000/mes | $25.000/mes |
| Precio anual | Gratis | $120.000/año (pagás 10, tenés 12) | $250.000/año (pagás 10, tenés 12) |

*(Valores estimados ARS Q4 2025 — a reajustar trimestralmente por inflación, ej. índice CAC).*

### 3. Estrategia de monetización y precios

- **Modelos de cobro:** mensual (baja la barrera de entrada) y anual (asegura cashflow inicial, con 12 meses al precio de 10).
- **Pago único:** no es un modelo estándar — se usa solo estratégicamente para financiar la inversión inicial (ver punto 6).

### 4. Estrategia de escalabilidad — modelo subdominio

Arquitectura de **plataforma centralizada multisite**: cada ciudad es un subdominio (`ciudad.comerciantes.com.ar`), no un proyecto aparte.

Proceso de lanzamiento de una ciudad nueva:
1. **Setup técnico:** el admin crea el subdominio nuevo (ej. `rosario.comerciantes.com.ar`) en minutos.
2. **Pre-población (data carga) — crítico:** nunca se lanza una guía vacía. Se cargan 100-200 negocios clave en Plan Freemium, extrayendo datos de Google Maps/Instagram.
3. **Venta hiperlocal:** se activa el equipo de ventas local sobre esa base ya cargada.
4. **Marketing local:** SEO local ("restaurantes en rosario") + pauta segmentada a esa ciudad.

### 5. Estrategia de marketing y ventas (hiperlocal)

**Ventas — táctica "puerta a puerta" / "boots on the ground":** el vendedor visita comercios ya cargados en Freemium y ofrece el upgrade a Básico/Premium para activar WhatsApp, fotos y mejor visibilidad.

**Marketing B2B (al comercio):**
- Alianzas con Cámaras de Comercio locales.
- Pauta segmentada a "administradores de páginas de negocios" de la ciudad objetivo.
- Stickers "Encontranos en comerciantes.com.ar" para las vidrieras físicas.

**Marketing B2C (al usuario final):**
- SEO local como máxima prioridad: posicionar en Google para "ferreterías en [ciudad]", "delivery en [ciudad]".

**Promociones gancho de lanzamiento:**
- **Plan Fundadores:** los primeros 50 comercios de la ciudad obtienen 6 meses gratis del Plan Básico, o acceden a Premium por 1 año al precio del Básico.
- **Upgrade Gratis:** email a todos los comercios en Freemium ofreciendo un trial de 30 días del Plan Básico.

### 6. Estrategia de inversión inicial

| Opción | Descripción |
|---|---|
| **1 — Bootstrapping + preventa (recomendada)** | Lanzar solo `colon.comerciantes.com.ar` (usando la reputación del proyecto anterior de microemprendedores). Ofrecer "Plan Fundador": 30-50 comercios locales pagan **$100.000 ARS por única vez** a cambio de Plan Premium **de por vida**. Meta: recaudar $3M-$5M ARS para financiar el desarrollo. |
| **2 — Capital semilla** | Buscar USD 20.000-30.000 de un inversor ángel, para desarrollo + lanzamiento simultáneo en 3-5 ciudades. |
| **3 — FFF** | Préstamos de círculo cercano (familiares y amigos). |

---

## Parte 2 — Estrategia de producto (UX/UI)

### 1. Filosofía de diseño y principios UX

1. **Mobile-first, mobile-always:** el 90% de las búsquedas locales son móviles. El diseño arranca en 360px de ancho.
2. **La tiranía del pulgar:** todas las acciones primarias (buscar, filtrar, llamar, WhatsApp) van en la zona de confort del pulgar (parte inferior de la pantalla).
3. **Carga cognitiva cero:** la interfaz debe ser tan intuitiva como Google Maps — el usuario no debe pensar.

### 2. Experiencia del consumidor (la guía)

**A. Home de la ciudad (`ciudad.comerciantes.com.ar`)**
- *Above the fold:* barra de búsqueda enorme, centrada, con búsqueda predictiva ("¿Qué estás buscando en [Ciudad]?"), y 8 íconos grandes de categorías más buscadas (gastronomía, servicios, alojamiento, compras...).
- *Below the fold:* carrusel de "Comercios Destacados" (Premium), carrusel de "Promociones y Cupones" (Premium), banner CTA "¿Sos comerciante? Registrate acá".

**B. Página de listado / resultados de búsqueda**
- Toggle Lista/Mapa.
- Filtros "sticky" (sub-rubro, "abierto ahora", "con delivery") fijos al hacer scroll.

**La "card" de comercio en el listado — diferenciación estratégica por plan:**

| Elemento de la card | Freemium | Básico | Premium |
|---|---|---|---|
| Jerarquía | Últimos en la lista | Arriba de Freemium | Primeros 3-5 puestos (fijos) |
| Visual | "Fantasma" (grisado), sin logo | Color, logo claro | Badge "DESTACADO", foto de portada |
| CTA en lista | Ninguno (hay que entrar al perfil) | Ninguno (hay que entrar al perfil) | Botones directos [Llamar] [WhatsApp] |

**C. Página individual del comercio** — la "máquina de conversión":
- **Sticky CTA Bar** (barra fija inferior, zona del pulgar): en Básico y Premium contiene [LLAMAR] [WHATSAPP] [CÓMO LLEGAR]. **En Freemium esta barra no existe** — fricción a propósito para forzar el upgrade.
- Anatomía de la página (mobile-first):
  1. **Visual/gancho:** Básico = 1 foto de portada estática; Premium = carrusel de galería + video (embed YouTube).
  2. **Identidad y confianza:** logo, nombre, slogan, indicador "Abierto Ahora" (verde) / "Cerrado Ahora" (rojo) con hora de cierre/apertura.
  3. **Conversión y contenido:** banner de "Promoción del Mes" (solo Premium), descripción larga, botones de redes sociales.
  4. **Ubicación:** mapa interactivo embebido + dirección en texto.

### 3. Dashboard del cliente (retención y ROI)

El comerciante tiene que *sentir* el valor — el dashboard es la herramienta para justificar el gasto.
- **Acceso:** login de autogestión, solo planes Básico y Premium.
- **Editar perfil:** fotos, descripción, horarios.
- **Gestionar promoción** (solo Premium): un campo para la "Promoción del Mes".
- **Métricas (el justificador de gasto):** visitas al perfil, clicks al botón de WhatsApp, clicks al botón de llamar, veces que apareció en búsquedas.

### 4. Resumen — features por plan

| Feature | Freemium (el cebo) | Básico (el producto) | Premium (el VIP) |
|---|---|---|---|
| Visibilidad en lista | Baja | Media | Alta (Top 3 fijo + Home) |
| Diseño de card | Grisado, sin logo | Con logo | Con logo, foto y badge |
| CTA directo en lista | No | No | Sí |
| Sticky CTA bar (perfil) | No | Sí (Llamar / WhatsApp / Mapa) | Sí (Llamar / WhatsApp / Mapa) |
| Galería de fotos/video | No | Galería 10 fotos | Galería ilimitada + video |
| Publicar cupones | No | No | Sí (1 por mes) |
| Acceso a dashboard | No | Sí (autogestión) | Sí (autogestión) |
| Métricas / ROI | No | Sí (visitas, clicks) | Sí (visitas, clicks) |

---

## Cómo esto se conecta con lo que ya construimos

Este documento es el plan original del cliente — vale la pena marcar dónde coincide con el trabajo ya hecho en este repo y dónde todavía hay una brecha:

1. **Los precios del catálogo `planes` son placeholder, no los reales.** Sembramos `gratuito/$0`, `destacado-mensual/$5.000`, `premium-mensual/$9.000`, etc., marcados explícitamente como "a definir". Este documento trae los precios reales de referencia (Q4 2025): Freemium gratis, **Básico $12.000/mes o $120.000/año**, **Premium $25.000/mes o $250.000/año**. Falta actualizar la semilla de `planes` (o editarlo desde el panel admin, que ya soporta precios editables) para que coincida con esta estructura de 3 niveles y estos montos.

2. **El proyecto es multi-ciudad por diseño, Colón es la ciudad piloto.** Todo lo construido hasta ahora asumió a Colón, Buenos Aires como el único alcance. El modelo real es una plataforma centralizada con un subdominio por ciudad (`colon.comerciantes.com.ar`, después `rosario.comerciantes.com.ar`, etc.), reutilizando el mismo backend/admin. Esto no cambia nada de lo ya implementado, pero sí importa para decisiones futuras de arquitectura (ej. si `localidades` debería en algún momento ser `ciudades` + `localidades`, o si el multitenancy se resuelve por subdominio en el reverse proxy).

3. **Falta un plan de "pago único de por vida" (Plan Fundador) en el modelo de datos.** La tabla `planes` solo contempla `periodicidad = 'mensual' | 'anual'`. El Plan Fundador de la Opción 1 de inversión ($100.000 ARS una vez, Premium de por vida) no encaja en ese esquema — habría que agregar `periodicidad = 'unico'` (sin `fecha_fin`, o con una fecha muy lejana) si se decide usar esta estrategia de preventa para financiar el desarrollo.

4. **La ficha pública y el listado con mapa siguen sin construirse** (quedaron marcados "fuera de esta iteración" en cada ronda de trabajo hasta ahora). Este documento da la especificación detallada que faltaba: diferenciación de card por plan (grisado/con logo/badge + Top 3 fijo), Sticky CTA Bar que **no existe** en Freemium a propósito (fricción para forzar upgrade), indicador "Abierto Ahora/Cerrado Ahora", banner de "Promoción del Mes" solo Premium, y el toggle Lista/Mapa con filtros sticky.

5. **El dashboard de autogestión del comerciante con métricas ya está previsto en el esquema.** El campo `con_estadisticas` que ya agregamos a `planes` (Premium/Básico según se configure) corresponde exactamente a la sección de métricas de este documento (visitas, clicks a WhatsApp, clicks a llamar, apariciones en búsqueda) — falta construir el endpoint que cuente esos eventos y el panel de autogestión (`usuarios_comercio`) que los muestre.

6. **La estrategia de ventas puerta a puerta y el Plan Fundadores** no son trabajo de código, pero condicionan la prioridad técnica: antes de vender puerta a puerta en Colón hace falta la pre-población de 100-200 negocios en Freemium (carga de datos desde Google Maps/Instagram) — un trabajo de datos, no de features nuevas, que se puede hacer con lo que el admin panel ya soporta hoy.
