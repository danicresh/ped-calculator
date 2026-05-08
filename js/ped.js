const CATEGORY_BY_HEX = {
  "FF0000": { key: "IV", label: "Classe IV", rank: 4, css: "#ff0000" },
  "00BFFF": { key: "III", label: "Classe III", rank: 3, css: "#00bfff" },
  "FF7F00": { key: "II", label: "Classe II", rank: 2, css: "#ff7f00" },
  "FFFF00": { key: "I", label: "Classe I", rank: 1, css: "#ffff00" },
  "00FF00": { key: "ART33", label: "art. 3.3 / Art. 4(3) SEP", rank: 0, css: "#00ff00" },
  "C0DCC0": { key: "NA", label: "N.A.", rank: -1, css: "#c0dcc0" }
};

const CALIBRATION = {
  // Replica la logica Delphi originale:
  // X = 200 + log10(valore ascissa) * 100
  // Y = 500 - log10(PS) * 100
  xZero: 200,
  yZero: 500,
  pxPerDecade: 100,

  // Area grafico effettiva nelle immagini 632x695.
  xMin: 100,
  xMax: 594,
  yMin: 100,
  yMax: 596
};

const BOUNDARY_MAX_OFFSET_PX = 6;

const form = document.getElementById("pedForm");
const productEl = document.getElementById("product");
const stateEl = document.getElementById("state");
const groupEl = document.getElementById("fluidGroup");
const psEl = document.getElementById("ps");
const xValueEl = document.getElementById("xValue");
const boundaryModeEl = document.getElementById("boundaryMode");
const xValueLabelEl = document.getElementById("xValueLabel");
const tableNoEl = document.getElementById("tableNo");
const resultEl = document.getElementById("result");
const debugOutputEl = document.getElementById("debugOutput");
const visibleCanvas = document.getElementById("visibleCanvas");
const mapCanvas = document.getElementById("mapCanvas");
const visibleCtx = visibleCanvas.getContext("2d", { willReadFrequently: false });
const mapCtx = mapCanvas.getContext("2d", { willReadFrequently: true });

let currentTable = 0;
let currentViewImage = null;
let currentMapImage = null;
let lastMarker = null;

function tableFromSelection() {
  const product = productEl.value;
  const state = stateEl.value;
  const group = groupEl.value;

  if (product === "steam") return 5;

  if (product === "vessel") {
    if (state === "gas" && group === "1") return 1;
    if (state === "gas" && group === "2") return 2;
    if (state === "liquid" && group === "1") return 3;
    if (state === "liquid" && group === "2") return 4;
  }

  if (product === "pipe") {
    if (state === "gas" && group === "1") return 6;
    if (state === "gas" && group === "2") return 7;
    if (state === "liquid" && group === "1") return 8;
    if (state === "liquid" && group === "2") return 9;
  }

  return 1;
}

function updateControls() {
  const product = productEl.value;
  const isSteam = product === "steam";

  document.getElementById("stateWrap").style.display = isSteam ? "none" : "";
  document.getElementById("groupWrap").style.display = isSteam ? "none" : "";
  xValueLabelEl.textContent = product === "pipe" ? "DN [mm]" : "Volume [L]";

  const table = tableFromSelection();
  tableNoEl.textContent = table;
  loadImages(table);
}

function loadImages(tableNo) {
  if (currentTable === tableNo && currentViewImage && currentMapImage) {
    drawView(lastMarker);
    return;
  }

  currentTable = tableNo;
  currentViewImage = null;
  currentMapImage = null;
  lastMarker = null;

  const viewImg = new Image();
  viewImg.onload = () => {
    if (currentTable !== tableNo) return;
    currentViewImage = viewImg;
    visibleCanvas.width = viewImg.width;
    visibleCanvas.height = viewImg.height;
    drawView(lastMarker);
  };
  viewImg.src = `views/tab-${tableNo}_1.jpg`;

  const mapImg = new Image();
  mapImg.onload = () => {
    if (currentTable !== tableNo) return;
    currentMapImage = mapImg;
    mapCanvas.width = mapImg.width;
    mapCanvas.height = mapImg.height;
    mapCtx.clearRect(0, 0, mapImg.width, mapImg.height);
    mapCtx.drawImage(mapImg, 0, 0);
  };
  mapImg.src = `maps/tab-${tableNo}_0.png`;
}

