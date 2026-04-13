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
      name: "totem-loja-webhook",
      cwd: "/home/xulio/apps/totem-loja",
      script: "/home/xulio/.nvm/versions/node/v25.8.1/bin/node",
      args: ["--import", "tsx", "automation/saibweb-webhook.ts"],
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
