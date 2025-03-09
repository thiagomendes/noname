// db.js
const Datastore = require('nedb');

// Criar coleções em memória (sem persistência)
// Para persistência em disco, substitua o objeto vazio por um caminho de arquivo
const rooms = new Datastore({ inMemory: true });
const participants = new Datastore({ inMemory: true });

// Garantir que os índices necessários estejam criados
rooms.ensureIndex({ fieldName: 'id', unique: true });
participants.ensureIndex({ fieldName: 'id', unique: true });
participants.ensureIndex({ fieldName: 'roomId' });

// API do banco de dados
const roomsDB = {
  // Gerenciamento de salas
  createRoom: (room) => {
    return new Promise((resolve, reject) => {
      rooms.insert(room, (err, newRoom) => {
        if (err) reject(err);
        else resolve(newRoom);
      });
    });
  },
  
  getRoom: (roomId) => {
    return new Promise((resolve, reject) => {
      rooms.findOne({ id: roomId }, (err, room) => {
        if (err) reject(err);
        else resolve(room);
      });
    });
  },
  
  getAllRooms: () => {
    return new Promise((resolve, reject) => {
      rooms.find({}, (err, allRooms) => {
        if (err) reject(err);
        else resolve(allRooms);
      });
    });
  },
  
  deleteRoom: (roomId) => {
    return new Promise((resolve, reject) => {
      rooms.remove({ id: roomId }, {}, (err, numRemoved) => {
        if (err) reject(err);
        else resolve(numRemoved);
      });
    });
  },
  
  // Gerenciamento de participantes
  addParticipant: (participant) => {
    return new Promise((resolve, reject) => {
      participants.insert(participant, (err, newParticipant) => {
        if (err) reject(err);
        else resolve(newParticipant);
      });
    });
  },
  
  updateParticipant: (participantId, updates) => {
    return new Promise((resolve, reject) => {
      participants.update({ id: participantId }, { $set: updates }, {}, (err, numUpdated) => {
        if (err) reject(err);
        else resolve(numUpdated);
      });
    });
  },
  
  getRoomParticipants: (roomId) => {
    return new Promise((resolve, reject) => {
      participants.find({ roomId: roomId }, (err, roomParticipants) => {
        if (err) reject(err);
        else resolve(roomParticipants);
      });
    });
  },
  
  getParticipant: (participantId) => {
    return new Promise((resolve, reject) => {
      participants.findOne({ id: participantId }, (err, participant) => {
        if (err) reject(err);
        else resolve(participant);
      });
    });
  },
  
  removeParticipant: (participantId) => {
    return new Promise((resolve, reject) => {
      participants.remove({ id: participantId }, {}, (err, numRemoved) => {
        if (err) reject(err);
        else resolve(numRemoved);
      });
    });
  },
  
  removeAllParticipants: (roomId) => {
    return new Promise((resolve, reject) => {
      participants.remove({ roomId: roomId }, { multi: true }, (err, numRemoved) => {
        if (err) reject(err);
        else resolve(numRemoved);
      });
    });
  }
};

module.exports = roomsDB;