function drawView(marker) {
  if (!currentViewImage) return;

  visibleCtx.clearRect(0, 0, visibleCanvas.width, visibleCanvas.height);
  visibleCtx.drawImage(currentViewImage, 0, 0);

  if (!marker) return;

  const { xReal, yReal, xRead, yRead } = marker;

  visibleCtx.save();

  // Punto tecnico reale: bianco con bordo nero, visibile su tutti i colori.
  visibleCtx.lineWidth = 3;
  visibleCtx.strokeStyle = "#111827";
  visibleCtx.fillStyle = "#ffffff";
  visibleCtx.beginPath();
  visibleCtx.arc(xReal, yReal, 8, 0, Math.PI * 2);
  visibleCtx.fill();
  visibleCtx.stroke();

  visibleCtx.lineWidth = 2;
  visibleCtx.beginPath();
  visibleCtx.moveTo(xReal - 14, yReal);
  visibleCtx.lineTo(xReal + 14, yReal);
  visibleCtx.moveTo(xReal, yReal - 14);
  visibleCtx.lineTo(xReal, yReal + 14);
  visibleCtx.stroke();

  // Pixel letto sulla mappa tecnica, se differente dal punto reale.
  if (Number.isFinite(xRead) && Number.isFinite(yRead)) {
    visibleCtx.fillStyle = "#111827";
    visibleCtx.beginPath();
    visibleCtx.arc(xRead, yRead, 3, 0, Math.PI * 2);
    visibleCtx.fill();
  }

  visibleCtx.restore();
}

function log10(value) {
  return Math.log(value) / Math.LN10;
}

function valueToXReal(value) {
  return CALIBRATION.xZero + log10(value) * CALIBRATION.pxPerDecade;
}

function psToYReal(ps) {
  return CALIBRATION.yZero - log10(ps) * CALIBRATION.pxPerDecade;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function toHex(r, g, b) {
  return [r, g, b]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

function pixelHexAt(x, y) {
  if (!currentMapImage) return null;

  const xi = Math.round(x);
  const yi = Math.round(y);

  if (xi < 0 || yi < 0 || xi >= mapCanvas.width || yi >= mapCanvas.height) {
    return null;
  }

  const data = mapCtx.getImageData(xi, yi, 1, 1).data;
  return toHex(data[0], data[1], data[2]);
}

function exactCategoryAt(x, y) {
  const hex = pixelHexAt(x, y);
  if (!hex) return null;

  const category = CATEGORY_BY_HEX[hex] || null;
  return category ? { ...category, hex, x: Math.round(x), y: Math.round(y) } : null;
}

function nearestCategoryAt(x, y) {
  if (!currentMapImage) return null;

  const xi = Math.round(x);
  const yi = Math.round(y);

  if (xi < 0 || yi < 0 || xi >= mapCanvas.width || yi >= mapCanvas.height) {
    return null;
  }

  const data = mapCtx.getImageData(xi, yi, 1, 1).data;
  let best = null;

  for (const [hex, category] of Object.entries(CATEGORY_BY_HEX)) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);

    const distance =
      Math.pow(data[0] - r, 2) +
      Math.pow(data[1] - g, 2) +
      Math.pow(data[2] - b, 2);

    if (!best || distance < best.distance) {
      best = {
        ...category,
        hex: toHex(data[0], data[1], data[2]),
        nearestHex: hex,
        distance,
        x: xi,
        y: yi
      };
    }
  }

  return best;
}

function lowerBoundaryCategory(xBase, yBase) {
  const candidates = [];

  // Direzione meno severa sul grafico:
  // ascissa minore = sinistra, PS minore = basso.
  for (let d = 0; d <= BOUNDARY_MAX_OFFSET_PX; d += 1) {
    const x = clamp(Math.round(xBase) - d, CALIBRATION.xMin, CALIBRATION.xMax);
    const y = clamp(Math.round(yBase) + d, CALIBRATION.yMin, CALIBRATION.yMax);
    const cat = exactCategoryAt(x, y);

    if (cat) {
      candidates.push({ ...cat, offset: d, mode: "confine-lato-inferiore" });
    }
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => a.rank - b.rank);
  return candidates[0];
}

function sampleCategory(xReal, yReal, useBoundaryMode) {
  const xNominal = clamp(Math.round(xReal), CALIBRATION.xMin, CALIBRATION.xMax);
  const yNominal = clamp(Math.round(yReal), CALIBRATION.yMin, CALIBRATION.yMax);
  const nominal = exactCategoryAt(xNominal, yNominal);
  const nominalHex = pixelHexAt(xNominal, yNominal);

  if (!useBoundaryMode) {
    if (nominal) return { ...nominal, mode: "pixel-nominale" };

    const nearest = nearestCategoryAt(xNominal, yNominal);
    if (nearest) {
      return {
        ...nearest,
        mode: "colore-piu-vicino",
        note: "Colore non esatto: usata categoria del colore PED piu' vicino."
      };
    }

    return null;
  }

  const lower = lowerBoundaryCategory(xNominal, yNominal);

  if (lower && (!nominal || lower.rank < nominal.rank)) {
    return {
      ...lower,
      nominalHex,
      note: "Applicata gestione confine: lettura dal lato inferiore, cioe' ascissa minore e PS minore."
    };
  }

  if (nominal) return { ...nominal, mode: "pixel-nominale" };

  if (lower) {
    return {
      ...lower,
      nominalHex,
      note: "Pixel nominale non appartenente ai colori categoria: applicata lettura lato inferiore."
    };
  }

  const nearest = nearestCategoryAt(xNominal, yNominal);
  if (nearest) {
    return {
      ...nearest,
      mode: "colore-piu-vicino",
      note: "Colore non esatto: usata categoria del colore PED piu' vicino."
    };
  }

  return null;
}

