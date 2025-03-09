// Elementos da UI
const welcomeScreen = document.getElementById('welcome-screen');
const roomScreen = document.getElementById('room-screen');
const joinRoomBtn = document.getElementById('join-room-btn');
const createRoomBtn = document.getElementById('create-room-btn');
const leaveRoomBtn = document.getElementById('leave-room-btn');
const inviteBtn = document.getElementById('invite-btn');
const micBtn = document.getElementById('mic-btn');
const roomsGrid = document.getElementById('rooms-grid');
const participantsContainer = document.getElementById('participants-container');
const currentRoomName = document.getElementById('current-room-name');
const usernameDisplay = document.getElementById('username-display');
const userInfo = document.getElementById('user-info');

// Elementos dos modais
const joinModalOverlay = document.getElementById('join-modal-overlay');
const joinModalClose = document.getElementById('join-modal-close');
const joinModalCancel = document.getElementById('join-modal-cancel');
const joinModalSubmit = document.getElementById('join-modal-submit');
const createModalOverlay = document.getElementById('create-modal-overlay');
const createModalClose = document.getElementById('create-modal-close');
const createModalCancel = document.getElementById('create-modal-cancel');
const createModalSubmit = document.getElementById('create-modal-submit');
const inviteModalOverlay = document.getElementById('invite-modal-overlay');
const inviteModalClose = document.getElementById('invite-modal-close');
const copyInviteLink = document.getElementById('copy-invite-link');
const joiningOverlay = document.getElementById('joining-overlay');

// Campos de formulário
const usernameInput = document.getElementById('username');
const roomSelection = document.getElementById('room-selection');
const customRoomInput = document.getElementById('custom-room');
const roomNameInput = document.getElementById('room-name');
const createUsernameInput = document.getElementById('create-username');
const inviteLinkInput = document.getElementById('invite-link');

// Estado da aplicação
let currentUser = {
    id: null,
    username: '',
    roomId: null,
    isMuted: false,
    isSpeaking: false
};

let peers = {};
let audioStreams = {};
let localStream = null;

// Verificar se estamos em HTTPS
if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
    window.location.href = 'https://' + window.location.host + window.location.pathname + window.location.search;
}

// Conectar ao servidor Socket.IO (automaticamente usa HTTPS se o site estiver em HTTPS)
const socket = io();

// Configuração para WebRTC com HTTPS
const peerConfig = {
    secure: window.location.protocol === 'https:',
    config: {
        'iceServers': [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            // Adicione servidores TURN se necessário para NAT traversal mais confiável
            // { urls: 'turn:seu-servidor-turn.com', username: 'username', credential: 'credential' }
        ]
    }
};

// Iniciar Peer para WebRTC
const peer = new Peer(peerConfig);

// Inicialização
window.addEventListener('DOMContentLoaded', () => {
    initApp();
    loadRooms();

    // Verificar se há uma sala na URL
    const urlParams = new URLSearchParams(window.location.search);
    const roomId = urlParams.get('room');

    if (roomId) {
        customRoomInput.value = roomId;
        openJoinModal();
    }
});

// Funções de inicialização
function initApp() {
    // Inicialização da aplicação
    showWelcomeScreen();
    setupEventListeners();

    // Inicializar Peer
    peer.on('open', (id) => {
        console.log('Peer ID:', id);
    });

    peer.on('error', (err) => {
        console.error('Peer error:', err);
        showError('Erro de conexão WebRTC. Tente novamente.');
    });

    // Inicializar detecção de áudio
    setupAudioDetection();

    // Carregar nome de usuário do localStorage se disponível
    const savedUsername = localStorage.getItem('voice-rooms-username');
    if (savedUsername) {
        usernameInput.value = savedUsername;
        createUsernameInput.value = savedUsername;
    }
}

