# Convective Tracker — Windy Plugin

Plugin para rastreamento **manual** de células convectivas no Windy.com, utilizando o horário de radar da própria plataforma (`store.timestamp`).

## Funcionalidades

- Registro de posições por clique no mapa, associado ao `timestamp` ativo.
- Várias células, cada uma com nome, cor e histórico independente.
- Cálculo de distância geodésica, velocidade média e azimute.
- Com dois pontos: extrapolação com velocidade constante.
- Com três ou mais pontos: o vetor de movimento é ajustado por regressão linear sobre **todas** as posições. A aceleração só é considerada com 4 ou mais posições e quando a tendência é estatisticamente significativa.
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
7. Repita. Com dois pontos já há cálculo de velocidade; com três ou mais o vetor de movimento passa a ser ajustado por regressão, e com quatro ou mais o plugin avalia se há aceleração estatisticamente significativa.
8. Desative a captura ao terminar.

## Validação

O painel mostra um **teste retroativo** (com 3 ou mais posições): o plugin usa as posições anteriores para prever a última posição marcada e informa o erro (à frente/atrás e lateral). Registre esses valores em vários casos reais: se o erro for consistentemente "à frente", isso é evidência para calibrar o modelo com dados reais.

Simulações (marcações com erro de 2 km, 5 posições, projeção de +60 min) mostraram que a regressão reduz o erro médio de ≈ 23 km para ≈ 3 km quando a velocidade é de fato constante. Para células que realmente desaceleram ou aceleram, a tendência costuma ser pequena demais para ser detectada com poucos pontos ruidosos, e o modelo tende a manter a velocidade média observada.

## Modelo matemático

**Vetor de movimento.** As posições são convertidas para um plano local (km) e ajustadas por mínimos quadrados em função do tempo; a inclinação é o vetor velocidade (com 2 posições é o próprio intervalo). O erro de marcação assumido é de 2 km por componente (`POSITION_ERROR_KM` em `motion.ts`), e dele sai a incerteza estatística da velocidade, que alarga a área quando há poucos pontos ou intervalo curto.

**Aceleração.** Só entra com 4 ou mais posições, ajustando por mínimos quadrados ponderados a velocidade dos intervalos em função do tempo, e apenas se |aceleração| > 2 erros-padrão. Caso contrário, assume-se velocidade constante e o painel indica que não há evidência estatística de aceleração. Quando entra, a projeção da distância é:

\[
s(t) = v_0 t + (v_\infty - v_0)\left[t - \tau\left(1-e^{-t/\tau}\right)\right],\quad v_\infty = v_0 + a\tau
\]

Quando considerada, a aceleração **não é extrapolada indefinidamente**: ela decai exponencialmente (constante de 40 min), de modo que a velocidade tende a um valor limitado entre 30% e 250% da última velocidade observada. Assim a célula nunca "para" nem recua na projeção, e as áreas de 15, 30, 60, 90 e 120 min avançam sempre ao longo da trajetória. A área de cada intervalo sempre cobre também a hipótese de velocidade constante.

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
