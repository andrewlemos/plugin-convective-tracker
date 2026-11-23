import type { ExternalPluginConfig } from '@windy/interfaces';

const config: ExternalPluginConfig = {
  name: 'windy-plugin-convective-tracker',
  version: '1.0.8',
  icon: '🌩️',
  title: 'Convective Tracker',
  description: 'Rastreamento manual de células convectivas e extrapolação de movimento por até 120 minutos.',
  author: 'Andrew Lemos',
  repository: 'https://github.com/andrewlemos/plugin-convective-tracker',
  desktopUI: 'rhpane',
  desktopWidth: 430,
  mobileUI: 'fullscreen',
  routerPath: '/convective-tracker',
  listenToSingleclick: true,
  private: true
};

export default config;