function setupEventListeners() {
    // Botões principais
    joinRoomBtn.addEventListener('click', openJoinModal);
    createRoomBtn.addEventListener('click', openCreateModal);
    leaveRoomBtn.addEventListener('click', leaveRoom);
    inviteBtn.addEventListener('click', openInviteModal);
    micBtn.addEventListener('click', toggleMicrophone);

    // Modais
    joinModalClose.addEventListener('click', closeJoinModal);
    joinModalCancel.addEventListener('click', closeJoinModal);
    joinModalSubmit.addEventListener('click', handleJoinRoom);
    createModalClose.addEventListener('click', closeCreateModal);
    createModalCancel.addEventListener('click', closeCreateModal);
    createModalSubmit.addEventListener('click', handleCreateRoom);
    inviteModalClose.addEventListener('click', closeInviteModal);
    copyInviteLink.addEventListener('click', copyInviteLinkToClipboard);

    // Campos de formulário
    roomSelection.addEventListener('change', handleRoomSelectionChange);
    customRoomInput.addEventListener('input', handleCustomRoomInput);

    // Socket.IO
    socket.on('connect', () => {
        console.log('Conectado ao servidor:', socket.id);
    });

    socket.on('disconnect', () => {
        console.log('Desconectado do servidor');
        if (currentUser.roomId) {
            showError('Você foi desconectado do servidor. Atualizando a página...');
            setTimeout(() => window.location.reload(), 3000);
        }
    });

    socket.on('user-joined', ({ userId, username, users }) => {
        console.log(`${username} entrou na sala`);
        updateParticipants(users);

        if (userId !== socket.id) {
            showNotification(`${username} entrou na sala`);

            // Iniciar conexão com o novo usuário
            connectToNewUser(userId);
        }
    });

    socket.on('user-left', ({ userId, username }) => {
        console.log(`${username} saiu da sala`);
        removeParticipant(userId);
        showNotification(`${username} saiu da sala`);

        // Limpar conexões WebRTC
        if (peers[userId]) {
            peers[userId].close();
            delete peers[userId];
        }

        if (audioStreams[userId]) {
            delete audioStreams[userId];
        }
    });

    socket.on('room-users', ({ roomId, users }) => {
        console.log('Usuários na sala:', users);
        updateParticipants(users);

        // Conectar ao peer de cada usuário existente
        Object.keys(users).forEach(userId => {
            if (userId !== socket.id && users[userId].peerId) {
                connectToNewUser(userId, users[userId].peerId);
            }
        });
    });

    socket.on('user-peer-updated', ({ userId, peerId }) => {
        console.log(`Peer ID atualizado para usuário ${userId}: ${peerId}`);
        connectToNewUser(userId, peerId);
    });

    socket.on('signal', ({ userId, signal }) => {
        handleSignal(userId, signal);
    });

    socket.on('user-speaking-state', ({ userId, isSpeaking }) => {
        updateSpeakingState(userId, isSpeaking);
    });

    // Peer events
    peer.on('call', (call) => {
        console.log('Recebendo chamada de áudio do peer:', call.peer);

        if (localStream) {
            call.answer(localStream);

            call.on('stream', (remoteStream) => {
                console.log('Stream recebido do peer:', call.peer);
                addAudioStream(call.peer, remoteStream);
            });

            call.on('error', (err) => {
                console.error('Erro na chamada:', err);
            });
        } else {
            console.warn('Sem stream local para responder à chamada');
        }
    });
}

function setupAudioDetection() {
    // Configuração da detecção de fala
    let audioContext;
    let analyser;
    let isSpeakingThisFrame = false;
    let speakingTimeout;

    const speakingThreshold = 0.01;
    const minSpeakingTime = 300;

    function detectSpeaking(stream) {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 512;
            analyser.smoothingTimeConstant = 0.5;
        }

        const source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        function checkAudioLevel() {
            if (!localStream || currentUser.isMuted) {
                if (currentUser.isSpeaking) {
                    updateLocalSpeakingState(false);
                }
                requestAnimationFrame(checkAudioLevel);
                return;
            }

            analyser.getByteFrequencyData(dataArray);

            // Calcular nível de volume médio
            let sum = 0;
            for (let i = 0; i < bufferLength; i++) {
                sum += dataArray[i];
            }

            const average = sum / bufferLength / 255;

            // Definir estado de fala
            if (average > speakingThreshold) {
                if (!isSpeakingThisFrame) {
                    isSpeakingThisFrame = true;
                    if (!currentUser.isSpeaking) {
                        updateLocalSpeakingState(true);
                    }
                }

                // Reiniciar timeout
                clearTimeout(speakingTimeout);
                speakingTimeout = setTimeout(() => {
                    isSpeakingThisFrame = false;
                    updateLocalSpeakingState(false);
                }, minSpeakingTime);
            }

            requestAnimationFrame(checkAudioLevel);
        }

        checkAudioLevel();
    }

    // Atualizar estado de fala e enviar para outros usuários
    function updateLocalSpeakingState(isSpeaking) {
        currentUser.isSpeaking = isSpeaking;
        updateSpeakingState(socket.id, isSpeaking);

        if (currentUser.roomId) {
            socket.emit('user-speaking', {
                roomId: currentUser.roomId,
                isSpeaking
            });
        }
    }

    window.detectSpeaking = detectSpeaking;
}

