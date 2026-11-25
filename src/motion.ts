import type { TrackPoint, MotionAnalysis, ForecastPoint } from './types';

const EARTH_RADIUS_KM = 6371.0088;
const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

export function distanceKm(a: TrackPoint, b: TrackPoint): number {
  const p1 = a.lat * RAD, p2 = b.lat * RAD;
  const dp = (b.lat - a.lat) * RAD, dl = (b.lon - a.lon) * RAD;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(Math.min(1, h)));
}

export function bearingDeg(a: TrackPoint, b: TrackPoint): number {
  const p1 = a.lat * RAD, p2 = b.lat * RAD, dl = (b.lon - a.lon) * RAD;
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return (Math.atan2(y, x) * DEG + 360) % 360;
}

function segment(a: TrackPoint, b: TrackPoint) {
  const durationMin = (b.timestamp - a.timestamp) / 60000;
  if (!(durationMin > 0)) throw new Error('Os horários dos pontos precisam ser crescentes e distintos.');
  const distance = distanceKm(a, b);
  return {
    distanceKm: distance,
    durationMin,
    speedKmh: distance / (durationMin / 60),
    bearingDeg: bearingDeg(a, b),
  };
}

/**
 * Constante de relaxação da aceleração (s).
 * A aceleração observada decai exponencialmente — células convectivas não mantêm
 * a mesma taxa de aceleração/desaceleração por horas.
 */
export const ACCEL_TAU_S = 30 * 60;

/** Faixa meteorológica realista para movimento de células (km/h). */
const V_CLAMP_MIN = 3;
const V_CLAMP_MAX = 100;

/**
 * Fator máximo de variação da velocidade assintótica em relação a v0.
 * Antes: 2.5× (podia quase triplicar a velocidade projetada — causa clássica de
 * polígono "muito à frente"). Agora: variação limitada a ±40%.
 */
const V_MIN_FACTOR = 0.6;
const V_MAX_FACTOR = 1.4;

/**
 * |Aceleração| máxima admitida (m/s²).
 * ≈ 8 km/h de variação em 30 min — acima disso costuma ser ruído de marcação
 * (borda da célula em vez do centroide) e não movimento real do sistema.
 */
const A_MAX_MPS2 = 0.00075;

/** Erro típico de marcação manual da posição de uma célula (km, por componente). */
export const POSITION_ERROR_KM = 2;

function clamp(x: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, x));
}

function terminalSpeed(v0: number, a: number): number {
  // v∞ = v0 + a·τ, limitado a uma faixa estreita em torno de v0
  return clamp(v0 + a * ACCEL_TAU_S, V_MIN_FACTOR * v0, V_MAX_FACTOR * v0);
}

/** Velocidade (m/s) após t segundos, com aceleração amortecida. */
export function speedAtMps(v0: number, a: number, tSec: number): number {
  if (!(tSec > 0) || a === 0) return Math.max(0, v0);
  const vInf = terminalSpeed(v0, a);
  return v0 + (vInf - v0) * (1 - Math.exp(-tSec / ACCEL_TAU_S));
}

/**
 * Deslocamento (m) após t segundos.
 * Integra v(t) = v0 + (v∞−v0)(1−e^(−t/τ)).
 * Com a=0 reduz-se a s = v0·t (velocidade constante do último trecho).
 */
export function displacementM(v0: number, a: number, tSec: number): number {
  if (!(tSec > 0)) return 0;
  if (a === 0) return Math.max(0, v0) * tSec;
  const vInf = terminalSpeed(v0, a);
  return (
    v0 * tSec +
    (vInf - v0) * (tSec - ACCEL_TAU_S * (1 - Math.exp(-tSec / ACCEL_TAU_S)))
  );
}

export function destination(
  origin: TrackPoint,
  bearing: number,
  distanceKmValue: number,
  timestamp: number,
): TrackPoint {
  const delta = distanceKmValue / EARTH_RADIUS_KM;
  const theta = bearing * RAD;
  const lat1 = origin.lat * RAD;
  const lon1 = origin.lon * RAD;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(delta) + Math.cos(lat1) * Math.sin(delta) * Math.cos(theta),
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(theta) * Math.sin(delta) * Math.cos(lat1),
      Math.cos(delta) - Math.sin(lat1) * Math.sin(lat2),
    );
  return {
    lat: lat2 * DEG,
    lon: ((lon2 * DEG + 540) % 360) - 180,
    timestamp,
  };
}

