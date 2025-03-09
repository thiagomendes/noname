// db.js
const Database = require('better-sqlite3');

// Inicializar o banco de dados em memória
// Para persistência em disco, substitua ':memory:' por um caminho de arquivo
const db = new Database(':memory:');

// Criar tabela de salas se não existir
db.exec(`
  CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    createdAt INTEGER NOT NULL,
    maxParticipants INTEGER DEFAULT 10,
    isPrivate INTEGER DEFAULT 0,
    password TEXT,
    creatorId TEXT
  )
`);

// Criar tabela de participantes se não existir
db.exec(`
  CREATE TABLE IF NOT EXISTS participants (
    id TEXT PRIMARY KEY,
    roomId TEXT NOT NULL,
    name TEXT NOT NULL,
    joinedAt INTEGER NOT NULL,
    peerId TEXT,
    FOREIGN KEY (roomId) REFERENCES rooms (id)
  )
`);

// Preparar statements para operações comuns
const statements = {
  // Salas
  createRoom: db.prepare(`
    INSERT INTO rooms (id, name, createdAt, maxParticipants, isPrivate, password, creatorId)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `),
  getRoomById: db.prepare('SELECT * FROM rooms WHERE id = ?'),
  getAllRooms: db.prepare('SELECT * FROM rooms'),
  deleteRoom: db.prepare('DELETE FROM rooms WHERE id = ?'),
  
  // Participantes
  addParticipant: db.prepare(`
    INSERT INTO participants (id, roomId, name, joinedAt)
    VALUES (?, ?, ?, ?)
  `),
  getParticipantsByRoom: db.prepare('SELECT * FROM participants WHERE roomId = ?'),
  removeParticipant: db.prepare('DELETE FROM participants WHERE id = ?'),
  removeAllParticipants: db.prepare('DELETE FROM participants WHERE roomId = ?')
};

// API do banco de dados
const roomsDB = {
  // Gerenciamento de salas
  createRoom: (room) => {
    return statements.createRoom.run(
      room.id,
      room.name,
      room.createdAt || Date.now(),
      room.maxParticipants || 10,
      room.isPrivate ? 1 : 0,
      room.password || null,
      room.creatorId || null
    );
  },
  
  getRoom: (roomId) => {
    const room = statements.getRoomById.get(roomId);
    if (room) {
      // Converter de volta para booleano
      room.isPrivate = !!room.isPrivate;
    }
    return room;
  },
  
  getAllRooms: () => {
    const rooms = statements.getAllRooms.all();
    // Converter campos numéricos de volta para booleanos
    return rooms.map(room => ({
      ...room,
      isPrivate: !!room.isPrivate
    }));
  },
  
  deleteRoom: (roomId) => {
    // Primeiro remover todos os participantes
    statements.removeAllParticipants.run(roomId);
    // Depois remover a sala
    return statements.deleteRoom.run(roomId);
  },
  
  // Gerenciamento de participantes
  addParticipant: (participant) => {
    // Atualizar a declaração SQL para incluir peerId
    statements.addParticipant = db.prepare(`
      INSERT INTO participants (id, roomId, name, joinedAt, peerId)
      VALUES (?, ?, ?, ?, ?)
    `);
    
    return statements.addParticipant.run(
      participant.id,
      participant.roomId,
      participant.name,
      participant.joinedAt || Date.now(),
      participant.peerId || null
    );
  },
  
  getRoomParticipants: (roomId) => {
    return statements.getParticipantsByRoom.all(roomId);
  },
  
  removeParticipant: (participantId) => {
    return statements.removeParticipant.run(participantId);
  }
};

module.exports = roomsDB;