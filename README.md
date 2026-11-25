# Convective Tracker — Windy Plugin

Plugin para rastreamento **manual** de células convectivas no Windy.com, utilizando o horário de radar da própria plataforma (`store.timestamp`).

## Funcionalidades

- Registro de posições por clique no mapa, associado ao `timestamp` ativo.
- Várias células, cada uma com nome, cor e histórico independente.
- Cálculo de distância geodésica, velocidade média e azimute.
- Com dois pontos: extrapolação com velocidade constante.
- Com dois pontos: velocidade e direção do trecho. Com três ou mais: velocidade do **último trecho**; aceleração a partir da diferença entre os dois últimos trechos (se significativa); direção suavizada por regressão.
- Projeção de 15 em 15 minutos até 120 minutos.
- **Área provável de posição** (setor anular, estilo Colibri) para o intervalo selecionado (15, 30, 60, 90 ou 120 min), redesenhada ao clicar em cada botão. A incerteza vem da dispersão de velocidade e de azimute das posições marcadas (mín. 15% / 10°), cresce levemente com o tempo e tem piso de 2 km. É uma estimativa heurística, não uma probabilidade calibrada.
- Trajetória observada e projetada desenhadas no mapa.
- Persistência local no navegador, edição/remoção de pontos e células.
- **Chegada a um local:** o local é marcado clicando no mapa (ou digitando as coordenadas, com ponto ou vírgula decimal). O plugin compara o ponto com a **mesma área estimada desenhada no mapa** e informa se a área o atinge, a janela de tempo em que ele está dentro da área (início e fim) e quando o centro da estimativa passa por ele. Quando não atinge, informa o motivo: fora do eixo lateralmente, atrás da célula ou além do alcance em 120 min. O resultado atualiza sozinho ao mudar posições ou o local.

## Requisitos

- Node.js LTS e npm.
- Navegador com acesso ao Windy.com.
- Windy.com com camada Radar selecionada para que `timestamp` represente o tempo que se deseja registrar.

## Instalação e desenvolvimento (Windows)

1. Extraia o ZIP.
2. Abra o terminal na pasta `convective-tracker-windy`.
3. Execute:

```bash
npm install
npm start
```

4. Abra `https://localhost:9999/plugin.js` em uma nova aba e aceite o certificado local autoassinado.
5. Acesse `https://www.windy.com/developer-mode`.
6. Carregue o plugin usando `https://localhost:9999/plugin.js`.

Para compilar uma versão de distribuição:

```bash
npm run build
```

No Windows, se o comando acima não funcionar no Prompt de Comando, use `npm run build:win`.

O arquivo compilado ficará em `dist/plugin.min.js` (junto com `dist/package.json`), que é o artefato a ser publicado/hospedado.

## Como operar

> Os campos de coordenadas bloqueiam os atalhos de teclado do Windy (por exemplo `-` e `+` para zoom) enquanto você digita.

1. Ative a camada Radar no Windy.
2. Abra o Convective Tracker.
3. Na barra temporal nativa do Windy, selecione um horário de radar.
4. No painel, crie uma célula e ative **Captura ativa**.
5. Clique no centro da célula no mapa.
6. Mude o horário pela barra do Windy e clique novamente no centro da mesma célula.
7. Repita. Com dois pontos já há velocidade/direção; com três ou mais o plugin usa a velocidade do último trecho e estima aceleração pela diferença entre os dois últimos trechos.
8. Desative a captura ao terminar.

## Validação

O painel mostra um **teste retroativo** (com 3 ou mais posições): o plugin usa as posições anteriores para prever a última posição marcada e informa o erro (à frente/atrás e lateral). Registre esses valores em vários casos reais: se o erro for consistentemente "à frente", isso é evidência para calibrar o modelo com dados reais.

Simulações (marcações com erro de 2 km, 5 posições, projeção de +60 min) mostraram que a regressão reduz o erro médio de ≈ 23 km para ≈ 3 km quando a velocidade é de fato constante. Para células que realmente desaceleram ou aceleram, a tendência costuma ser pequena demais para ser detectada com poucos pontos ruidosos, e o modelo tende a manter a velocidade média observada.

