# 06 — Functional Requirements

## 1. Propósito

Este documento define el comportamiento funcional que debe cumplir el sitio web y CMS de **Iglesia UCI — Unidad Cristiana de Intercesión**.

Mientras `05-content-model-cms.md` define **qué contenido existe y cómo se relaciona**, este documento define **qué debe poder hacer el sistema con ese contenido**.

La especificación cubre:

- experiencia pública;
- navegación;
- descubrimiento de contenido;
- sermones;
- eventos;
- ministerios;
- historias;
- páginas institucionales;
- medios;
- búsqueda y filtros;
- formularios;
- configuración;
- CMS;
- publicación;
- previsualización;
- estados;
- comportamiento responsive;
- errores y estados vacíos.

Los detalles de implementación tecnológica, endpoints, estructura física de PostgreSQL, infraestructura y despliegue pertenecen a otras especificaciones.

---

# 2. Principios funcionales

## 2.1. El sitio debe funcionar como una experiencia editorial

UCI no debe sentirse como una base de datos publicada en Internet.

El sistema debe transformar el contenido estructurado del CMS en una experiencia:

- clara;
- humana;
- espiritual;
- contemporánea;
- fácil de explorar.

---

## 2.2. El visitante no necesita conocer la estructura interna del CMS

El visitante debe encontrar directamente:

- quién es UCI;
- cuándo reunirse;
- dónde está;
- qué puede esperar;
- qué está enseñando la iglesia;
- qué eventos existen;
- cómo participar;
- cómo contactar a UCI.

---

## 2.3. El CMS y el sitio público son dos experiencias diferentes

```text
Visitante
    ↓
Sitio público
    ↓
Contenido publicado

Administrador
    ↓
/panel
    ↓
Contenido + publicación + medios + configuración
```

El panel no debe exponer innecesariamente conceptos técnicos al equipo editorial.

---

# 3. Actores funcionales

## 3.1. Visitante

Puede:

- navegar;
- consultar información;
- ver sermones;
- explorar eventos;
- conocer ministerios;
- consultar historias;
- contactar a UCI;
- consultar ubicación;
- acceder a redes;
- acceder a recursos externos.

No necesita autenticación.

---

## 3.2. Visitante nuevo

Tiene como objetivo principal responder:

- ¿Qué es UCI?
- ¿Dónde está?
- ¿Cuándo se reúne?
- ¿Qué puedo esperar?
- ¿Cómo puedo llegar?
- ¿Cómo puedo conocer la iglesia?

La experiencia `/soy-nuevo` debe estar especialmente optimizada para este usuario.

---

## 3.3. Administrador/editor

Puede administrar contenido según los permisos definidos posteriormente.

Debe poder:

- crear;
- editar;
- previsualizar;
- publicar;
- programar;
- despublicar;
- archivar;
- relacionar;
- buscar;
- organizar contenido.

---

# 4. Navegación pública

La navegación principal debe permitir acceder como mínimo a:

```text
Inicio
Nosotros
Sermones
Eventos
Ministerios
Contacto
```

También deben existir llamadas a la acción contextuales:

- Soy nuevo;
- Ver en vivo, cuando exista transmisión;
- Ver sermón;
- Planear mi visita;
- Contactar.

La navegación exacta y su arquitectura deben respetar `02-information-architecture.md`.

---

# 5. Header

## Requisitos

El header debe:

- mostrar la identidad UCI;
- permitir navegación principal;
- proporcionar acceso a acciones principales;
- funcionar correctamente en desktop y móvil;
- permanecer legible sobre el hero;
- cambiar de tratamiento visual al hacer scroll cuando corresponda.

## Desktop

Debe mostrar:

- logo;
- navegación;
- CTA principal/secundario según diseño.

## Mobile

Debe mostrar:

- logo;
- botón de menú;
- acceso claro a la navegación;
- CTA prioritario cuando corresponda.

El menú móvil debe ser completamente navegable mediante teclado y tecnologías de asistencia.

---

# 6. Homepage

La homepage debe implementar la estructura definida en `04-home-page-spec.md`.

Orden funcional:

