<div class="plugin__mobile-header">{title}</div>
<section class="plugin__content tracker">
  <header class="heading">
    <div class="eyebrow">METEOROLOGICAL NOWCASTING</div>
    <h2>Convective Tracker</h2>
    <p>Rastreamento manual de células convectivas</p>
  </header>

  <div class="statusbar">
    <span class:live={radarTimestamp > 0} class="status-dot"></span>
    <div>
      <strong>{radarTimestamp ? 'TEMPO DO RADAR SINCRONIZADO' : 'AGUARDANDO HORÁRIO DO RADAR'}</strong>
      <small>{formatTime(radarTimestamp)}</small>
    </div>
    <span class="spacer"></span>
    <span class="pill">RADAR</span>
  </div>

  <div class="section-title"><span>01</span> OPERAÇÃO</div>
  <div class="control-row">
    <button class="primary" on:click={createCell}>＋ Nova célula</button>
    <button class:armed={captureArmed} class="capture" on:click={() => { captureArmed = !captureArmed; if (captureArmed) targetCaptureArmed = false; }}>
      {captureArmed ? '● Captura ativa' : '◎ Ativar captura'}
    </button>
  </div>
  {#if statusMsg}<div class="status-msg">{statusMsg}</div>{/if}
  <p class="hint">Ative a captura e clique no centro da célula no mapa. Cada clique registra a coordenada e o horário atualmente selecionado na barra de radar do Windy.</p>

  {#if cells.length}
    <label class="field-label" for="cell-select">CÉLULA EM ANÁLISE</label>
    <select id="cell-select" bind:value={selectedId} on:change={refreshAnalysis}>
      {#each cells as cell}
        <option value={cell.id}>{cell.name} · {cell.points.length} ponto(s)</option>
      {/each}
    </select>
    {#if selectedCell}
      <div class="cell-tools">
        <input aria-label="Nome da célula" bind:value={selectedCell.name} on:input={persist}
          on:keydown|stopPropagation on:keyup|stopPropagation on:keypress|stopPropagation />
        <button class="small danger" on:click={deleteCell}>Excluir</button>
      </div>
      <div class="metrics">
        <div><small>POSIÇÕES</small><strong>{selectedCell.points.length}</strong></div>
        <div><small>VELOCIDADE</small><strong>{analysis ? analysis.speedKmh.toFixed(1) : '—'} <i>km/h</i></strong></div>
        <div><small>DIREÇÃO</small><strong>{analysis ? `${analysis.bearingDeg.toFixed(0)}°` : '—'}</strong></div>
        <div><small>ACELERAÇÃO</small><strong>{analysis?.accelerationMps2 === null || !analysis ? '—' : analysis.accelerationMps2.toFixed(4)} <i>m/s²</i></strong></div>
      </div>
      {#if analysis}
        <div class="analysis-banner">
          <span class="regime-dot" class:accelerating={analysis.regime === 'Acelerando'} class:decelerating={analysis.regime === 'Desacelerando' || analysis.regime === 'Parada projetada'}></span>
          <div><strong>{analysis.regime}</strong><small>{analysis.method}</small></div>
        </div>
        {#if backtestText}<div class="backtest">{backtestText}</div>{/if}
      {:else}
        <div class="empty-analysis">Adicione pelo menos dois horários distintos para calcular o movimento.</div>
      {/if}

      <div class="section-title compact"><span>02</span> HISTÓRICO DE POSIÇÕES</div>
      {#if selectedCell.points.length}
        <div class="point-list">
          {#each selectedCell.points as point, i}
            <div class="point-row">
              <span class="point-index">{i + 1}</span>
              <div class="point-info">
                <strong>{formatTime(point.timestamp)}</strong>
                <small>{point.lat.toFixed(4)}, {point.lon.toFixed(4)}</small>
              </div>
              <button class="icon-button" title="Remover posição" on:click={() => removePoint(i)}>×</button>
            </div>
          {/each}
        </div>
      {:else}
        <p class="hint">Nenhuma posição registrada.</p>
      {/if}

      <div class="section-title compact"><span>03</span> PROJEÇÃO</div>
      <div class="horizon-row">
        <label for="horizon-buttons">Intervalo da projeção</label>
      </div>
      <div class="horizon-buttons" id="horizon-buttons">
        {#each HORIZONS as h}
          <button class:active={horizon === h} on:click={() => setHorizon(h)}>{h} min</button>
        {/each}
      </div>
      {#if analysis}
        <div class="forecast-list">
          {#each analysis.forecast as p}
            <div><span>+{p.minutesAhead} min</span><strong>{p.lat.toFixed(4)}, {p.lon.toFixed(4)}</strong><small>{p.speedKmh.toFixed(1)} km/h</small></div>
          {/each}
        </div>
      {/if}
    {/if}
  {:else}
    <div class="empty-analysis">Crie uma célula para iniciar o acompanhamento.</div>
  {/if}

  <div class="section-title"><span>04</span> CHEGADA A UM LOCAL</div>
  <div class="control-row">
    <button class:armed={targetCaptureArmed} class="capture" on:click={toggleTargetCapture}>
      {targetCaptureArmed ? '● Clique no mapa…' : '◎ Marcar local no mapa'}
    </button>
    <button class="secondary small-btn" on:click={clearTarget} disabled={!targetLatStr && !targetLonStr}>Limpar</button>
  </div>
  <div class="arrival-grid">
    <label>Latitude<input type="text" inputmode="decimal" autocomplete="off" bind:value={targetLatStr} placeholder="-22.0000"
      on:keydown|stopPropagation on:keyup|stopPropagation on:keypress|stopPropagation /></label>
    <label>Longitude<input type="text" inputmode="decimal" autocomplete="off" bind:value={targetLonStr} placeholder="-47.0000"
      on:keydown|stopPropagation on:keyup|stopPropagation on:keypress|stopPropagation /></label>
  </div>
  {#if targetInvalid}
    <div class="arrival-result neutral">Coordenadas inválidas. Use graus decimais (latitude entre -90 e 90, longitude entre -180 e 180).</div>
  {:else if !target}
    <p class="hint">Digite as coordenadas ou use <b>Marcar local no mapa</b> e clique no ponto desejado.</p>
  {:else if !selectedCell || selectedCell.points.length < 2}
    <div class="arrival-result neutral">Registre pelo menos duas posições da célula para avaliar se a área estimada atinge este local.</div>
  {:else if arrivalText}
    <div class="arrival-result" class:hit={arrivalText.kind === 'hit'} class:miss={arrivalText.kind === 'miss'}>
      <strong>{arrivalText.title}</strong>
      {#each arrivalText.lines as line}<p>{line}</p>{/each}
    </div>
  {/if}

  <footer class="disclaimer">
    <strong>NOTA OPERACIONAL</strong>
    <p>Esta ferramenta extrapola o movimento observado da célula. Não prevê crescimento, dissipação, fusão, divisão ou mudanças futuras de direção. O vetor de movimento é ajustado por regressão sobre as posições marcadas e a aceleração só é considerada quando estatisticamente significativa; a direção futura permanece fixa. A precisão depende de marcar sempre o mesmo ponto da célula (por exemplo, o centro do núcleo). Não utilizar isoladamente para decisões de segurança operacional.</p>
  </footer>
  <div class="credits">Desenvolvido por Andrew Lemos</div>
</section>

<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { map } from '@windy/map';
  import store from '@windy/store';
  import * as singleclickModule from '@windy/singleclick';
  import config from './pluginConfig';
  import { analyzeMotion, projectionAreas, assessArrival, backtestLast } from './motion';
  import type { BacktestResult } from './motion';
  import type { ArrivalAssessment } from './motion';
  import type { CellTrack, TrackPoint, MotionAnalysis } from './types';

  // Windy expõe o Leaflet como global (window.L)
  const L: any = (window as any).L;

  const title = config.title;
  const STORAGE_KEY = 'convective-tracker:v1';
  const palette = ['#38bdf8', '#f59e0b', '#a78bfa', '#34d399', '#fb7185', '#facc15'];
  let cells: CellTrack[] = [];
  let selectedId = '';
  let captureArmed = false;
  let radarTimestamp = 0;
  let horizon: number = 60;
  const HORIZONS = [15, 30, 60, 90, 120];
  let statusMsg = '';
  const BAND_COLORS: Record<number, string> = { 15: '#facc15', 30: '#fbbf24', 60: '#fb923c', 90: '#f43f5e', 120: '#a855f7' };
  let targetLatStr = '';
  let targetLonStr = '';
  let targetCaptureArmed = false;
  let arrivalText: { kind: 'hit' | 'miss'; title: string; lines: string[] } | null = null;
  let analysis: MotionAnalysis | null = null;
  let layers: any[] = [];
  let mounted = false;

  $: selectedCell = cells.find(c => c.id === selectedId);
  $: if (selectedCell) {
    try { analysis = selectedCell.points.length >= 2 ? analyzeMotion(selectedCell.points, Number(horizon), 15) : null; }
    catch { analysis = null; }
  } else analysis = null;


  // O emissor de cliques pode vir como export nomeado, default ou o próprio módulo.
  function resolveEmitter(): any {
    const m: any = singleclickModule;
    for (const c of [m?.singleclick, m?.default, m]) {
      if (c && typeof c.on === 'function') return c;
    }
    return null;
  }
  let clickEmitter: any = null;
  let mapClickFallback = false;

  // Horário real do frame de radar atualmente exibido (ms UTC), alinhado ao calendário do radar.
  function getRadarTime(): number {
    let ts = NaN;
    for (const key of ['radsatTimestamp', 'timestamp']) {
      try {
        const v = Number((store as any).get(key));
        if (Number.isFinite(v) && v > 0) { ts = v; break; }
      } catch {}
    }
    if (!Number.isFinite(ts)) return 0;
    try {
      const cal: any = (store as any).get('radarCalendar');
      const arr: number[] | undefined = cal?.timestamps;
      if (Array.isArray(arr) && arr.length) {
        let best = arr[0];
        for (const t of arr) if (Math.abs(t - ts) < Math.abs(best - ts)) best = t;
        if (Math.abs(best - ts) <= 5 * 60 * 1000) return Math.round(best);
      }
    } catch {}
    return Math.round(ts);
  }

  function formatTime(ts: number) {
    if (!ts) return 'Horário indisponível';
    return new Date(ts).toLocaleString('pt-BR', { timeZone: 'UTC', hour12: false }) + ' UTC';
  }
  function persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cells)); } catch (e) { console.warn('[Convective Tracker] Falha ao salvar dados locais', e); }
    try { redraw(); } catch (e) { console.warn('[Convective Tracker] redraw falhou', e); }
  }
  function createCell() {
    const id = `cell-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    cells = [...cells, { id, name: `Célula ${cells.length + 1}`, color: palette[cells.length % palette.length], points: [], visible: true }];
    selectedId = id;
    persist();
  }
  function deleteCell() {
    if (!selectedCell) return;
    cells = cells.filter(c => c.id !== selectedId);
    selectedId = cells[0]?.id ?? '';
    persist();
  }
  function removePoint(index: number) {
    if (!selectedCell) return;
    selectedCell.points.splice(index, 1);
    cells = [...cells];
    persist();
  }
  function setHorizon(h: number) { horizon = h; }
  $: if (mounted) { cells; horizon; selectedId; target; arrival; try { redraw(); } catch (e) { console.warn('[Convective Tracker] redraw falhou', e); } }
  function refreshAnalysis() { try { redraw(); } catch (e) { console.warn('[Convective Tracker] redraw falhou', e); } }

  function extractLatLon(ev: any): {lat:number; lon:number} | null {
    const candidates = [ev?.latlng, ev?.latLng, ev?.latLon, ev?.location, ev?.coords, ev?.position, ev];
    for (const c of candidates) {
      const lat = Number(c?.lat ?? c?.latitude);
      const lon = Number(c?.lng ?? c?.lon ?? c?.longitude);
      if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) return { lat, lon };
    }
    return null;
  }
  function handleMapClick(ev: any) {
    if (targetCaptureArmed) {
      const tp = extractLatLon(ev);
      if (tp) {
        targetLatStr = tp.lat.toFixed(4);
        targetLonStr = tp.lon.toFixed(4);
        targetCaptureArmed = false;
        statusMsg = `Local marcado: ${targetLatStr}, ${targetLonStr}.`;
      }
      return;
    }
    if (!captureArmed) return;
    if (!selectedCell) createCell();
    const activeCell = cells.find(c => c.id === selectedId);
    if (!activeCell) return;
    const pos = extractLatLon(ev);
    if (!pos) {
      console.warn('[Convective Tracker] Evento de clique sem coordenadas reconhecidas:', ev);
      return;
    }
    if (store.get('overlay') !== 'radar') {
      alert('Selecione a camada Radar do Windy antes de registrar posições.');
      return;
    }
    const ts = getRadarTime();
    if (!Number.isFinite(ts) || ts <= 0) {
      alert('O Windy ainda não disponibilizou o horário. Ative o radar e selecione um horário na barra temporal.');
      return;
    }
    if (activeCell.points.some(p => p.timestamp === ts)) {
      const replace = confirm('Já existe uma posição desta célula neste horário. Substituir a posição?');
      if (!replace) return;
      activeCell.points = activeCell.points.filter(p => p.timestamp !== ts);
    }
    activeCell.points = [...activeCell.points, { ...pos, timestamp: ts }].sort((a,b) => a.timestamp - b.timestamp);
    cells = [...cells];
    statusMsg = `Posição ${activeCell.points.length} de "${activeCell.name}" registrada às ${hhmm(ts)} (${pos.lat.toFixed(3)}, ${pos.lon.toFixed(3)}).` + (activeCell.points.length < 2 ? ' Mude o horário do radar e marque a célula de novo.' : '');
    persist();
  }

  function clearLayers() {
    for (const layer of layers) { try { map.removeLayer(layer); } catch {} }
    layers = [];
  }
  function safeAdd(layer: any) {
    try { layer.addTo(map); layers.push(layer); } catch (e) { console.warn('[Convective Tracker] Falha ao adicionar camada', e); }
  }
  function labelMarker(lat: number, lon: number, text: string, color: string) {
    const icon = L.divIcon({
      className: '',
      html: `<div style="transform:translate(8px,-18px);white-space:nowrap;font:700 10px/1 sans-serif;color:#fff;background:${color}dd;padding:2px 5px;border-radius:3px;border:1px solid #0b1220;pointer-events:none">${text}</div>`,
      iconSize: [0, 0]
    });
    return L.marker([lat, lon], { icon, interactive: false, keyboard: false });
  }
  function hhmm(ts: number) {
    return new Date(ts).toISOString().substring(11, 16) + 'Z';
  }
  function redraw() {
    if (!mounted) return;
    if (!map || !L) { statusMsg = 'Aviso: mapa/Leaflet indisponível — a projeção não pode ser desenhada.'; return; }
    clearLayers();
    for (const cell of cells) {
      if (!cell.visible || !cell.points.length) continue;
      try {
        const pts = cell.points.map(p => [p.lat, p.lon]);
        safeAdd(L.polyline(pts, { color: cell.color, weight: 3, opacity: 0.95, dashArray: '5 4', interactive: false }));
        cell.points.forEach((p, i) => {
          safeAdd(L.circleMarker([p.lat, p.lon], {
            radius: i === cell.points.length - 1 ? 7 : 5, color: '#0b1220', weight: 2,
            fillColor: cell.color, fillOpacity: 1, interactive: false
          }));
          safeAdd(labelMarker(p.lat, p.lon, `P${i + 1} · ${hhmm(p.timestamp)}`, cell.color));
        });
      } catch (e) { console.warn('[Convective Tracker] Não foi possível desenhar o histórico', e); }

      if (cell.id === selectedId && cell.points.length >= 2) {
        try {
          const sel = Number(horizon);
          // faixas anteriores (múltiplos de 30 min) mais fracas + a faixa selecionada em destaque
          const minutesList = HORIZONS.filter(h => h < sel && h % 30 === 0).concat([sel]);
          const areas = projectionAreas(cell.points, minutesList);
          const lastPt = cell.points[cell.points.length - 1];
          const centers = [[lastPt.lat, lastPt.lon], ...areas.map(a => [a.center.lat, a.center.lon])];
          safeAdd(L.polyline(centers, { color: cell.color, weight: 2, opacity: 0.9, dashArray: '8 7', interactive: false }));
          areas.forEach(a => {
            const strong = a.minutes === sel;
            const col = BAND_COLORS[a.minutes] ?? '#fb923c';
            safeAdd(L.polygon(a.ring, {
              color: col, weight: strong ? 3 : 1.5, opacity: strong ? 1 : 0.55,
              fillColor: col, fillOpacity: strong ? 0.32 : 0.1, interactive: false
            }));
            if (strong) {
              safeAdd(L.circleMarker([a.center.lat, a.center.lon], {
                radius: 5, color: '#0b1220', weight: 2, fillColor: '#ffffff', fillOpacity: 1, interactive: false
              }));
            }
            safeAdd(labelMarker(a.center.lat, a.center.lon, `+${a.minutes} min · ${hhmm(a.timestamp)}`, strong ? '#0f172a' : '#334155'));
          });
        } catch (e) { console.warn('[Convective Tracker] Não foi possível desenhar projeção', e); }
      }
    }
    if (target) {
      try {
        const hit = arrival?.status === 'reaches';
        const col = hit ? '#ef4444' : '#e2e8f0';
        safeAdd(L.circleMarker([target.lat, target.lon], { radius: 8, color: '#0b1220', weight: 2, fillColor: col, fillOpacity: 0.95, interactive: false }));
        safeAdd(L.circleMarker([target.lat, target.lon], { radius: 14, color: col, weight: 2, fillOpacity: 0, interactive: false }));
        safeAdd(labelMarker(target.lat, target.lon, 'Local', hit ? '#b91c1c' : '#334155'));
      } catch (e) { console.warn('[Convective Tracker] Não foi possível desenhar o local-alvo', e); }
    }
    layers = layers;
  }

  function parseCoord(s: string, limit: number): number | null {
    const t = (s ?? '').trim().replace(',', '.');
    if (t === '' || t === '-' || t === '+') return null;
    const n = Number(t);
    return Number.isFinite(n) && Math.abs(n) <= limit ? n : NaN;
  }
  function toggleTargetCapture() {
    targetCaptureArmed = !targetCaptureArmed;
    if (targetCaptureArmed) captureArmed = false;
  }
  function clearTarget() { targetLatStr = ''; targetLonStr = ''; targetCaptureArmed = false; }

  $: latVal = parseCoord(targetLatStr, 90);
  $: lonVal = parseCoord(targetLonStr, 180);
  $: targetInvalid = (latVal !== null && Number.isNaN(latVal)) || (lonVal !== null && Number.isNaN(lonVal));
  $: target = latVal !== null && lonVal !== null && !Number.isNaN(latVal) && !Number.isNaN(lonVal) ? { lat: latVal, lon: lonVal } : null;
  $: backtest = computeBacktest(selectedCell);
  $: backtestText = backtest ? formatBacktest(backtest) : '';
  $: arrival = computeArrival(selectedCell, analysis, target);
  $: arrivalText = arrival ? formatArrival(arrival) : null;

  function computeArrival(cell: CellTrack | undefined, an: MotionAnalysis | null, tg: { lat: number; lon: number } | null): ArrivalAssessment | null {
    if (!cell || !an || !tg || cell.points.length < 2) return null;
    try { return assessArrival(cell.points, tg, 120); }
    catch (e) { console.warn('[Convective Tracker] Falha ao avaliar chegada', e); return null; }
  }
  function computeBacktest(cell: CellTrack | undefined): BacktestResult | null {
    if (!cell || cell.points.length < 3) return null;
    try { return backtestLast(cell.points); }
    catch (e) { console.warn('[Convective Tracker] Falha no teste retroativo', e); return null; }
  }
  function formatBacktest(b: BacktestResult): string {
    const dir = Math.abs(b.alongKm) < 0.5 ? 'sem desvio ao longo da trajetória' : b.alongKm > 0 ? `${b.alongKm.toFixed(1)} km À FRENTE da posição real` : `${(-b.alongKm).toFixed(1)} km ATRÁS da posição real`;
    return `Teste retroativo: usando as ${b.pointsUsed} posições anteriores para prever a última (${Math.round(b.spanMin)} min depois), o modelo errou ${b.missKm.toFixed(1)} km no total (${dir}; desvio lateral ${b.crossKm.toFixed(1)} km).`;
  }
  function rel(min: number) { return `+${Math.round(min)} min`; }
  function formatArrival(a: ArrivalAssessment): { kind: 'hit' | 'miss'; title: string; lines: string[] } {
    const clock = (m: number) => hhmm(a.originTimestamp + m * 60000);
    const geo = `Distância até o local: ${a.distanceKm.toFixed(1)} km · desvio em relação ao eixo de deslocamento: ${a.offAxisDeg.toFixed(0)}° (a área se abre até ±${a.maxHalfDeg.toFixed(0)}° em ${a.horizonMin} min).`;
    const ref = 'Tempos contados a partir da última posição registrada.';
    if (a.status === 'reaches') {
      const lines: string[] = [];
      const start = a.enterMin! <= 1 ? 'já no início da projeção' : `${rel(a.enterMin!)} (${clock(a.enterMin!)})`;
      const reachesLimit = a.leaveMin! >= a.horizonMin - 0.5;
      const stop = reachesLimit ? `até o fim da análise (+${a.horizonMin} min)` : `${rel(a.leaveMin!)} (${clock(a.leaveMin!)})`;
      lines.push(`Janela em que o local está dentro da área estimada: de ${start} a ${stop}.`);
      lines.push(a.centerMin != null
        ? `O centro da estimativa passa pelo local em ≈ ${rel(a.centerMin)} (${clock(a.centerMin)}).`
        : 'O centro da estimativa não passa exatamente sobre o local; ele fica dentro da margem de incerteza da área.');
      lines.push(geo);
      lines.push(ref);
      return { kind: 'hit', title: 'A área estimada ATINGE este local', lines };
    }
    const lines: string[] = [];
    if (a.reason === 'atras') lines.push('O local está atrás da célula em relação ao sentido de deslocamento.');
    else if (a.reason === 'lateral') lines.push(`O local fica a ≈ ${a.crossTrackKm!.toFixed(1)} km do eixo da trajetória, fora da abertura máxima da área (±${a.maxHalfDeg.toFixed(0)}°).`);
    else if (a.reason === 'alcance') lines.push(`O local está a ${a.distanceKm.toFixed(1)} km, além do alcance máximo da área em ${a.horizonMin} min (≈ ${a.maxReachKm.toFixed(0)} km).`);
    else lines.push('A combinação de distância e direção do local não coincide com a área estimada no período analisado.');
    lines.push(geo);
    lines.push(`Conclusão válida para o período de ${a.horizonMin} min com o movimento observado até agora; novas posições podem mudar o resultado.`);
    return { kind: 'miss', title: `A área estimada NÃO atinge este local em ${a.horizonMin} min`, lines };
  }

  onMount(() => {
    mounted = true;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) cells = JSON.parse(saved);
    } catch (e) { console.warn('[Convective Tracker] Dados locais não puderam ser recuperados', e); }
    selectedId = cells[0]?.id ?? '';
    radarTimestamp = getRadarTime();
    for (const key of ['timestamp', 'radsatTimestamp', 'radarCalendar']) {
      try { store.on(key as any, onRadarTime); } catch (e) { console.warn('[Convective Tracker] store.on falhou', key, e); }
    }
    clickEmitter = resolveEmitter();
    if (clickEmitter) {
      try { clickEmitter.on(config.name, handleMapClick); } catch (e) { console.warn('[Convective Tracker] singleclick.on falhou', e); clickEmitter = null; }
    }
    if (!clickEmitter && map) {
      // Fallback: clique direto no mapa Leaflet
      try { map.on('click', handleLeafletClick); mapClickFallback = true; } catch (e) { console.warn('[Convective Tracker] map.on falhou', e); }
    }
    redraw();
  });
  function onRadarTime() { radarTimestamp = getRadarTime(); }
  function handleLeafletClick(e: any) { handleMapClick(e?.latlng ? { lat: e.latlng.lat, lon: e.latlng.lng } : e); }
  onDestroy(() => {
    mounted = false;
    for (const key of ['timestamp', 'radsatTimestamp', 'radarCalendar']) {
      try { store.off(key as any, onRadarTime); } catch {}
    }
    try { clickEmitter?.off?.(config.name, handleMapClick); } catch {}
    try { if (mapClickFallback) map.off('click', handleLeafletClick); } catch {}
    clearLayers();
  });
</script>

<style>
  .tracker { color: #e7edf6; padding-bottom: 28px; }
  .heading { padding: 8px 0 18px; border-bottom: 1px solid #293548; margin-bottom: 16px; }
  .eyebrow { color: #63b3ed; font-size: 10px; letter-spacing: 1.6px; font-weight: 800; }
  h2 { font-size: 23px; margin: 5px 0; color: #f8fafc; font-weight: 750; }
  .heading p { color: #9aa9bd; font-size: 12px; margin: 0; }
  .statusbar { display:flex; align-items:center; gap:10px; background:#111d2d; border:1px solid #26374e; border-radius:9px; padding:11px; margin-bottom:20px; }
  .statusbar strong { display:block; font-size:9px; letter-spacing:.7px; color:#a8bad0; }
  .statusbar small { display:block; margin-top:3px; color:#f1f5f9; font-size:12px; }
  .status-dot,.regime-dot { width:8px; height:8px; flex:0 0 8px; border-radius:50%; background:#64748b; }
  .status-dot.live { background:#22c55e; box-shadow:0 0 0 4px #22c55e22; }
  .pill { border:1px solid #31506c; color:#7dd3fc; font-size:9px; padding:4px 7px; border-radius:20px; letter-spacing:1px; }
  .spacer { flex:1; }
  .section-title { display:flex; gap:9px; align-items:center; color:#c6d3e2; font-size:11px; font-weight:800; letter-spacing:1px; margin:20px 0 11px; }
  .section-title span { color:#38bdf8; font-variant-numeric:tabular-nums; }
  .section-title.compact { margin-top:20px; }
  .control-row { display:flex; gap:8px; }
  button { border:0; border-radius:6px; padding:10px 12px; font-weight:700; font-size:12px; cursor:pointer; }
  button:disabled { opacity:.4; cursor:not-allowed; }
  .primary { background:#0284c7; color:white; flex:1; }
  .capture { background:#25354a; color:#dbeafe; flex:1; border:1px solid #40536b; }
  .capture.armed { background:#7f1d1d; border-color:#ef4444; color:#fff; }
  .hint { color:#92a3b8; font-size:11px; line-height:1.55; margin:9px 0 14px; }
  .field-label { display:block; font-size:9px; letter-spacing:1px; color:#93a4b8; margin:13px 0 6px; font-weight:800; }
  select,input { box-sizing:border-box; width:100%; color:#edf4fb; background:#111d2d; border:1px solid #34465d; border-radius:6px; padding:9px 10px; font-size:12px; }
  option { background:#111d2d; }
  .cell-tools { display:flex; gap:8px; margin-top:8px; }
  .cell-tools input { flex:1; }
  .small { padding:8px 10px; }
  .danger { background:#4b2028; color:#fecaca; }
  .metrics { display:grid; grid-template-columns:1fr 1fr; gap:7px; margin-top:12px; }
  .metrics > div { background:#111d2d; border:1px solid #27384e; border-radius:7px; padding:10px; min-width:0; }
  .metrics small { display:block; color:#8fa2b9; font-size:9px; letter-spacing:.7px; margin-bottom:6px; }
  .metrics strong { color:#f8fafc; font-size:18px; font-variant-numeric:tabular-nums; }
  .metrics i { color:#9fb0c4; font-size:9px; font-style:normal; }
  .analysis-banner { display:flex; align-items:center; gap:9px; background:#15283a; border:1px solid #2a4861; padding:10px; border-radius:7px; margin-top:9px; }
  .analysis-banner strong { display:block; font-size:12px; color:#e0f2fe; }
  .analysis-banner small { display:block; font-size:10px; color:#93a9bf; margin-top:3px; line-height:1.4; }
  .regime-dot { background:#94a3b8; }
  .regime-dot.accelerating { background:#22c55e; }
  .regime-dot.decelerating { background:#f59e0b; }
  .empty-analysis { background:#111d2d; border:1px dashed #3b4c62; color:#9fb0c4; border-radius:7px; padding:13px; font-size:11px; line-height:1.5; margin-top:10px; }
  .point-list { border:1px solid #27384e; border-radius:7px; overflow:hidden; }
  .point-row { display:flex; align-items:center; gap:9px; padding:8px 10px; border-bottom:1px solid #27384e; }
  .point-row:last-child { border-bottom:0; }
  .point-index { width:22px; height:22px; display:grid; place-items:center; border-radius:50%; background:#20344a; color:#7dd3fc; font-size:10px; font-weight:800; }
  .point-info { flex:1; min-width:0; }
  .point-info strong,.point-info small { display:block; }
  .point-info strong { font-size:11px; color:#e2e8f0; }
  .point-info small { font-size:10px; color:#8fa2b9; margin-top:3px; }
  .icon-button { padding:2px 8px; background:transparent; color:#fca5a5; font-size:20px; }
  .horizon-row { display:flex; align-items:center; gap:10px; color:#a8b8cb; font-size:11px; }
  .horizon-buttons { display:flex; gap:6px; margin-top:8px; }
  .horizon-buttons button { flex:1; background:#1b2b3f; color:#cfe3f7; border:1px solid #34465d; padding:9px 4px; }
  .horizon-buttons button.active { background:#0284c7; color:#fff; border-color:#38bdf8; }
  .status-msg { background:#10261c; border:1px solid #1f6b45; color:#bbf7d0; padding:8px 10px; border-radius:6px; font-size:11px; line-height:1.45; margin-top:8px; }
  .forecast-list { margin-top:8px; border:1px solid #27384e; border-radius:7px; overflow:hidden; }
  .forecast-list > div { display:grid; grid-template-columns:55px 1fr 65px; gap:5px; align-items:center; padding:8px; border-bottom:1px solid #27384e; font-size:10px; }
  .forecast-list > div:last-child { border:0; }
  .forecast-list span { color:#7dd3fc; font-weight:800; }
  .forecast-list strong { color:#e2e8f0; font-weight:600; }
  .forecast-list small { color:#9aabc0; text-align:right; }
  .secondary { background:#26384e; color:#dbeafe; border:1px solid #40536b; flex:1; }
  .full { width:100%; margin-top:10px; }
  .arrival-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
  .arrival-grid label { color:#9fb0c4; font-size:10px; }
  .arrival-grid input { margin-top:5px; }
  .small-btn { flex:0 0 auto; padding:10px 14px; }
  .arrival-result.hit { background:#3a1517; border-color:#b91c1c; color:#fecaca; }
  .arrival-result.miss { background:#10261c; border-color:#1f6b45; color:#bbf7d0; }
  .arrival-result.neutral { background:#1a2535; border-color:#34465d; color:#cbd5e1; }
  .arrival-result strong { display:block; font-size:12px; margin-bottom:5px; }
  .arrival-result p { margin:4px 0 0; }
  .arrival-result { background:#123047; border:1px solid #25617f; color:#bae6fd; padding:10px; border-radius:7px; margin-top:9px; font-size:11px; line-height:1.5; }
  .disclaimer { margin-top:23px; padding:12px; border-left:3px solid #d97706; background:#2a241a; border-radius:4px; }
  .disclaimer strong { color:#fbbf24; font-size:9px; letter-spacing:1px; }
  .backtest { margin-top:8px; padding:8px 10px; border:1px dashed #34465d; border-radius:6px; color:#cbd5e1; font-size:10.5px; line-height:1.5; }
  .credits { margin-top:14px; padding-top:10px; border-top:1px solid #243447; text-align:center; font-size:10px; letter-spacing:.4px; color:#7f93a9; }
  .disclaimer p { color:#d6c7a9; font-size:10px; line-height:1.55; margin:6px 0 0; }
</style>