## Modelo matemático (v1.1 — correção de superestimação)

**Velocidade de projeção.** Usa a velocidade do **último trecho** marcado (movimento atual), não a média de todo o trajeto. A média temporal superestimava o deslocamento em células que desaceleram (comportamento comum na maturidade/dissipação).

**Direção.** Azimute do último trecho, suavizado (30%) com regressão vetorial quando há ≥3 posições — reduz ruído de marcação sem puxar a velocidade para a média.

**Aceleração.** Com ≥3 posições (≥2 trechos): compara a velocidade do penúltimo trecho com a do último, dividida pelo tempo entre os centros dos trechos. Só entra se superar o ruído de marcação (~1,5σ) e após tetos físicos (|a| ≤ 0,00075 m/s² ≈ 8 km/h em 30 min). A aceleração decai exponencialmente (τ = 30 min); a velocidade assintótica fica limitada a 60–140% da velocidade atual.

**Projeção da distância:**

\[
s(t) = v_0 t + (v_\infty - v_0)\left[t - \tau\left(1-e^{-t/\tau}\right)\right],\quad v_\infty = \mathrm{clamp}(v_0 + a\tau)
\]

Com \(a = 0\) reduz-se a \(s = v_0 t\) (velocidade constante do último trecho). Velocidade clampada em 3–100 km/h.

**Área provável.** Setor anular centrado no deslocamento cinemático acima; a incerteza radial/angular cresce com o tempo (piso 2 km, abertura mínima 10°).

## Limitações científicas e operacionais

- A aceleração é **tangencial** (variação da velocidade escalar). Não estima aceleração lateral nem curva futura; a direção projetada permanece igual ao último azimute observado.
- Não modela crescimento, dissipação, fusão, divisão, regeneração ou reorganização convectiva.
- A ETA é uma aproximação geométrica e só é apresentada quando o destino está próximo do eixo atual de deslocamento.
- A interface recebe cliques pelo mecanismo `@windy/singleclick`. A estrutura do evento de clique e a disponibilidade real de `timestamp` devem ser confirmadas no ambiente Windy alvo.
- Esta versão (1.0.1) corrige o erro de abertura (`Cannot read properties of undefined (reading 'get')`). Execute os testes de aceitação abaixo antes de uso operacional.

## Testes de aceitação recomendados

- [ ] `npm install` conclui sem erros.
- [ ] `npm start` disponibiliza `https://localhost:9999/plugin.js`.
- [ ] O plugin abre em Developer Mode sem erros no console.
- [ ] `timestamp` muda ao mover a barra temporal com Radar ativo.
- [ ] O clique registra latitude, longitude e timestamp corretos.
- [ ] Dois pontos produzem velocidade constante e projeção.
- [ ] Com 4 ou mais pontos e tendência clara de velocidade, o painel indica aceleração/desaceleração; com tendência fraca, indica "sem evidência estatística de aceleração".
- [ ] Pontos fora de ordem, timestamps duplicados e remoções são tratados corretamente.
- [ ] A trajetória desenhada acompanha os pontos e a projeção calculada.

## Estrutura

```text
convective-tracker-windy/
├── package.json
├── rollup.config.js
├── tsconfig.json
├── README.md
└── src/
    ├── plugin.svelte
    ├── pluginConfig.ts
    ├── types.ts
    └── motion.ts
```

## Referências oficiais

- Windy Plugins Guide: https://docs.windy-plugins.com/
- Template oficial: https://github.com/windycom/windy-plugin-template
- Store API: https://docs.windy-plugins.com/api/modules/store.html
- Store properties: https://docs.windy-plugins.com/api/interfaces/DataSpecifications.DataSpecifications.html
- Single click API: https://docs.windy-plugins.com/api/modules/singleclick.html
- Plugin configuration: https://docs.windy-plugins.com/api/interfaces/ExternalPluginConfig.html

Desenvolvido por Andrew Lemos.
