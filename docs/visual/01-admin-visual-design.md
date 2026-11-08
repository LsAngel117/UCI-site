# 14 --- Admin Panel Visual Design

**Proyecto:** Iglesia UCI --- Unidad Cristiana de Intercesión\
**Documento:** Admin Panel Visual Design\
**Versión:** 1.0\
**Estado:** Propuesta visual para implementación\
**Ámbito:** Interfaz administrativa `/panel`\
**Documentos relacionados:** `03-visual-design-system.md`,
`06-functional-requirements.md`, `09-admin-panel-spec.md`,
`12-media-and-assets.md`, `13-responsive-and-accessibility.md`,
`15-implementation-roadmap.md`

------------------------------------------------------------------------

## 1. Propósito

Este documento define la dirección visual y las reglas de interfaz del
CMS administrativo de UCI.

Su objetivo es traducir la identidad visual aprobada de UCI a una
experiencia editorial profesional, clara y eficiente, sin convertir el
panel en una réplica literal del sitio público ni en un dashboard SaaS
genérico.

El documento especifica:

-   identidad visual aplicada al CMS;
-   paleta y jerarquía cromática;
-   tipografía y escalas;
-   layout administrativo;
-   navegación lateral y header;
-   dashboard;
-   patrones de listados, formularios y editores;
-   biblioteca multimedia;
-   componentes reutilizables;
-   estados de interacción;
-   responsive y accesibilidad;
-   criterios de aceptación visual.

Este documento complementa las especificaciones funcionales. No redefine
modelos de datos, permisos, contratos API, reglas de negocio ni
arquitectura técnica.

------------------------------------------------------------------------

## 2. Autoridad y relación con otros documentos

### 2.1 Jerarquía documental

Las decisiones deben interpretarse así:

1.  `03-visual-design-system.md` es la fuente de verdad para la
    identidad visual compartida: colores, tipografía, ritmo, botones,
    tratamiento de imágenes, iconografía y principios de marca.
2.  `09-admin-panel-spec.md` es la fuente de verdad para la estructura,
    navegación, módulos, workflows y comportamiento funcional del panel.
3.  Este documento concreta cómo se representa visualmente esa
    experiencia administrativa.
4.  `12-media-and-assets.md` define las reglas técnicas y operativas de
    los recursos multimedia. Este documento solo especifica su
    presentación en la interfaz.
5.  `13-responsive-and-accessibility.md` conserva la autoridad sobre
    requisitos transversales detallados de responsive y accesibilidad.

Si aparece una contradicción, no se debe resolver inventando una regla
nueva: debe prevalecer el documento de autoridad correspondiente y
actualizarse este documento si hace falta.

### 2.2 Principio central

**El CMS debe parecer parte de UCI, pero debe comportarse como una
herramienta editorial.**

El sitio público prioriza emoción, identidad, narrativa y experiencia
del visitante. El CMS prioriza claridad, eficiencia, gestión de
contenido y visibilidad operativa.

Se comparte la identidad; no se copia la composición cinematográfica del
sitio público.

------------------------------------------------------------------------

## 3. Dirección visual

### 3.1 Carácter

La interfaz administrativa debe sentirse:

-   institucional;
-   moderna;
-   sobria;
-   editorial;
-   confiable;
-   ordenada;
-   funcional;
-   accesible;
-   consistente con UCI.

Debe transmitir que el usuario está administrando el contenido de una
iglesia real, sin recurrir a adornos religiosos genéricos.

### 3.2 Traducción de la identidad UCI

El lenguaje visual de UCI se construye alrededor de **Globo + Biblia +
Latido/ECG**. En el CMS estos elementos se aplican con moderación:

-   **Globo:** puede aparecer en el logo oficial y en recursos de marca;
    no debe repetirse como textura decorativa en todas las pantallas.
-   **Biblia:** permanece principalmente en el logo y recursos
    institucionales aprobados.
-   **Latido/ECG:** puede usarse en una línea o acento institucional
    puntual, nunca como decoración constante.

No crear versiones alternativas del logo ni alterar sus proporciones,
colores o efectos aprobados.

### 3.3 Balance entre marca y productividad

La marca debe reconocerse en:

-   sidebar;
-   logo;
-   acento de navegación activa;
-   botones de acción principal;
-   detalles gráficos puntuales;
-   tipografía y paleta.

La marca no debe competir con:

-   títulos de contenido;
-   tablas;
-   formularios;
-   estados;
-   controles de publicación;
-   información operativa.

------------------------------------------------------------------------

## 4. Sistema de color

### 4.1 Paleta oficial heredada

Los siguientes valores proceden de `03-visual-design-system.md` y no
deben sustituirse por una paleta independiente del CMS.

  -----------------------------------------------------------------------
  Token                   Valor                   Uso
  ----------------------- ----------------------- -----------------------
  `color.black`           `#05070A`               Fondo oscuro principal

  `color.navy`            `#0B1220`               Superficies oscuras
                                                  secundarias y
                                                  navegación

  `color.blue`            `#1675D1`               Enlaces, interacción y
                                                  selección

  `color.blueLight`       `#5BB8F5`               Realces y detalles
                                                  secundarios

  `color.gold`            `#D9A441`               Acento institucional y
                                                  énfasis principal

  `color.goldLight`       `#F0C96A`               Hover y realces dorados

  `color.white`           `#F5F5F5`               Superficie clara
                                                  principal

  `color.gray`            `#9CA3AF`               Texto secundario

  `color.grayLight`       `#D9DDE2`               Bordes y superficies
                                                  claras secundarias
  -----------------------------------------------------------------------

### 4.2 Aplicación al CMS

La distribución visual recomendada es:

-   **Navegación:** `color.black` o `color.navy`.
-   **Contenido principal:** `color.white` (`#F5F5F5`) como fondo de
    trabajo.
