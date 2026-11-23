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
    bearingDeg: bearingDeg(a, b)
  };
}

/** Constante de relaxação da aceleração (s). A aceleração observada decai exponencialmente. */
export const ACCEL_TAU_S = 40 * 60;
/** A velocidade assintótica fica limitada a [30%, 250%] da última velocidade observada. */
const V_MIN_FACTOR = 0.3;
const V_MAX_FACTOR = 2.5;

function terminalSpeed(v0: number, a: number): number {
  return Math.min(V_MAX_FACTOR * v0, Math.max(V_MIN_FACTOR * v0, v0 + a * ACCEL_TAU_S));
}

/** Velocidade (m/s) após t segundos. */
export function speedAtMps(v0: number, a: number, tSec: number): number {
  const vInf = terminalSpeed(v0, a);
  return v0 + (vInf - v0) * (1 - Math.exp(-tSec / ACCEL_TAU_S));
}

/** Deslocamento (m) após t segundos; estritamente crescente (a célula nunca para nem recua). */
export function displacementM(v0: number, a: number, tSec: number): number {
  const vInf = terminalSpeed(v0, a);
  return v0 * tSec + (vInf - v0) * (tSec - ACCEL_TAU_S * (1 - Math.exp(-tSec / ACCEL_TAU_S)));
}

export function destination(origin: TrackPoint, bearing: number, distanceKmValue: number, timestamp: number): TrackPoint {
  const delta = distanceKmValue / EARTH_RADIUS_KM;
  const theta = bearing * RAD, lat1 = origin.lat * RAD, lon1 = origin.lon * RAD;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(delta) + Math.cos(lat1) * Math.sin(delta) * Math.cos(theta));
  const lon2 = lon1 + Math.atan2(
    Math.sin(theta) * Math.sin(delta) * Math.cos(lat1),
    Math.cos(delta) - Math.sin(lat1) * Math.sin(lat2)
  );
  return { lat: lat2 * DEG, lon: ((lon2 * DEG + 540) % 360) - 180, timestamp };
}

/**
 * Two positions: constant-speed extrapolation.
 * Three or more: estimate tangential acceleration from the last two segment
 * speeds, using the elapsed time between segment midpoints. Direction is
 * held at the latest observed bearing; turning is not extrapolated.
 */
/** Erro típico de marcação manual da posição de uma célula (km, por componente). */
export const POSITION_ERROR_KM = 2;

/**
 * Estima o movimento da célula.
 * - Vetor de movimento: regressão linear (mínimos quadrados) da posição em função do tempo,
 *   usando TODAS as posições marcadas (com 2 posições é o próprio intervalo). Isso evita que uma
 *   única marcação imprecisa defina a velocidade.
 * - Aceleração: só é considerada com pelo menos 4 posições e quando a tendência das velocidades
 *   dos intervalos é estatisticamente significativa (|aceleração| > 2 erros-padrão, usando o erro
 *   de marcação POSITION_ERROR_KM). Caso contrário, assume-se velocidade constante.
 */
