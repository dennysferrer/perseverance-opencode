import * as THREE from 'three';

// Nombres de cámara en la API NASA (instrumento real publicado por la NASA).
const CAMERA_API_NAMES = {
  mastcam_z: 'MCZ_LEFT', // Mastcam-Z izquierda
  nav: 'NAVCAM_LEFT', // Navcam izquierda
  hazcam_front: 'NAVCAM_RIGHT', // Navcam derecha (la frontal de la torre)
  // WATSON es una macro en el brazo: se combina con la Mastcam derecha,
  // quetambién fotografía el brazo robótico apoyado sobre el suelo.
  watson: 'SHERLOC_WATSON|MCZ_RIGHT',
};

// Etiquetas visibles para el usuario.
const CAMERA_LABELS = {
  mastcam_z: 'Mastcam-Z',
  nav: 'Navcams',
  hazcam_front: 'Hazcam frontal',
  watson: 'WATSON',
};

const NASA_ORIGIN = 'https://mars.nasa.gov';
// En desarrollo se usa el proxy de Vite (mismo origen, sin CORS ni bloqueos).
const USE_PROXY = import.meta.env.DEV;

/** URL del endpoint de la API con el filtro de cámara. */
function nasaApiUrl(cameraKey, page = 0) {
  const apiName = CAMERA_API_NAMES[cameraKey];
  const qs =
    `feed=raw_images&category=mars2020&feedtype=json&ver=1.2&num=100&page=${page}` +
    `&order=sol+desc&search=%7C${apiName}%7C`;
  return USE_PROXY
    ? `/nasa-api/?${qs}`
    : `${NASA_ORIGIN}/rss/api/?${qs}`;
}

/** Convertir una URL de imagen de la NASA al proxy local (solo en dev). */
function nasaImageUrl(url) {
  if (!url || !USE_PROXY) return url;
  return url.startsWith(NASA_ORIGIN) ? url.replace(NASA_ORIGIN, '/nasa-img') : url;
}

// Estado de la galería de fotos.
let photoState = {
  activeCamera: null,
  photos: [],
  currentIndex: 0,
  loading: new Set(),
  error: null,
  modal: null,
  photoEl: null,
  infoEl: null,
  flashEl: null,
  overlay: null,
  currentImageSrc: null,
  rover: null,
  camera: null,
  renderer: null,
  // Referencias a elementos del DOM del sidebar
  sidebar: null,
  sidebarToggle: null,
  sidebarSections: null,
  thumbnailContainers: null,
};

