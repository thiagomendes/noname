// https-server.js
const express = require('express');
const http = require('http');
const https = require('https');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const app = express();

// Verificar se os certificados existem, caso contrário, criar certificados auto-assinados
const certPath = path.join(__dirname, 'certs');
const keyPath = path.join(certPath, 'key.pem');
const certFilePath = path.join(certPath, 'cert.pem');

if (!fs.existsSync(certPath)) {
    console.log('Pasta de certificados não encontrada. Criando...');
    fs.mkdirSync(certPath, { recursive: true });
}

if (!fs.existsSync(keyPath) || !fs.existsSync(certFilePath)) {
    console.log('Certificados não encontrados. Gerando certificados auto-assinados...');
    try {
        // Comando para gerar certificados auto-assinados
        const cmd = `openssl req -x509 -newkey rsa:4096 -keyout ${keyPath} -out ${certFilePath} -days 365 -nodes -subj "/CN=localhost"`;
        execSync(cmd);
        console.log('Certificados gerados com sucesso!');
    } catch (error) {
        console.error('Erro ao gerar certificados:', error.message);
        console.log('Continuando apenas com HTTP...');
    }
}

// Servir arquivos estáticos da pasta 'public'
app.use(express.static(path.join(__dirname, 'public')));

// Estrutura para armazenar informações de usuários e salas
const rooms = {};

// Criar servidor HTTP
const httpServer = http.createServer(app);

// Tentar criar servidor HTTPS se os certificados existirem
let httpsServer;
if (fs.existsSync(keyPath) && fs.existsSync(certFilePath)) {
    const httpsOptions = {
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certFilePath)
    };
    httpsServer = https.createServer(httpsOptions, app);
}

// Inicializar Socket.io em ambos os servidores se estiverem disponíveis
const io = socketIo(httpServer);
let httpsIo;
if (httpsServer) {
    httpsIo = socketIo(httpsServer);

    // Função para configurar os eventos do Socket.io
    const setupSocketEvents = (socketInstance) => {
        socketInstance.on('connection', (socket) => {
            console.log('Novo usuário conectado:', socket.id);

            // Usuário entra em uma sala
            socket.on('joinRoom', ({ username, roomId }) => {
                // Sai de todas as salas anteriores
                if (socket.roomId) {
                    socket.leave(socket.roomId);
                    if (rooms[socket.roomId]) {
                        // Remove o usuário da sala anterior
                        delete rooms[socket.roomId].users[socket.id];
                        // Notifica os outros usuários
                        socketInstance.to(socket.roomId).emit('userLeft', { userId: socket.id, username: socket.username });
                    }
                }

                // Entra na nova sala
                socket.join(roomId);
                socket.username = username;
                socket.roomId = roomId;

                // Inicializa a sala se não existir
                if (!rooms[roomId]) {
                    rooms[roomId] = {
                        id: roomId,
                        name: `Sala ${roomId}`,
                        users: {}
                    };
                }

                // Adiciona o usuário à sala
                rooms[roomId].users[socket.id] = {
                    id: socket.id,
                    username: username,
                    isSpeaking: false
                };

                // Notifica todos na sala sobre o novo usuário
                socketInstance.to(roomId).emit('userJoined', {
                    userId: socket.id,
                    username: username,
                    roomInfo: rooms[roomId]
                });

                // Envia informações da sala para o novo usuário
                socket.emit('roomInfo', rooms[roomId]);

                console.log(`${username} entrou na sala ${roomId}`);
            });

            // Recebe dados de áudio de um usuário e transmite para todos na sala
            socket.on('audioData', (data) => {
                if (socket.roomId) {
                    // Marca o usuário como falando
                    if (rooms[socket.roomId] && rooms[socket.roomId].users[socket.id]) {
                        rooms[socket.roomId].users[socket.id].isSpeaking = true;

                        // Notifica todos que o usuário está falando
                        socketInstance.to(socket.roomId).emit('userSpeakingStatus', {
                            userId: socket.id,
                            isSpeaking: true
                        });

                        // Envia os dados de áudio para todos na sala (exceto o remetente)
                        socket.to(socket.roomId).emit('audioData', {
                            userId: socket.id,
                            username: socket.username,
                            audioData: data
                        });

                        // Programa para desativar o status de "falando" após um breve período sem dados
                        if (socket.speakTimeout) clearTimeout(socket.speakTimeout);
                        socket.speakTimeout = setTimeout(() => {
                            if (rooms[socket.roomId] && rooms[socket.roomId].users[socket.id]) {
                                rooms[socket.roomId].users[socket.id].isSpeaking = false;
                                socketInstance.to(socket.roomId).emit('userSpeakingStatus', {
                                    userId: socket.id,
                                    isSpeaking: false
                                });
                            }
                        }, 300); // 300ms de silêncio = não está falando
                    }
                }
            });

            // Tratar a desconexão do usuário
            socket.on('disconnect', () => {
                console.log('Usuário desconectado:', socket.id, socket.username);

                if (socket.roomId && rooms[socket.roomId]) {
                    // Remove o usuário da sala
                    delete rooms[socket.roomId].users[socket.id];

                    // Notifica os outros usuários sobre a saída
                    socketInstance.to(socket.roomId).emit('userLeft', {
                        userId: socket.id,
                        username: socket.username
                    });

                    // Limpa a sala se estiver vazia
                    if (Object.keys(rooms[socket.roomId].users).length === 0) {
                        delete rooms[socket.roomId];
                        console.log(`Sala ${socket.roomId} foi removida por estar vazia`);
                    }
                }
            });
        });
    };

    // Configurar eventos para ambos os servidores
    setupSocketEvents(io);
    setupSocketEvents(httpsIo);
}

// Certifique-se de que o servidor sempre retorna o arquivo index.html para rotas não encontradas
// Isso permite que a SPA gerencie as rotas do lado do cliente
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Adicionar informação sobre protocolo na página inicial
app.get('/', (req, res, next) => {
    // Continuar com o fluxo normal
    next();
});

// Iniciar os servidores
const HTTP_PORT = process.env.HTTP_PORT || 3000;
const HTTPS_PORT = process.env.HTTPS_PORT || 3443;

httpServer.listen(HTTP_PORT, () => {
    console.log(`Servidor HTTP rodando na porta ${HTTP_PORT}`);
});

if (httpsServer) {
    server.listen(PORT, '0.0.0.0', () => {
        console.log(`Servidor HTTPS rodando na porta ${HTTPS_PORT}`);
    });
}