1. Header
2. Hero
3. Somos UCI
4. En UCI / tres pilares
5. Próximo servicio
6. Primera vez en UCI
7. Último sermón
8. Biblioteca de sermones
9. Próximos eventos
10. Ministerios
11. Historias
12. Generosidad
13. CTA final
14. Footer

El CMS proporciona los datos, pero no puede modificar arbitrariamente este orden.

---

# 7. Hero

El hero debe:

- cargar la imagen o medio configurado;
- aplicar el tratamiento visual definido por el sistema de diseño;
- mostrar el mensaje principal;
- proporcionar acciones claras;
- mostrar información de servicio cuando corresponda.

### Contenido

Debe poder recibir desde CMS:

- eyebrow;
- título;
- descripción;
- imagen/medio;
- CTA primario;
- CTA secundario.

### Reglas

- debe existir contraste suficiente entre contenido y fondo;
- los CTAs deben ser accesibles;
- si la imagen falla, debe existir un fallback visual;
- el hero no debe impedir la lectura del contenido.

---

# 8. Información de UCI

El sistema debe permitir al visitante consultar:

- quién es UCI;
- identidad;
- propósito;
- misión;
- visión;
- mensaje institucional.

La información debe proceder de contenido administrado.

No deben existir copias independientes de estos datos en diferentes componentes.

---

# 9. Tres pilares

La homepage debe mostrar los tres pilares definidos:

- ADORAMOS;
- APRENDEMOS;
- INTERCEDEMOS.

Cada pilar puede contener:

- título;
- descripción;
- imagen;
- enlace contextual.

La composición visual es fija; el contenido puede ser administrado.

---

# 10. Próximo servicio

El sistema debe mostrar el próximo servicio relevante.

Debe poder obtener:

- nombre;
- fecha/día;
- hora;
- ubicación;
- instrucciones;
- acción para planear la visita.

Si no existe información válida, la sección debe mostrar un estado alternativo definido por diseño y no datos ficticios.

---

# 11. Primera vez en UCI

La sección y página correspondiente deben ayudar al visitante nuevo.

Debe responder como mínimo:

- cuándo reunirse;
- dónde;
- qué esperar;
- cómo llegar;
- qué hacer al llegar;
- cómo contactar a UCI.

Debe existir una CTA para continuar el proceso:

```text
Planear mi visita
```

o equivalente definido por diseño.

---

# 12. Sermones

## 12.1. Listado

El visitante debe poder consultar los sermones publicados.

Cada elemento puede mostrar:

- imagen;
- título;
- predicador;
- fecha;
- serie;
- temas;
- referencia bíblica;
- acceso al sermón.

El frontend debe evitar mostrar contenido no publicado.

---

## 12.2. Filtros

La biblioteca debe permitir filtrar por:

- predicador;
- serie;
- tema;
- fecha cuando corresponda.

Los filtros deben poder combinarse.

Ejemplo:

```text
Predicador = X
+
Tema = Obediencia
```

---

## 12.3. Página individual

La página de un sermón debe permitir:

- ver título;
- conocer predicador;
- consultar fecha;
- consultar serie;
- consultar temas;
- ver video;
- escuchar audio cuando exista;
- consultar referencias bíblicas;
- acceder a notas;
- descubrir contenido relacionado.

---

## 12.4. Video externo

Cuando exista un video externo:

- debe mostrarse mediante el mecanismo apropiado;
- debe existir un enlace alternativo cuando sea posible;
- el sitio no debe depender de almacenar el video localmente.

Si el video no está disponible, el resto del contenido del sermón debe continuar siendo accesible.

---

# 13. Notas del sermón

Cuando un sermón tenga notas:

El visitante debe poder:

- visualizarlas;
- abrirlas;
- descargarlas cuando exista archivo descargable.

El contenido de notas puede ser:

- PDF;
- imagen;
- documento;
- recurso externo.

La ausencia de notas no debe generar un error en la página del sermón.

---

# 14. Series de sermones

El visitante debe poder reconocer cuando un sermón pertenece a una serie.

Desde un sermón debe poder navegar hacia:

- la serie;
- otros sermones de la serie.

La serie debe presentar:

- nombre;
- descripción;
- imagen;
- listado ordenado de sermones.

---

# 15. Eventos

## 15.1. Listado

El sitio debe mostrar próximos eventos.

