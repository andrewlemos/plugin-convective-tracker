export interface TrackPoint {
  lat: number;
  lon: number;
  timestamp: number;
}

export interface ForecastPoint extends TrackPoint {
  minutesAhead: number;
  speedKmh: number;
}

export interface MotionAnalysis {
  speedKmh: number;
  previousSpeedKmh: number | null;
  bearingDeg: number;
  accelerationMps2: number | null;
  regime: 'Velocidade constante' | 'Acelerando' | 'Desacelerando' | 'Parada projetada';
  forecast: ForecastPoint[];
  intervals: Array<{ distanceKm: number; durationMin: number; speedKmh: number; bearingDeg: number }>;
  method: string;
  speedSigmaKmh: number;
}

export interface CellTrack {
  id: string;
  name: string;
  color: string;
  points: TrackPoint[];
  visible: boolean;
}