// Gestão de salas
async function loadRooms() {
    try {
        const response = await fetch('/api/rooms');
        const data = await response.json();

        roomsGrid.innerHTML = '';
        roomSelection.innerHTML = '<option value="">Selecione uma sala</option>';

        if (data.rooms.length === 0) {
            roomsGrid.innerHTML = `
        <div class="room-card">
          <h3 class="room-name">Nenhuma sala disponível</h3>
          <div class="room-info">
            <p>Crie uma nova sala para começar</p>
          </div>
        </div>
      `;
        } else {
            data.rooms.forEach((room) => {
                addRoomToUI(room);
            });
        }
    } catch (error) {
        console.error('Erro ao carregar salas:', error);
        showError('Não foi possível carregar a lista de salas.');
    }
}

function addRoomToUI(room) {
    // Adicionar à grid de salas
    const roomCard = document.createElement('div');
    roomCard.className = 'room-card';
    roomCard.innerHTML = `
    <h3 class="room-name">${room.name}</h3>
    <div class="room-info">
      <i class="fas fa-user"></i>
      <span>${room.userCount} ${room.userCount === 1 ? 'usuário' : 'usuários'}</span>
    </div>
  `;

    roomCard.addEventListener('click', () => {
        customRoomInput.value = room.id;
        roomSelection.value = room.id;
        openJoinModal();
    });

    roomsGrid.appendChild(roomCard);

    // Adicionar ao select de salas
    const option = document.createElement('option');
    option.value = room.id;
    option.textContent = `${room.name} (${room.userCount} ${room.userCount === 1 ? 'usuário' : 'usuários'})`;
    roomSelection.appendChild(option);
}

// WebRTC e streams de áudio
async function startLocalStream() {
    try {
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
        }

        // Solicitar permissão de áudio ao usuário com HTTPS
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: false
        });

        localStream = stream;

        // Iniciar detecção de fala
        window.detectSpeaking(stream);

        return stream;
    } catch (error) {
        console.error('Erro ao acessar microfone:', error);

        if (error.name === 'NotAllowedError') {
            showError('Permissão de microfone negada. Por favor, permita acesso ao microfone nas configurações do navegador.');
        } else if (error.name === 'NotFoundError') {
            showError('Nenhum microfone encontrado. Por favor, conecte um microfone e tente novamente.');
        } else {
            showError('Não foi possível acessar seu microfone. Verifique as permissões do navegador.');
        }

        // Criar um stream silencioso como fallback
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const destination = audioContext.createMediaStreamDestination();
        localStream = destination.stream;

        return localStream;
    }
}

function connectToNewUser(userId, peerId) {
    if (!localStream) {
        console.warn('Tentando conectar sem stream local');
        return;
    }

    // Se já existir uma conexão com este usuário, não criar outra
    if (peers[userId]) {
        console.log('Conexão já existe com:', userId);
        return;
    }

    if (peerId) {
        try {
            console.log('Iniciando chamada para:', userId, 'com peerId:', peerId);

            const call = peer.call(peerId, localStream);
            peers[userId] = call;

            call.on('stream', (remoteStream) => {
                console.log('Stream recebido do peer:', userId);
                addAudioStream(userId, remoteStream);
            });

            call.on('close', () => {
                console.log('Chamada fechada com:', userId);
                removeAudioStream(userId);
            });

            call.on('error', (err) => {
                console.error('Erro na chamada:', err);
            });
        } catch (error) {
            console.error('Erro ao conectar ao novo usuário:', error);
        }
    } else {
        console.log('Esperando pelo Peer ID do usuário:', userId);
    }
}

