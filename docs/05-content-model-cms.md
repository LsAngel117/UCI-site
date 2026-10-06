# 05 — Content Model & CMS

## 1. Propósito

Este documento define el **modelo editorial y funcional del CMS de Iglesia UCI — Unidad Cristiana de Intercesión**.

El CMS debe permitir que el equipo autorizado de UCI pueda administrar el contenido público del sitio sin depender de un desarrollador para las tareas editoriales habituales: crear sermones, organizar series, publicar eventos, actualizar información institucional, gestionar imágenes, destacar contenido, mantener páginas informativas y controlar la información visible en el sitio.

El CMS debe ser **más completo que el mini-CMS desarrollado para O.R.B.I.T.**, pero sin convertirse en un constructor visual de páginas ni en un sistema administrativo general de la iglesia.

La regla principal es:

> **El CMS administra contenido, relaciones, publicación y medios; el frontend mantiene el control de la composición visual y la experiencia de usuario.**

---

# 2. Principios del modelo editorial

## 2.1. Contenido estructurado

El contenido debe almacenarse de forma estructurada para que pueda reutilizarse en diferentes partes del sitio.

Por ejemplo:

- un sermón puede aparecer en su página individual;
- puede aparecer como “Último sermón”;
- puede pertenecer a una serie;
- puede filtrarse por predicador;
- puede asociarse con uno o varios temas;
- puede mostrar una imagen de portada;
- puede enlazar al video;
- puede tener sus propias notas del sermón.

No se debe duplicar el contenido para cada lugar donde aparece.

---

## 2.2. El CMS no es un Page Builder

El CMS **no debe permitir crear libremente páginas arrastrando bloques visuales**.

La composición de las páginas principales pertenece al producto y al sistema de diseño definido en:

- `01-product-requirements.md`
- `02-information-architecture.md`
- `03-visual-design-system.md`
- `04-home-page-spec.md`

El CMS proporciona los datos que esas páginas necesitan.

---

## 2.3. Contenido reutilizable

Cuando un dato pueda reutilizarse, debe modelarse como una entidad independiente.

Ejemplos:

- un predicador no debe escribirse como texto libre en cada sermón;
- una serie no debe repetirse manualmente en cada sermón;
- una ubicación frecuente puede reutilizarse;
- un tema puede relacionarse con varios sermones.

Esto permite mantener consistencia y facilita filtros, búsquedas y relaciones.

---

## 2.4. Publicación controlada

Todo contenido público debe tener un estado editorial claro.

Estados conceptuales:

- `DRAFT`
- `SCHEDULED`
- `PUBLISHED`
- `UNPUBLISHED`
- `ARCHIVED`

El contenido en borrador o programado no debe aparecer públicamente antes de su momento de publicación.

---

## 2.5. El contenido debe sobrevivir al cambio visual

El contenido no debe depender de una determinada implementación visual.

Cambiar posteriormente:

- el diseño de una tarjeta;
- el layout de la página;
- el estilo de los botones;
- la tipografía;
- la composición de la portada;

no debe requerir migrar el contenido editorial existente.

---

# 3. Arquitectura conceptual del contenido

El CMS se organiza conceptualmente en las siguientes áreas:

```text
UCI CMS
│
├── Configuración
│   ├── Información de UCI
│   ├── Horarios de servicio
│   ├── Ubicaciones
│   ├── Redes sociales
│   ├── Generosidad
│   └── Transmisión en vivo
│
├── Personas
│   ├── Predicadores
│   ├── Líderes
│   └── Autores / participantes públicos
│
├── Sermones
│   ├── Sermones
│   ├── Series
│   └── Temas
│
├── Eventos
│   └── Categorías
│
├── Ministerios
│
├── Historias
│   └── Testimonios
│
├── Noticias / Artículos
│
├── Galería
│   └── Álbumes
│
├── Medios
│   └── Biblioteca multimedia
│
├── Páginas
│   ├── Nosotros
│   ├── Soy nuevo
│   └── Contacto
│
└── Inicio
    └── Configuración editorial de la página principal
```