-   **Paneles y superficies de lectura:** blanco cuando se requiera
    separación clara.
-   **Texto principal:** tono oscuro de alto contraste, coherente con la
    paleta del proyecto.
-   **Texto secundario:** gris con contraste suficiente.
-   **Enlaces y controles interactivos:** azul UCI.
-   **Acento de marca:** dorado, aplicado selectivamente.

La interfaz administrativa puede ser más neutra y densa que el sitio
público, según `09-admin-panel-spec.md` §91.

### 4.3 Jerarquía del dorado

El dorado comunica importancia, no decoración.

Usos preferidos:

-   indicador lateral de navegación activa;
-   línea corta bajo una marca o encabezado institucional;
-   acento de un CTA realmente prioritario;
-   pequeños detalles de identidad;
-   énfasis puntual en un título.

No usar dorado para todos los botones, todos los títulos, todos los
iconos ni grandes superficies sólidas.

### 4.4 Jerarquía del azul

El azul es el color de interacción:

-   enlaces;
-   botones secundarios o acciones comunes;
-   foco y selección;
-   elementos navegables;
-   iconos funcionales seleccionados.

No llenar todas las tarjetas de azul ni usarlo como fondo dominante del
área de trabajo.

### 4.5 Estados semánticos

Los estados funcionales pueden usar colores semánticos discretos (éxito,
advertencia, error e información), siempre acompañados por texto y,
cuando aporte claridad, iconografía.

Los colores semánticos no reemplazan la paleta de marca. Deben
mantenerse como señales de estado y no como decoración.

Estados editoriales iniciales:

-   Borrador
-   Publicado
-   Archivado

Estados previstos cuando el workflow los habilite:

-   En revisión
-   Programado
-   Rechazado

El significado nunca debe depender únicamente del color.

### 4.6 Gradientes

Los gradientes se reservan para elementos institucionales puntuales y
deben respetar las direcciones aprobadas en el sistema visual:

-   negro → navy;
-   navy → transparente;
-   azul → transparente;
-   dorado → transparente.

No usar gradientes aleatorios, neón ni fondos degradados en cada
tarjeta.

------------------------------------------------------------------------

## 5. Tipografía

### 5.1 Familia principal

Usar **Inter** o la familia sans-serif equivalente que finalmente esté
aprobada para el proyecto.

La tipografía UI debe priorizar:

-   legibilidad;
-   neutralidad;
-   lectura prolongada;
-   buena representación de números;
-   jerarquía consistente.

### 5.2 Serif editorial

La serif refinada aprobada para el lenguaje editorial puede aparecer de
forma excepcional en:

-   marca UCI, si el archivo oficial la contiene;
-   un encabezado institucional breve;
-   una cita o referencia bíblica destacada cuando corresponda.

No usar serif en tablas, controles, navegación, formularios o metadatos.

### 5.3 Escala administrativa

La escala pública de display del documento 03 no debe trasladarse
literalmente al CMS. El panel requiere una jerarquía compacta y legible.

  Elemento                    Rango recomendado
  ------------------------- -------------------
  Título de pantalla                  28--32 px
  Título de sección                   18--22 px
  Título de tarjeta/panel             16--18 px
  Texto principal                     14--16 px
  Texto secundario                    13--14 px
  Navegación                          13--15 px
  Etiqueta / metadato                 12--13 px
  Texto de tabla                      13--14 px

Estos rangos son una adaptación visual para la interfaz administrativa,
no una modificación de la escala editorial pública.

### 5.4 Jerarquía

Cada pantalla debe tener:

1.  un título principal identificable;
2.  una descripción breve cuando ayude a orientar;
3.  encabezados de sección;
4.  etiquetas de campo;
5.  metadatos secundarios.

Evitar títulos enormes, mayúsculas sostenidas en bloques largos y exceso
de pesos tipográficos.

------------------------------------------------------------------------

## 6. Espaciado, contenedores y densidad

### 6.1 Escala

Usar el ritmo base del documento 03:

`4, 8, 12, 16, 24, 32, 40, 48, 64, 80, 96, 120, 144 px`.

En el CMS se priorizan los intervalos compactos:

-   4--8 px: separación interna pequeña;
-   12--16 px: campos, controles y elementos relacionados;
-   24 px: separación entre bloques;
-   32 px: separación entre secciones;
-   40--48 px: separación de áreas principales cuando la pantalla lo
    requiera.

### 6.2 Contenedor de trabajo

A diferencia del sitio público, el CMS debe aprovechar el ancho
disponible para tablas y editores.

-   El área principal ocupa el espacio restante después del sidebar.
-   Los listados pueden usar el ancho completo del área principal.
-   Los editores pueden usar una columna principal y un panel contextual
    lateral.
-   Los formularios de configuración pueden limitar su ancho para
    facilitar lectura.
-   No imponer el máximo de 1200--1320 px del sitio público a todas las
    pantallas administrativas.

### 6.3 Densidad

La densidad debe ser funcional, no comprimida.

-   Evitar espacios vacíos excesivos que obliguen a desplazarse.
-   Evitar también formularios y tablas saturados.
-   Mantener alineaciones consistentes.
-   Usar separadores suaves y agrupaciones claras.
-   Reservar espacio para acciones importantes y mensajes de validación.

------------------------------------------------------------------------

## 7. Layout global del panel

### 7.1 Estructura

El shell autenticado debe mantener una estructura persistente:

``` text
┌────────────────────────────────────────────────────────────────────┐
│ Header: marca compacta | búsqueda (si existe) | sitio | usuario   │
├───────────────────┬────────────────────────────────────────────────┤
│                   │ Breadcrumbs                                    │
│ Sidebar           │ Título de pantalla                 Acciones     │
│                   │                                                │
│ Dashboard         │ Contenido principal                             │
│ Contenido         │                                                │
│ Multimedia        │                                                │
│ Sitio             │                                                │
│ Administración   │                                                │
│                   │                                                │
└───────────────────┴────────────────────────────────────────────────┘
```

