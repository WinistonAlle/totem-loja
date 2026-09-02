module.exports = {
  apps: [
    {
      name: "totem-loja-frontend",
      cwd: "/home/xulio/apps/totem-loja",
      script: "/usr/bin/bash",
      args: ["-lc", "npm run preview -- --host 127.0.0.1 --port 4174"],
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: "production",
      },
    },
    {
      // Sincronização de pedidos com o CIGAM. Substituiu o antigo
      // totem-loja-webhook (SAIBWEB/Playwright), que foi removido do pm2 e
      // daqui — deixá-lo no arquivo fazia um `pm2 start ecosystem.config.cjs`
      // ressuscitar a automação aposentada.
      //
      // NÃO SUBIR sem antes rodar `node scripts/cigam-preflight.mjs`: com
      // CIGAM_AUTO_EFETIVAR_PEDIDO=1 este processo emite NOTA FISCAL REAL
      // (série CF1) para todo pedido em erp_status=PENDING assim que sobe. E
      // o CIGAM aceita uma sessão por usuário — `winiston.a` é o mesmo do PDV
      // em produção, então subir isso em horário de loja pode derrubar a
      // sessão do caixa. Regra herdada do PDV: só depois das 16:45.
      name: "totem-loja-cigam",
      cwd: "/home/xulio/apps/totem-loja",
      script: "/home/xulio/.nvm/versions/node/v25.8.1/bin/node",
      args: ["--import", "tsx", "automation/cigam-sync-service.ts"],
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