Esta estructura es conceptual. La interfaz administrativa puede organizar estos elementos de una forma más eficiente para los usuarios.

---

# 4. Entidades principales

## 4.1. Church Profile / Información de UCI

Representa la información institucional principal de la iglesia.

Debe existir como información central reutilizable.

### Información

- nombre público;
- nombre completo;
- descripción corta;
- descripción institucional;
- misión;
- visión;
- lema;
- dirección principal;
- ciudad;
- departamento/estado;
- país;
- teléfono;
- WhatsApp;
- correo electrónico;
- coordenadas geográficas;
- enlace para obtener indicaciones;
- logo principal;
- logo compacto;
- favicon o identidad equivalente;
- imagen institucional;
- información de contacto pública.

### Reglas

- No debe existir duplicación de estos datos en diferentes páginas.
- El footer, contacto, “Soy nuevo” y otras secciones deben consumir esta información.
- Los datos deben poder actualizarse desde un único lugar.

---

# 5. Horarios de servicio

Los horarios de servicio deben modelarse separadamente de los eventos.

Un servicio semanal puede existir aunque no tenga un evento individual creado para cada domingo.

### Campos conceptuales

- nombre;
- día de la semana;
- hora de inicio;
- hora de finalización;
- ubicación;
- descripción;
- activo/inactivo;
- fecha de inicio de vigencia;
- fecha de finalización opcional;
- notas.

### Ejemplo conceptual

```text
Servicio
└── Domingo
    ├── 09:00
    ├── 11:00
    └── Ubicación principal
```

Los valores reales serán configurados por UCI.

### Consideración

Los cambios especiales de horario deben poder representarse mediante un evento o configuración excepcional sin destruir el horario habitual.

---

# 6. Ubicaciones

Se recomienda disponer de una entidad reutilizable de ubicación.

### Campos

- nombre;
- dirección;
- ciudad;
- departamento/estado;
- país;
- código postal si aplica;
- latitud;
- longitud;
- enlace de mapa;
- instrucciones para llegar;
- ubicación principal;
- activa/inactiva.

### Uso

Puede ser utilizada por:

- servicios;
- eventos;
- ministerios;
- páginas;
- información de contacto.

No se debe almacenar una dirección diferente manualmente en cada contenido cuando se trata de la misma ubicación.

---

# 7. Personas

La entidad `Person` representa personas que tienen una presencia pública dentro del sitio.

Puede utilizarse para:

- predicadores;
- líderes;
- autores;
- participantes de historias;
- responsables de ministerios.

### Campos conceptuales

- nombre;
- apellido;
- nombre para mostrar;
- fotografía;
- descripción corta;
- biografía;
- cargo o función pública;
- redes sociales públicas opcionales;
- perfil público habilitado;
- estado activo/inactivo.

### Privacidad

Solo deben almacenarse los datos necesarios para la presencia pública.

No se debe convertir esta entidad en una base de datos de miembros de la iglesia.

Los datos privados de miembros, pastoral, asistencia, información financiera u otra información sensible están fuera del alcance de este CMS.

---

# 8. Sermones

Los sermones son una de las entidades centrales del sitio.

### Campos principales

- título;
- slug;
- descripción/resumen;
- predicador;
- fecha;
- serie;
- temas;
- imagen principal;
- video externo;
- audio externo opcional;
- notas del sermón;
- versículo principal;
- referencias bíblicas;
- duración opcional;
- contenido destacado;
- estado editorial;
- fecha/hora de publicación;
- fecha/hora de actualización;
- SEO.

### Relaciones

```text
Sermón
├── Predicador → Person
├── Serie → Sermon Series
├── Temas → Topic[]
├── Imagen → MediaAsset
├── Video → External Media
├── Audio → External Media
└── Notas → Sermon Notes
```

### Video

El video debe almacenarse preferiblemente mediante una referencia externa.

Ejemplos de proveedor:

- YouTube;
- otro proveedor compatible;
- URL externa de video.

El CMS no debe asumir que los videos serán almacenados físicamente en el VPS.

### Notas del sermón