function wrap180(d: number) {
  return ((d + 540) % 360) - 180;
}

/**
 * Estima o movimento da célula.
 *
 * MODELO CORRIGIDO (v2):
 * 1) Velocidade de projeção = velocidade do ÚLTIMO trecho (mais representativa do
 *    movimento atual). A regressão sobre todas as posições era a média temporal
 *    do trajeto: em células que desaceleram (comportamento comum), a média fica
 *    sistematicamente maior que a velocidade atual → polígono à frente da realidade.
 * 2) Direção = azimute do último trecho, suavizado com a regressão vetorial quando
 *    há ≥3 pontos (reduz ruído de marcação sem puxar a velocidade para a média).
 * 3) Aceleração: com ≥3 pontos (pelo menos 2 trechos), calcula-se a diferença de
 *    velocidade entre o penúltimo e o último trecho, dividida pelo intervalo de
 *    tempo entre os centros dos trechos. Aplica-se amortecimento e tetos físicos.
 * 4) Limites meteorológicos: velocidade clampada em 3–100 km/h; |a| ≤ 0.00075 m/s².
 */
export function analyzeMotion(
  input: TrackPoint[],
  horizonMin = 120,
  stepMin = 15,
): MotionAnalysis {
  if (input.length < 2) throw new Error('Marque pelo menos dois pontos da mesma célula.');
  const points = [...input].sort((a, b) => a.timestamp - b.timestamp);
  const intervals = points.slice(1).map((p, i) => segment(points[i], p));
  const origin = points[points.length - 1];
  const lastInterval = intervals[intervals.length - 1];

  // --- velocidade de projeção: ÚLTIMO trecho (não a média do trajeto) ---
  let speedKmh = clamp(lastInterval.speedKmh, V_CLAMP_MIN, V_CLAMP_MAX);
  let bearing = lastInterval.bearingDeg;

  // --- direção estável por regressão vetorial (não altera a velocidade) ---
  // Plano local em km, centrado na última posição; tempo em horas relativas ao fim.
  if (points.length >= 3) {
    const kx = RAD * EARTH_RADIUS_KM * Math.cos(origin.lat * RAD);
    const ky = RAD * EARTH_RADIUS_KM;
    const th = points.map(p => (p.timestamp - origin.timestamp) / 3600000);
    const xs = points.map(p => (p.lon - origin.lon) * kx);
    const ys = points.map(p => (p.lat - origin.lat) * ky);
    const n = points.length;
    const tBar = th.reduce((s, v) => s + v, 0) / n;
    const xBar = xs.reduce((s, v) => s + v, 0) / n;
    const yBar = ys.reduce((s, v) => s + v, 0) / n;
    let sxx = 0;
    let sxt = 0;
    let syt = 0;
    for (let i = 0; i < n; i++) {
      sxx += (th[i] - tBar) ** 2;
      sxt += (th[i] - tBar) * (xs[i] - xBar);
      syt += (th[i] - tBar) * (ys[i] - yBar);
    }
    if (sxx > 1e-12) {
      const vx = sxt / sxx; // km/h leste
      const vy = syt / sxx; // km/h norte
      const regSpeed = Math.hypot(vx, vy);
      if (regSpeed > 0.5) {
        // Suaviza só a direção: mistura 70% último trecho + 30% regressão
        const regBearing = (Math.atan2(vx, vy) * DEG + 360) % 360;
        const dAng = wrap180(regBearing - lastInterval.bearingDeg);
        bearing = (lastInterval.bearingDeg + 0.3 * dAng + 360) % 360;
      }
    }
  }

  // incerteza estatística da velocidade (erro de marcação / Δt efetivo do último trecho)
  const lastDtH = lastInterval.durationMin / 60;
  const speedSigmaKmh =
    lastDtH > 0 ? (Math.SQRT2 * POSITION_ERROR_KM) / lastDtH : POSITION_ERROR_KM * 10;

  // --- aceleração a partir dos dois últimos trechos ---
  let acceleration: number | null = null;
  let previousSpeed: number | null = null;
  let regime: MotionAnalysis['regime'] = 'Velocidade constante';
  let method: string;

  if (intervals.length >= 2) {
    previousSpeed = intervals[intervals.length - 2].speedKmh;
  }

  if (points.length === 2) {
    method = '2 posições: velocidade e direção do único trecho (aceleração não estimada)';
    acceleration = 0;
  } else {
    // v_prev (penúltimo trecho) e v_last (último trecho)
    const prev = intervals[intervals.length - 2];
    const last = intervals[intervals.length - 1];
    previousSpeed = prev.speedKmh;

    // Tempo entre os centros dos dois trechos (horas)
    const tMidPrev =
      (points[points.length - 3].timestamp + points[points.length - 2].timestamp) / 2;
    const tMidLast =
      (points[points.length - 2].timestamp + points[points.length - 1].timestamp) / 2;
    const dtH = (tMidLast - tMidPrev) / 3600000;

    if (dtH > 0.02) {
      // (km/h)/h → m/s² : 1 (km/h)/h = 1/12960 m/s²
      const slopeKmhPerH = (last.speedKmh - prev.speedKmh) / dtH;
      let aRaw = slopeKmhPerH / 12960;

      // Erro-padrão aproximado da aceleração (propagação do erro de marcação)
      const svPrev = (Math.SQRT2 * POSITION_ERROR_KM) / (prev.durationMin / 60);
      const svLast = (Math.SQRT2 * POSITION_ERROR_KM) / (last.durationMin / 60);
      const aSigma = Math.hypot(svPrev, svLast) / dtH / 12960;

      // Só aplica se a tendência superar o ruído de marcação e estiver em faixa física
      if (Math.abs(aRaw) > 1.5 * aSigma) {
        aRaw = clamp(aRaw, -A_MAX_MPS2, A_MAX_MPS2);
        acceleration = aRaw;
        regime = aRaw > 0 ? 'Acelerando' : 'Desacelerando';
        method =
          `${points.length} posições: velocidade do último trecho; ` +
          `aceleração dos 2 últimos trechos (${regime.toLowerCase()})`;
      } else {
        acceleration = 0;
        method =
          `${points.length} posições: velocidade do último trecho; ` +
          `sem evidência de aceleração acima do ruído de marcação`;
      }
    } else {
      acceleration = 0;
      method =
        `${points.length} posições: velocidade do último trecho; ` +
        `intervalo entre trechos curto demais para estimar aceleração`;
    }
  }

  // Velocidade de partida da projeção = último trecho (já clampada)
  const v0 = speedKmh / 3.6; // m/s
  const a = acceleration ?? 0;

  const forecast: ForecastPoint[] = [];
  for (let minute = stepMin; minute <= horizonMin; minute += stepMin) {
    const t = minute * 60;
    const distanceM = displacementM(v0, a, t);
    const speedMps = speedAtMps(v0, a, t);
    const pos = destination(origin, bearing, distanceM / 1000, origin.timestamp + t * 1000);
    forecast.push({
      ...pos,
      minutesAhead: minute,
      speedKmh: clamp(speedMps * 3.6, 0, V_CLAMP_MAX * V_MAX_FACTOR),
    });
  }

  return {
    speedKmh,
    previousSpeedKmh: previousSpeed,
    bearingDeg: bearing,
    accelerationMps2: acceleration,
    regime,
    forecast,
    intervals,
    method,
    speedSigmaKmh,
  };
}