### 7.2 Sidebar

Dirección visual:

-   fondo `color.black` o `color.navy`;
-   logo oficial UCI en versión adecuada al espacio;
-   texto claro y legible;
-   grupos de navegación con jerarquía;
-   indicador dorado discreto para la ruta activa;
-   estados hover y focus perceptibles;
-   iconografía uniforme;
-   posibilidad de colapsar en escritorio cuando sea conveniente.

El sidebar no debe contener fondos fotográficos, partículas, grandes
ilustraciones ni efectos que dificulten leer el menú.

### 7.3 Marca en sidebar

-   Usar el logo oficial sin deformarlo.
-   Priorizar una variante compacta cuando el ancho sea reducido.
-   Mantener proporciones y espacio de seguridad.
-   Si no existe una variante oficial adecuada, utilizar el recurso
    aprobado disponible; no redibujar el logo con texto genérico.

### 7.4 Agrupación de navegación

La navegación funcional se basa en `09-admin-panel-spec.md` y en su
modelo final:

``` text
Dashboard

Contenido
├── Sermones
├── Eventos
├── Ministerios
└── Páginas

Multimedia
└── Biblioteca multimedia

Sitio
├── Navegación
├── SEO
└── Configuración

Administración
├── Usuarios
├── Roles y permisos
├── Auditoría
└── Contacto
```

La visibilidad de cada grupo e ítem depende de los permisos recibidos
desde la sesión. No mostrar enlaces a módulos inaccesibles.

Nota: el documento 09 contiene una tabla inicial de permisos que no
enumera Contacto en el mismo bloque, pero su modelo final sí lo incluye.
El permiso y la ruta de Contacto deben respetar la definición funcional
y de seguridad correspondiente; no se debe inventar un permiso desde
este documento visual.

### 7.5 Header administrativo

El header debe incluir, cuando corresponda:

-   marca compacta "UCI" y contexto "Panel" o "CMS";
-   control de colapso del sidebar;
-   búsqueda global solo cuando esté implementada;
-   acceso "Ver sitio";
-   notificaciones o indicadores de estado si existen;
-   identidad del usuario;
-   menú de usuario;
-   cerrar sesión.

El header debe ser claro, de altura contenida y visualmente subordinado
al contenido.

No mostrar indicadores ficticios, notificaciones de ejemplo ni búsqueda
que no tenga funcionalidad.

### 7.6 Breadcrumbs

Mostrar breadcrumbs en pantallas con jerarquía o profundidad:

`Contenido / Sermones / Editar sermón`

-   El primer nivel debe permitir volver a la sección.
-   El último elemento representa la pantalla actual.
-   No reemplazan el título de página.
-   En móvil pueden compactarse sin perder orientación.

### 7.7 Área de contenido

El fondo principal será claro. La jerarquía debe venir de la
composición, tipografía, separadores y superficies, no de una tarjeta
blanca para cada elemento.

Cada pantalla debe comenzar con un `PageHeader` consistente:

-   breadcrumb opcional;
-   título;
-   descripción opcional;
-   acción primaria;
-   acciones secundarias si existen.

------------------------------------------------------------------------

## 8. Dashboard `/panel`

### 8.1 Objetivo

El dashboard es una vista operativa editorial. No es una página de
marketing ni un panel de analítica empresarial.

Debe responder rápidamente:

-   ¿Qué contenido está publicado?
-   ¿Qué contenido está en borrador?
-   ¿Qué eventos vienen?
-   ¿Qué publicaciones están programadas?
-   ¿Qué actividad reciente ocurrió?
-   ¿Qué acción editorial puedo iniciar?

### 8.2 Composición recomendada

``` text
┌───────────────────────────────────────────────────────────────┐
│ Bienvenido, [usuario]                                         │
│ Administra el contenido de UCI desde un solo lugar.           │
├───────────────────────────────────────────────────────────────┤
│ Sermones publicados │ Borradores │ Próximos eventos │ Páginas │
├───────────────────────────────────────┬───────────────────────┤
│ Actividad reciente                    │ Acciones rápidas      │
│                                       │                       │
├───────────────────────────────────────┼───────────────────────┤
│ Contenido programado                  │ Resumen multimedia    │
│                                       │                       │
└───────────────────────────────────────┴───────────────────────┘
```

La distribución exacta puede adaptarse al ancho de pantalla y a los
datos disponibles.

### 8.3 Resumen editorial

Indicadores permitidos por la especificación funcional:

-   Sermones publicados.
-   Borradores.
-   Eventos próximos.
-   Páginas publicadas.

Reglas:

-   Mostrar cifras reales obtenidas del sistema.
-   No inventar porcentajes de crecimiento.
-   No mostrar tendencias si no existe una fuente de datos válida.
-   Cada indicador debe enlazar al listado correspondiente si el usuario
    tiene permiso.
-   No convertir cada cifra en una tarjeta excesivamente decorada.

### 8.4 Actividad reciente

Presentar una lista cronológica compacta con:

-   acción realizada;
-   recurso afectado;
-   usuario responsable;
-   tiempo o fecha;
-   enlace al recurso si el usuario tiene permiso.

Ejemplos de texto:

-   "Juan creó un sermón".
-   "María actualizó una página".
-   "Carlos publicó un evento".

La actividad debe provenir de datos reales de auditoría o actividad. No
usar datos ficticios en producción.

### 8.5 Contenido programado

Mostrar próximas publicaciones con:

-   título;
-   tipo de contenido;
-   fecha y hora;
-   estado;
-   acción contextual permitida.

Debe distinguirse claramente "Programado" de "Publicado". No presentar
una publicación programada como si ya fuera pública.

### 8.6 Acciones rápidas