export function analyzeMotion(
  input: TrackPoint[],
  horizonMin = 120,
  stepMin = 15
): MotionAnalysis {
  if (input.length < 2) throw new Error('Marque pelo menos dois pontos da mesma célula.');
  const points = [...input].sort((a, b) => a.timestamp - b.timestamp);
  const intervals = points.slice(1).map((p, i) => segment(points[i], p));
  const origin = points[points.length - 1];
  const lastInterval = intervals[intervals.length - 1];

  // --- regressão da posição (plano local em km, centrado na última posição) ---
  const kx = RAD * EARTH_RADIUS_KM * Math.cos(origin.lat * RAD);
  const ky = RAD * EARTH_RADIUS_KM;
  const th = points.map(p => (p.timestamp - origin.timestamp) / 3600000); // horas (<= 0)
  const xs = points.map(p => (p.lon - origin.lon) * kx);
  const ys = points.map(p => (p.lat - origin.lat) * ky);
  const n = points.length;
  const tBar = th.reduce((s, v) => s + v, 0) / n;
  const xBar = xs.reduce((s, v) => s + v, 0) / n;
  const yBar = ys.reduce((s, v) => s + v, 0) / n;
  let sxx = 0, sxt = 0, syt = 0;
  for (let i = 0; i < n; i++) {
    sxx += (th[i] - tBar) ** 2;
    sxt += (th[i] - tBar) * (xs[i] - xBar);
    syt += (th[i] - tBar) * (ys[i] - yBar);
  }
  const vx = sxt / sxx; // km/h para leste
  const vy = syt / sxx; // km/h para norte
  let speedKmh = Math.hypot(vx, vy);
  const bearing = (Math.atan2(vx, vy) * DEG + 360) % 360;
  const speedSigmaKmh = POSITION_ERROR_KM / Math.sqrt(sxx);

  // --- aceleração (somente com evidência estatística) ---
  let acceleration: number | null = null;
  let previousSpeed: number | null = null;
  let regime: MotionAnalysis['regime'] = 'Velocidade constante';
  let method: string;

  if (intervals.length >= 2) previousSpeed = intervals[intervals.length - 2].speedKmh;

  if (points.length === 2) {
    method = '2 posições: vetor de movimento do intervalo (aceleração não estimada)';
  } else if (points.length === 3) {
    method = '3 posições: vetor médio por regressão (aceleração exige no mínimo 4 posições)';
    acceleration = 0;
  } else {
    // regressão ponderada das velocidades dos intervalos contra o tempo médio de cada intervalo
    const tm = intervals.map((_, i) => (th[i] + th[i + 1]) / 2);
    const v = intervals.map(s => s.speedKmh);
    const w = intervals.map(s => {
      const sv = (Math.SQRT2 * POSITION_ERROR_KM) / (s.durationMin / 60);
      return 1 / (sv * sv);
    });
    const sw = w.reduce((s, x) => s + x, 0);
    const tw = tm.reduce((s, t, i) => s + w[i] * t, 0) / sw;
    const vw = v.reduce((s, x, i) => s + w[i] * x, 0) / sw;
    let stt = 0, stv = 0;
    for (let i = 0; i < v.length; i++) { stt += w[i] * (tm[i] - tw) ** 2; stv += w[i] * (tm[i] - tw) * (v[i] - vw); }
    const slopeKmhPerH = stv / stt;
    const slopeSE = 1 / Math.sqrt(stt);
    if (Math.abs(slopeKmhPerH) > 2 * slopeSE) {
      acceleration = slopeKmhPerH / 12960; // (km/h)/h -> m/s²
      regime = acceleration > 0 ? 'Acelerando' : 'Desacelerando';
      speedKmh = Math.max(0.5, vw + slopeKmhPerH * (0 - tw)); // velocidade ajustada no instante da última posição
      method = `${points.length} posições: regressão com tendência de velocidade significativa (> 2σ)`;
    } else {
      acceleration = 0;
      method = `${points.length} posições: regressão; sem evidência estatística de aceleração`;
    }
  }

  const v0 = speedKmh / 3.6;
  const a = acceleration ?? 0;

  const forecast: ForecastPoint[] = [];
  for (let minute = stepMin; minute <= horizonMin; minute += stepMin) {
    const t = minute * 60;
    const distanceM = displacementM(v0, a, t);
    const speedMps = speedAtMps(v0, a, t);
    const pos = destination(origin, bearing, distanceM / 1000, origin.timestamp + t * 1000);
    forecast.push({ ...pos, minutesAhead: minute, speedKmh: speedMps * 3.6 });
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
    speedSigmaKmh
  };
}

export interface ProjectionArea {
  minutes: number;
  timestamp: number;
  center: { lat: number; lon: number };
  ring: Array<[number, number]>; // [lat, lon]
  distanceKm: number;
  alongHalfKm: number;
  crossHalfKm: number;
  bearingHalfDeg: number;
}

export interface AreaAt {
  centerKm: number;   // distância do centro estimado
  rMinKm: number;     // borda interna da área
  rMaxKm: number;     // borda externa da área
  halfDeg: number;    // meia-abertura angular
}

export interface AreaModel {
  origin: TrackPoint;
  bearingDeg: number;
  speedKmh: number;
  analysis: MotionAnalysis;
  at: (minutes: number) => AreaAt;
}

function wrap180(d: number) { return ((d + 540) % 360) - 180; }

/**
 * Modelo da área provável de posição (setor anular) em função do tempo.
 * - Raio central = distância extrapolada (velocidade + aceleração amortecida); a faixa radial
 *   sempre inclui também a hipótese de velocidade constante.
 * - Incerteza radial: maior entre a dispersão relativa das velocidades dos intervalos e a incerteza
 *   estatística da regressão (2σ), limitada a 15%–50%, crescendo levemente com o tempo, + piso de 2 km.
 * - Incerteza angular: maior entre o desvio dos azimutes dos intervalos e a incerteza estatística
 *   da direção, limitada a 10°–40°, crescendo levemente com o tempo.
 * É uma estimativa heurística de incerteza, não uma probabilidade calibrada.
 * O desenho no mapa e a análise de chegada usam exatamente este mesmo modelo.
 */