Cada evento puede incluir:

- título;
- imagen;
- fecha;
- hora;
- ubicación;
- resumen;
- categoría;
- CTA.

---

## 15.2. Página individual

Debe permitir consultar:

- información completa;
- fecha;
- hora;
- ubicación;
- mapa o indicaciones;
- registro cuando corresponda;
- contacto;
- contenido relacionado.

---

## 15.3. Eventos pasados

Los eventos finalizados deben poder conservarse como contenido histórico.

No deben mostrarse automáticamente como próximos eventos.

---

# 16. Calendario / descubrimiento de eventos

El sistema debe poder proporcionar una experiencia para consultar eventos.

La primera versión debe priorizar:

- próximos eventos;
- orden cronológico;
- filtros simples si están disponibles.

Un calendario avanzado no debe introducirse hasta que exista una necesidad real.

---

# 17. Ministerios

El listado de ministerios debe mostrar los ministerios configurados y publicados.

Cada ministerio puede mostrar:

- nombre;
- imagen;
- descripción;
- líder;
- horario;
- ubicación;
- contacto;
- CTA.

La información debe ser completamente administrable desde el CMS.

---

# 18. Historias y testimonios

El sitio debe poder mostrar historias publicadas.

Una historia puede incluir:

- imagen;
- nombre para mostrar;
- título;
- cita;
- contenido;
- fecha.

Las historias deben publicarse únicamente cuando hayan sido aprobadas editorialmente.

---

# 19. Artículos y noticias

El sitio debe poder presentar contenido editorial adicional.

Los artículos deben tener:

- listado;
- página individual;
- fecha;
- autor;
- imagen;
- contenido;
- SEO.

El sistema debe poder separar artículos publicados de borradores.

---

# 20. Galería

Los visitantes deben poder consultar álbumes públicos.

Un álbum debe:

- mostrar portada;
- mostrar título;
- mostrar fecha;
- abrir la galería;
- permitir navegar por sus imágenes.

La galería debe contemplar:

- imágenes responsivas;
- texto alternativo;
- navegación accesible;
- estados de carga.

---

# 21. Contacto

La página de contacto debe proporcionar:

- dirección;
- teléfono;
- WhatsApp si existe;
- correo;
- redes;
- ubicación;
- formulario cuando se habilite.

Los datos deben proceder de la configuración central de UCI.

---

# 22. Formulario de contacto

Cuando esté habilitado, el formulario debe permitir enviar una consulta.

Campos mínimos posibles:

- nombre;
- correo;
- asunto;
- mensaje.

### Comportamiento

Al enviar:

1. validar campos;
2. mostrar estado de envío;
3. procesar solicitud;
4. informar éxito o error.

Nunca se debe mostrar un mensaje de éxito si el servidor no confirmó el procesamiento.

### Seguridad

La protección contra abuso, spam y validación del backend se define en las especificaciones de seguridad.

---

# 23. Ubicación

El sitio debe permitir encontrar físicamente a UCI.

Debe poder ofrecer:

- dirección;
- mapa;
- enlace para indicaciones;
- información contextual;
- horarios.

Cuando exista una ubicación principal, debe utilizarse de forma consistente en todo el sitio.

---

# 24. Redes sociales

Las redes sociales configuradas deben aparecer en los lugares definidos por diseño.

Al seleccionar una red:

- debe abrirse la URL configurada;
- debe existir tratamiento apropiado para enlaces externos;
- no se deben inventar perfiles.

---

# 25. Generosidad

La sección de generosidad debe informar de forma clara y sobria.

Debe permitir:

- conocer el propósito;
- consultar métodos;
- acceder a plataforma externa;
- consultar instrucciones cuando corresponda.

El sitio no debe procesar directamente datos financieros privados salvo que una futura especificación incorpore explícitamente una plataforma de pago.

---

# 26. Transmisión en vivo

Cuando exista transmisión activa:

- debe mostrarse claramente;
- debe existir una acción para acceder;
- puede aparecer el CTA “Ver en vivo”.

Cuando no exista transmisión:

- no debe aparecer una indicación engañosa de contenido en vivo;
- puede mostrarse el próximo servicio o último contenido disponible.

---

# 27. Footer

