# Deploy Totem Loja

## Portas usadas

- `4174`: frontend `vite preview`
- `3334`: webhook SAIBWEB
- `8081`: Nginx deste projeto

## PM2

Este projeto possui um arquivo [`ecosystem.config.cjs`](/home/xulio/apps/totem-loja/ecosystem.config.cjs) com os dois processos:

- `totem-loja-frontend`
- `totem-loja-webhook`

Comandos:

```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

Depois de rodar `pm2 startup`, execute o comando que o próprio PM2 mostrar na tela para registrar a inicialização automática no boot.

## Nginx

O arquivo [`nginx/totem-loja.conf`](/home/xulio/apps/totem-loja/nginx/totem-loja.conf) publica este projeto na porta `8081`, sem usar a porta `80` que já está ocupada por outro sistema.

- `/` -> `127.0.0.1:4174`
- `/webhook/` -> `127.0.0.1:3334`

Exemplo de instalação:

```bash
sudo cp nginx/totem-loja.conf /etc/nginx/sites-available/totem-loja.conf
sudo ln -s /etc/nginx/sites-available/totem-loja.conf /etc/nginx/sites-enabled/totem-loja.conf
sudo nginx -t
sudo systemctl reload nginx
sudo systemctl enable nginx
```

## Resultado esperado

Com `pm2 save`, `pm2 startup` e `nginx` habilitado:

- ao reiniciar o servidor, o frontend sobe automaticamente
- o webhook sobe automaticamente
- o Nginx volta automaticamente
- o sistema fica acessível pela porta `8081`