export interface ProjectionArea {
  minutes: number;
  timestamp: number;
  center: { lat: number; lon: number };
  ring: Array<[number, number]>;
  distanceKm: number;
  alongHalfKm: number;
  crossHalfKm: number;
  bearingHalfDeg: number;
}

export interface AreaAt {
  centerKm: number;
  rMinKm: number;
  rMaxKm: number;
  halfDeg: number;
}

export interface AreaModel {
  origin: TrackPoint;
  bearingDeg: number;
  speedKmh: number;
  analysis: MotionAnalysis;
  at: (minutes: number) => AreaAt;
}

/**
 * Modelo da área provável de posição (setor anular) em função do tempo.
 *
 * - Centro = deslocamento cinemático a partir da velocidade do ÚLTIMO trecho
 *   (+ aceleração amortecida dos dois últimos trechos, se significativa).
 * - Faixa radial: inclui a hipótese de velocidade constante e cresce com o tempo.
 * - Incerteza angular baseada no desvio de azimutes observados e no erro de marcação.
 */
export function buildAreaModel(points: TrackPoint[]): AreaModel {
  const sorted = [...points].sort((a, b) => a.timestamp - b.timestamp);
  const analysis = analyzeMotion(sorted, 15, 15);
  const origin = sorted[sorted.length - 1];
  const speeds = analysis.intervals.map(i => i.speedKmh);
  const meanSpeed = speeds.reduce((a, b) => a + b, 0) / speeds.length;

  const noiseRel =
    analysis.speedKmh > 0.5 ? (2 * analysis.speedSigmaKmh) / analysis.speedKmh : 0.5;
  let spreadRel = 0;
  let devDeg = 0;
  if (speeds.length >= 2 && meanSpeed > 0.5) {
    spreadRel = (Math.max(...speeds) - Math.min(...speeds)) / 2 / meanSpeed;
    devDeg = Math.max(
      ...analysis.intervals.map(i => Math.abs(wrap180(i.bearingDeg - analysis.bearingDeg))),
    );
  }
  // Faixa de incerteza um pouco mais contida (15–40%) — evita "bolha" enorme à frente
  const fv = Math.min(0.4, Math.max(0.15, spreadRel, noiseRel));
  const dTheta = Math.min(35, Math.max(10, devDeg, Math.atan(noiseRel) * DEG));

  const v0 = analysis.speedKmh / 3.6;
  const a = analysis.accelerationMps2 ?? 0;

  const at = (minutes: number): AreaAt => {
    const growth = 0.85 + 0.35 * (minutes / 120);
    const r = displacementM(v0, a, minutes * 60) / 1000;
    // Hipótese de velocidade constante do último trecho (referência)
    const rConst = analysis.speedKmh * (minutes / 60);
    const rLow = Math.min(r, rConst);
    const rHigh = Math.max(r, rConst);
    return {
      centerKm: r,
      rMaxKm: rHigh * (1 + fv * growth) + 2,
      rMinKm: Math.max(0, rLow * (1 - fv * growth) - 2),
      halfDeg: Math.min(50, dTheta * growth),
    };
  };
  return {
    origin,
    bearingDeg: analysis.bearingDeg,
    speedKmh: analysis.speedKmh,
    analysis,
    at,
  };
}

