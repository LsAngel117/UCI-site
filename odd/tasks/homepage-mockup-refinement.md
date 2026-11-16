# Homepage visual refinement against the approved mockup

**Objetivo:** llevar el sitio público (homepage + chrome global) al nivel del mockup aprobado, corrigiendo de paso el bug sistémico de estilos con scope, y dejar la navegación/CMS sin enlaces rotos.
**Rama:** trabajo directo sobre la rama actual.
**Entrega:** commits por unidad de trabajo (unidad = comportamiento + tests/docs).
**Runner:** `pnpm typecheck`, `pnpm test`, `pnpm build`; verificación visual con Playwright contra `pnpm dev:all`.

## Specs

- **S1 — Header (mockup).** Logo UCI completo a ~52 px de alto a la izquierda; navegación principal centrada (Inicio, Nosotros, Sermones, Eventos, Ministerios, Contacto); acciones a la derecha en este orden: “Soy nuevo” con borde/outline y “Ver en vivo” en dorado. Sobre el hero es transparente; al hacer scroll, superficie navy casi opaca. En móvil: logo a la izquierda, botón de menú a la derecha, menú desplegable oscuro.
- **S2 — Hero (mockup + docs/04 §6).** Imagen de adoración a sangre, overlay cinematográfico. Etiqueta “BIENVENIDO A UCI”. H1 “UNA IGLESIA” (blanco) + “QUE INTERCEDE.” (dorado). Texto de apoyo “Una comunidad que busca a Dios, vive Su Palabra y permanece en oración.”. CTA primaria dorada “CONÓCENOS” y secundaria outline “VER ÚLTIMO SERMÓN” con icono de play. Franja de servicio al pie del hero, a ancho completo: día y hora, dirección + ciudad, y acción “CÓMO LLEGAR” en outline. Sin datos configurados debe mostrar estados honestos (“Por confirmar”), nunca datos inventados.
- **S3 — Somos UCI (mockup + docs/04 §7).** Superficie navy/negra. Columna izquierda: etiqueta “SOMOS UCI”, título “Unidad Cristiana de Intercesión”, texto “Somos una comunidad que cree en el poder de la oración, en la autoridad de la Palabra de Dios y en el llamado de cada persona a vivir una relación genuina con Cristo.” y CTA outline “CONÓCENOS MÁS”. Columna derecha: visual del globo + Biblia + latido integrado al fondo, sin banda fotográfica adicional.
- **S4 — En UCI + Próximo servicio (mockup + docs/04 §8–9).** Superficie clara. Columna izquierda: etiqueta “EN UCI”, título “Te invitamos a...”, tres bloques fotográficos editoriales (ADORAMOS, APRENDEMOS, INTERCEDEMOS) con imagen, nombre, descripción y acción “+”. Columna derecha: panel oscuro sobre fotografía con etiqueta “NOS VEMOS ESTE DOMINGO”, título “Servicio de adoración”, día y hora, dirección, y CTA outline “PLANEA TU VISITA”. En móvil el panel pasa debajo de los bloques.
- **S5 — Primera vez (mockup + docs/04 §10).** Superficie oscura. Etiqueta “SOY NUEVO”, título “¿Es tu primera vez en UCI?”, apoyo “Queremos que te sientas como en casa.”. Tres bloques con icono: “¿Dónde estamos?”, “¿Cuándo nos reunimos?”, “¿Qué puedes esperar?”. CTA dorada “QUIERO CONOCER UCI”. Fotografía comunitaria (`conocenos-v1.png`) integrada al lado derecho con máscara hacia el fondo.
- **S6 — Último sermón (mockup + docs/04 §11).** Superficie oscura. Izquierda: etiqueta “ÚLTIMO SERMÓN”, título editorial, referencia bíblica con anillo dibujado, predicador/fecha y CTAs “VER SERMÓN” (dorado) + “VER NOTAS” (outline, sólo si hay notas). Derecha: imagen del predicador en proporción editorial (no un placeholder gigante). Estados vacíos honestos.
- **S7 — Explora mensajes (mockup + docs/04 §12).** Superficie clara. Etiqueta “SERMONES”, título “Explora nuestros mensajes”, filtros Todos/Predicadores/Series/Temas y acción “Ver todos los sermones →” alineada arriba a la derecha. Cuatro tarjetas en desktop con imagen 16:9, indicador de play, título, referencia y fecha.
- **S8 — Próximos eventos (mockup + docs/04 §13).** Superficie clara. Encabezado con etiqueta “LO QUE ESTÁ PASANDO EN UCI”, título “Próximos eventos” y “Ver calendario →” arriba a la derecha. Filas con bloque de fecha (día/mes), categoría, título, hora y ciudad, con flecha. Estado vacío honesto.
- **S9 — Ministerios (mockup + docs/04 §14).** Tarjeta oscura junto a los eventos: etiqueta “MINISTERIOS”, título “Encuentra tu lugar”, apoyo “Conoce nuestros ministerios y sé parte.” y CTA “VER MINISTERIOS”.
- **S10 — Historias (mockup + docs/04 §15).** Tarjeta oscura junto a generosidad: etiqueta “HISTORIAS”, título “Dios sigue haciendo historia”, retrato + cita + nombre. Sin historias aprobadas, estado honesto.
- **S11 — Generosidad (mockup + docs/04 §16).** Tarjeta azul junto a historias: icono de corazón, título “UNA IGLESIA GENEROSA”, mensaje y CTA “QUIERO DAR”. Sin URL oficial, estado informativo honesto.
- **S12 — CTA final (mockup + docs/04 §17).** Cierre oscuro cinematográfico centrado: “Hay un lugar para ti.”, apoyo breve y CTA dorada “PLANEA TU VISITA”, con resplandor azul.
- **S13 — Footer (mockup + docs/04 §18).** Composición compacta: logo y navegación principal en una fila, redes a la derecha; segunda fila con dirección/horarios/contacto y copyright. Sin columnas pesadas.
- **S14 — Responsive (docs/13).** Desktop, tablet y móvil según el mockup; sin overflow horizontal, un solo `h1`, foco visible y `prefers-reduced-motion` respetado.
- **S15 — Bug sistémico de estilos.** Los estilos del componente padre no aplican a la raíz de `Container`/`Section` (Astro scope). Toda clase pasada a esos componentes debe estilizarse con un wrapper nativo interno o `:global()` acotado; ninguna sección puede quedar apilada por este motivo.
- **S16 — CMS/navegación.** Sembrar de forma idempotente la navegación HEADER y FOOTER con los seis enlaces principales. Sembrar la página publicada `nosotros` para que el enlace no dé 404. Añadir la ruta `/en-vivo` para la acción “Ver en vivo”. `/nosotros` debe aparecer en el sitemap.
- **S17 — Copy estructural.** Actualizar el copy controlado por producto a lo aprobado en el mockup (título de Somos UCI, cuerpo, “Servicio de adoración”, etc.), sin inventar datos dinámicos.