// Inicializar el visor de fotos de cámaras y sidebar.
export function initCameraPhotos(rover, scene, camera, renderer) {
  photoState.rover = rover;
  photoState.scene = scene;
  photoState.camera = camera;
  photoState.renderer = renderer;

  // Referencias al DOM.
  const sidebar = document.getElementById('camera-sidebar');
  const sidebarToggle = document.querySelector('.sidebar-toggle');
  const sidebarSections = document.querySelectorAll('.sidebar-section');
  const thumbnailContainers = {
    mastcam: document.getElementById('mastcam-thumbnails'),
    nav: document.getElementById('nav-thumbnails'),
    hazcam: document.getElementById('hazcam-thumbnails'),
    watson: document.getElementById('watson-thumbnails'),
  };

  // Alternar sidebar.
  sidebarToggle.addEventListener('click', () => {
    sidebar.classList.toggle('active');
  });

  // Cerrar sidebar al hacer clic fuera.
  sidebar.addEventListener('click', (e) => {
    if (e.target === sidebar) {
      sidebar.classList.remove('active');
    }
  });

  // Crear modal y elementos principales.
  const modal = document.createElement('div');
  modal.style.position = 'fixed';
  modal.style.inset = '0';
  modal.style.background = 'rgba(0,0,0,0.9)';
  modal.style.zIndex = '200';
  modal.style.display = 'none';
  modal.style.justifyContent = 'center';
  modal.style.alignItems = 'center';
  modal.style.flexDirection = 'column';
  document.body.appendChild(modal);

  const photoEl = document.createElement('img');
  photoEl.style.maxWidth = '90vw';
  photoEl.style.maxHeight = '80vh';
  photoEl.style.objectFit = 'contain';
  photoEl.style.transition = 'opacity 0.3s';
  photoEl.style.opacity = '0';
  modal.appendChild(photoEl);

  const infoEl = document.createElement('div');
  infoEl.style.marginTop = '12px';
  infoEl.style.color = '#ffe6cd';
  infoEl.style.fontFamily = 'ui-monospace, monospace';
  infoEl.style.fontSize = '11px';
  infoEl.style.minWidth = '200px';
  infoEl.style.padding = '8px 12px';
  infoEl.style.background = 'rgba(0,0,0,0.5)';
  infoEl.style.borderRadius = '6px';
  modal.appendChild(infoEl);

  const closeBtn = document.createElement('button');
  closeBtn.style.marginTop = '12px';
  closeBtn.style.padding = '6px 12px';
  closeBtn.style.background = 'rgba(255,176,102,0.2)';
  closeBtn.style.border = '1px solid #ffb066';
  closeBtn.style.color = '#ffb066';
  closeBtn.style.borderRadius = '4px';
  closeBtn.style.cursor = 'pointer';
  closeBtn.style.fontFamily = 'inherit';
  closeBtn.textContent = 'Cerrar';
  closeBtn.addEventListener('click', closeCameraPhoto);
  modal.appendChild(closeBtn);

  const overlay = document.createElement('div');
  overlay.style.position = 'fixed';
  overlay.style.inset = '0';
  overlay.style.background = 'rgba(0,0,0,0.95)';
  overlay.style.zIndex = '300';
  overlay.style.display = 'none';
  overlay.style.cursor = 'zoom-out';
  document.body.appendChild(overlay);

  document.addEventListener('keydown', handleKeyDown);
  overlay.addEventListener('click', () => {
    // Vuelve al modal (ampliación → vista normal).
    overlay.style.display = 'none';
  });

  // Estado accesible para la verificación automática.
  window.__cameraPhotos = photoState;
  window.__analyzeImage = analyzeImage;

  // Guardar referencias
  photoState.modal = modal;
  photoState.photoEl = photoEl;
  photoState.infoEl = infoEl;
  photoState.overlay = overlay;
  photoState.sidebar = sidebar;
  photoState.sidebarToggle = sidebarToggle;
  photoState.sidebarSections = sidebarSections;
  photoState.thumbnailContainers = thumbnailContainers;

  setupCameraPicking(rover, camera, renderer);

  // Precarga en segundo plano: el click abre la foto al instante.
  Object.keys(CAMERA_API_NAMES).forEach((key) => {
    loadCameraPhotos(key);
  });
}

/**
 * Raycasting sobre los indicadores de cámara: hover (tooltip + agrandar)
 * y click (abrir la galería de esa cámara).
 */
function setupCameraPicking(rover, camera, renderer) {
  const dom = renderer.domElement;
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const tooltip = document.createElement('div');
  tooltip.style.position = 'fixed';
  tooltip.style.pointerEvents = 'none';
  tooltip.style.background = 'rgba(26,13,7,0.82)';
  tooltip.style.border = '1px solid rgba(255,176,102,0.28)';
  tooltip.style.borderRadius = '6px';
  tooltip.style.padding = '5px 10px';
  tooltip.style.fontSize = '10px';
  tooltip.style.color = '#ffe6cd';
  tooltip.style.textTransform = 'uppercase';
  tooltip.style.letterSpacing = '0.08em';
  tooltip.style.opacity = '0';
  tooltip.style.transition = 'opacity 0.15s';
  tooltip.style.zIndex = '100';
  tooltip.style.whiteSpace = 'nowrap';
  tooltip.style.transform = 'translate(-50%, -140%)';
  document.body.appendChild(tooltip);

  const pick = (event) => {
    const rect = dom.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(rover.cameraIndicators.map((i) => i.indicator), false);
    if (!hits.length) return null;

    // Los halos pueden solaparse: se elige el más cercano al puntero en píxeles.
    let best = hits[0].object;
    let bestDist = Infinity;
    for (const hit of hits) {
      const wp = hit.object.getWorldPosition(new THREE.Vector3());
      const sp = wp.clone().project(camera);
      const sx = rect.left + ((sp.x + 1) / 2) * rect.width;
      const sy = rect.top + ((-sp.y + 1) / 2) * rect.height;
      const dist = (sx - event.clientX) ** 2 + (sy - event.clientY) ** 2;
      if (dist < bestDist) {
        bestDist = dist;
        best = hit.object;
      }
    }
    return best;
  };

  let hovered = null;

  const setHover = (indicator, event) => {
    if (hovered === indicator) {
      if (indicator && event) {
        tooltip.style.left = `${event.clientX}px`;
        tooltip.style.top = `${event.clientY}px`;
      }
      return;
    }
    if (hovered) hovered.userData.hovered = false;
    hovered = indicator;
    if (hovered) {
      hovered.userData.hovered = true;
      const data = rover.cameraData[hovered.userData.name];
      tooltip.textContent = data ? data.name : hovered.userData.name;
      tooltip.style.left = `${event.clientX}px`;
      tooltip.style.top = `${event.clientY}px`;
      tooltip.style.opacity = '1';
      dom.style.cursor = 'pointer';
    } else {
      tooltip.style.opacity = '0';
      dom.style.cursor = '';
    }
  };

  dom.addEventListener('pointermove', (event) => {
    setHover(pick(event), event);
  });

  dom.addEventListener('pointerleave', () => {
    setHover(null);
  });

  dom.addEventListener('click', (event) => {
    const indicator = pick(event);
    if (!indicator) return;
    const side = indicator.userData.name;
    openCameraPhoto(side);
  });
}

