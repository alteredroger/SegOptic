# SegOptic

Herramienta web (estática, sin servidor) de diseño óptico para el **telescopio Cassegrain segmentado en anillo**: trazado de rayos real, frente de onda, PSF/MTF, optimización, y simulación de co-faseo con sensores de borde.

Funciona entera en el navegador: abre `index.html` o publícala con GitHub Pages.

## Publicar en GitHub Pages

1. Crea un repositorio (p. ej. `segoptic`) y sube **todos** los archivos de esta carpeta a la raíz: `index.html`, `style.css`, `optics.js`, `designs.js`, `app.js`, `.nojekyll`, `README.md`.
2. En el repo: **Settings → Pages → Build and deployment → Source: Deploy from a branch**, rama `main`, carpeta `/ (root)` → Save.
3. Al cabo de un minuto estará en `https://<usuario>.github.io/segoptic/`.

Para usarla en local basta con abrir `index.html` (no necesita servidor).

## Qué hace

## Nuevo telescopio (asistente)

El botón **Nuevo telescopio…** de la cabecera genera un sistema completo a partir de unos pocos datos (apertura, focal o F/#, tamaño del sensor, banda…):

| Grupo | Tipos |
|---|---|
| Reflectores | Foco primario · Newtoniano (diagonal dimensionada para el sensor) · Cassegrain clásico · Ritchey–Chrétien · Dall–Kirkham · Pressmann–Camichel · Cassegrain todo esférico · Gregoriano. Opción de primario segmentado en anillo |
| Catadióptricos | Cámara Schmidt (superficie focal curva) · Schmidt–Cassegrain · Maksutov–Cassegrain (secundario aluminizado en el menisco) |
| Refractores | Lente simple · Acromático (doblete cementado) · Apocromático (triplete, elección automática de vidrios) · Astrógrafo Petzval |

Los tipos que lo necesitan (catadióptricos y refractores) se afinan automáticamente al crearlos (Nelder–Mead sobre curvaturas, asferas y separaciones, con la focal y el foco trasero como restricciones). Las cónicas de Dall–Kirkham, Pressmann–Camichel y Gregoriano se resuelven para anular la esférica en eje. El resultado queda en el editor con sus variables marcadas, listo para seguir optimizando.

## Superficies asféricas

Además de la cónica, cada superficie admite coeficientes asféricos pares: sag = cónica + A4·r⁴ + A6·r⁶ + A8·r⁸ (como «Even Asphere» en Zemax). Se muestran con la casilla **Asféricos** del editor, se editan también en el inspector y pueden marcarse como variables de optimización.

| Pestaña | Contenido |
|---|---|
| Validación | Semáforo de cumple/no cumple frente a requisitos editables: EFL, F/#, foco tras el primario, EE80 geométrico vs presupuesto de seeing, uniformidad, Strehl central, curvatura de campo, color axial y lateral, distorsión, viñeteo, fabricabilidad (espesores centro/borde, materiales, radios), comparación con RC/clásico, y tolerancias (sensibilidad uno a uno + Monte Carlo con reenfoque) |
| Descentrados | Descentrado Δx/Δy, desplazamiento Δz e inclinaciones de cualquier elemento o grupo como sólido rígido, con pivote configurable (vértice, centro de curvatura…); efecto frente al nominal y barrido de sensibilidad con tolerancia para el presupuesto |
| Banco óptico | Editor visual 2D/3D: seleccionar, mover (con compensación de espesores), cambiar semi-Ø, curvar perfiles, insertar elementos con un clic sobre el haz, inspector con deslizadores y métricas en vivo |
| Resumen | EFL, F/#, Ø equivalente, área, escala de placa, hueco entre segmentos, avisos, spot RMS por campo, prescripción |
| Layout 2D | Corte YZ con rayos por campo, segmentos resaltados, zoom al foco |
| Spot | Diagramas policromáticos por campo, RMS/GEO, círculo de Airy |
| Frente de onda | Mapa OPD, PV/RMS, Strehl (Maréchal), estadísticas por segmento |
| PSF / MTF | PSF por FFT con la pupila segmentada real, Strehl, energía encerrada, MTF tangencial/sagital vs difracción |
| Segmentos y co-faseo | Errores pistón/tip/tilt/ΔROC por segmento (en el trazado real), SVD de sensores de borde, modos ciegos (con inyección), lazo cerrado con ruido, cuantización de actuador, deriva y calibración de pupila completa |
| Optimización | Nelder–Mead sobre radios/espesores/cónicas marcados con «V»; mérito = spot RMS + EFL objetivo |
| Herramientas | Solver Cassegrain (esférico, clásico, RC, Dall–Kirkham), resolución de actuador (husillo × micropasos), Monte Carlo de tolerancias de segmento |

Los diseños se guardan automáticamente en el navegador y se pueden exportar/importar como `.json` (para compartir entre el equipo) o como prescripción `.txt`.

## Banco óptico (edición interactiva)

- **Seleccionar:** clic en una superficie del dibujo, en los botones STO/2/3/IMA del inspector o en una fila de la tabla (las tres vistas están sincronizadas).
- **Mover:** arrastra el vértice ■ (o el perfil, en modo *Mover*). Se compensan el espesor anterior y el siguiente, así que el resto del sistema no se desplaza. Mayús = pasos de 1 mm.
- **Semi-diámetro:** arrastra los puntos ● del borde.
- **Curvar:** en modo *Curvar*, arrastra el perfil; el radio pasa a ser el de la esfera que contiene el vértice y el punto del ratón.
- **Añadir:** elige *Lente, Menisco, Doblete, Placa, Espejo plano, Espejo esf.* o *Ficticia* y haz clic sobre el haz. Se coloca en ese punto exacto, con el semi-Ø ajustado a la huella del haz (+10 %). Mayús+clic para insertar varios. Los espejos insertados reflejan el resto del sistema, de modo que la óptica posterior sigue siendo equivalente (útil para diagonales de pliegue).
- **Inspector:** radio/espesor/cónica con deslizador (recentrado al soltar), material con lista de vidrios, z del vértice, huella del haz, flecha en el borde (útil para fabricar) y potencia de la superficie.
- **3D:** arrastra para orbitar, rueda para zoom. Muestra cada segmento del anillo.
- **Deshacer / rehacer:** Ctrl+Z / Ctrl+Y (o Ctrl+Mayús+Z), también con los botones del editor. **Supr** elimina la superficie seleccionada.

## Validación: criterios

- **EE80 geométrico** (diámetro que encierra el 80 % de la energía, solo aberraciones del diseño) ≤ *fracción × seeing* (por defecto 0,5 × 2″ = 1″). La difracción de la pupila en anillo (≈1,5″ EE80 para segmentos Ø150, la fija λ/d del segmento) se muestra aparte porque no depende del diseño óptico.
- **Imagen entregada** ≈ √(seeing² + difracción² + diseño²), con EE80 de seeing gaussiano = 1,52 × FWHM; la uniformidad borde/centro se evalúa sobre ella.
- **Profundidad de foco** del presupuesto = F/# × presupuesto (µm); curvatura de campo y color axial deben caber dentro.
- **Strehl central** (opcional, planetaria) por Maréchal en eje y a ±R mm, con los segmentos como estén en su tabla.
- **Tolerancias:** parten del diseño nominal (sin descentrados, segmentos a cero); errores uniformes en ±tolerancia (descentrado/inclinación con dirección aleatoria); compensador = plano imagen. El WFE en eje se mide enfocando en el eje.

## Descentrados: convenciones

- Cada grupo (superficies *de*–*a*) se mueve como un sólido: mundo = P + R·(q − P) + d, con P = vértice de la primera superficie + pivote Δz, R = Ry(tilt Y)·Rx(tilt X) en grados y d = (Δx, Δy, Δz).
- Δz desplaza el elemento sin mover el resto (equivale a cambiar el espesor anterior y el siguiente a la vez).
- Las aperturas (semi-Ø, agujero) se mueven con el elemento.
- Botón **CC**: pivote en el centro de curvatura. Para una esfera, girar alrededor de su centro no cambia nada; para un secundario asférico deja solo la coma, sin desapuntar.
- ΔROC de segmento: cónica madre con |R| + ΔR (misma constante cónica) que pasa por el centro del segmento y realineada en tip/tilt.

## Convenciones (tipo Zemax)

- Unidades mm; λ en µm; ángulos de campo en grados (eje Y).
- Radio con signo: el centro de curvatura está en `z_vértice + R`. `Infinity` = plano. Primario y secundario de un Cassegrain son ambos negativos.
- Espesor = distancia en z hasta el siguiente vértice; negativo tras un espejo que devuelve la luz.
- Material = medio **después** de la superficie: `MIRROR`, vacío/`AIR`, un vidrio del catálogo (`N-BK7`, `F_SILICA`, `N-F2`, `N-SF11`, `N-SK16`, `CAF2`), un modelo `nd/Vd` (p. ej. `1.5168/64.17`) o un índice constante.
- La superficie 1 es el stop / pupila de entrada (el primario). Objeto en el infinito.
- Errores de segmento: `p` pistón de superficie [nm] (⇒ 2p en frente de onda), `tx = dz/dx`, `ty = dz/dy` [µrad] alrededor del centro del segmento, `ΔROC` [mm] (segmento esférico de radio |R|+ΔR tangente en su centro).

## Validación del motor

Comprobado contra casos con solución conocida:

- Cassegrain clásico (K1 = −1, K2 hiperbólico): spot y OPD en eje = 0 (estigmático), con coma creciente fuera de eje.
- Ritchey–Chrétien con las cónicas analíticas: en eje ≈ 0, y coma fuera de eje reducida a menos de la mitad que el clásico.
- EFL / foco: coinciden con el solver paraxial de dos espejos (EFL 2940 mm, foco 250 mm tras el primario).
- Tilt de 1 µrad en un segmento Ø150: 75 nm RMS de frente de onda (analítico 2·1µrad·75mm/2 = 75 nm).
- ΔROC = 1 mm en un segmento esférico R 2425: 1,80 λ PV (analítico ≈ 1,74 λ).

## Limitaciones conocidas

- Trazado secuencial: el paso de la luz por el agujero central se modela con una superficie ficticia («Plano del primario») y el bloqueo del secundario con la «Obstrucción Ø» de la pupila.
- Superficies cónicas con términos asféricos pares hasta r⁸; sin superficies libres ni descentradas fuera de eje (off-axis).
- La diagonal de un newtoniano se modela desplegada sobre el eje (un espejo plano no añade aberraciones); su sombra está en la obstrucción.
- PSF/MTF monocromáticas y fiables cuando el RMS de frente de onda ≲ 1 λ; para diseños lejos de difracción usar Spot.
- El modelo de sensores de borde es lineal (Δz en la posición del sensor); no modela deriva térmica del propio sensor ni acoplamiento con el hueco.
- El optimizador es Nelder–Mead (robusto pero lento con muchas variables); para el corrector final conviene validar en `rayoptics`/Zemax.

## Estructura

- `designs.js` — generadores de telescopios del asistente.
- `optics.js` — motor (sin dependencias, también se puede usar desde Node: `require('./optics.js')`).
- `app.js` — interfaz.
- `style.css`, `index.html`.
