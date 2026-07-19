/* ============================================================
   等时圈 Worker：把距离场采样与 d3.contours 移出主线程。
   输入/输出只包含结构化克隆安全的数据与 SVG path 字符串。
   ============================================================ */

importScripts("../vendor/d3.min.js");

const ONWARD_SPEED_KMH = 65;
let projection, contourPath;
let width = 0, height = 0, gridStep = 7, bandMaxes = [];

function haversineKm([lon1, lat1], [lon2, lat2]) {
  const R = 6371, toR = Math.PI / 180;
  const dLat = (lat2 - lat1) * toR, dLon = (lon2 - lon1) * toR;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * toR) * Math.cos(lat2 * toR) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function rewind(fc) {
  for (const feature of fc.features) {
    const geometry = feature.geometry;
    if (!geometry) continue;
    const polygons = geometry.type === "Polygon" ? [geometry.coordinates]
      : geometry.type === "MultiPolygon" ? geometry.coordinates : [];
    for (const rings of polygons) {
      for (const ring of rings) {
        if (d3.geoArea({ type: "Polygon", coordinates: [ring] }) > Math.PI * 2) {
          ring.reverse();
        }
      }
    }
  }
}

function initialize({ geojson, width: nextWidth, height: nextHeight, gridStep: nextStep, bandMaxes: nextBands }) {
  rewind(geojson);
  const provinces = geojson.features.filter(feature => feature.properties.name);
  width = nextWidth;
  height = nextHeight;
  gridStep = nextStep;
  bandMaxes = nextBands;
  projection = d3.geoConicEqualArea()
    .parallels([25, 47])
    .rotate([-105, 0])
    .fitExtent([[20, 16], [width - 20, height - 8]], {
      type: "FeatureCollection",
      features: provinces,
    });
  contourPath = d3.geoPath(d3.geoIdentity().scale(gridStep));
}

function computePaths(anchors, homeCoord) {
  const allAnchors = [...anchors, { coord: homeCoord, t: 0 }];
  const cols = Math.ceil(width / gridStep), rows = Math.ceil(height / gridStep);
  const values = new Float64Array(cols * rows);

  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const geo = projection.invert([i * gridStep, j * gridStep]);
      let best = Infinity;
      if (geo && isFinite(geo[0]) && isFinite(geo[1])) {
        for (const anchor of allAnchors) {
          const km = haversineKm(geo, anchor.coord);
          const time = anchor.t + (km / ONWARD_SPEED_KMH) * 60;
          if (time < best) best = time;
        }
      }
      values[j * cols + i] = Math.min(best, 1e5);
    }
  }

  const inverted = values.map(value => -value);
  const thresholds = bandMaxes.map(value => -value);
  const contours = d3.contours()
    .size([cols, rows])
    .thresholds(thresholds)(inverted);
  const byValue = new Map(contours.map(contour => [contour.value, contour]));

  return thresholds.map(value => {
    const contour = byValue.get(value);
    return contour && contour.coordinates.length ? contourPath(contour) : null;
  });
}

self.addEventListener("message", event => {
  const message = event.data || {};
  try {
    if (message.type === "init") {
      initialize(message);
      self.postMessage({ type: "ready" });
      return;
    }
    if (message.type !== "compute" || !projection) return;

    const paths = computePaths(message.anchors, message.homeCoord);
    self.postMessage({
      type: "result",
      requestId: message.requestId,
      mode: message.mode,
      paths,
    });
  } catch (error) {
    self.postMessage({
      type: "error",
      requestId: message.requestId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
});
