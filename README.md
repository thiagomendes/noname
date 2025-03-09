# Voice Rooms - Aplicação de Salas de Voz em Tempo Real

Esta é uma aplicação web que permite usuários criarem e participarem de salas de voz em tempo real usando WebRTC e WebSockets.

## Requisitos

- Node.js 14+ 
- NPM ou Yarn
- Para produção: Certificados SSL válidos

## Configuração para Desenvolvimento Local

1. Clone este repositório
2. Instale as dependências:
   ```
   npm install
   ```
3. Gere certificados autoassinados para desenvolvimento:
   ```
   npm run generate-certs
   ```
4. Inicie a aplicação em modo de desenvolvimento:
   ```
   npm run dev
   ```
5. Acesse `https://localhost` (ou a porta configurada)
   - Como os certificados são autoassinados, você precisará aceitar o aviso de segurança no navegador

## Configuração para Implantação na Azure

### 1. Criar uma VM na Azure

1. Acesse o Portal da Azure e crie uma VM Linux (Ubuntu é recomendado)
2. Configure as regras de firewall para permitir tráfego nas portas:
   - 80 (HTTP)
   - 443 (HTTPS)
   - 3000 (opcional, para desenvolvimento)

### 2. Obter um Domínio e Certificados SSL

Opção 1: Usar Let's Encrypt (gratuito)
```bash
# Instalar Certbot
sudo apt update
sudo apt install certbot

# Obter certificado (substitua example.com pelo seu domínio)
sudo certbot certonly --standalone -d example.com -d www.example.com

# Os certificados serão instalados em:
# /etc/letsencrypt/live/example.com/fullchain.pem (certificado)
# /etc/letsencrypt/live/example.com/privkey.pem (chave privada)
```

Opção 2: Usar certificados autoassinados (NÃO recomendado para produção)
```bash
# Na pasta do projeto
mkdir -p certificates
openssl req -nodes -new -x509 -keyout certificates/key.pem -out certificates/cert.pem -days 365
```

### 3. Configurar o Projeto na VM

1. Clone o repositório na VM
   ```bash
   git clone [URL_DO_REPOSITORIO]
   cd voice-rooms-app
   ```

2. Instale as dependências
   ```bash
   npm install
   ```

3. Configure as variáveis de ambiente em um arquivo `.env`:
   ```
   NODE_ENV=production
   HTTP_PORT=80
   HTTPS_PORT=443
   SSL_KEY_PATH=/etc/letsencrypt/live/example.com/privkey.pem
   SSL_CERT_PATH=/etc/letsencrypt/live/example.com/fullchain.pem
   ```

4. Instale PM2 para gerenciar o processo Node:
   ```bash
   npm install -g pm2
   ```

5. Inicie a aplicação com PM2:
   ```bash
   pm2 start server.js
   pm2 save
   pm2 startup
   ```

### 4. Configurar NGINX como Proxy Reverso (Opcional, mas recomendado)

1. Instale NGINX:
   ```bash
   sudo apt install nginx
   ```

2. Configure o site no NGINX:
   ```bash
   sudo nano /etc/nginx/sites-available/voice-rooms
   ```

3. Adicione a seguinte configuração:
   ```nginx
   server {
       listen 80;
       server_name example.com www.example.com;
       
       # Redirecionar HTTP para HTTPS
       location / {
           return 301 https://$host$request_uri;
       }
   }

   server {
       listen 443 ssl;
       server_name example.com www.example.com;

       ssl_certificate /etc/letsencrypt/live/example.com/fullchain.pem;
       ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;
       
       # Configurações de segurança SSL recomendadas
       ssl_protocols TLSv1.2 TLSv1.3;
       ssl_prefer_server_ciphers on;
       ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384;
       
       # Configurações para WebSocket
       location / {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection "upgrade";
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
   }
   ```

4. Ative o site e reinicie o NGINX:
   ```bash
   sudo ln -s /etc/nginx/sites-available/voice-rooms /etc/nginx/sites-enabled/
   sudo nginx -t  # Testar configuração
   sudo systemctl restart nginx
   ```

5. Se usar NGINX como proxy, atualize o `.env` para:
   ```
   NODE_ENV=production
   HTTP_PORT=3000  # Porta interna
   HTTPS_PORT=3001 # Porta interna para HTTPS quando usado com NGINX
   SSL_KEY_PATH=/etc/letsencrypt/live/example.com/privkey.pem
   SSL_CERT_PATH=/etc/letsencrypt/live/example.com/fullchain.pem
   ```

## Possíveis Problemas e Soluções

### Problema: Erro ao acessar microfone

- **Causa**: A API getUserMedia() só funciona em contextos seguros (HTTPS)
- **Solução**: Certifique-se de que está acessando a aplicação via HTTPS

### Problema: WebRTC não funciona atrás de NAT/Firewall

- **Causa**: Servidores STUN/TURN não configurados adequadamente
- **Solução**: Configure servidores TURN adicionais no código do cliente:
  ```javascript
  const peerConfig = {
    config: {
      'iceServers': [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { 
          urls: 'turn:seu-servidor-turn.com:3478',
          username: 'seu-username',
          credential: 'sua-senha'
        }
      ]
    }
  };
  ```

### Problema: Erro de permissão ao ler certificados

- **Causa**: O usuário que executa o Node.js não tem permissão para ler os certificados 
- **Solução**: Ajuste as permissões ou use NGINX como proxy reverso

## Monitoramento e Manutenção

- Monitorar logs: `pm2 logs`
- Reiniciar aplicação: `pm2 restart server`
- Verificar status: `pm2 status`
- Renovar certificados Let's Encrypt: 
  ```
  sudo certbot renew
  ```