// Cargar fotos para una cámara.
async function loadCameraPhotos(cameraKey) {
  if (photoState.loading.has(cameraKey)) return;
  const apiName = CAMERA_API_NAMES[cameraKey];
  if (!apiName) return;

  photoState.loading.add(cameraKey);

  try {
    // Tres páginas para tener variedad de objetivos (no solo las últimas tomas).
    const responses = await Promise.all([
      fetch(nasaApiUrl(cameraKey, 0)),
      fetch(nasaApiUrl(cameraKey, 1)),
      fetch(nasaApiUrl(cameraKey, 2)),
    ]);

    const images = [];
    for (const res of responses) {
      if (!res.ok) continue;
      const data = await res.json();
      if (data.images) images.push(...data.images);
    }

    const picked = await pickInterestingImages(images);

    if (picked.length > 0) {
      photoState.photos.push({
        cameraKey,
        photos: picked,
      });
      // Poblar el sidebar con miniaturas de esta cámara.
      populateSidebarThumbnails(cameraKey, picked.slice(0, 6));
    }
  } catch (err) {
    console.error('[camera-photos] Error:', err);
    photoState.error = err.message;
  } finally {
    photoState.loading.delete(cameraKey);
  }
}

const SKIP_RE =
  /sky|star|\bsun\b|calib|calibration|dark|blank|test|focus|checker|ghost|thumbnail|micro|target|logo|plaque|artifact|wheel\b/i;
const GOOD_RE = /horizon|ground|surface|terrain|rock|arm|delta|crater|dune|landscape|rim|soil/i;

/**
 * Puntuar el contenido real de la imagen: mide el cielo sobre el horizonte
 * y el detalle (texturas/rocas). Así se eligen fotos de paisaje de Marte
 * y no primer planos borrosos ni tomas de calibración.
 */