Las notas deben poder representar el contenido asociado al sermón.

Pueden incluir:

- archivo descargable;
- imagen;
- PDF;
- contenido editorial;
- referencia externa.

La implementación concreta del formato dependerá de la especificación de medios y del frontend.

---

# 9. Series de sermones

Una serie agrupa varios sermones relacionados.

### Campos

- nombre;
- slug;
- descripción;
- imagen de portada;
- fecha de inicio;
- fecha de finalización;
- estado;
- sermones relacionados;
- SEO.

### Reglas

- Un sermón puede pertenecer a una serie.
- Una serie puede contener múltiples sermones.
- El orden de los sermones debe poder controlarse.
- Eliminar una serie no debe eliminar sus sermones.
- Un sermón puede existir sin serie.

---

# 10. Temas

Los temas proporcionan clasificación transversal.

Ejemplos conceptuales:

- oración;
- fe;
- obediencia;
- adoración;
- propósito;
- familia.

Los ejemplos anteriores son ilustrativos y no constituyen una taxonomía definitiva de UCI.

### Campos

- nombre;
- slug;
- descripción opcional;
- estado;
- SEO opcional.

### Reglas

- Un tema puede estar asociado a muchos sermones.
- Un sermón puede tener varios temas.
- Debe evitarse crear duplicados por diferencias de escritura.

---

# 11. Eventos

Los eventos representan actividades específicas de UCI.

### Campos

- título;
- slug;
- resumen;
- descripción;
- imagen principal;
- categoría;
- fecha de inicio;
- fecha de finalización;
- hora;
- ubicación;
- organizador o responsable público opcional;
- información de registro;
- URL externa de registro opcional;
- teléfono/correo de contacto opcional;
- evento destacado;
- estado;
- SEO.

### Relaciones

```text
Evento
├── Categoría → EventCategory
├── Ubicación → Location
├── Imagen → MediaAsset
└── Responsable → Person (opcional)
```

### Eventos pasados

Los eventos no deben desaparecer inmediatamente al finalizar.

Deben pasar a un estado de archivo o histórico para:

- conservar enlaces;
- mantener información histórica;
- permitir galerías relacionadas;
- evitar pérdida de contenido.

El frontend decide cuándo y dónde mostrar eventos pasados.

---

# 12. Categorías de eventos

Permiten organizar los eventos sin depender de texto libre.

### Campos

- nombre;
- slug;
- descripción opcional;
- imagen opcional;
- orden;
- estado.

Las categorías reales serán definidas por UCI.

---

# 13. Ministerios

Los ministerios representan áreas de participación y servicio de UCI.

### Campos

- nombre;
- slug;
- descripción corta;
- descripción completa;
- imagen principal;
- icono opcional;
- líder(es);
- horario;
- ubicación;
- información de contacto;
- enlace externo opcional;
- estado;
- destacado;
- SEO.

### Relaciones

```text
Ministerio
├── Líderes → Person[]
├── Ubicación → Location
└── Imagen → MediaAsset
```

### Regla importante

La lista de ministerios **no debe inventarse desde el CMS ni desde el frontend**.

Los ministerios reales serán configurados por UCI cuando sean confirmados.

---

# 14. Historias y testimonios

Esta entidad representa historias públicas de transformación, experiencias o testimonios.

### Campos

- título;
- nombre para mostrar;
- persona relacionada opcional;
- cita destacada;
- historia completa;
- fotografía;
- fecha;
- consentimiento/validación editorial;
- destacado;
- estado;
- SEO opcional.

### Privacidad

El CMS debe asumir que un testimonio puede contener información personal.

Por lo tanto:

- solo debe publicarse contenido aprobado;
- debe evitarse almacenar información privada innecesaria;
- la información pública debe limitarse a lo necesario para la historia.

---

# 15. Noticias y artículos

El CMS debe permitir publicar contenido editorial adicional.

Puede utilizarse para:

- noticias;
- reflexiones;
- anuncios;
- artículos;
- comunicados;
- contenido pastoral.

### Campos