Acciones definidas en `09-admin-panel-spec.md`:

-   Nuevo sermón.
-   Nuevo evento.
-   Nueva página.
-   Subir imagen.

Se presentan como botones o accesos compactos, con iconos funcionales y
etiquetas explícitas. Solo se muestran si el usuario tiene los permisos
correspondientes.

### 8.7 Resumen multimedia

Puede incluir:

-   imágenes recientes;
-   espacio utilizado;
-   enlace a la biblioteca multimedia.

El uso de almacenamiento debe ser informativo. No mostrar rutas
internas, proveedores, infraestructura, credenciales ni detalles
técnicos innecesarios.

### 8.8 Elementos excluidos del dashboard inicial

No incluir como contenido predeterminado sin requisito y fuente de
datos:

-   gráfico de visitas del sitio;
-   porcentaje de crecimiento;
-   métricas de usuarios visitantes;
-   uptime o estado interno de servicios;
-   estado de PostgreSQL;
-   panel de respaldos con acción "respaldar ahora";
-   alertas técnicas de infraestructura.

Estos elementos no forman parte del dashboard definido en
`09-admin-panel-spec.md` §13. Podrían considerarse en otra
especificación si aparece una necesidad real y se define su fuente,
permisos y comportamiento.

### 8.9 Personalización

No implementar inicialmente un constructor de widgets ni personalización
compleja. Mantener una composición predeterminada útil.

------------------------------------------------------------------------

## 9. Patrones de páginas de listado

Aplican a:

-   Sermones.
-   Eventos.
-   Ministerios.
-   Páginas.
-   Usuarios.
-   Auditoría y otros módulos cuando corresponda.

### 9.1 Encabezado

Cada listado debe incluir:

-   breadcrumb cuando aplique;
-   título;
-   descripción opcional;
-   acción principal alineada a la derecha o debajo en móvil.

Ejemplo:

``` text
Contenido / Sermones

Sermones
Administra los mensajes publicados y sus borradores.

[Buscar sermón...] [Filtros]                 [Nuevo sermón]
```

### 9.2 Barra de búsqueda y filtros

-   Búsqueda visible y con placeholder contextual.
-   Filtros específicos del módulo.
-   Filtros activos representados de forma identificable.
-   Posibilidad de quitar un filtro individual.
-   Acción para limpiar filtros.
-   Búsqueda con debounce según la especificación funcional.
-   Conservar filtros al entrar y volver al detalle cuando sea viable.

### 9.3 Tabla

Estilo:

-   superficie clara;
-   encabezados legibles;
-   divisores discretos;
-   filas con altura cómoda;
-   hover sutil;
-   estados en badges textuales;
-   acciones por fila agrupadas;
-   selección múltiple cuando aplique.

No usar bordes fuertes en todas las celdas ni convertir cada fila en una
tarjeta independiente en escritorio.

Columnas orientativas para contenido:

  Campo           Presentación
  --------------- ----------------------------------------------
  Título          Texto principal y posible slug como metadato
  Estado          Badge con texto e icono opcional
  Fecha           Fecha relevante para el módulo
  Autor           Usuario responsable cuando aplique
  Actualización   Fecha de modificación cuando aplique
  Acciones        Menú contextual o acciones directas

Las columnas definitivas dependen de la entidad y del contrato de datos.

### 9.4 Paginación

Mostrar:

-   rango de registros;
-   total;
-   página actual;
-   anterior y siguiente;
-   selector de tamaño si está soportado.

Ejemplo:

`Mostrando 1–20 de 83`

La interfaz debe respetar el contrato de paginación de `08-api-spec.md`.

### 9.5 Acciones por fila

Las acciones deben ser contextuales y permission-aware. No mostrar
acciones que el usuario no puede ejecutar.

Priorizar acciones frecuentes y mantener las menos comunes en un menú.

### 9.6 Selección masiva

Cuando esté habilitada:

-   checkbox por fila;
-   checkbox de selección general;
-   barra contextual al seleccionar;
-   número de elementos seleccionados;
-   acciones masivas permitidas;
-   confirmación explícita para operaciones destructivas o de alto
    impacto.

------------------------------------------------------------------------

## 10. Estados editoriales y feedback

### 10.1 Badges

Los badges deben ser compactos, legibles y consistentes.

Ejemplos:

-   Borrador
-   Publicado
-   Archivado
-   Programado
-   En revisión
-   Rechazado

No depender exclusivamente del color. El texto siempre debe comunicar el
estado.

### 10.2 Toasts

Usar notificaciones no bloqueantes para operaciones rutinarias:

-   "Sermón guardado correctamente".
-   "Página publicada".
-   "Imagen subida correctamente".

Los errores deben ser accionables y, cuando sea posible, enlazar al
campo o sección que requiere atención.

Los toasts no sustituyen mensajes persistentes de validación.

### 10.3 Confirmaciones

Las acciones destructivas deben abrir un diálogo accesible que explique:

-   qué ocurrirá;
-   si puede revertirse;
-   qué dependencias existen;
-   cuál será el efecto para el sitio público.

Ejemplo:

``` text
Archivar sermón

El sermón dejará de estar disponible como contenido publicado,
pero se conservará en el panel.

[Cancelar] [Archivar sermón]
```

Para eliminación permanente, explicar que la acción no puede deshacerse
y comprobar dependencias cuando aplique.

### 10.4 Estados de carga

-   Usar skeletons discretos que respeten la estructura final.
-   Preferir carga localizada.
-   Evitar spinners gigantes o pantallas completas de bloqueo sin
    necesidad.
-   Mantener visibles los controles que no dependan de la carga.

### 10.5 Estados vacíos

Los estados vacíos deben explicar qué ocurre y ofrecer una acción
contextual cuando corresponda.

Ejemplo:

``` text
Todavía no hay sermones.

Crea el primer sermón para comenzar a construir el archivo de mensajes.

[Nuevo sermón]
```

No usar ilustraciones genéricas grandes ni mensajes vagos como "No
data".

### 10.6 Errores

Los errores deben ser claros, concisos y accionables.

No mostrar en producción:

-   stack traces;
-   SQL;
-   errores ORM;
-   rutas internas;
-   detalles de implementación.

Si la sesión expira, mostrar un mensaje comprensible y preservar el
estado de edición cuando técnicamente sea posible.

------------------------------------------------------------------------

## 11. Formularios y editores

### 11.1 Principios

Los formularios deben priorizar lectura y comprensión.

Cada campo debe contar con:

-   etiqueta visible;
-   indicador de obligatoriedad cuando aplique;
-   ayuda contextual opcional;
-   estado de validación;
-   mensaje de error asociado.

No depender de placeholders como sustituto de etiquetas.

### 11.2 Agrupación

Agrupar campos relacionados en secciones identificables. Evitar
formularios largos sin jerarquía.

Usar divisores o paneles solo cuando ayuden a separar tareas. No
envolver cada campo en una tarjeta.

### 11.3 Editor de sermones

El editor de sermones es una experiencia prioritaria.

Debe organizar visualmente:

-   Información básica.
-   Contenido.
-   Predicador.
-   Fecha.
-   Escritura.
-   Multimedia.
-   SEO.
-   Publicación.
-   Revisiones.

### 11.4 Layout de editor largo

En escritorio:

``` text
┌────────────────────────────────────────────────────────────────┐
│ Editar sermón                                                   │
│ [Guardar borrador] [Vista previa] [Publicar / Programar]       │
├──────────────────────────────────────────────┬─────────────────┤
│                                              │ Publicación     │
│ Información básica                           │                 │
│                                              │ Estado          │
│ Contenido / editor enriquecido                │ Fecha           │
│                                              │                 │
│ Multimedia                                   │ SEO             │
│                                              │                 │
│ Revisiones                                   │ Recursos        │
└──────────────────────────────────────────────┴─────────────────┘
```

-   Columna principal amplia para escritura y contenido.
-   Columna lateral contextual para publicación, SEO y medios.
-   La columna lateral puede ser sticky si no interfiere con el scroll.
-   Las acciones principales deben permanecer accesibles sin ocupar
    demasiado espacio.
-   En pantallas pequeñas, las columnas se apilan y los controles se
    adaptan.

### 11.5 Editor enriquecido

La barra de herramientas debe ser sobria y reconocible. Las acciones de
formato deben usar iconos consistentes y tooltips accesibles.

Debe representar las capacidades funcionales definidas en
`09-admin-panel-spec.md` §24, sin añadir controles que no estén
soportados por el editor real.

No convertir el editor en un constructor visual libre tipo Webflow.

### 11.6 Guardado y publicación

Distinguir visualmente:

-   Guardando...
-   Guardado
-   Cambios sin guardar
-   Error al guardar
-   Publicado
-   Programado

Guardar borrador nunca debe publicar. Publicar y programar son acciones
explícitas y requieren los permisos y confirmaciones definidos
funcionalmente.

### 11.7 Cambios sin guardar

Cuando existan cambios no guardados, mostrar advertencia antes de
abandonar la pantalla. El diálogo debe ofrecer:

-   Seguir editando.
-   Salir sin guardar.

### 11.8 SEO contextual

Los campos SEO deben estar disponibles dentro de los editores
pertinentes, no únicamente en el módulo general SEO.

El bloque puede incluir:

-   título SEO;
-   descripción;
-   imagen para compartir;
-   URL canónica;
-   vista previa aproximada de búsqueda/social.

La vista previa debe identificarse como estimación visual, no como
garantía de representación en buscadores.

------------------------------------------------------------------------

## 12. Biblioteca multimedia

### 12.1 Objetivo visual

La biblioteca debe sentirse como un administrador de recursos
reutilizables, no como un formulario aislado de carga.

Ruta principal definida funcionalmente:

`/panel/media`

### 12.2 Encabezado y controles

Debe contemplar:

-   título "Biblioteca multimedia";
-   búsqueda;
-   filtro por tipo;
-   filtro por formato;
-   fecha;
-   carpeta u organización si está soportada;
-   ordenamiento;
-   cambio entre cuadrícula y lista cuando sea útil;
-   acción "Subir archivo".

### 12.3 Cuadrícula

-   Miniaturas optimizadas.
-   Proporciones consistentes.
-   Nombre de archivo legible sin saturar.
-   Indicador de tipo cuando no exista vista previa.
-   Selección claramente identificable.
-   Hover y focus discretos.
-   No cargar originales de alta resolución para todas las miniaturas.

### 12.4 Vista de lista

Usar cuando facilite comparar metadatos o gestionar grandes cantidades
de archivos.

Puede mostrar:

-   miniatura;
-   nombre;
-   tipo;
-   tamaño;
-   dimensiones;
-   fecha de carga;
-   acciones.

### 12.5 Subida

El área de carga debe comunicar:

-   zona de arrastre;
-   selección de archivo;
-   formatos y tamaño admitidos según configuración real;
-   progreso;
-   procesamiento;
-   éxito;
-   error;
-   cancelación cuando sea posible.

No inventar límites de tamaño ni formatos. La UI debe consumir o
reflejar la configuración real y la validación del backend.

### 12.6 Detalle de recurso

Al seleccionar un archivo, mostrar un drawer o panel de detalle con:

-   vista previa;
-   nombre;
-   tipo;
-   tamaño;
-   dimensiones;
-   URL;
-   texto alternativo;
-   título;
-   descripción;
-   fecha de carga;
-   usos/referencias.

La URL debe poder copiarse mediante una acción clara. No mostrar rutas
internas del servidor.

