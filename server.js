const express = require('express');
const http = require('http');
const https = require('https');
const socketIO = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const fs = require('fs');
const roomsDB = require('./db'); // Importando o módulo de banco de dados

// Inicializando o app Express
const app = express();

// Configuração do CORS
app.use(cors());
app.use(express.json());

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
  try {
    const rooms = roomsDB.getAllRooms();
    
    // Transformar dados para manter compatibilidade com formato anterior
    const roomList = rooms.map(room => {
      const participants = roomsDB.getRoomParticipants(room.id);
      return {
        id: room.id,
        name: room.name,
        userCount: participants.length
      };
    });
    
    res.json({ rooms: roomList });
  } catch (error) {
    console.error('Erro ao obter salas:', error);
    res.status(500).json({ error: 'Erro ao obter salas' });
  }
});

// Configurando eventos de WebSocket
io.on('connection', (socket) => {
  console.log('Novo usuário conectado:', socket.id);
  
  // Evento: Usuário entra em uma sala
  socket.on('join-room', ({ roomId, username }) => {
    const userId = socket.id;
    
    // Verificar se a sala existe
    let room = roomsDB.getRoom(roomId);
    
    // Criar a sala se não existir
    if (!room) {
      const newRoom = {
        id: roomId,
        name: roomId,
        createdAt: Date.now(),
        maxParticipants: 10,
        isPrivate: false,
        creatorId: userId
      };
      
      roomsDB.createRoom(newRoom);
      room = newRoom;
    }
    
    // Adicionar usuário à sala
    const participant = {
      id: userId,
      roomId: roomId,
      name: username,
      joinedAt: Date.now(),
      peerId: null
    };
    
    roomsDB.addParticipant(participant);
    
    // Adicionando socket à sala
    socket.join(roomId);
    
    // Obter todos os participantes da sala
    const participants = roomsDB.getRoomParticipants(roomId);
    
    // Transformar para o formato esperado pelos clientes
    const users = {};
    participants.forEach(p => {
      users[p.id] = {
        username: p.name,
        peerId: p.peerId
      };
    });
    
    // Notificando a todos na sala sobre o novo usuário
    io.to(roomId).emit('user-joined', { 
      userId, 
      username, 
      users 
    });
    
    console.log(`${username} entrou na sala ${roomId}`);
    
    // Enviando lista de usuários na sala para o novo usuário
    socket.emit('room-users', { 
      roomId, 
      users 
    });
  });
  
  // Evento: Usuário atualiza seu peer ID
  socket.on('user-peer-id', ({ roomId, peerId }) => {
    const userId = socket.id;
    
    try {
      // Obter participante
      const participants = roomsDB.getRoomParticipants(roomId);
      const participant = participants.find(p => p.id === userId);
      
      if (participant) {
        // Atualizar o peerId - como não temos diretamente um método de atualização
        // vamos remover e adicionar novamente com o peerId atualizado
        roomsDB.removeParticipant(userId);
        
        const updatedParticipant = {
          ...participant,
          peerId: peerId
        };
        
        roomsDB.addParticipant(updatedParticipant);
        
        // Informando outros usuários sobre o novo peer ID
        socket.to(roomId).emit('user-peer-updated', { 
          userId, 
          peerId 
        });
      }
    } catch (error) {
      console.error('Erro ao atualizar peerId:', error);
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
    
    try {
      // Obter todas as salas
      const rooms = roomsDB.getAllRooms();
      
      // Verificar cada sala para encontrar o participante
      rooms.forEach(room => {
        const participants = roomsDB.getRoomParticipants(room.id);
        const isInRoom = participants.some(p => p.id === socket.id);
        
        if (isInRoom) {
          leaveRoom(socket, room.id);
        }
      });
    } catch (error) {
      console.error('Erro ao processar desconexão:', error);
    }
  });
});

// Função auxiliar para remover usuário de uma sala
function leaveRoom(socket, roomId) {
  const userId = socket.id;
  
  try {
    // Obter participantes da sala
    const participants = roomsDB.getRoomParticipants(roomId);
    const participant = participants.find(p => p.id === userId);
    
    if (participant) {
      const username = participant.name;
      
      // Remover participante
      roomsDB.removeParticipant(userId);
      
      // Verificar se a sala está vazia
      const remainingParticipants = roomsDB.getRoomParticipants(roomId);
      
      if (remainingParticipants.length === 0) {
        // Remover sala se estiver vazia
        roomsDB.deleteRoom(roomId);
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
  } catch (error) {
    console.error('Erro ao sair da sala:', error);
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