function addAudioStream(userId, stream) {
    console.log('Adicionando stream de áudio para:', userId);

    // Remover stream antigo se existir
    removeAudioStream(userId);

    // Criar novo elemento de áudio
    const audioElement = document.createElement('audio');
    audioElement.id = `audio-${userId}`;
    audioElement.srcObject = stream;
    audioElement.autoplay = true;

    // Adicionar ao DOM (invisível)
    document.body.appendChild(audioElement);

    // Armazenar referência
    audioStreams[userId] = {
        stream,
        element: audioElement
    };
}

function removeAudioStream(userId) {
    if (audioStreams[userId]) {
        const { element } = audioStreams[userId];

        if (element && element.parentNode) {
            element.parentNode.removeChild(element);
        }

        delete audioStreams[userId];
    }
}

async function toggleMicrophone() {
    if (!localStream) {
        await startLocalStream();
    }

    const audioTracks = localStream.getAudioTracks();

    if (audioTracks.length === 0) {
        console.warn('Nenhuma faixa de áudio encontrada');
        return;
    }

    currentUser.isMuted = !currentUser.isMuted;

    // Atualizar o estado dos tracks de áudio
    audioTracks.forEach(track => {
        track.enabled = !currentUser.isMuted;
    });

    // Atualizar UI
    updateMicButtonState();

    // Se estiver falando e mutar, atualizar estado de fala
    if (currentUser.isMuted && currentUser.isSpeaking) {
        currentUser.isSpeaking = false;

        socket.emit('user-speaking', {
            roomId: currentUser.roomId,
            isSpeaking: false
        });

        updateSpeakingState(socket.id, false);
    }
}

function updateMicButtonState() {
    if (currentUser.isMuted) {
        micBtn.classList.add('muted');
        micBtn.classList.remove('active');
        micBtn.innerHTML = '<i class="fas fa-microphone-slash"></i>';
        micBtn.setAttribute('data-tooltip', 'Ativar microfone');
    } else if (currentUser.isSpeaking) {
        micBtn.classList.add('active');
        micBtn.classList.remove('muted');
        micBtn.innerHTML = '<i class="fas fa-microphone"></i>';
        micBtn.setAttribute('data-tooltip', 'Desativar microfone');
    } else {
        micBtn.classList.remove('active', 'muted');
        micBtn.innerHTML = '<i class="fas fa-microphone"></i>';
        micBtn.setAttribute('data-tooltip', 'Desativar microfone');
    }
}

function handleSignal(userId, signal) {
    console.log('Sinal recebido de:', userId);

    // Implementação específica de sinalização WebRTC se necessário
}

// UI de participantes
function updateParticipants(users) {
    participantsContainer.innerHTML = '';

    Object.keys(users).forEach(userId => {
        const user = users[userId];

        const participant = document.createElement('div');
        participant.className = 'participant';
        participant.id = `participant-${userId}`;

        if (userId === socket.id) {
            participant.classList.add('current-user');
        }

        const initials = user.username
            .split(' ')
            .map(n => n[0])
            .join('')
            .toUpperCase()
            .slice(0, 2);

        participant.innerHTML = `
      <div class="participant-avatar">
        <span class="avatar-text">${initials}</span>
        <div class="mic-indicator ${userId === socket.id && currentUser.isMuted ? 'hidden' : ''}"></div>
      </div>
      <div class="participant-name">${user.username}</div>
      <div class="participant-status">
        <i class="fas fa-circle"></i>
        <span>Online</span>
      </div>
    `;

        participantsContainer.appendChild(participant);
    });
}

function removeParticipant(userId) {
    const participant = document.getElementById(`participant-${userId}`);

    if (participant) {
        participant.classList.add('hidden');
        setTimeout(() => {
            if (participant.parentNode) {
                participant.parentNode.removeChild(participant);
            }
        }, 300);
    }
}

function updateSpeakingState(userId, isSpeaking) {
    const participant = document.getElementById(`participant-${userId}`);

    if (participant) {
        if (isSpeaking) {
            participant.classList.add('speaking');
        } else {
            participant.classList.remove('speaking');
        }
    }

    // Atualizar botão de microfone se for o usuário atual
    if (userId === socket.id) {
        currentUser.isSpeaking = isSpeaking;
        updateMicButtonState();
    }
}