### 12.7 Media picker

El selector reutilizable debe permitir:

-   seleccionar un recurso existente;
-   buscar;
-   filtrar;
-   subir uno nuevo;
-   confirmar selección;
-   cancelar.

Debe poder integrarse en sermones, páginas, eventos y ministerios.

### 12.8 Referencias y eliminación

Antes de eliminar un recurso, presentar dónde está siendo utilizado. Si
existen referencias que impiden eliminarlo, explicarlo y orientar al
usuario para reemplazarlas.

Las operaciones masivas destructivas requieren confirmación.

### 12.9 Alcance

La interfaz no debe convertirse en un DAM empresarial completo ni en un
servicio de alojamiento de video. Los videos externos, inicialmente
YouTube, se gestionan mediante referencias según
`09-admin-panel-spec.md`.

Los binarios multimedia no se presentan como registros almacenados en
PostgreSQL. La interfaz trabaja con los recursos y metadatos expuestos
por la API y la abstracción de almacenamiento.

------------------------------------------------------------------------

## 13. Módulos administrativos

### 13.1 Sermones

-   Listado editorial con búsqueda, filtros, estado, fecha y autor
    cuando aplique.
-   Editor de contenido con columna principal amplia.
-   Acceso a multimedia, SEO, publicación y revisiones.
-   Vista previa antes de publicar.
-   Historial de revisiones y comparación/restauración según permisos.

### 13.2 Eventos

-   Listado con estado, fecha, categoría y acciones.
-   Formulario con fecha y hora fáciles de identificar.
-   Vista calendario como alternativa al listado cuando esté
    implementada.
-   Estado y programación claramente diferenciados.
-   Imagen y enlaces relacionados.

### 13.3 Ministerios

-   Listado consistente con el resto del CMS.
-   Editor para nombre, descripción, responsable, horario, contacto,
    redes e imagen.
-   Control de orden cuando la presentación pública lo requiera.

### 13.4 Páginas

-   Listado editorial.
-   Editor de título, slug, resumen, contenido, imagen, SEO y estado.
-   Diferenciación de páginas críticas del sistema cuando la lógica
    funcional lo requiera.

### 13.5 Navegación

-   Representación jerárquica de grupos y elementos.
-   Reordenamiento directo mediante drag-and-drop o alternativa
    equivalente.
-   Indicadores visibles de destino de arrastre.
-   Acciones de guardar y revertir.
-   Confirmación ante eliminación.
-   No exigir al usuario introducir posiciones numéricas.

### 13.6 SEO

-   Interfaz de gestión clara y agrupada.
-   Campos con ayuda contextual.
-   Vista previa aproximada.
-   No duplicar innecesariamente la edición SEO disponible dentro de
    cada contenido.

### 13.7 Configuración

Agrupar ajustes en secciones:

-   General.
-   Contacto.
-   Ubicación.
-   Redes sociales.
-   Horarios.
-   SEO.
-   Integraciones.

No exponer configuración sensible de infraestructura en ajustes
ordinarios del sitio.

### 13.8 Usuarios

Tabla con nombre, correo, rol, estado y última actividad cuando esté
disponible.

Acciones posibles según permisos:

-   Crear usuario.
-   Editar.
-   Desactivar.
-   Restablecer acceso.

Nunca mostrar contraseñas.

### 13.9 Roles y permisos

Presentar roles y permisos de forma legible y comprensible. La edición
debe hacer visibles las consecuencias del cambio y requerir confirmación
para cambios de alto impacto.

No asumir permisos por el nombre del rol: representar los permisos
entregados por el sistema.

### 13.10 Auditoría

Tabla de solo lectura con:

-   usuario;
-   acción;
-   recurso;
-   fecha;
-   filtros por usuario, acción, recurso y fecha.

Debe ayudar a responder qué cambió, quién lo cambió, cuándo y sobre qué
contenido.

### 13.11 Contacto

Incluir la bandeja o módulo de contacto conforme al modelo final del
CMS. Su diseño debe reutilizar patrones de listado, filtros, detalle y
estado; los estados y acciones específicos deben venir de la
especificación funcional correspondiente.

------------------------------------------------------------------------

## 14. Componentes visuales reutilizables

La interfaz debe componerse con un conjunto consistente de componentes
administrativos. Los nombres siguientes son referencias conceptuales y
no obligan a una implementación concreta.

### 14.1 Shell

-   `AdminLayout`
-   `Sidebar`
-   `Header`
-   `Breadcrumbs`
-   `UserMenu`
-   `PageHeader`

### 14.2 Navegación y acciones

-   `NavGroup`
-   `NavItem`
-   `Button`
-   `IconButton`
-   `DropdownMenu`
-   `Tabs`
-   `Tooltip`

### 14.3 Datos

-   `DataTable`
-   `TableToolbar`
-   `SearchInput`
-   `FilterBar`
-   `FilterChip`
-   `Pagination`
-   `StatusBadge`
-   `ActivityList`
-   `ScheduledContentList`

### 14.4 Formularios

-   `FormField`
-   `TextInput`
-   `Textarea`
-   `Select`
-   `DatePicker`
-   `TimePicker`
-   `Checkbox`
-   `RadioGroup`
-   `FieldHint`
-   `FieldError`

### 14.5 Editorial

-   `RichTextEditor`
-   `PublishPanel`
-   `SeoPanel`
-   `MediaPicker`
-   `RevisionHistory`
-   `PreviewButton`
-   `UnsavedChangesDialog`

### 14.6 Feedback

-   `Toast`
-   `ConfirmDialog`
-   `Modal`
-   `Drawer`
-   `Skeleton`
-   `EmptyState`
-   `ErrorState`
-   `InlineNotice`

Los componentes deben ser reutilizables sin crear abstracciones
excesivamente genéricas.

------------------------------------------------------------------------

## 15. Botones y acciones