export function projectionAreas(points: TrackPoint[], minutesList: number[]): ProjectionArea[] {
  const model = buildAreaModel(points);
  const { origin, bearingDeg: brg } = model;
  const areas: ProjectionArea[] = [];
  for (const minutes of minutesList) {
    const ar = model.at(minutes);
    const n = 18;
    const ring: Array<[number, number]> = [];
    for (let i = 0; i <= n; i++) {
      const b = brg - ar.halfDeg + (2 * ar.halfDeg * i) / n;
      const p = destination(origin, b, ar.rMaxKm, origin.timestamp);
      ring.push([p.lat, p.lon]);
    }
    for (let i = n; i >= 0; i--) {
      const b = brg - ar.halfDeg + (2 * ar.halfDeg * i) / n;
      const p = destination(origin, b, ar.rMinKm, origin.timestamp);
      ring.push([p.lat, p.lon]);
    }
    const ts = origin.timestamp + minutes * 60000;
    const c = destination(origin, brg, ar.centerKm, ts);
    areas.push({
      minutes,
      timestamp: ts,
      center: { lat: c.lat, lon: c.lon },
      ring,
      distanceKm: ar.centerKm,
      alongHalfKm: (ar.rMaxKm - ar.rMinKm) / 2,
      crossHalfKm: ar.rMaxKm * Math.tan(Math.min(ar.halfDeg, 80) * RAD),
      bearingHalfDeg: ar.halfDeg,
    });
  }
  return areas;
}