// Funções de sala
async function joinRoom(roomId, username) {
    try {
        // Mostrar overlay de carregamento
        showJoiningOverlay(true);

        // Iniciar stream de áudio local
        await startLocalStream();

        // Salvar informações do usuário
        currentUser.id = socket.id;
        currentUser.username = username;
        currentUser.roomId = roomId;

        // Salvar username no localStorage
        localStorage.setItem('voice-rooms-username', username);

        // Iniciar Peer se ainda não inicializado
        if (peer.id === null) {
            return new Promise(resolve => {
                peer.on('open', id => {
                    finishJoiningRoom(roomId, username);
                    resolve();
                });
            });
        } else {
            finishJoiningRoom(roomId, username);
        }
    } catch (error) {
        console.error('Erro ao entrar na sala:', error);
        showError('Não foi possível entrar na sala. Tente novamente.');
        showJoiningOverlay(false);
    }
}

function finishJoiningRoom(roomId, username) {
    // Juntar-se à sala via Socket.IO
    socket.emit('join-room', { roomId, username });

    // Enviar Peer ID para outros usuários
    socket.emit('user-peer-id', { roomId, peerId: peer.id });

    // Atualizar UI
    currentRoomName.textContent = roomId;
    usernameDisplay.textContent = username;
    userInfo.classList.remove('hidden');

    // Atualizar URL mantendo o protocolo HTTPS
    updateURLWithRoom(roomId);

    // Mostrar tela da sala
    showRoomScreen();

    // Esconder overlay de carregamento
    showJoiningOverlay(false);
}

function leaveRoom() {
    if (currentUser.roomId) {
        // Notificar servidor
        socket.emit('leave-room', { roomId: currentUser.roomId });

        // Parar streams
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
            localStream = null;
        }

        // Limpar conexões de audio
        Object.keys(peers).forEach(userId => {
            if (peers[userId]) {
                peers[userId].close();
            }
        });
        peers = {};

        Object.keys(audioStreams).forEach(userId => {
            removeAudioStream(userId);
        });

        // Resetar estado
        currentUser.roomId = null;
        currentUser.isSpeaking = false;
        currentUser.isMuted = false;

        // Voltar para tela inicial
        showWelcomeScreen();

        // Remover room da URL
        updateURLWithRoom(null);
    }
}

// Manipuladores de eventos
function handleJoinRoom() {
    const username = usernameInput.value.trim();
    let roomId = roomSelection.value;

    if (customRoomInput.value.trim()) {
        roomId = customRoomInput.value.trim();
    }

    if (!username) {
        showError('Por favor, digite seu nome.');
        return;
    }

    if (!roomId) {
        showError('Por favor, selecione ou crie uma sala.');
        return;
    }

    closeJoinModal();
    joinRoom(roomId, username);
}

function handleCreateRoom() {
    const roomName = roomNameInput.value.trim();
    const username = createUsernameInput.value.trim();

    if (!roomName) {
        showError('Por favor, digite um nome para a sala.');
        return;
    }

    if (!username) {
        showError('Por favor, digite seu nome.');
        return;
    }

    closeCreateModal();
    joinRoom(roomName, username);
}

function handleRoomSelectionChange() {
    if (roomSelection.value) {
        customRoomInput.value = '';
    }
}

function handleCustomRoomInput() {
    if (customRoomInput.value.trim()) {
        roomSelection.value = '';
    }
}

// Funções de UI
function showWelcomeScreen() {
    welcomeScreen.style.display = 'flex';
    roomScreen.style.display = 'none';
    loadRooms();
}

function showRoomScreen() {
    welcomeScreen.style.display = 'none';
    roomScreen.style.display = 'flex';
}

function showJoiningOverlay(show) {
    if (show) {
        joiningOverlay.classList.add('active');
    } else {
        joiningOverlay.classList.remove('active');
    }
}

// Funções de modal
function openJoinModal() {
    joinModalOverlay.classList.add('active');
}

function closeJoinModal() {
    joinModalOverlay.classList.remove('active');
}

function openCreateModal() {
    createModalOverlay.classList.add('active');
}

function closeCreateModal() {
    createModalOverlay.classList.remove('active');
}

function openInviteModal() {
    if (currentUser.roomId) {
        const url = getInviteLink();
        inviteLinkInput.value = url;
        inviteModalOverlay.classList.add('active');
    }
}