El footer debe mostrar como mínimo:

- logo UCI;
- navegación relevante;
- información de contacto;
- ubicación;
- redes sociales;
- copyright.

Debe consumir información global del CMS.

---

# 28. Búsqueda pública

La búsqueda pública debe considerarse una capacidad del sistema, especialmente para el archivo de sermones y contenido editorial.

Cuando esté habilitada debe permitir encontrar contenido por:

- título;
- predicador;
- serie;
- tema;
- texto relevante.

Los resultados deben excluir:

- borradores;
- contenido programado;
- contenido despublicado;
- contenido archivado.

---

# 29. URLs y navegación interna

Las páginas públicas deben utilizar URLs legibles.

Ejemplos:

```text
/sermones
/sermones/[slug]
/eventos
/eventos/[slug]
/ministerios
/ministerios/[slug]
```

Los enlaces internos deben utilizar rutas canónicas.

Si un contenido cambia de slug, debe mantenerse la continuidad de la URL anterior mediante el mecanismo definido en la especificación SEO/técnica.

---

# 30. Estados vacíos

Cada colección debe tener un estado vacío apropiado.

Ejemplo:

```text
No hay sermones disponibles para este filtro.
```

No se deben mostrar:

- tarjetas vacías;
- imágenes inexistentes;
- botones sin destino;
- texto de placeholder de desarrollo.

---

# 31. Estados de carga

Cuando una interacción requiera carga dinámica, el usuario debe recibir una indicación adecuada.

Debe evitarse:

- pantalla completamente bloqueada sin explicación;
- saltos visuales innecesarios;
- contenido duplicado durante la carga.

Los estados de carga deben respetar el sistema visual.

---

# 32. Estados de error

Los errores públicos deben ser comprensibles.

Ejemplos:

```text
No pudimos cargar este contenido.
Intenta nuevamente.
```

Debe existir una acción útil cuando corresponda:

- reintentar;
- volver;
- ir al inicio.

Nunca se deben mostrar errores técnicos internos al visitante.

---

# 33. Contenido no encontrado

Si una URL no corresponde a contenido publicado:

- mostrar una página 404;
- explicar que el contenido no está disponible;
- permitir regresar al inicio;
- proporcionar navegación útil.

No debe mostrarse una pantalla técnica del servidor.

---

# 34. Contenido despublicado

Si un contenido previamente público deja de estar publicado:

- su URL ya no debe presentarse como contenido público;
- debe manejarse mediante el comportamiento SEO definido;
- los enlaces internos deben dejar de promocionarlo;
- las referencias históricas deben resolverse de forma coherente.

---

# 35. CMS — Dashboard

El panel debe proporcionar una visión rápida del estado editorial.

Puede mostrar:

- contenido reciente;
- borradores;
- publicaciones programadas;
- próximos eventos;
- contenido destacado;
- actividad reciente;
- accesos rápidos.

El dashboard no debe convertirse en un sistema de analítica excesivamente complejo en la primera versión.

---

# 36. CMS — Gestión de contenido

Para cada entidad administrable, el CMS debe permitir según corresponda:

```text
Crear
Editar
Guardar borrador
Previsualizar
Publicar
Programar
Despublicar
Archivar
Restaurar
```

Las operaciones disponibles dependerán del estado y permisos del usuario.

---

# 37. CMS — Formularios

Los formularios administrativos deben:

- validar datos obligatorios;
- indicar errores junto al campo correspondiente;
- conservar información válida cuando falle una validación;
- distinguir claramente entre guardar y publicar;
- advertir sobre cambios que puedan afectar contenido publicado.

---

# 38. CMS — Editor de contenido

El editor debe soportar contenido rico cuando sea necesario.

Debe permitir como mínimo:

- títulos;
- párrafos;
- enlaces;
- listas;
- citas;
- énfasis;
- imágenes cuando el modelo lo permita.

El editor no debe permitir modificar arbitrariamente:

- colores globales;
- tipografías;
- layout;
- componentes del sitio;
- espaciado del sistema de diseño.

---

# 39. CMS — Medios

La biblioteca de medios debe permitir:

- cargar;
- consultar;
- buscar;
- filtrar;
- editar metadatos;
- reutilizar;
- identificar uso;
- retirar medios cuando sea seguro.