export interface ArrivalAssessment {
  status: 'reaches' | 'not';
  distanceKm: number;
  offAxisDeg: number;
  maxHalfDeg: number;
  maxReachKm: number;
  horizonMin: number;
  originTimestamp: number;
  enterMin?: number;
  leaveMin?: number;
  centerMin?: number | null;
  reason?: 'lateral' | 'atras' | 'alcance' | 'indefinido';
  crossTrackKm?: number;
}

export function assessArrival(
  points: TrackPoint[],
  target: { lat: number; lon: number },
  horizonMin = 120,
): ArrivalAssessment {
  const model = buildAreaModel(points);
  const { origin } = model;
  const tgt: TrackPoint = { lat: target.lat, lon: target.lon, timestamp: origin.timestamp };
  const d = distanceKm(origin, tgt);
  const offAxis = d < 0.05 ? 0 : Math.abs(wrap180(bearingDeg(origin, tgt) - model.bearingDeg));
  const end = model.at(horizonMin);
  const base = {
    distanceKm: d,
    offAxisDeg: offAxis,
    maxHalfDeg: end.halfDeg,
    maxReachKm: end.rMaxKm,
    horizonMin,
    originTimestamp: origin.timestamp,
  };

  let enter: number | null = null;
  let leave: number | null = null;
  for (let t = 0.5; t <= horizonMin + 1e-9; t += 0.5) {
    const ar = model.at(t);
    const angleOk = d < 1 || offAxis <= ar.halfDeg;
    if (angleOk && d >= ar.rMinKm && d <= ar.rMaxKm) {
      if (enter === null) enter = t;
      leave = t;
    }
  }

  if (enter !== null && leave !== null) {
    let centerMin: number | null = null;
    if (model.at(horizonMin).centerKm >= d) {
      let lo = 0;
      let hi = horizonMin;
      for (let i = 0; i < 50; i++) {
        const mid = (lo + hi) / 2;
        if (model.at(mid).centerKm < d) lo = mid;
        else hi = mid;
      }
      if (d < 1 || offAxis <= model.at(hi).halfDeg) centerMin = hi;
    }
    return { ...base, status: 'reaches', enterMin: enter, leaveMin: leave, centerMin };
  }

  const crossTrack = offAxis >= 90 ? d : d * Math.sin(offAxis * RAD);
  let reason: ArrivalAssessment['reason'] = 'indefinido';
  if (offAxis >= 90) reason = 'atras';
  else if (offAxis > end.halfDeg) reason = 'lateral';
  else if (d > end.rMaxKm) reason = 'alcance';
  return { ...base, status: 'not', reason, crossTrackKm: crossTrack };
}

export interface BacktestResult {
  alongKm: number;
  crossKm: number;
  missKm: number;
  spanMin: number;
  pointsUsed: number;
}

/** Usa as posições anteriores para prever a última posição marcada e mede o erro. */
export function backtestLast(points: TrackPoint[]): BacktestResult | null {
  const sorted = [...points].sort((a, b) => a.timestamp - b.timestamp);
  if (sorted.length < 3) return null;
  const prior = sorted.slice(0, -1);
  const observed = sorted[sorted.length - 1];
  const an = analyzeMotion(prior, 15, 15);
  const base = prior[prior.length - 1];
  const spanMin = (observed.timestamp - base.timestamp) / 60000;
  const predictedKm =
    displacementM(an.speedKmh / 3.6, an.accelerationMps2 ?? 0, spanMin * 60) / 1000;
  const obsDist = distanceKm(base, observed);
  const delta = wrap180(bearingDeg(base, observed) - an.bearingDeg) * RAD;
  const obsAlong = obsDist * Math.cos(delta);
  const cross = Math.abs(obsDist * Math.sin(delta));
  const along = predictedKm - obsAlong;
  return {
    alongKm: along,
    crossKm: cross,
    missKm: Math.hypot(along, cross),
    spanMin,
    pointsUsed: prior.length,
  };
}