function closeInviteModal() {
    inviteModalOverlay.classList.remove('active');
}

function copyInviteLinkToClipboard() {
    // Em ambientes seguros (HTTPS), podemos usar a Clipboard API
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(inviteLinkInput.value)
            .then(() => {
                // Sucesso
                showCopySuccess();
            })
            .catch(err => {
                console.error('Falha ao copiar:', err);
                // Fallback para método mais antigo
                fallbackCopyTextToClipboard();
            });
    } else {
        // Método mais antigo para ambientes não seguros ou navegadores mais antigos
        fallbackCopyTextToClipboard();
    }
}

function fallbackCopyTextToClipboard() {
    inviteLinkInput.select();

    try {
        document.execCommand('copy');
        showCopySuccess();
    } catch (err) {
        console.error('Falha ao copiar texto:', err);
        showError('Não foi possível copiar o link. Por favor, selecione-o manualmente e copie.');
    }

    // Remover seleção
    window.getSelection().removeAllRanges();
}

function showCopySuccess() {
    // Mudar texto do botão temporariamente
    const originalText = copyInviteLink.innerHTML;
    copyInviteLink.innerHTML = '<i class="fas fa-check"></i> Copiado!';

    setTimeout(() => {
        copyInviteLink.innerHTML = originalText;
    }, 2000);
}

// Funções utilitárias
function getInviteLink() {
    // Garantir que o link compartilhado use HTTPS
    const protocol = window.location.protocol === 'https:' ? 'https://' : 'http://';
    const host = window.location.host;
    const path = window.location.pathname;

    return `${protocol}${host}${path}?room=${currentUser.roomId}`;
}

function updateURLWithRoom(roomId) {
    // Usar history API para atualizar URL sem recarregar a página
    const url = new URL(window.location.href);

    if (roomId) {
        url.searchParams.set('room', roomId);
    } else {
        url.searchParams.delete('room');
    }

    window.history.pushState({}, '', url.toString());
}

function showError(message) {
    // Implementação de alerta de erro melhorada
    // Criar elemento de alerta
    const alertElement = document.createElement('div');
    alertElement.className = 'error-alert';
    alertElement.innerHTML = `
      <div class="error-content">
        <i class="fas fa-exclamation-circle"></i>
        <span>${message}</span>
      </div>
      <button class="error-close">
        <i class="fas fa-times"></i>
      </button>
    `;

    // Adicionar ao DOM
    document.body.appendChild(alertElement);

    // Adicionar estilo se não existir
    if (!document.querySelector('#error-alert-style')) {
        const styleElement = document.createElement('style');
        styleElement.id = 'error-alert-style';
        styleElement.textContent = `
        .error-alert {
          position: fixed;
          top: 20px;
          left: 50%;
          transform: translateX(-50%);
          background-color: var(--danger);
          color: white;
          padding: 12px 20px;
          border-radius: 8px;
          box-shadow: 0 5px 15px rgba(0, 0, 0, 0.2);
          z-index: 2000;
          display: flex;
          align-items: center;
          justify-content: space-between;
          min-width: 300px;
          max-width: 500px;
          animation: slideDown 0.3s ease;
        }
        
        .error-content {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        
        .error-close {
          background: none;
          border: none;
          color: white;
          cursor: pointer;
          font-size: 1rem;
          opacity: 0.7;
          transition: opacity 0.3s;
        }
        
        .error-close:hover {
          opacity: 1;
        }
        
        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translate(-50%, -20px);
          }
          to {
            opacity: 1;
            transform: translate(-50%, 0);
          }
        }
      `;
        document.head.appendChild(styleElement);
    }

    // Adicionar evento de fechar
    const closeBtn = alertElement.querySelector('.error-close');
    closeBtn.addEventListener('click', () => {
        document.body.removeChild(alertElement);
    });

    // Auto-fechar após 5 segundos
    setTimeout(() => {
        if (document.body.contains(alertElement)) {
            document.body.removeChild(alertElement);
        }
    }, 5000);
}

function showNotification(message) {
    console.log('Notificação:', message);

    // Adicionar notificação visual
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.classList.add('show');
    }, 10);

    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            if (document.body.contains(notification)) {
                document.body.removeChild(notification);
            }
        }, 300);
    }, 3000);
}