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

### 2. Obter Certificados SSL

Há várias opções para obter certificados SSL quando você está acessando a VM via IP:

#### Opção 1: Certificados Autoassinados (apenas para testes)

Esta opção é a mais simples, mas os navegadores mostrarão avisos de segurança:

```bash
# Na pasta do projeto
mkdir -p certificates

# Gerar certificados autoassinados para o IP da VM
# Substitua 123.456.789.123 pelo IP real da sua VM
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout certificates/key.pem \
  -out certificates/cert.pem \
  -subj "/CN=123.456.789.123" \
  -addext "subjectAltName = IP:123.456.789.123"
```

Em `server.js`, use:
```javascript
const httpsOptions = {
  key: fs.readFileSync(path.join(__dirname, 'certificates', 'key.pem')),
  cert: fs.readFileSync(path.join(__dirname, 'certificates', 'cert.pem'))
};
```

#### Opção 2: Let's Encrypt com serviço nip.io (melhor para testes)

Esta opção usa o serviço nip.io que mapeia IPs para nomes de domínio:

1. Instale o cliente Certbot:
```bash
sudo apt update
sudo apt install certbot
```

2. Obtenha certificados usando o domínio nip.io:
```bash
# Substitua 123.456.789.123 pelo IP real da sua VM
sudo certbot certonly --standalone -d 123-456-789-123.nip.io
```

3. Configure seu servidor:
```javascript
const httpsOptions = {
  key: fs.readFileSync('/etc/letsencrypt/live/123-456-789-123.nip.io/privkey.pem'),
  cert: fs.readFileSync('/etc/letsencrypt/live/123-456-789-123.nip.io/fullchain.pem')
};
```

#### Opção 3: Domínio dedicado com Let's Encrypt (recomendado para produção)

Esta é a melhor opção para uma implantação de produção:

1. Registre um domínio ou use um subdomínio de um domínio que você já possui
2. Configure o DNS para apontar para o IP da sua VM Azure
3. Instale Certbot e solicite um certificado:
```bash
sudo apt update
sudo apt install certbot
sudo certbot certonly --standalone -d seu-dominio.com
```

4. Configure seu servidor:
```javascript
const httpsOptions = {
  key: fs.readFileSync('/etc/letsencrypt/live/seu-dominio.com/privkey.pem'),
  cert: fs.readFileSync('/etc/letsencrypt/live/seu-dominio.com/fullchain.pem')
};
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
   # Ajuste o caminho conforme a opção de certificado escolhida
   SSL_KEY_PATH=/caminho/para/seu/key.pem
   SSL_CERT_PATH=/caminho/para/seu/cert.pem
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

### 4. Problemas comuns com certificados SSL

#### Problema: Permissões de acesso aos certificados

Se você receber erros de permissão ao tentar ler os certificados:

```bash
# Para certificados Let's Encrypt
sudo chmod -R 755 /etc/letsencrypt/live/
sudo chmod -R 755 /etc/letsencrypt/archive/

# OU copie os certificados para um local acessível pela aplicação
sudo mkdir -p /app/certificates
sudo cp /etc/letsencrypt/live/seu-dominio/privkey.pem /app/certificates/key.pem
sudo cp /etc/letsencrypt/live/seu-dominio/fullchain.pem /app/certificates/cert.pem
sudo chown -R $USER:$USER /app/certificates
```

#### Problema: Renovação de certificados Let's Encrypt

Os certificados Let's Encrypt expiram após 90 dias. Configure a renovação automática:

```bash
# Adicionar ao crontab
sudo crontab -e

# Adicione esta linha (ajuste o caminho para sua aplicação):
0 3 * * * certbot renew --quiet && systemctl restart sua-aplicacao.service
```

### 5. Configurar NGINX como Proxy Reverso (Opcional, mas recomendado)

1. Instale NGINX:
   ```bash
   sudo apt install nginx
   ```

2. Configure o site no NGINX:
   ```bash
   sudo nano /etc/nginx/sites-available/voice-rooms
   ```

3. Adicione a seguinte configuração (substitua o IP ou domínio apropriadamente):
   ```nginx
   server {
       listen 80;
       server_name 123.456.789.123;
       # Ou use o domínio se você tem um: server_name example.com www.example.com;
       
       # Redirecionar HTTP para HTTPS
       location / {
           return 301 https://$host$request_uri;
       }
   }

   server {
       listen 443 ssl;
       server_name 123.456.789.123;
       # Ou use o domínio se você tem um: server_name example.com www.example.com;

       # Ajuste para os caminhos corretos dos seus certificados
       ssl_certificate /caminho/para/seu/cert.pem;
       ssl_certificate_key /caminho/para/seu/key.pem;
       
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
   SSL_KEY_PATH=/caminho/para/seu/key.pem
   SSL_CERT_PATH=/caminho/para/seu/cert.pem
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

### Problema: Avisos de segurança no navegador com certificados autoassinados

- **Causa**: Certificados autoassinados não são reconhecidos como confiáveis pelo navegador
- **Solução**: 
  - Para desenvolvimento: Clique em "Avançado" e depois "Prosseguir para o site"
  - Para produção: Use certificados Let's Encrypt ou outra autoridade certificadora reconhecida

## Monitoramento e Manutenção

- Monitorar logs: `pm2 logs`
- Reiniciar aplicação: `pm2 restart server`
- Verificar status: `pm2 status`
- Renovar certificados Let's Encrypt: 
  ```
  sudo certbot renew
  ```