async function pickInterestingImages(images) {
  // 1) Preselección rápida por metadatos (sin descargar nada).
  const preselected = [];
  for (const img of images) {
    const text = `${img.caption || ''} ${img.title || ''}`;
    if (SKIP_RE.test(text)) continue;

    const el = parseFloat(img.extended?.mastEl);
    if (!Number.isNaN(el) && (el > 62 || el < -78)) continue;

    let score = 0;
    if (GOOD_RE.test(text)) score += 3;
    if (img.sample_type === 'Full') score += 1;
    if (!Number.isNaN(el) && el > -40 && el < -4) score += 3; // con horizonte

    preselected.push({ img, score });
  }
  preselected.sort((a, b) => b.score - a.score || b.img.sol - a.img.sol);

  // Diversidad: la API devuelve 100 tomas del mismo sol (mismo objetivo).
  // Se reparten las candidatas entre varios soles para obtener escenas distintas.
  const bySol = new Map();
  for (const cand of preselected) {
    const sol = cand.img.sol;
    if (!bySol.has(sol)) bySol.set(sol, []);
    bySol.get(sol).push(cand);
  }
  const sols = [...bySol.keys()].sort((a, b) => b - a);
  const candidates = [];
  let round = 0;
  while (candidates.length < 72 && round < 24) {
    for (const sol of sols) {
      const list = bySol.get(sol);
      if (list[round]) candidates.push(list[round]);
      if (candidates.length >= 72) break;
    }
    round++;
  }

  // 2) Análisis real del contenido de las candidatas (en paralelo).
  const visions = await mapLimit(candidates, 10, async (cand) => {
    const src = nasaImageUrl(cand.img.image_files?.small || cand.img.image_files?.medium);
    return analyzeImage(src);
  });

  const scored = [];
  for (let i = 0; i < candidates.length; i++) {
    const cand = candidates[i];
    const vision = visions[i];

    // Las tomas en blanco y negro (calibración) no valen.
    if (!vision || vision.color < 0.09) continue;
    // Targets de calibración: paneles azules/verdes que no existen en Marte.
    if (vision.blue > 0.012) continue;
    // Objetos artificiales (cuerpo del rover, blanco brillante).
    if (vision.artificial > 0.1) continue;
    // El fuselaje del rover o piezas metálicas en primer plano.
    if (vision.rover > 0.1 || vision.gray > 0.45 || vision.dark > 0.3) continue;

    let score = cand.score;
    // El "cielo" solo cuenta si la imagen no es un objeto del rover.
    if (vision.artificial < 0.05) score += Math.min(6, Math.round(vision.sky * 6));
    score += Math.min(4, Math.round(vision.detail * 4)); // textura / rocas
    score += vision.contrast * 3; // contraste del paisaje
    score += Math.min(3, vision.color * 6); // a color, bien saturado

    scored.push({ img: cand.img, score });
  }

  scored.sort((a, b) => b.score - a.score || b.img.sol - a.img.sol);

  // Diversidad: la NASA publica ráfagas de la misma toma (mismo sclk).
  // Se queda con la mejor de cada instante distinto.
  const seen = new Set();
  const unique = [];
  for (const cand of scored) {
    const key = cand.img.extended?.sclk || cand.img.imageid;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(cand);
  }

  const picked = unique.slice(0, 12);
  for (const p of picked) p.img._score = p.score;
  return picked.map((s) => s.img);
}

/** Ejecutar tareas en paralelo con un límite de concurrencia. */
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let index = 0;

  const worker = async () => {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i]);
    }
  };

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** Analizar una imagen: proporción de cielo y detalle (varianza). */
function analyzeImage(src) {
  return new Promise((resolve) => {
    if (!src) return resolve({ sky: 0, detail: 0, contrast: 0 });
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const W = 48;
      const H = 36;
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, W, H);
      let data;
      try {
        data = ctx.getImageData(0, 0, W, H).data;
      } catch {
        return resolve({ sky: 0, detail: 0, contrast: 0 });
      }

      // Cielo: la franja superior más brillante que la inferior.
      let topLum = 0;
      let botLum = 0;
      let topN = 0;
      let botN = 0;
      const lums = [];
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const i = (y * W + x) * 4;
          const l = (data[i] * 0.3 + data[i + 1] * 0.59 + data[i + 2] * 0.11) / 255;
          lums.push(l);
          if (y < H * 0.28) {
            topLum += l;
            topN++;
          } else if (y > H * 0.72) {
            botLum += l;
            botN++;
          }
        }
      }
      const t = topLum / Math.max(1, topN);
      const b = botLum / Math.max(1, botN);
      const sky = Math.max(0, Math.min(1, (t - b) * 3 + (t > 0.55 ? 0.25 : 0)));

      // Detalle: desviación típica de la luminancia.
      const mean = lums.reduce((a, v) => a + v, 0) / lums.length;
      const variance = lums.reduce((a, v) => a + (v - mean) ** 2, 0) / lums.length;
      const detail = Math.max(0, Math.min(1, (Math.sqrt(variance) - 0.05) * 6));

      // Saturación media: las tomas en blanco y negro (calibración) se descartan.
      let sat = 0;
      let artificial = 0;
      let bright = 0;
      let blue = 0;
      let roverWhite = 0;
      let gray = 0;
      let dark = 0;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const mx = Math.max(r, g, b);
        const mn = Math.min(r, g, b);
        const s = mx > 0 ? (mx - mn) / mx : 0;
        sat += s;
        // Colores muy saturados (blue/red de un target de calibración).
        if (s > 0.6) artificial++;
        // Blancos saturados (cuerpo del rover o paneles).
        if (mx > 225 && mn > 190) bright++;
        // Azul: no existe en la naturaleza marciana → es artificial.
        if (b > r + 22 && b > g + 12) blue++;
        // Blanco roto del fuselaje del rover.
        if (mx > 205 && s < 0.22) roverWhite++;
        // Gris metálico (piezas del rover, no hay gris en el suelo marciano).
        if (s < 0.12) gray++;
        // Oscuro: primer plano de una pieza del rover.
        if (mx < 85) dark++;
      }
      const px = W * H;
      sat /= px;

      resolve({
        sky,
        detail,
        color: sat,
        artificial: artificial / px + bright / px,
        blue: blue / px,
        rover: roverWhite / px,
        gray: gray / px,
        dark: dark / px,
        contrast: Math.max(0, Math.min(1, Math.sqrt(variance) * 3)),
      });
    };
    img.onerror = () => resolve({ sky: 0, detail: 0, contrast: 0 });
    img.src = src;
  });
}

