module.exports = {
  /**
   * Application configuration section
   * http://pm2.keymetrics.io/docs/usage/application-declaration/
   */
  apps : [
    {
      name      : 'Agora Science API',
      script    : './bin/www',
      env: {
        DEBUG: 'setup',
        NODE_ENV: 'development'
      },
      env_production : {
        DEBUG: 'setup',
        NODE_ENV: 'production'
      }
    }
  ]
};