- título;
- slug;
- resumen;
- contenido;
- imagen principal;
- autor;
- fecha;
- categorías/tags si se habilitan;
- contenido destacado;
- estado;
- fecha de publicación;
- SEO.

### Regla

Los artículos deben utilizar una estructura editorial controlada.

No se debe convertir esta funcionalidad en un constructor de páginas arbitrarias.

---

# 16. Galería y álbumes

La galería debe organizar fotografías relacionadas con:

- eventos;
- actividades;
- servicios;
- ministerios;
- momentos especiales.

## Álbum

### Campos

- título;
- slug;
- descripción;
- fecha;
- ubicación;
- evento relacionado opcional;
- imagen de portada;
- estado;
- SEO opcional.

## Elementos del álbum

Un álbum contiene múltiples `MediaAsset`.

Debe poder controlarse:

- orden;
- imagen principal;
- título/caption;
- texto alternativo.

---

# 17. Biblioteca multimedia

La biblioteca multimedia es un componente central del CMS.

Debe permitir administrar recursos reutilizables sin obligar al frontend a conocer el origen físico del archivo.

## Tipos

- imagen;
- audio;
- video;
- documento.

## Imágenes

Campos conceptuales:

- nombre;
- URL/origen;
- tipo MIME;
- tamaño;
- ancho;
- alto;
- texto alternativo;
- título;
- descripción;
- crédito;
- autor/fuente;
- focal point opcional;
- fecha de carga;
- estado;
- variantes disponibles.

## Documentos

Ejemplos:

- PDF;
- notas del sermón;
- guías;
- documentos públicos.

## Medios externos

Debe ser posible registrar referencias externas.

Ejemplos:

```text
YouTube
Spotify
Google Drive
Proveedor externo de imágenes
```

El CMS debe distinguir entre:

```text
Archivo administrado
vs.
Referencia externa
```

---

# 18. Estrategia de almacenamiento de imágenes

UCI no debe depender de almacenar indefinidamente todas las imágenes de contenido directamente dentro de PostgreSQL.

La base de datos debe almacenar **metadatos y referencias**, no los binarios como regla general.

Conceptualmente:

```text
PostgreSQL
└── MediaAsset
    ├── id
    ├── url
    ├── provider
    ├── metadata
    └── alt text

Proveedor de medios
└── Archivo físico
```

Esto permite utilizar:

- almacenamiento externo;
- CDN;
- servicio de imágenes;
- almacenamiento compatible con objetos;
- otra infraestructura futura.

La implementación concreta del proveedor queda para la especificación técnica.

---

# 19. Optimización de imágenes

El sistema debe considerar diferentes necesidades de imagen.

Una misma fotografía puede utilizarse:

- como hero;
- como portada de sermón;
- como thumbnail;
- como tarjeta;
- como imagen de galería.

El CMS o la capa de medios debe permitir obtener variantes apropiadas sin obligar al frontend a utilizar siempre el archivo original.

### Requisitos

- preservar relación de aspecto cuando corresponda;
- evitar imágenes gigantes innecesarias;
- soportar formatos modernos cuando sea posible;
- conservar texto alternativo;
- evitar pérdida excesiva de calidad;
- permitir imágenes suficientemente grandes para los heroes.

---

# 20. Páginas administrables

Las páginas institucionales principales deben ser administrables, pero mediante **modelos estructurados**.

Páginas iniciales:

- `/nosotros`
- `/soy-nuevo`
- `/contacto`

El CMS puede administrar:

- título;
- subtítulo;
- contenido;
- imágenes;
- llamadas a la acción;
- información relacionada;
- SEO.

### Regla

Cada página debe tener una estructura conocida por el frontend.

No se debe permitir que un administrador cree arbitrariamente:

```text
50 bloques
+
20 columnas
+
15 layouts diferentes
```

La flexibilidad editorial no debe destruir la consistencia visual.

---

# 21. Configuración de la página de inicio

La página de inicio tiene una estructura visual fija definida en `04-home-page-spec.md`.

El CMS debe administrar únicamente el contenido que alimenta esa estructura.

## Contenido administrable

Puede incluir:

- imagen/video del hero;
- texto del hero cuando se habilite para edición;
- CTA configurados;
- sermón destacado;
- eventos destacados;
- ministerios destacados;
- historia/testimonio destacado;
- configuración de generosidad;
- visibilidad de determinadas secciones;
- contenido institucional asociado.

### Contenido estructural

El CMS no debe permitir cambiar arbitrariamente:

- el orden de las secciones;
- la estructura visual;
- la composición de cada sección;
- el sistema de diseño;
- la navegación principal.

---

# 22. Contenido destacado

Varias entidades pueden marcarse como `featured`.

Ejemplos:

- sermón destacado;
- evento destacado;
- ministerio destacado;
- historia destacada;
- artículo destacado.

### Reglas

El sistema debe evitar depender únicamente de fechas para determinar qué aparece destacado.

Debe poder existir una selección editorial explícita.

Cuando existan múltiples elementos destacados, debe existir un orden.

---

# 23. Transmisión en vivo

La configuración de transmisión en vivo debe ser independiente de los sermones archivados.

### Campos conceptuales

- habilitado;
- proveedor;
- URL;
- título;
- descripción;
- imagen;
- horario de inicio;
- horario de finalización;
- mensaje previo;
- mensaje posterior;
- estado.

Esto permitirá que el frontend muestre:

```text
EN VIVO
```

cuando corresponda y un enlace alternativo cuando no exista una transmisión activa.

---

# 24. Generosidad

La información de generosidad debe ser administrable sin almacenar transacciones financieras dentro de este CMS.

### Configuración

- habilitado;
- título;
- descripción;
- métodos disponibles;
- URL externa;
- instrucciones;
- texto legal o informativo;
- estado.

Los pagos, transacciones y datos financieros no forman parte de este modelo.

El CMS únicamente administra la información pública y los enlaces correspondientes.

---

# 25. Redes sociales

Debe existir una configuración central de redes sociales.

### Campos

- plataforma;
- nombre visible;
- URL;
- icono/referencia de plataforma;
- orden;
- activo.

Ejemplos conceptuales:

- Instagram;
- Facebook;
- YouTube;
- TikTok.

No se deben asumir plataformas definitivas hasta que UCI las configure.

---

# 26. SEO editorial

Todo contenido indexable debe poder tener metadatos SEO.

### Campos comunes

- meta title;
- meta description;
- imagen Open Graph;
- slug;
- canonical URL opcional;
- indexable/no indexable;
- datos estructurados cuando corresponda.

### Reglas

- si un campo SEO está vacío, el sistema puede generar un valor razonable desde el contenido;
- una personalización explícita debe tener prioridad;
- los contenidos archivados o privados no deben indexarse;
- los cambios de slug deben considerar continuidad de URLs existentes.

---

# 27. Slugs y URLs

Las entidades públicas con página individual deben tener un slug estable.

Ejemplo:

```text
/sermones/obediencia-y-fe
/eventos/congreso-de-intercesion
/ministerios/adoracion
```

### Reglas

- slug único dentro de su colección;
- formato legible;
- sin caracteres innecesarios;
- generación automática inicial;
- posibilidad de edición controlada;
- evitar cambios innecesarios después de publicar.

Si un slug publicado cambia, el sistema debe conservar información suficiente para implementar una redirección desde la URL anterior.

---

# 28. Modelo editorial común

Las entidades publicables deben compartir conceptualmente un conjunto de metadatos.

```text
PublishableContent
├── id
├── status
├── slug
├── createdAt
├── updatedAt
├── publishedAt
├── publishAt
├── unpublishAt
├── createdBy
├── updatedBy
├── publishedBy
└── SEO
```

No implica necesariamente una tabla única en la implementación física.

Es una definición conceptual de comportamiento común.

---

# 29. Estados editoriales

## DRAFT

Contenido en edición.

Características:

- visible en CMS;
- no visible públicamente;
- puede editarse libremente.

## SCHEDULED

Contenido preparado para publicarse en una fecha futura.

Características:

- visible en CMS;
- no visible públicamente antes de `publishAt`;
- debe publicarse automáticamente cuando corresponda.