### 15.1 Primario

Usar para la acción principal de la pantalla:

-   fondo dorado UCI o tratamiento de énfasis aprobado;
-   texto oscuro con contraste suficiente;
-   tamaño compacto;
-   hover sobrio;
-   foco visible.

El dorado no debe usarse para todos los botones primarios de una
pantalla si ello genera ruido. En operaciones administrativas
frecuentes, el azul UCI puede asumir el énfasis interactivo según la
jerarquía establecida en el componente.

### 15.2 Secundario

-   fondo neutro o transparente;
-   borde discreto;
-   texto de alto contraste;
-   hover visible.

### 15.3 Terciario / texto

Para navegación secundaria o acciones de bajo énfasis. Puede incluir
icono o flecha, sin contenedor pesado.

### 15.4 Destructivo

Usar tratamiento semántico de peligro, separado visualmente de acciones
normales y acompañado de confirmación. No usar rojo como decoración
permanente.

### 15.5 Icon buttons

-   tamaño de interacción suficiente;
-   tooltip o nombre accesible;
-   foco visible;
-   no depender únicamente del icono cuando la acción pueda ser ambigua.

------------------------------------------------------------------------

## 16. Iconografía

-   Mantener una sola familia visual de iconos.
-   Preferir iconos lineales, simples y consistentes.
-   Usar iconos para reconocer funciones, no para decorar.
-   Mantener tamaño y grosor coherentes.
-   Acompañar con texto cuando el significado no sea universal.
-   No mezclar emojis, iconos sólidos y lineales de distintas familias
    en una misma navegación.

Los iconos deben corresponder a la acción real. No crear un lenguaje
iconográfico paralelo al sitio.

------------------------------------------------------------------------

## 17. Imágenes y recursos gráficos

### 17.1 Logo

Usar exclusivamente los recursos oficiales aprobados. No regenerar el
logo, no alterar proporciones ni aplicar filtros.

### 17.2 Fotografía

El CMS no necesita imágenes decorativas en cada pantalla. Priorizar
miniaturas de contenido cuando ayuden a identificar sermones, eventos,
ministerios o recursos.

Cuando se necesite fotografía institucional, priorizar:

1.  fotografía auténtica de UCI;
2.  recursos visuales institucionales aprobados;
3.  fotografía de apoyo cuidadosamente seleccionada;
4.  imágenes generadas solo cuando sean apropiadas y aprobadas.

Evitar depender de imágenes genéricas de adoración.

### 17.3 Banner de bienvenida

Se permite un acento institucional discreto en el dashboard, pero no un
hero cinematográfico de gran altura como el sitio público. El contenido
operativo debe permanecer visible en la primera pantalla.

### 17.4 Decoración prohibida o desaconsejada

Evitar:

-   fondos fotográficos detrás de tablas;
-   partículas;
-   estrellas o efectos celestiales;
-   glow intenso;
-   glassmorphism excesivo;
-   sombras grandes;
-   gradientes sin función;
-   cruces, palomas u otros símbolos genéricos usados como adorno;
-   ilustraciones religiosas caricaturescas.

------------------------------------------------------------------------

## 18. Responsive

El panel debe funcionar en desktop, laptop, tablet y móvil. El
escritorio es el entorno principal para edición compleja.

### 18.1 Desktop

-   Sidebar visible.
-   Header horizontal.
-   Tablas completas.
-   Editores en dos columnas.
-   Acciones editoriales accesibles.
-   Aprovechar ancho sin estirar formularios innecesariamente.

### 18.2 Tablet

-   Sidebar colapsable o convertido en navegación temporal.
-   Tablas con columnas priorizadas.
-   Filtros reordenados o agrupados.
-   Editores con columna lateral debajo o en panel contextual.

### 18.3 Mobile

Priorizar:

-   dashboard;
-   revisión de contenido;
-   cambios rápidos;
-   monitoreo de publicaciones;
-   operaciones básicas de multimedia.

Comportamientos:

-   navegación lateral como drawer;
-   header compacto;
-   acciones principales visibles;
-   tablas densas convertidas en tarjetas o desplazamiento horizontal
    cuando sea apropiado;
-   formularios en una columna;
-   editores largos apilados;
-   controles sticky reducidos y sin tapar contenido.

La edición compleja de texto enriquecido puede optimizarse
principalmente para pantallas grandes, pero no debe romperse en móvil.

Los breakpoints exactos deben coordinarse con
`13-responsive-and-accessibility.md` y centralizarse en tokens.

------------------------------------------------------------------------

## 19. Accesibilidad visual e interacción

El panel debe mantener:

-   contraste suficiente;
-   navegación por teclado;
-   foco visible;
-   etiquetas asociadas a controles;
-   mensajes de error asociados a campos;
-   diálogos accesibles;
-   menús y dropdowns accesibles;
-   alternativas accesibles a drag-and-drop;
-   estados no comunicados solo por color;
-   áreas de interacción cómodas;
-   jerarquía de encabezados coherente.

No usar gris claro de bajo contraste para texto funcional. Los estados
hover no deben ser el único indicador de interactividad.

Los requisitos detallados se mantienen en
`13-responsive-and-accessibility.md`.

------------------------------------------------------------------------

## 20. Motion y microinteracciones

El movimiento en el CMS debe ser funcional y discreto.

Permitido:

-   transición breve de hover/focus;
-   apertura/cierre de drawer y modal;
-   feedback de guardado;
-   reordenamiento de elementos;
-   skeletons y cambios de estado suaves.

Evitar:

-   animaciones constantes;
-   parallax;
-   rotación del globo como fondo del panel;
-   partículas;
-   animaciones que retrasen tareas;
-   movimiento ornamental sin propósito.

Respetar preferencias de reducción de movimiento y las reglas de
accesibilidad del proyecto.

------------------------------------------------------------------------

