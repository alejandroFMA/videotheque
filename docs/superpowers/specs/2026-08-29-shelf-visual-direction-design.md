# Videothèque — Dirección visual del shelf

**Fecha:** 2026-08-29
**Estado:** dirección visual **cerrada como MVP**. Artboards en el canvas de la sección 9.
Probado y descartado: panel de fondo de madera / recreo entre baldas (no aportaba).
**Sustituye a:** la estética de `shelf-prototype.html` (paleta oscura violácea + nogal + oro
marigold + Fraunces/Barlow Condensed), que se descarta.

---

## 1. Qué se diseña

La pantalla principal de la app: una **estantería fotorrealista** con las películas del
usuario como **cintas de VHS** apoyadas de canto sobre baldas de madera, contra una pared.
Buscar en TMDB añade una cinta. Al elegir una cinta, su estuche viaja al centro de la
pantalla, se puede girar con el ratón, y su ficha aparece al lado.

Este documento cubre **look & feel y layout**, y fija cómo se apoya en el modelo de datos
(sección 10). La implementación de componentes y el spec de datos van después.

---

## 2. Mood

- **Fotorrealista, no skeuomórfico-decorativo.** Objeto real: madera con veta de verdad
  (textura CC0 tipo Poly Haven / ambientCG), cartón de funda de VHS, sombras de contacto
  correctas, un reflejo especular sutil en el plástico.
- **La interfaz desaparece.** Tipografía y controles neutros; el peso visual lo llevan los
  objetos y la madera.
- Referencia de origen (Criterion Closet) **queda atrás**: menos "cine-club sobrio",
  más **videoclub / biblioteca de barrio de los 90**, cálido y tangible.

---

## 3. Temas

| | Dark (se diseña primero) | Light |
|---|---|---|
| Pared | Gris carbón (~`#1a1a1a`) | Hueso cálido (blanco roto, leve calidez) |
| Madera | La misma textura, iluminada según el tema | idem, más luz |
| Texto UI | Hueso sobre carbón | Carbón sobre hueso |

- **Selección de tema:** sigue la preferencia del sistema por defecto; un **toggle en el
  menú del avatar** la sobreescribe y persiste.
- Diseñar los artboards en **dark primero**; el light es variante, no rediseño.

---

## 4. Layout

### Cabecera (fija arriba)

- **Izquierda:** wordmark **VIDEOTHEQUE**, mayúsculas, grotesque condensada pesada
  (registro "masthead", tipo Impact / The Hollywood Reporter pero con más finura —
  candidatos libres: *Anton*, *Archivo Black*). Tracking ajustado. Sin icono.
- **Derecha:** círculo con **avatar** + **display name** al lado. Clic en el avatar
  despliega un menú:
  - Ajustes (Settings)
  - Compartir perfil → copia el link a tu perfil público (`/u/[handle]`)
  - Cerrar sesión (Log out)
  - (el toggle de tema vive aquí también)
- **Búsqueda:** input de búsqueda en la zona de cabecera (bajo el wordmark o alineado a la
  derecha, a definir en artboard). Placeholder tipo "Busca una película para archivarla".
  Resultados en un desplegable: miniatura de póster + título + año + estado
  "Ya en la estantería" cuando aplica.

### La estantería (cuerpo)

**Modelo (resuelto, reutiliza el schema actual sin cambios):**

- **Un solo nivel.** La librería del usuario = su pila de **baldas** apiladas en vertical,
  de arriba a abajo. Cada balda es una fila de la tabla `shelves`.
- Cada balda: un listón de madera con su canto frontal, exactamente **20 huecos** en
  **una fila única** (sin envolver), alineados a la izquierda. **El ancho del listón es
  el justo para 20 títulos** — ni más, ni menos. Una balda con menos de 20 deja madera
  vacía a la derecha. Los 20 huecos son un límite de cliente, no de BD.
- **Se llena de arriba abajo.** Cuando la última balda llega a sus 20 huecos, aparece
  **debajo** un botón **"+ Añadir balda"** que crea una nueva fila `shelves` vacía. Sin
  tope de número de baldas: la página crece con scroll vertical.