## PUBLISHED

Contenido público.

Características:

- disponible mediante su URL;
- elegible para aparecer en listados;
- indexable si SEO lo permite.

## UNPUBLISHED

Contenido retirado de la publicación pero conservado.

Características:

- no público;
- permanece en CMS;
- puede volver a publicarse.

## ARCHIVED

Contenido histórico que ya no forma parte de la operación activa.

Características:

- no debe aparecer en listados normales;
- se conserva para referencia;
- puede restaurarse según permisos.

---

# 30. Programación de publicaciones

El CMS debe permitir:

```text
Publicar ahora
Programar publicación
Retirar publicación
Archivar
Volver a publicar
```

El sistema debe utilizar una zona horaria definida por la configuración de UCI.

No se deben interpretar las fechas del CMS de forma diferente entre administrador, API y frontend.

---

# 31. Previsualización

El CMS debe permitir previsualizar contenido antes de publicarlo.

La previsualización debe mostrar el contenido dentro de una representación cercana al frontend real.

Debe ser posible revisar, como mínimo:

- título;
- imagen;
- contenido;
- metadatos;
- relaciones;
- apariencia general.

La previsualización no debe hacer público el contenido.

---

# 32. Versionado editorial

El CMS debe contemplar historial de cambios para contenido importante.

Como mínimo, el modelo debe permitir distinguir:

```text
Versión publicada
vs.
Cambios actuales en borrador
```

Una edición posterior no debería destruir silenciosamente la versión que actualmente está publicada.

La capacidad de restaurar una versión anterior es deseable para contenido editorial crítico.

La implementación concreta del sistema de revisiones se definirá en la especificación técnica.

---

# 33. Auditoría editorial

Las entidades publicables deben registrar conceptualmente:

- quién creó;
- quién modificó;
- quién publicó;
- cuándo se creó;
- cuándo se modificó;
- cuándo se publicó.

Esto permite conocer la trazabilidad básica del contenido.

Los detalles completos de auditoría y seguridad pertenecen a las especificaciones de seguridad y permisos.

---

# 34. Relaciones entre entidades

Las relaciones deben ser explícitas.

Ejemplo completo:

```text
Person
 └── Predicador

Sermon Series
 └── Sermon
      ├── Person
      ├── Topic[]
      ├── MediaAsset
      └── ExternalMedia

Event
 ├── EventCategory
 ├── Location
 ├── Person
 └── MediaAsset

Ministry
 ├── Person[]
 ├── Location
 └── MediaAsset

Story
 ├── Person (opcional)
 └── MediaAsset

GalleryAlbum
 ├── Event (opcional)
 └── MediaAsset[]
```

---

# 35. Reglas de integridad de contenido

El CMS debe evitar estados incoherentes.

Ejemplos:

- un sermón publicado debe tener título;
- un contenido público debe tener slug cuando su ruta lo requiera;
- una imagen pública debe tener texto alternativo cuando sea informativamente relevante;
- un evento publicado debe tener fecha;
- una serie no debe contener referencias a sermones inexistentes;
- una relación eliminada debe poder resolverse sin corromper el contenido principal;
- un contenido archivado no debe aparecer como contenido destacado;
- un contenido programado no debe aparecer antes de su fecha;
- una URL pública debe ser resoluble mientras el contenido continúe publicado.

---

# 36. Eliminación y archivado

La eliminación debe utilizarse con precaución.

Para contenido publicado o relacionado con otros contenidos, se debe preferir:

```text
ARCHIVE
```

sobre:

```text
DELETE
```

Ejemplo:

Archivar un predicador no debe eliminar los sermones históricos asociados a él.

Archivar un evento no debe eliminar su álbum fotográfico.

Eliminar una serie no debe eliminar sus sermones.

---

# 37. Biblioteca de contenido relacionado

El CMS debe permitir seleccionar contenido relacionado cuando tenga sentido.

Ejemplos:

```text
Sermón
→ Otros sermones de la misma serie

Evento
→ Galería del evento

Ministerio
→ Eventos relacionados

Historia
→ Contenido relacionado

Artículo
→ Sermones o eventos relacionados
```