Debe ser posible saber, cuando corresponda, dónde se utiliza un recurso.

---

# 40. CMS — Selección de imágenes

Cuando un contenido requiera imagen, el administrador debe poder:

- seleccionar un medio existente;
- cargar un nuevo medio;
- reemplazarlo;
- quitarlo.

No se debe obligar a cargar la misma imagen múltiples veces.

---

# 41. CMS — Publicación programada

El administrador debe poder establecer:

- fecha;
- hora;
- estado programado.

El contenido no debe hacerse público antes del momento configurado.

Debe ser posible cancelar una programación sin eliminar el contenido.

---

# 42. CMS — Previsualización

El administrador debe poder revisar contenido antes de publicarlo.

La preview debe:

- mostrar datos actuales;
- permitir comprobar relaciones;
- no indexarse;
- no confundirse con una URL pública.

---

# 43. CMS — Contenido destacado

El administrador debe poder seleccionar qué contenido se considera destacado cuando la entidad lo soporte.

Debe poder:

- activar destacado;
- quitar destacado;
- ordenar destacados cuando corresponda.

El frontend debe respetar estas selecciones.

---

# 44. CMS — Relaciones

Al editar una entidad relacionada, el CMS debe facilitar la selección.

Ejemplo:

```text
Crear Sermón

Predicador:
[ Seleccionar persona ]

Serie:
[ Seleccionar serie ]

Temas:
[ Seleccionar temas ]
```

No se debe obligar al administrador a introducir IDs técnicos.

---

# 45. CMS — Taxonomías

Las taxonomías deben poder administrarse desde el panel cuando estén habilitadas.

Debe evitarse crear duplicados como:

```text
Oración
oracion
Oración y oración
```

Las taxonomías deben mantener nombres y slugs consistentes.

---

# 46. CMS — Orden

Cuando el orden sea editorialmente relevante, el panel debe proporcionar una forma sencilla de modificarlo.

La interacción debe ser comprensible para usuarios no técnicos.

---

# 47. CMS — Eliminación

Antes de eliminar contenido, el sistema debe comprobar dependencias relevantes.

Si el contenido tiene relaciones importantes, debe recomendarse archivar.

Las eliminaciones irreversibles deben requerir confirmación explícita.

---

# 48. CMS — Cambios sin publicar

Editar un contenido publicado no debe cambiar inmediatamente su representación pública cuando el flujo editorial requiera revisión.

El sistema debe distinguir:

```text
Contenido publicado
vs.
Cambios en borrador
```

La estrategia exacta de versionado se desarrollará en la especificación técnica.

---

# 49. CMS — Recuperación

Cuando exista historial de versiones, el administrador autorizado debe poder:

- consultar versiones;
- comparar cambios cuando se implemente;
- restaurar una versión anterior.

La restauración debe generar un estado controlado y no publicar automáticamente contenido sin autorización.

---

# 50. Configuración global del CMS

Debe existir acceso centralizado a:

- información de iglesia;
- contacto;
- ubicación;
- horarios;
- redes;
- generosidad;
- transmisión;
- SEO global.

La modificación de configuración debe afectar todos los lugares que consumen esa información.

---

# 51. Validación de contenido público

Antes de permitir publicación, el sistema debe comprobar requisitos mínimos según entidad.

Ejemplos:

### Sermón

- título;
- slug;
- fecha;
- predicador cuando sea obligatorio;
- contenido o recurso principal.

### Evento

- título;
- fecha;
- información básica de ubicación o modalidad.

### Ministerio

- nombre;
- descripción;
- imagen cuando sea requerida por el diseño.

### Historia

- contenido;
- aprobación editorial;
- datos públicos necesarios.

Los requisitos exactos por entidad se derivan de `05-content-model-cms.md`.

---

# 52. SEO funcional

Cuando se publique contenido indexable, el sistema debe generar o exponer:

- título;
- descripción;
- URL;
- imagen social;
- canonical cuando corresponda;
- estado de indexación.

El contenido no publicado no debe exponerse accidentalmente a motores de búsqueda.

---

# 53. Accesibilidad funcional

Todas las funciones principales deben poder utilizarse mediante:

- teclado;
- lector de pantalla;
- dispositivos táctiles.

Debe existir:

- foco visible;
- nombres accesibles para controles;
- navegación lógica;
- mensajes de error comprensibles;
- alternativas para contenido no textual.

---

# 54. Responsive

Todas las funcionalidades públicas deben funcionar en:

- móvil;
- tablet;
- desktop.

El comportamiento puede cambiar por breakpoint, pero no debe perderse funcionalidad.

Especial atención:

- navegación;
- filtros;
- sermones;
- galerías;
- formularios;
- mapas;
- CTAs;
- contenido multimedia.

---

# 55. Multimedia responsive

Los videos y otros medios deben:

- adaptarse al ancho disponible;
- mantener proporciones;
- no provocar overflow horizontal;
- ofrecer controles accesibles;
- manejar fallos de carga.

---

# 56. Formularios y feedback

Todos los formularios deben comunicar claramente:

```text
Idle
→ Editing
→ Submitting
→ Success
```

o:

```text
Idle
→ Editing
→ Submitting
→ Error
```

El usuario nunca debe quedar sin saber si una acción fue procesada.

---

# 57. Persistencia de acciones editoriales

Cuando el administrador realice una acción importante:

- guardar;
- publicar;
- programar;
- archivar;

el sistema debe mostrar una confirmación clara.

La interfaz debe actualizar el estado mostrado para evitar que el administrador crea que una acción no fue ejecutada.

---

# 58. Integridad entre CMS y frontend

El frontend debe consumir únicamente contenido válido y publicado.

Nunca debe asumir que:

- existe una imagen;
- existe un predicador;
- existe una serie;
- existe una descripción;
- existe un video;
- existe un evento.

Los datos opcionales deben manejarse explícitamente.

---

# 59. Datos faltantes

Cuando un campo opcional no exista:

- ocultar el componente correspondiente;
- no mostrar placeholders artificiales;
- mantener la composición visual coherente.

Ejemplo:

Si un sermón no tiene audio:

```text
No mostrar reproductor vacío.
```

Si un evento no tiene registro:

```text
No mostrar botón "Registrarse".
```

---

# 60. Contenido externo no disponible

Si un recurso externo deja de funcionar:

- el sitio no debe romperse;
- debe mostrar un estado alternativo;
- debe conservar el contenido textual disponible;
- debe permitir actualizar la referencia desde el CMS.

---

# 61. Consistencia editorial

Los componentes públicos deben utilizar datos del mismo origen.

Ejemplo:

La dirección de UCI mostrada en:

- hero;
- próximo servicio;
- Soy nuevo;
- contacto;
- footer;

debe provenir de la configuración central.

---

# 62. Reglas para llamadas a la acción

Los CTAs deben:

- tener un objetivo claro;
- conducir a una ruta o URL válida;
- tener etiquetas comprensibles;
- no aparecer si no existe destino.

Ejemplos:

```text
Ver sermón
Planear mi visita
Conocer ministerios
Ver eventos
Ver en vivo
Cómo llegar
Contactar
```

---

# 63. Comportamiento del contenido destacado

Si no existe contenido destacado:

- el frontend debe utilizar fallback editorial definido;
- no debe mostrar una sección rota.

Ejemplo:

Si no existe sermón destacado, puede utilizarse automáticamente el último sermón publicado, siempre que esa regla haya sido definida para la sección.

Las reglas específicas de fallback deben mantenerse deterministas.

---

# 64. Reglas para contenido reciente

Los listados cronológicos deben utilizar fechas de publicación o fechas editoriales apropiadas.

Nunca debe utilizarse la fecha de creación interna como sustituto automático de la fecha que el visitante necesita conocer.

---

# 65. Consistencia temporal

Las fechas y horas deben:

- mostrarse en el contexto local de UCI;
- utilizar una zona horaria central;
- evitar diferencias entre CMS, API y frontend.

Los eventos y servicios deben ser especialmente cuidadosos con cambios de horario.

---

# 66. Performance funcional

El usuario debe poder comenzar a percibir contenido rápidamente.

El sistema debe evitar:

- cargar toda la biblioteca de sermones en una sola petición;
- cargar todas las imágenes originales cuando no son necesarias;
- cargar videos pesados automáticamente;
- bloquear la página esperando contenido secundario.