- Huecos por borrado **no se compactan** (pueden quedar hiatos en una balda).
- **El número de posición nunca se muestra** en el lomo ni en ningún sitio.
- **El postit de categoría es opcional, por balda.** Cuando la balda tiene nombre y color
  (`shelves.name` + `shelves.accent_color`), se dibuja una tarjeta rotulada al inicio,
  estilo separador de videoclub ("TERROR", "FANTASÍA", …). **Una balda sin postit no
  dibuja nada** y se lee como continuación de la sección anterior. Es un adorno, no un
  control.
- **Estantería vacía (primer uso):** una sola balda desnuda, sin postit, y un texto breve
  invitando a buscar un título (y a ponerle etiqueta si quiere).

### La cinta en la balda (lomo)

- Formato **VHS**: caja alta y gruesa, lomo ancho y legible.
- `films.spine_color` (calculado una vez desde el póster) **tiñe la funda de cartón** del
  lomo. El **título va impreso encima**, en mayúsculas condensadas. No es el arte del
  póster envuelto alrededor. **Sin número de posición.**
- Anchura del lomo con leve variación por película para que la fila no parezca un peine,
  pero dentro del presupuesto: 20 lomos tienen que caber justos en el listón.
- Hover: la cinta se asoma un poco de la balda.
- Futuro (follow-up, no ahora): al registrarse podrás elegir formato físico —
  al menos VHS o Blu-ray.

---

## 5. Interacción: elegir una película

1. **Clic en el lomo** → el estuche de VHS **viaja al centro de la pantalla** sobre un
   fondo atenuado (la estantería se oscurece detrás), a tamaño grande.
2. **Arrastrar sobre el estuche lo gira** en su eje Y, con tope suave a **±90°**
   (ver frente, lomo y algo de contraportada; no vuelta completa). Suelta y se reencuadra.
3. La **ficha aparece al lado** del estuche, que **sigue girable** mientras lees.
4. **`Esc` o clic fuera** → el estuche vuelve solo a su hueco en la balda.

**Convención de estantería:** el lomo va a la **izquierda** de la portada desde la
perspectiva del usuario (como un libro sacado del estante). La vista por defecto del
estuche centrado lo enseña ligeramente girado hacia ese lado.

### La ficha (contenido)

- Título (serif/display de película), año, director.
- Sinopsis.
- Acción: "Quitar de la estantería".
- **Todo sale de la caché `films`. Renderizar la estantería nunca llama a TMDB.**

### Construcción del estuche 3D — decidido tras el spike A/B

Se probaron las dos vías (spikes publicados como Artifacts). Decisión:

- **En la estantería, los lomos son CSS/DOM.** Baratos, sin canvas, nunca tocan TMDB.
- **El estuche centrado (el que se saca y se gira) se renderiza con Three.js.** Se monta
  **un** `<canvas>` WebGL al abrir el estuche y se desmonta al cerrar, para que la
  dependencia (~150 KB gzip, desde CDN) y la GPU solo entren en juego cuando el usuario
  está inspeccionando una cinta, no en el render de la estantería.
- **Qué justifica la dependencia** (frente al CSS 3D de la Prueba A): sombra proyectada
  real que cambia al girar, y reflejo especular que sigue a la luz sobre el plástico —
  el "sí es un objeto de plástico brillante" que es el atractivo del producto. El CSS lo
  finge con una franja fija que no reacciona. CLAUDE.md queda actualizado para admitir
  librerías justificadas; Three.js es la primera aceptada.
- **Caras del estuche:** frente = póster desde `image.tmdb.org` como textura UV;
  lomo = color (`films.spine_color`) + título impreso; contraportada = plantilla genérica
  montada con datos de la caché (miniatura + sinopsis + año/dirección + código de barras
  figurado; TMDB no da arte de contra).
- Material `clearcoat` (plástico sobre cartón), luz direccional con sombra suave, y un
  entorno mínimo para el reflejo especular.
- Fallback: si WebGL no está disponible, degradar a una vista estática del póster con la
  ficha (sin giro).

---

## 6. Tipografía

- **Display / masthead:** grotesque condensada muy pesada, mayúsculas, para el wordmark
  VIDEOTHEQUE y (opcional) títulos de película en lomo y ficha. Candidatos libres:
  *Anton*, *Archivo Black*, *Oswald* (pesos altos).