Estas relaciones deben ser opcionales y controladas.

No se debe crear una red automática excesivamente compleja.

---

# 38. Orden editorial

Cuando una colección se muestre en un orden específico, debe existir una forma explícita de controlarlo.

Ejemplos:

- orden de sermones dentro de una serie;
- orden de imágenes en un álbum;
- orden de ministerios destacados;
- orden de eventos destacados;
- orden de redes sociales.

No todo debe depender del orden de creación.

---

# 39. Búsqueda y filtros del CMS

El CMS debe permitir encontrar contenido rápidamente.

Filtros esperados:

### Sermones

- título;
- predicador;
- serie;
- tema;
- fecha;
- estado.

### Eventos

- título;
- categoría;
- fecha;
- estado.

### Ministerios

- nombre;
- líder;
- estado.

### Artículos

- título;
- autor;
- fecha;
- estado.

### Medios

- tipo;
- fecha;
- nombre;
- uso.

---

# 40. Operaciones editoriales masivas

Cuando sea seguro, el CMS puede permitir acciones sobre varios elementos.

Ejemplos:

- archivar varios eventos;
- cambiar estado;
- asignar categoría;
- ordenar contenido;
- asociar elementos.

Las acciones destructivas deben requerir confirmación.

---

# 41. Duplicación de contenido

Debe considerarse la posibilidad de duplicar contenido para acelerar tareas repetitivas.

Ejemplos:

- crear un nuevo evento a partir de uno anterior;
- reutilizar estructura de un sermón;
- crear un nuevo álbum con configuración similar.

La duplicación debe generar un nuevo contenido en estado `DRAFT`.

Nunca debe crear accidentalmente dos contenidos publicados idénticos.

---

# 42. Contenido externo

El CMS debe soportar contenido cuya fuente principal esté fuera de UCI.

Ejemplos:

```text
Sermón
└── Video → YouTube

Generosidad
└── Pago → plataforma externa

Red social
└── Perfil → plataforma externa

Imagen
└── CDN/proveedor externo
```

El CMS almacena la referencia y los metadatos necesarios.

No se debe asumir que todos los contenidos deben vivir físicamente en el servidor de UCI.

---

# 43. Accesibilidad editorial

El CMS debe ayudar a los administradores a producir contenido accesible.

Para imágenes informativas:

- exigir o recomendar texto alternativo.

Para enlaces:

- permitir etiquetas descriptivas.

Para contenido:

- mantener estructura de títulos;
- evitar depender únicamente del color;
- permitir contenido legible.

La accesibilidad final también debe garantizarse en el frontend.

---

# 44. Reglas para contenido visual

El CMS debe distinguir entre:

```text
Imagen decorativa
Imagen informativa
Imagen editorial
Imagen de perfil
Imagen de portada
```

No todas las imágenes requieren el mismo tratamiento.

Los campos de texto alternativo y descripción deben responder a la función de la imagen, no simplemente repetir su nombre de archivo.

---

# 45. Contenido de la navegación

La navegación principal no debe convertirse en un menú completamente libre.

La estructura base definida por el producto permanece controlada.

El CMS puede permitir, si posteriormente se requiere:

- habilitar/deshabilitar enlaces secundarios;
- actualizar etiquetas controladas;
- administrar enlaces sociales;
- administrar CTAs globales.

Pero no debe permitir que un administrador destruya la arquitectura principal del sitio.

---

# 46. Configuración global

Debe existir una sección de configuración para información transversal.

Puede incluir:

```text
Configuración
├── Información de UCI
├── Contacto
├── Ubicación
├── Horarios
├── Redes sociales
├── Generosidad
├── Transmisión
└── SEO global
```

Esta información debe ser consumida por diferentes partes del frontend.

---

# 47. SEO global

Además del SEO de cada contenido, el CMS debe permitir definir valores globales:

- nombre del sitio;
- descripción predeterminada;
- imagen Open Graph predeterminada;
- favicon;
- información institucional;
- datos de contacto;
- configuración de indexación cuando corresponda.