// Poblar miniaturas en el sidebar.
function populateSidebarThumbnails(cameraKey, images) {
  const sectionMap = {
    mastcam_z: 'mastcam',
    nav: 'nav',
    hazcam_front: 'hazcam',
    watson: 'watson',
  };
  const sectionId = sectionMap[cameraKey];
  if (!sectionId) return;

  const container = photoState.thumbnailContainers[sectionId];
  if (!container) return;

  // Limpiar thumbnails anteriores
  container.innerHTML = '';

  // Agregar nuevas miniaturas
  images.forEach((img, i) => {
    const src = nasaImageUrl(img.image_files?.medium || img.image_files?.small);
    if (!src) return;

    const thumb = document.createElement('div');
    thumb.className = 'sidebar-thumbnail';
    thumb.style.backgroundImage = `url('${src}')`;
    thumb.title = `${img.sol} - ${img.title || ''}`;
    thumb.addEventListener('click', () => {
      openCameraPhoto(cameraKey, img);
    });
    container.appendChild(thumb);
  });

  // Mostrar todas las secciones que ya tengan contenido.
  photoState.sidebarSections.forEach((sec) => {
    const grid = sec.querySelector('div:last-child');
    sec.style.display = grid && grid.children.length ? 'block' : 'none';
  });

  // Mostrar el sidebar.
  photoState.sidebar.classList.add('active');
}

// Abrir foto de una cámara.
export function openCameraPhoto(cameraSide, photo = null) {
  photoState.activeCamera = cameraSide;

  const entry = photoState.photos.find(p => p.cameraKey === cameraSide);
  if (!entry || entry.photos.length === 0) {
    showLoading(cameraSide);
    loadCameraPhotos(cameraSide).then(() => {
      const e = photoState.photos.find(p => p.cameraKey === cameraSide);
      if (e && e.photos.length > 0) {
        showPhotoViewer(e.photos, 0);
      } else {
        showError(cameraSide);
      }
    });
    return;
  }
  if (photo) {
    const idx = entry.photos.indexOf(photo);
    showPhotoViewer(entry.photos, idx >= 0 ? idx : 0);
    return;
  }
  showPhotoViewer(entry.photos, 0);
}

/** Aviso de "descargando imagen" mientras llegan los datos. */
function showLoading(cameraSide) {
  photoState.modal.style.display = 'flex';
  photoState.photoEl.removeAttribute('src');
  photoState.photoEl.style.opacity = '0';
  photoState.infoEl.style.opacity = '1';
  photoState.infoEl.textContent =
    `${CAMERA_LABELS[cameraSide] || cameraSide} · descargando imágenes de la NASA…`;
}

/** Aviso de error si la API no responde. */
function showError(cameraSide) {
  photoState.modal.style.display = 'flex';
  photoState.photoEl.removeAttribute('src');
  photoState.photoEl.style.opacity = '0';
  photoState.infoEl.style.opacity = '1';
  photoState.infoEl.textContent =
    `${CAMERA_LABELS[cameraSide] || cameraSide} · no se pudo contactar con la NASA`;
}