## 21. Datos reales y contenido de demostración

Los mockups y ejemplos pueden usar contenido ilustrativo, pero la
implementación productiva debe mostrar datos reales.

No incluir como si fueran reales:

-   contadores inventados;
-   porcentajes de crecimiento;
-   visitas ficticias;
-   nombres de usuarios de ejemplo;
-   eventos simulados;
-   estados falsos de infraestructura;
-   notificaciones ficticias.

Cuando no existan datos, usar estados vacíos adecuados.

------------------------------------------------------------------------

## 22. Tokens administrativos

La implementación debe centralizar los tokens visuales. No dispersar
valores de color, spacing, radios o sombras en componentes.

Grupos conceptuales:

``` text
color.*
typography.*
spacing.*
radius.*
border.*
shadow.*
breakpoint.*
motion.*
container.*
z-index.*
```

Los tokens administrativos pueden añadir alias semánticos sin modificar
la paleta oficial:

``` text
admin.surface.canvas
admin.surface.panel
admin.surface.sidebar
admin.text.primary
admin.text.secondary
admin.border.default
admin.action.primary
admin.action.secondary
admin.state.success
admin.state.warning
admin.state.danger
admin.state.info
```

Los alias deben referenciar valores centralizados. No inventar tonos de
marca adicionales sin revisión.

### 22.1 Radios

Usar radios discretos y consistentes. Evitar que todas las superficies
parezcan cápsulas o tarjetas excesivamente redondeadas.

### 22.2 Bordes y sombras

-   Bordes finos y de bajo contraste.
-   Separación mediante espacio antes que mediante múltiples
    contenedores.
-   Sombras muy suaves solo cuando ayuden a distinguir capas elevadas.
-   No usar sombras grandes como recurso dominante.

------------------------------------------------------------------------

## 23. Reglas de consistencia

Todas las pantallas deben cumplir:

1.  Usar la paleta UCI aprobada.
2.  Mantener Inter o la sans-serif UI aprobada.
3.  Usar una jerarquía tipográfica coherente.
4.  Mantener el ritmo de espaciado del proyecto.
5.  Compartir patrones de botones y formularios.
6.  Usar una única familia de iconos.
7.  Mantener estados editoriales consistentes.
8.  Respetar la navegación por permisos.
9.  Reutilizar patrones de listados y edición.
10. Mantener la separación visual entre sitio público y CMS.
11. Evitar adornos que no ayuden a identificar, comprender o ejecutar
    una tarea.
12. No inventar módulos ni datos para completar espacios visuales.

------------------------------------------------------------------------

## 24. Criterios de aceptación visual

El diseño visual del panel se considera alineado cuando:

-   [ ] El panel se reconoce como parte de UCI por su logo, paleta y
    detalles institucionales.
-   [ ] No replica literalmente el hero ni el ritmo cinematográfico del
    sitio público.
-   [ ] El sidebar oscuro y el área de trabajo clara crean una
    separación funcional.
-   [ ] El dorado se utiliza como acento y no como color dominante.
-   [ ] La tipografía UI es legible y consistente.
-   [ ] Dashboard y módulos priorizan tareas reales del CMS.
-   [ ] El dashboard no contiene métricas ficticias ni bloques de
    infraestructura no definidos.
-   [ ] La navegación coincide con el modelo funcional y respeta
    permisos.
-   [ ] Los listados comparten patrones visuales y funcionales.
-   [ ] Los estados se distinguen por texto, no solo por color.
-   [ ] Los editores largos priorizan el contenido y mantienen
    publicación, SEO y multimedia accesibles.
-   [ ] La biblioteca multimedia permite reconocer, buscar, seleccionar
    y revisar recursos.
-   [ ] Los diálogos destructivos explican consecuencias.
-   [ ] Loading, empty, error y success states están diseñados.
-   [ ] La interfaz se adapta a escritorio, tablet y móvil.
-   [ ] Los controles son utilizables por teclado y tienen foco visible.
-   [ ] Los componentes usan tokens centralizados.
-   [ ] No se introducen estilos ajenos a la identidad visual aprobada.

------------------------------------------------------------------------

## 25. Referencias visuales de dirección

Las referencias generadas durante la conversación sirven para comunicar
la intención:

-   sidebar oscuro con identidad UCI;
-   área de trabajo clara;
-   acentos dorados limitados;
-   composición editorial ordenada;
-   tarjetas y paneles sobrios;
-   jerarquía funcional.

No son contratos pixel-perfect ni autorizan componentes o métricas que
contradigan `09-admin-panel-spec.md`.

La primera propuesta visual elegida por el usuario es la referencia de
composición preferida, sujeta a las reglas y correcciones de este
documento.

------------------------------------------------------------------------

## 26. Fuera de alcance

Este documento no define:

-   endpoints ni contratos API;
-   estructura de base de datos;
-   permisos definitivos;
-   reglas de publicación;
-   políticas de almacenamiento;
-   límites de carga;
-   proveedores multimedia;
-   métricas analíticas;
-   monitoreo de infraestructura;
-   respaldos;
-   módulos futuros no aprobados;
-   implementación específica de componentes o librerías.

Esos aspectos pertenecen a sus documentos funcionales, técnicos o de
seguridad correspondientes.

------------------------------------------------------------------------

## 27. Resultado esperado

El `/panel` debe ser una herramienta editorial avanzada, clara y
confiable, coherente con la identidad institucional de UCI.

Debe permitir que administradores y editores trabajen con sermones,
páginas, eventos, ministerios, multimedia, SEO, navegación, usuarios,
permisos, configuración, auditoría y contacto sin aprender detalles
técnicos de la plataforma.

**La identidad UCI debe estar presente en cada pantalla, pero la
prioridad visual siempre será que el usuario pueda entender qué está
viendo y completar su trabajo con seguridad y eficiencia.**