La optimización técnica detallada se definirá posteriormente.

---

# 67. SEO funcional del contenido

Las páginas públicas deben poder ser:

- descubiertas;
- compartidas;
- indexadas cuando corresponda;
- representadas correctamente en redes sociales.

El CMS debe proporcionar los datos necesarios para ello.

---

# 68. Compatibilidad con contenido futuro

El sistema debe permitir agregar nuevas entidades o tipos de contenido sin reconstruir la arquitectura pública completa.

Ejemplos futuros:

- devocionales;
- podcasts;
- recursos;
- campañas;
- transmisiones archivadas.

Esto no implica que deban implementarse inicialmente.

---

# 69. Reglas de no invención

El sistema no debe generar información institucional ficticia para completar componentes.

Si UCI todavía no ha configurado:

- horario;
- dirección;
- teléfono;
- ministerio;
- líder;
- red social;

el frontend debe mostrar un estado apropiado o no mostrar el elemento.

No se deben utilizar datos de ejemplo en producción.

---

# 70. Prioridad funcional

## P0 — Obligatorio para primera versión

- homepage;
- navegación;
- información de UCI;
- horarios;
- ubicación;
- página “Soy nuevo”;
- sermones;
- series;
- predicadores;
- temas;
- eventos;
- ministerios;
- contacto;
- CMS;
- publicación;
- programación;
- medios;
- SEO básico;
- responsive;
- accesibilidad básica;
- estados de error/vacío;
- transmisión externa;
- generosidad informativa.

## P1 — Importante

- historias/testimonios;
- artículos;
- galería;
- búsqueda pública;
- versionado editorial;
- relaciones de contenido avanzadas;
- operaciones masivas.

## P2 — Evolución

- filtros avanzados;
- automatizaciones editoriales;
- podcasts;
- newsletter;
- contenido bilingüe;
- funcionalidades de interacción más avanzadas.

---

# 71. Criterios generales de aceptación

Una funcionalidad puede considerarse terminada cuando:

1. cumple el comportamiento descrito;
2. funciona con contenido real;
3. funciona cuando los campos opcionales están ausentes;
4. no expone borradores;
5. respeta los estados editoriales;
6. funciona en móvil y desktop;
7. contempla estados de carga y error cuando corresponda;
8. es accesible;
9. no depende de datos ficticios;
10. mantiene la identidad visual definida;
11. no rompe otras áreas del sitio;
12. puede ser administrada desde CMS cuando corresponda.

---

# 72. Definición de terminado del sistema funcional

La primera versión funcional de UCI estará correctamente definida cuando:

- un visitante pueda descubrir UCI;
- pueda saber cuándo y dónde reunirse;
- pueda entender qué esperar;
- pueda explorar sermones;
- pueda consultar eventos;
- pueda descubrir ministerios;
- pueda leer historias y contenido editorial;
- pueda contactar a la iglesia;
- pueda acceder a recursos externos;
- el equipo de UCI pueda administrar el contenido desde `/panel`;
- el contenido pueda publicarse de inmediato o programarse;
- los cambios puedan previsualizarse;
- los medios puedan reutilizarse;
- el contenido pueda relacionarse;
- los contenidos retirados puedan conservarse;
- el frontend nunca dependa de datos ficticios;
- la experiencia mantenga coherencia con el sistema visual.

---

# 73. Relación con las siguientes especificaciones

Este documento define **qué debe hacer el producto**.

La separación conceptual queda así:

```text
01 — Product Requirements
        ↓
Qué producto se necesita
        ↓
02 — Information Architecture
        ↓
Cómo se organiza
        ↓
03 — Visual Design System
        ↓
Cómo debe verse
        ↓
04 — Home Page Spec
        ↓
Cómo funciona la página principal
        ↓
05 — Content Model & CMS
        ↓
Qué contenido existe
        ↓
06 — Functional Requirements
        ↓
Qué debe hacer el sistema
        ↓
Especificaciones técnicas posteriores
        ↓
Cómo se implementará
```

Las especificaciones técnicas posteriores no deben contradecir estos requisitos funcionales.

Este documento constituye la **fuente de verdad funcional del producto UCI**.
