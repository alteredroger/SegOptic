# SegOptic

Herramienta web (estática, sin servidor) de diseño óptico para el **telescopio Cassegrain segmentado en anillo**: trazado de rayos real, frente de onda, PSF/MTF, optimización, y simulación de co-faseo con sensores de borde.

Funciona entera en el navegador: abre `index.html` o publícala con GitHub Pages.

## Publicar en GitHub Pages

1. Crea un repositorio (p. ej. `segoptic`) y sube **todos** los archivos de esta carpeta a la raíz: `index.html`, `style.css`, `optics.js`, `app.js`, `.nojekyll`, `README.md`.
2. En el repo: **Settings → Pages → Build and deployment → Source: Deploy from a branch**, rama `main`, carpeta `/ (root)` → Save.
3. Al cabo de un minuto estará en `https://<usuario>.github.io/segoptic/`.

Para usarla en local basta con abrir `index.html` (no necesita servidor).

## Qué hace

| Pestaña | Contenido |
|---|---|
| Resumen | EFL, F/#, Ø equivalente, área, escala de placa, hueco entre segmentos, avisos, spot RMS por campo, prescripción |
| Layout 2D | Corte YZ con rayos por campo, segmentos resaltados, zoom al foco |
| Spot | Diagramas policromáticos por campo, RMS/GEO, círculo de Airy |
| Frente de onda | Mapa OPD, PV/RMS, Strehl (Maréchal), estadísticas por segmento |
| PSF / MTF | PSF por FFT con la pupila segmentada real, Strehl, energía encerrada, MTF tangencial/sagital vs difracción |
| Segmentos y co-faseo | Errores pistón/tip/tilt/ΔROC por segmento (en el trazado real), SVD de sensores de borde, modos ciegos (con inyección), lazo cerrado con ruido, cuantización de actuador, deriva y calibración de pupila completa |
| Optimización | Nelder–Mead sobre radios/espesores/cónicas marcados con «V»; mérito = spot RMS + EFL objetivo |
| Herramientas | Solver Cassegrain (esférico, clásico, RC, Dall–Kirkham), resolución de actuador (husillo × micropasos), Monte Carlo de tolerancias de segmento |

Los diseños se guardan automáticamente en el navegador y se pueden exportar/importar como `.json` (para compartir entre el equipo) o como prescripción `.txt`.

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
- Sólo superficies cónicas (sin asferas pares, sin descentrados/inclinaciones de elementos completos todavía).
- PSF/MTF monocromáticas y fiables cuando el RMS de frente de onda ≲ 1 λ; para diseños lejos de difracción usar Spot.
- El modelo de sensores de borde es lineal (Δz en la posición del sensor); no modela deriva térmica del propio sensor ni acoplamiento con el hueco.
- El optimizador es Nelder–Mead (robusto pero lento con muchas variables); para el corrector final conviene validar en `rayoptics`/Zemax.

## Estructura

- `optics.js` — motor (sin dependencias, también se puede usar desde Node: `require('./optics.js')`).
- `app.js` — interfaz.
- `style.css`, `index.html`.