// Mostrar visor de fotos con flash de obturador y revelado progresivo.
function showPhotoViewer(photos, index) {
  if (photos.length === 0) return;

  photoState.currentIndex = index;
  const photo = photos[index];

    const src = nasaImageUrl(
      photo.image_files?.large || photo.image_files?.full_res || photo.image_files?.medium
    );
    if (!src) return;

  photoState.currentImageSrc = src;

  // Flash de obturador.
  flashShutter();

  photoState.photoEl.src = src;
  photoState.photoEl.onload = () => {
    photoState.modal.style.display = 'flex';

    // Revelado progresivo: la foto aparece de golpe y se asienta.
    photoState.photoEl.style.transition = 'none';
    photoState.photoEl.style.opacity = '0';
    photoState.photoEl.style.transform = 'scale(1.04)';
    photoState.photoEl.offsetHeight; // reflow
    photoState.photoEl.style.transition = 'opacity 0.55s ease, transform 1.4s ease';
    photoState.photoEl.style.opacity = '1';
    photoState.photoEl.style.transform = 'scale(1)';

    photoState.infoEl.style.opacity = '0';
    requestAnimationFrame(() => {
      photoState.infoEl.style.transition = 'opacity 0.5s ease 0.2s';
      photoState.infoEl.style.opacity = '1';
    });

    updatePhotoInfo(photo);
  };

  // Clic en la foto → ampliación a pantalla completa.
  photoState.photoEl.onclick = () => {
    photoState.overlay.style.backgroundImage = `url('${src}')`;
    photoState.overlay.style.display = 'block';
    photoState.overlay.style.backgroundSize = 'contain';
    photoState.overlay.style.backgroundRepeat = 'no-repeat';
    photoState.overlay.style.backgroundPosition = 'center';
  };
}

/** Destello blanco del obturador. */
function flashShutter() {
  if (!photoState.flashEl) {
    photoState.flashEl = document.createElement('div');
    photoState.flashEl.style.position = 'fixed';
    photoState.flashEl.style.inset = '0';
    photoState.flashEl.style.background = '#fff';
    photoState.flashEl.style.opacity = '0';
    photoState.flashEl.style.pointerEvents = 'none';
    photoState.flashEl.style.zIndex = '400';
    document.body.appendChild(photoState.flashEl);
  }
  const el = photoState.flashEl;
  el.style.transition = 'none';
  el.style.opacity = '0.95';
  el.offsetHeight;
  el.style.transition = 'opacity 0.45s ease';
  el.style.opacity = '0';
}

// Actualizar información.
function updatePhotoInfo(photo) {
  const camName = CAMERA_LABELS[photoState.activeCamera] || 'Desconocida';
  const sol = photo.sol || '?';
  const taken = photo.date_taken_utc ? new Date(photo.date_taken_utc) : null;
  const date = taken ? taken.toLocaleDateString('es-ES') : '?';
  const daysAgo = taken
    ? Math.max(0, Math.floor((Date.now() - taken.getTime()) / 86400000))
    : '?';

  photoState.infoEl.innerHTML =
    `<strong>${camName}</strong> · Sol ${sol} · ${date} · Hace ${daysAgo} días`;
}

// Navegar anterior.
function showPrevPhoto() {
  const entry = photoState.photos.find(p => p.cameraKey === photoState.activeCamera);
  if (!entry) return;
  if (photoState.currentIndex > 0) {
    photoState.currentIndex--;
    showPhotoViewer(entry.photos, photoState.currentIndex);
  }
}

// Navegar siguiente.
function showNextPhoto() {
  const entry = photoState.photos.find(p => p.cameraKey === photoState.activeCamera);
  if (!entry) return;
  if (photoState.currentIndex < entry.photos.length - 1) {
    photoState.currentIndex++;
    showPhotoViewer(entry.photos, photoState.currentIndex);
  }
}

// Cerrar.
function closeCameraPhoto() {
  photoState.modal.style.display = 'none';
  photoState.photoEl.src = '';
  photoState.overlay.style.display = 'none';
  photoState.overlay.style.backgroundImage = '';
  photoState.activeCamera = null;
  photoState.currentIndex = 0;
  photoState.sidebar.classList.remove('active');
  document.body.style.cursor = '';
}

// Teclado.
function handleKeyDown(event) {
  if (event.key === 'Escape') closeCameraPhoto();
  else if (event.key === 'ArrowRight') showNextPhoto();
  else if (event.key === 'ArrowLeft') showPrevPhoto();
}