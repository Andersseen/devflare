export const environment = {
  production: true,
  apiUrl: process.env['NG_APP_API_URL'] || 'https://api.devflare.io',
  appName: 'DevFlare',
  version: process.env['NG_APP_VERSION'] || '1.0.0',
  features: {
    enableAuth: true,
    enableCloudStorage: true,
    enableDeployments: true,
  },
  webContainer: {
    enabled: true,
  },
};