- **UI / cuerpo:** grotesque neutra (*Inter*, *Archivo*). Todo el chrome, menús,
  resultados de búsqueda, metadatos.
- Sin serif tipo Fraunces. Si un artboard quiere probar una serif de carácter solo para
  el título de película en la ficha, adelante como variante.

---

## 7. Color de acento — decidido

Se elimina el oro marigold fijo. **UI neutra (hueso / carbón), sin tinte de marca
global.** El único color vivo son los postits de categoría de las baldas. Un acento único
y discreto (latón) solo para foco de teclado y el link de la atribución.

Descartado: teñir el chrome con el `accent_color` de cada balda (número, madera, aro del
avatar, bordes). Se probó en un artboard y no convence — demasiado ruido.

---

## 8. Atribución

TMDB exige atribución visible. Pie de página con el texto estándar
("This product uses the TMDB API but is not endorsed or certified by TMDB") y, si cabe,
el logo de TMDB. Discreto pero presente en la pantalla principal.

---

## 9. Artboards (canvas publicado)

Canvas: https://claude.ai/code/artifact/6748e98b-55b7-4107-aa40-4bf5353cdc79

1. **Home — carbón** (dirección elegida). Balda 1 llena a 20 con postit "TERROR"; balda 2
   **sin postit** (continúa terror); balda 3 con postit "CIENCIA FICCIÓN". Listón del
   ancho justo para 20. Sin números en los lomos. Botón "+ Añadir balda" al final.
2. **Home — hueso** (misma escena, tema claro).
3. **Búsqueda abierta:** desplegable de resultados sobre la estantería.
4. **Estuche seleccionado:** VHS al centro, girado ~26°, lomo a la izquierda de la
   portada, fondo atenuado, **ficha al lado**.
5. **Menú del avatar** desplegado (Ajustes / Compartir perfil / Tema / Cerrar sesión).
6. **Estantería vacía** (primer uso, sin postit).
7. **Perfil público** (`/u/[handle]`): misma escena read-only — sin buscador, sin
   "+ Añadir balda", sin menú de avatar, ficha sin botón de quitar.

Descartado: artboard de acento por balda (ver sección 7).

---

## 10. Modelo de datos: qué encaja y qué hay que añadir

**Encaja sin tocar el schema:**

- Balda ↔ fila de `shelves`. Orden de cintas ↔ `shelf_items.position` (`place_film`
  añade al final, `reorder_shelf` reescribe). Postit ↔ `shelves.name` +
  `shelves.accent_color`. "+ Añadir balda" ↔ `INSERT` en `shelves` (el cliente genera el
  `slug`). Librería ↔ `select … from shelves where owner = uid() order by created_at`.
  El cap de 20 ya está documentado como límite de cliente.

**Cambio de schema asumido (va en el spec de datos, después del prototipo):**

- Tabla **`profiles`**: `user_id` (PK, FK a `auth.users`), `handle` (único, drive de
  `/u/[handle]`), `display_name`, `avatar_url`. Es el hogar natural del avatar y el
  nombre que ya están en la cabecera, y lo que hace direccionable el perfil público.
- El perfil público lista `shelves` con `is_public = true` de ese `owner`; la RLS actual
  ("public or own shelves") ya permite la lectura anónima.

**Fuera de alcance de este prototipo:**

- La ruta `e/[slug]` por balda: se mantiene o se retira en v1 — se decide en el spec de
  datos. El foco de compartir es el perfil.
- Ajustes/edición del postit (renombrar balda, elegir color), edición del perfil.
- Drag-and-drop para reordenar lomos (existe en el modelo; el prototipo puede sugerirlo
  pero no es foco).
- Flujo de auth / magic link.

---

## 11. Invariantes del proyecto que el diseño respeta

- Renderizar la estantería **nunca** llama a TMDB; todo desde la caché `films`.
- Los pósters se sirven de `image.tmdb.org`, **no se rehospedan**.
- El color del lomo se calcula **una vez** y no se recalcula.
- La clave de TMDB nunca llega al navegador.
