const express = require('express');
const http = require('http');
const https = require('https');
const socketIO = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const fs = require('fs');

// Inicializando o app Express
const app = express();

// Configuração do CORS
app.use(cors());

// Opções para HTTPS 
// Para ambiente de produção, substitua os caminhos pelos seus certificados reais
const httpsOptions = {
  key: fs.readFileSync(path.join(__dirname, 'certificates', 'key.pem')),
  cert: fs.readFileSync(path.join(__dirname, 'certificates', 'cert.pem'))
};

// Criar servidores HTTP e HTTPS
const httpServer = http.createServer(app);
const httpsServer = https.createServer(httpsOptions, app);

// Configurando o Socket.IO para o servidor HTTPS
const io = socketIO(httpsServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Servindo arquivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// Estrutura de dados para controlar usuários e salas
const rooms = {};
/*
{
  "sala1": {
    users: {
      "userId1": { username: "User1", peerId: "peer-id-1" },
      "userId2": { username: "User2", peerId: "peer-id-2" }
    }
  }
}
*/

// Redirecionar HTTP para HTTPS
app.use((req, res, next) => {
  if (!req.secure && process.env.NODE_ENV === 'production') {
    return res.redirect(`https://${req.headers.host}${req.url}`);
  }
  next();
});

// Resposta padrão para requisições à raiz
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API para obter lista de salas
app.get('/api/rooms', (req, res) => {
  const roomList = Object.keys(rooms).map(roomId => {
    return {
      id: roomId,
      name: roomId,
      userCount: Object.keys(rooms[roomId].users).length
    };
  });
  res.json({ rooms: roomList });
});

// Configurando eventos de WebSocket
io.on('connection', (socket) => {
  console.log('Novo usuário conectado:', socket.id);
  
  // Evento: Usuário entra em uma sala
  socket.on('join-room', ({ roomId, username }) => {
    const userId = socket.id;
    
    // Criando a sala se não existir
    if (!rooms[roomId]) {
      rooms[roomId] = { users: {} };
    }
    
    // Adicionando usuário à sala
    rooms[roomId].users[userId] = { 
      username, 
      peerId: null 
    };
    
    // Adicionando socket à sala
    socket.join(roomId);
    
    // Notificando a todos na sala sobre o novo usuário
    io.to(roomId).emit('user-joined', { 
      userId, 
      username, 
      users: rooms[roomId].users 
    });
    
    console.log(`${username} entrou na sala ${roomId}`);
    
    // Enviando lista de usuários na sala para o novo usuário
    socket.emit('room-users', { 
      roomId, 
      users: rooms[roomId].users 
    });
  });
  
  // Evento: Usuário atualiza seu peer ID
  socket.on('user-peer-id', ({ roomId, peerId }) => {
    const userId = socket.id;
    
    if (rooms[roomId]?.users[userId]) {
      rooms[roomId].users[userId].peerId = peerId;
      
      // Informando outros usuários sobre o novo peer ID
      socket.to(roomId).emit('user-peer-updated', { 
        userId, 
        peerId 
      });
    }
  });
  
  // Evento: Sinalização WebRTC
  socket.on('signal', ({ userId, signal }) => {
    io.to(userId).emit('signal', {
      userId: socket.id,
      signal
    });
  });
  
  // Evento: Usuário começa a falar
  socket.on('user-speaking', ({ roomId, isSpeaking }) => {
    const userId = socket.id;
    socket.to(roomId).emit('user-speaking-state', {
      userId,
      isSpeaking
    });
  });
  
  // Evento: Usuário sai de uma sala
  socket.on('leave-room', ({ roomId }) => {
    leaveRoom(socket, roomId);
  });
  
  // Evento: Desconexão
  socket.on('disconnect', () => {
    console.log('Usuário desconectado:', socket.id);
    
    // Removendo usuário de todas as salas
    Object.keys(rooms).forEach(roomId => {
      if (rooms[roomId].users[socket.id]) {
        leaveRoom(socket, roomId);
      }
    });
  });
});

// Função auxiliar para remover usuário de uma sala
function leaveRoom(socket, roomId) {
  const userId = socket.id;
  
  if (rooms[roomId] && rooms[roomId].users[userId]) {
    const username = rooms[roomId].users[userId].username;
    
    // Removendo usuário da sala
    delete rooms[roomId].users[userId];
    
    // Removendo sala se estiver vazia
    if (Object.keys(rooms[roomId].users).length === 0) {
      delete rooms[roomId];
      console.log(`Sala ${roomId} removida por estar vazia`);
    } else {
      // Notificando outros usuários sobre a saída
      socket.to(roomId).emit('user-left', { 
        userId, 
        username 
      });
    }
    
    // Removendo socket da sala
    socket.leave(roomId);
    console.log(`${username} saiu da sala ${roomId}`);
  }
}

// Configuração de portas
const HTTP_PORT = process.env.HTTP_PORT || 80;
const HTTPS_PORT = process.env.HTTPS_PORT || 443;

// Iniciando os servidores
httpServer.listen(HTTP_PORT, () => {
  console.log(`Servidor HTTP rodando na porta ${HTTP_PORT}`);
});

httpsServer.listen(HTTPS_PORT, () => {
  console.log(`Servidor HTTPS rodando na porta ${HTTPS_PORT}`);
  console.log(`Acesse: https://seu-dominio:${HTTPS_PORT}`);
});