export function buildAreaModel(points: TrackPoint[]): AreaModel {
  const sorted = [...points].sort((a, b) => a.timestamp - b.timestamp);
  const analysis = analyzeMotion(sorted, 15, 15);
  const origin = sorted[sorted.length - 1];
  const speeds = analysis.intervals.map(i => i.speedKmh);
  const meanSpeed = speeds.reduce((a, b) => a + b, 0) / speeds.length;

  // incerteza estatística do vetor de movimento (erro de marcação propagado pela regressão)
  const noiseRel = analysis.speedKmh > 0.5 ? (2 * analysis.speedSigmaKmh) / analysis.speedKmh : 0.5;
  let spreadRel = 0;
  let devDeg = 0;
  if (speeds.length >= 2 && meanSpeed > 0.5) {
    spreadRel = (Math.max(...speeds) - Math.min(...speeds)) / 2 / meanSpeed;
    devDeg = Math.max(...analysis.intervals.map(i => Math.abs(wrap180(i.bearingDeg - analysis.bearingDeg))));
  }
  const fv = Math.min(0.5, Math.max(0.15, spreadRel, noiseRel));
  const dTheta = Math.min(40, Math.max(10, devDeg, Math.atan(noiseRel) * DEG));

  const v0 = analysis.speedKmh / 3.6;
  const a = analysis.accelerationMps2 ?? 0;

  const at = (minutes: number): AreaAt => {
    const growth = 0.8 + 0.4 * (minutes / 120);
    const r = displacementM(v0, a, minutes * 60) / 1000;
    const rConst = analysis.speedKmh * (minutes / 60); // hipótese de velocidade constante
    const rLow = Math.min(r, rConst), rHigh = Math.max(r, rConst);
    return {
      centerKm: r,
      rMaxKm: rHigh * (1 + fv * growth) + 2,
      rMinKm: Math.max(0, rLow * (1 - fv * growth) - 2),
      halfDeg: Math.min(60, dTheta * growth)
    };
  };
  return { origin, bearingDeg: analysis.bearingDeg, speedKmh: analysis.speedKmh, analysis, at };
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
      minutes, timestamp: ts, center: { lat: c.lat, lon: c.lon }, ring,
      distanceKm: ar.centerKm, alongHalfKm: (ar.rMaxKm - ar.rMinKm) / 2,
      crossHalfKm: ar.rMaxKm * Math.tan(Math.min(ar.halfDeg, 80) * RAD), bearingHalfDeg: ar.halfDeg
    });
  }
  return areas;
}

export interface ArrivalAssessment {
  status: 'reaches' | 'not';
  distanceKm: number;
  offAxisDeg: number;          // ângulo entre o eixo de deslocamento e a direção do ponto
  maxHalfDeg: number;          // abertura angular máxima da área no horizonte analisado
  maxReachKm: number;          // alcance da borda externa no horizonte analisado
  horizonMin: number;
  originTimestamp: number;
  // quando atinge:
  enterMin?: number;
  leaveMin?: number;
  centerMin?: number | null;   // quando o centro da estimativa passa pelo ponto (se passar)
  // quando não atinge:
  reason?: 'lateral' | 'atras' | 'alcance' | 'indefinido';
  crossTrackKm?: number;       // distância do ponto ao eixo da trajetória
}

/**
 * Compara a área provável (a mesma desenhada no mapa) com um ponto-alvo.
 * Varre o tempo de 0,5 em 0,5 min até o horizonte e verifica quando o ponto está dentro do setor.
 */
export function assessArrival(
  points: TrackPoint[],
  target: { lat: number; lon: number },
  horizonMin = 120
): ArrivalAssessment {
  const model = buildAreaModel(points);
  const { origin } = model;
  const tgt: TrackPoint = { lat: target.lat, lon: target.lon, timestamp: origin.timestamp };
  const d = distanceKm(origin, tgt);
  const offAxis = d < 0.05 ? 0 : Math.abs(wrap180(bearingDeg(origin, tgt) - model.bearingDeg));
  const end = model.at(horizonMin);
  const base = {
    distanceKm: d, offAxisDeg: offAxis, maxHalfDeg: end.halfDeg, maxReachKm: end.rMaxKm,
    horizonMin, originTimestamp: origin.timestamp
  };

  let enter: number | null = null, leave: number | null = null;
  for (let t = 0.5; t <= horizonMin + 1e-9; t += 0.5) {
    const ar = model.at(t);
    const angleOk = d < 1 || offAxis <= ar.halfDeg;
    if (angleOk && d >= ar.rMinKm && d <= ar.rMaxKm) {
      if (enter === null) enter = t;
      leave = t;
    }
  }

  if (enter !== null && leave !== null) {
    // instante em que o centro estimado passa pelo ponto (só se o ponto estiver dentro do cone nesse instante)
    let centerMin: number | null = null;
    if (model.at(horizonMin).centerKm >= d) {
      let lo = 0, hi = horizonMin;
      for (let i = 0; i < 50; i++) {
        const mid = (lo + hi) / 2;
        if (model.at(mid).centerKm < d) lo = mid; else hi = mid;
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
  alongKm: number;   // > 0: o modelo previu a posição À FRENTE da real; < 0: ATRÁS
  crossKm: number;   // desvio lateral (valor absoluto)
  missKm: number;    // erro total
  spanMin: number;   // intervalo de tempo previsto
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
  const predictedKm = displacementM(an.speedKmh / 3.6, an.accelerationMps2 ?? 0, spanMin * 60) / 1000;
  const obsDist = distanceKm(base, observed);
  const delta = wrap180(bearingDeg(base, observed) - an.bearingDeg) * RAD;
  const obsAlong = obsDist * Math.cos(delta);
  const cross = Math.abs(obsDist * Math.sin(delta));
  const along = predictedKm - obsAlong;
  return { alongKm: along, crossKm: cross, missKm: Math.hypot(along, cross), spanMin, pointsUsed: prior.length };
}