Los valores específicos de una página deben tener prioridad sobre los valores globales.

---

# 48. Qué NO debe administrar este CMS

El alcance inicial no incluye:

- gestión completa de miembros;
- asistencia;
- discipulado;
- contabilidad;
- nómina;
- inventario;
- gestión pastoral privada;
- historia clínica;
- información financiera privada;
- pagos internos;
- matrícula;
- gestión académica;
- chat interno;
- red social interna;
- constructor visual de páginas;
- edición libre del layout del sitio.

El CMS es una **plataforma editorial para el sitio web público de UCI**, no un ERP de la iglesia.

---

# 49. Modelo de contenido mínimo viable

La primera versión funcional debe priorizar:

```text
Configuración
├── Información de UCI
├── Ubicación
├── Horarios
└── Redes sociales

Personas
└── Predicadores / líderes públicos

Sermones
├── Sermones
├── Series
└── Temas

Eventos
└── Categorías

Ministerios

Historias

Artículos

Galería
└── Álbumes

Medios

Páginas estructuradas

Inicio

Transmisión

Generosidad
```

---

# 50. Evolución futura

El modelo debe permitir agregar posteriormente:

- múltiples sedes;
- contenido bilingüe;
- podcasts;
- devocionales;
- recursos descargables;
- formularios;
- newsletter;
- integración con plataformas externas;
- contenido protegido;
- perfiles públicos ampliados;
- calendario más avanzado;
- notificaciones.

Estas capacidades no deben introducirse en la primera versión sin una necesidad real.

---

# 51. Reglas editoriales generales

1. Todo contenido público debe tener un responsable editorial.
2. El contenido debe poder distinguirse claramente entre borrador y publicación.
3. Los contenidos relacionados deben utilizar relaciones, no texto duplicado.
4. Las imágenes deben conservar metadatos suficientes para su uso accesible.
5. Las URLs públicas deben ser estables.
6. Los cambios de slug deben considerar redirecciones.
7. El contenido publicado no debe perderse por una edición accidental.
8. El archivado debe preferirse a la eliminación cuando exista historial o relaciones.
9. El frontend conserva la composición visual.
10. El CMS administra el contenido, no el diseño de la aplicación.
11. La información institucional debe existir en un único origen de verdad.
12. No se deben introducir datos ficticios para completar el CMS.
13. Los ministerios, horarios, líderes, redes y demás información específica de UCI deben configurarse únicamente cuando hayan sido confirmados.
14. El contenido privado no pertenece al modelo editorial público.

---

# 52. Definición de terminado

El modelo de contenido y CMS se considera correctamente definido cuando:

- las entidades editoriales principales están identificadas;
- sus relaciones están claras;
- existe una estrategia de publicación;
- existe una estrategia de medios;
- existe una estrategia para contenido externo;
- el contenido puede reutilizarse sin duplicación;
- el homepage puede alimentarse desde el CMS sin convertirse en un page builder;
- los contenidos tienen estados editoriales claros;
- las URLs y slugs tienen reglas;
- SEO forma parte del modelo;
- las imágenes contemplan accesibilidad;
- existe trazabilidad editorial básica;
- el archivado está definido;
- el modelo no mezcla contenido público con administración privada de la iglesia;
- el modelo permite crecer sin introducir complejidad innecesaria.

---

# 53. Relación con las siguientes especificaciones

Este documento define **qué contenido existe y cómo se relaciona**.

Las siguientes especificaciones deberán definir progresivamente:

```text
05 — Content Model & CMS
        ↓
06 — [Siguiente especificación funcional]
        ↓
07 — API / contratos
        ↓
08 — arquitectura técnica
        ↓
09 — media / almacenamiento
        ↓
10 — SEO / performance
        ↓
11 — seguridad / permisos
```

Los detalles físicos de PostgreSQL, endpoints, DTOs, autenticación, almacenamiento concreto, infraestructura y despliegue no deben duplicarse aquí.

Este documento es la **fuente de verdad editorial del CMS de UCI**.