function calculate() {
  if (!currentMapImage || !currentViewImage) {
    throw new Error("Le immagini della tabella non sono ancora caricate. Riprovare tra un istante.");
  }

  const tableNo = tableFromSelection();
  const ps = Number(psEl.value);
  const xValue = Number(xValueEl.value);

  if (!Number.isFinite(ps) || ps <= 0) {
    throw new Error("PS non valida.");
  }

  if (!Number.isFinite(xValue) || xValue <= 0) {
    throw new Error(`${productEl.value === "pipe" ? "DN" : "Volume"} non valido.`);
  }

  const xRealRaw = valueToXReal(xValue);
  const yRealRaw = psToYReal(ps);
  const xReal = clamp(xRealRaw, CALIBRATION.xMin, CALIBRATION.xMax);
  const yReal = clamp(yRealRaw, CALIBRATION.yMin, CALIBRATION.yMax);
  const clipped = xReal !== xRealRaw || yReal !== yRealRaw;

  const sampled = sampleCategory(xReal, yReal, boundaryModeEl.checked);

  if (!sampled) {
    throw new Error("Impossibile determinare la categoria dalla mappa tecnica.");
  }

  const result = {
    tableNo,
    ps,
    xValue,
    xLabel: productEl.value === "pipe" ? "DN" : "Volume",
    xReal,
    yReal,
    xRead: sampled.x,
    yRead: sampled.y,
    clipped,
    sampled
  };

  lastMarker = result;
  drawView(result);
  renderResult(result);
}

function renderResult(result) {
  const { sampled } = result;
  const safeNote = sampled.note ? `<p class="meta">${sampled.note}</p>` : "";
  const clippedNote = result.clipped
    ? `<p class="meta">Attenzione: coordinate fuori scala grafica, lettura effettuata sul bordo mappa.</p>`
    : "";

  resultEl.className = "result ok";
  resultEl.innerHTML = `
    <span class="category" style="color:${sampled.css}">${sampled.label}</span>
    <p class="meta">
      Tabella ${result.tableNo} · PS = ${result.ps} bar · ${result.xLabel} = ${result.xValue}
    </p>
    <p class="meta">
      Pixel letto sulla PNG tecnica: X=${sampled.x}, Y=${sampled.y} · Colore: ${sampled.hex || sampled.nearestHex} · Modalita': ${sampled.mode}
    </p>
    ${safeNote}
    ${clippedNote}
  `;

  debugOutputEl.textContent = JSON.stringify({
    tabella: result.tableNo,
    ps: result.ps,
    valoreAscissa: result.xValue,
    xReale: result.xReal,
    yReale: result.yReal,
    xLetto: sampled.x,
    yLetto: sampled.y,
    coloreNominaleSeNonEsatto: sampled.nominalHex,
    coloreLetto: sampled.hex,
    nearestHex: sampled.nearestHex,
    categoria: sampled.label,
    modalita: sampled.mode,
    offsetConfine: sampled.offset,
    coordinateClippate: result.clipped,
    calibrazione: CALIBRATION,
    immagineVisibile: `views/tab-${result.tableNo}_1.jpg`,
    mappaTecnica: `maps/tab-${result.tableNo}_0.png`
  }, null, 2);
}

function renderError(error) {
  resultEl.className = "result error";
  resultEl.innerHTML = `<strong>Errore</strong><p>${error.message}</p>`;
  debugOutputEl.textContent = "";
}

form.addEventListener("submit", (event) => {
  event.preventDefault();

  try {
    calculate();
  } catch (error) {
    renderError(error);
  }
});

[productEl, stateEl, groupEl].forEach((el) => {
  el.addEventListener("change", updateControls);
});

window.addEventListener("load", () => {
  updateControls();

  // Calcolo automatico del caso critico iniziale:
  // Tabella 1, PS 200 bar, Volume 1 L.
  window.setTimeout(() => {
    try {
      calculate();
    } catch (error) {
      renderError(error);
    }
  }, 250);
});
