# Plan: Simulación 3D del Perseverance (Vite + Three.js)

## Contexto

- Carpeta de trabajo: `perseverance-opencode` (vacía), dentro de `My_Cursos/CURSO-CLAUDE-PLATZI`.
- En el proyecto padre ya existe una simulación completa con Vite + Three.js
  (`src/main.js`, ~1000 líneas), un `public/models/perseverance.glb` de la NASA y un
  script de verificación `npm run check` (Playwright headless + capturas).
- Objetivo: crear un modelo 3D del rover Perseverance de la NASA y simularlo en un
  ambiente marciano, con proyecto limpio y modular.

## Decisiones pendientes de confirmar

| Pregunta | Opciones | Estado |
|---|---|---|
| Modelo del rover | (A) Desde cero con geometrías Three.js · (B) Cargar GLB de la NASA · (C) Híbrido | Pendiente (recomendado: A) |
| Ubicación | Carpeta nueva `perseverance-opencode` · Proyecto padre | Confirmado: carpeta nueva |
| Alcance | Completa (conducción + suspensión + huellas) · Visual primero · Solo turntable | Pendiente (recomendado: completa) |

## Fase 0 — Decisiones de alcance (5 min)

- Confirmar cómo se modela el rover: desde cero o cargando el GLB existente.
- Confirmar nivel de simulación: recorrido básico / conducción completa con suspensión.

## Fase 1 — Scaffold y esqueleto visual (~30 min)

- `npm create vite@latest . -- --template vanilla` + `npm i three`.
- Estructura modular en lugar de un único `main.js`:

```
src/
  main.js                 # arranque y loop
  core/renderer.js        # WebGLRenderer, cámara, resize
  core/lighting.js        # sol marciano, ambiente, sombras
  world/terrain.js        # terreno procedural (fBm)
  world/sky.js            # cielo caramelo + sol + polvo
  world/rocks.js          # rocas instanciadas
  rover/                  # el modelo
    chassis.js
    wheels.js
    suspension.js
    mast.js
    arm.js
    materials.js          # aluminio, Kapton dorado, paneles
    controller.js         # conducción
  ui/hud.js
```

- Escena mínima visible: piso, luz, cámara orbital (`OrbitControls`), loop con
  `requestAnimationFrame`.
- Verificación: `npm run dev` + captura automática con Playwright.

## Fase 2 — Modelado del rover (~2-3 h)

Construcción con primitivas y jerarquía de grupos, respetando las proporciones reales
(3 m largo × 2.7 m ancho × 2.2 m alto, 1024 kg):

| Pieza | Técnica |
|---|---|
| Chasis (WAR) | Caja biselada + paneles, gris metálico |
| 6 ruedas | `CylinderGeometry` + garras (grousers) instanciadas + textura de banda de rodadura |
| Suspensión rocker-bogie | Vigas articuladas: balancín frontal/trasero + bogie con 2 ruedas |
| Mástil (RSS) | Cilindro + cabeza con Mastcam-Z y SuperCam |
| RTG (MMRTG) | Cilindro con aletas radiales, negro mate |
| Antena HGA | Hexágono plano inclinado |
| Brazo robótico | Cadena de cilindros con articulaciones |

- Materiales PBR (`MeshStandardMaterial`): `metalness` alto en aluminio, `roughness`
  alto en Kapton dorado.
- Todo generado por código, sin dependencias de assets externos (salvo que se elija el GLB).
- Verificación: captura con el rover en turntable y comparación visual con fotos de la NASA.

## Fase 3 — Conducción y física cinemática (~1-2 h)

- Control WASD/flechas: velocidad diferencial izquierda/derecha, giro sobre el centro.
- Suspensión adaptativa: un `Raycaster` por rueda contra el terreno; cada rueda sube/baja
  y el chasis se inclina (pitch/roll).
- Rotación de ruedas proporcional al avance; huellas persistentes en el suelo.
- Colisiones simples con rocas grandes y partículas de polvo al rodar.

## Fase 4 — Ambiente marciano (~1-2 h)

- Terreno con ruido fBm + crestas de dunas; color por altura/pendiente.
- Cielo con gradiente caramelo, halo del sol, niebla y partículas de polvo.
- Sol bajo cálido + sombras suaves (PCFSoft), tone mapping ACES.
- Rocas con `IcosahedronGeometry` deformada e `InstancedMesh` para rendimiento.

## Fase 5 — UI y pulido (~1 h)

- HUD: velocidad, inclinación, coordenadas y controles.
- Cámara: orbital libre + modo seguimiento del rover.
- Presets de calidad (sombras/partículas) y diseño responsive.
- Post-proceso ligero: bloom suave y viñeta.

## Fase 6 — Verificación y entrega (~30 min)

- Script `npm run check` (Playwright headless): abre la app, captura pantalla, reporta
  errores de consola y falla si hay `pageerror`.
- Checklist: 60 fps, sin errores de consola, rover completo visible, terreno y cielo
  correctos, controles funcionando.
- `README.md` con instrucciones y decisiones de diseño.

## Criterio de terminado

`npm run dev` levanta la simulación, el Perseverance se puede conducir sobre un terreno
marciano con la suspensión funcionando, y `npm run check` genera capturas sin errores.