## Tasks

| ID | Specs | Ruta | Estado |
| --- | --- | --- | --- |
| T1 | S15 | inline | completada |
| T2 | S1, S14 | inline | completada |
| T3 | S2, S14 | inline | completada |
| T4 | S3, S17 | inline | completada |
| T5 | S4, S17 | inline | completada |
| T6 | S5, S14 | inline | completada |
| T7 | S6, S14 | inline | completada |
| T8 | S7, S14 | inline | completada |
| T9 | S8–S12, S14 | inline | completada |
| T10 | S13, S14 | inline | completada |
| T11 | S16 | inline | completada |
| T12 | todas | inline | completada |

## Log

### L1 — Pedido original

> Este es el mockup del sitio web publico, ya tenemos unas specs visuales implementadas y se acercó bastante al mockup, con la img quiero que el diseño se perfeccione como en el mockup, hay imagenes que faltan agregar a web/assets/ pero pueden quedar pendientes.
> Add los enlaces de las páginas faltantes al cms, de ser necesario.

### L2 — Aclaración

> ten en cuanta también docs/04-home-page-spec.md, pero rediseña conforme al mockup

### L3 — Evidencia inicial

- `/api/v1/navigation?location=header` y `footer` responden `{ "data": [] }` → el header no muestra enlaces.
- El bug de scope de Astro deja sin layout a `.site-header__inner`, `.hero__inner`, `.somos__inner`, `.servicio__inner`, `.sermon__inner`, `.final__inner`, etc. (computed `display: block`).
- URLs inexistentes: `/nosotros` (sin página CMS sembrada) y `/en-vivo` (sin ruta).

### L4 — Implementación (evidencia observada)

- Rediseño verificado contra el mockup con Playwright a 1440, 1024, 768 y 390 px. Sin scroll horizontal (`scrollWidth === clientWidth` en todos los anchos probados).
- Header: logo 52 px, navegación centrada y acciones “Soy nuevo” (outline) / “Ver en vivo” (dorado). Menú móvil abre a pantalla completa, atrapa el foco y cierra con Escape.
- Hero: franja de servicio de ancho completo con día/hora, dirección/ciudad y “CÓMO LLEGAR”. Estados honestos “Por confirmar”.
- Composición: Somos UCI (globo), En UCI + “Nos vemos este domingo”, Primera vez con fotografía comunitaria, Último sermón, Explora mensajes, mosaico eventos+ministerios y historias+generosidad, CTA final y footer compacto.
- Copy actualizado: “Unidad Cristiana de Intercesión”, cuerpo de Somos UCI y “Servicio de adoración”.
- CMS: `pnpm db:seed` crea 6 ítems HEADER + 6 FOOTER (sólo si el menú está vacío) y la página publicada `nosotros`. `/nosotros` responde 200 y aparece en `/sitemap.xml`. `/en-vivo` responde 200.
- `pnpm typecheck`: 0 errores (astro, server, admin, e2e).
- `pnpm test`: 336 tests, 336 pass.
- `pnpm exec astro build`: build SSR completo.

### L5 — Bugs corregidos durante el rediseño

- **Scope de Astro**: los estilos del padre no alcanzan la raíz de `Container`/`Section`; por eso `.site-header__inner`, `.somos__inner`, `.servicio__inner`, `.sermon__inner`, `.final__inner`, etc. calculaban `display: block`. Se reemplazaron por wrappers nativos internos (y `:global()` acotado para la raíz de `Section`).
- **Tokens inexistentes**: `--space-56` (padding del bloque “+” de los pilares) y `--space-20` (gaps en StoryCard y detalle de sermón) no existían en `tokens.css`; las declaraciones eran inválidas y colapsaban a 0. Se reemplazaron por tokens existentes.
- **Menú móvil**: el `backdrop-filter` del header creaba un containing block para el panel `position: fixed`, que quedaba recortado a la altura del header. Se aplica el filtro sólo en estado scrolled y no en estado menú abierto.
- **Somos UCI / Último sermón en móvil**: el orden `-1` ponía la imagen antes del texto; se quitó para respetar el mockup (texto primero).
