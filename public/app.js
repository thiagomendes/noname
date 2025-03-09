// public/app.js
// Adicione no início do app.js, antes do event listener DOMContentLoaded

// Função para redirecionar para HTTPS se necessário
const checkAndRedirectToHttps = () => {
    // Se estamos acessando por IP (não localhost) e com HTTP, sugerir HTTPS
    if (window.location.protocol === 'http:' &&
        !window.location.hostname.match(/localhost|127.0.0.1/)) {

        // Criar banner de aviso
        const banner = document.createElement('div');
        banner.style.position = 'fixed';
        banner.style.top = '0';
        banner.style.left = '0';
        banner.style.right = '0';
        banner.style.backgroundColor = '#ff9800';
        banner.style.color = 'white';
        banner.style.padding = '10px';
        banner.style.textAlign = 'center';
        banner.style.zIndex = '9999';
        banner.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';

        const httpsPort = '3443'; // Porta do HTTPS, ajuste conforme sua configuração
        const httpsUrl = `https://${window.location.hostname}:${httpsPort}${window.location.pathname}`;

        banner.innerHTML = `
        <p>O acesso ao microfone pode não funcionar corretamente em conexões HTTP. 
        <a href="${httpsUrl}" style="color:white;text-decoration:underline;font-weight:bold;">
          Clique aqui para usar HTTPS
        </a>
        </p>
      `;

        document.body.appendChild(banner);
    }
};

document.addEventListener('DOMContentLoaded', () => {
    // Elementos da interface
    const loginScreen = document.getElementById('login-screen');
    const roomScreen = document.getElementById('room-screen');
    const usernameInput = document.getElementById('username');
    const customRoomInput = document.getElementById('custom-room');
    const joinCustomRoomBtn = document.getElementById('join-custom-room');
    const roomsList = document.getElementById('rooms-list');
    const usersList = document.getElementById('users-list');
    const roomNameElement = document.getElementById('room-name');
    const leaveRoomBtn = document.getElementById('leave-room');
    const micToggleBtn = document.getElementById('mic-toggle');
    const micStatusElement = document.getElementById('mic-status');
    const volumeBar = document.getElementById('volume-bar');
    const connectionStatus = document.getElementById('connection-status');
    const speakingIndicator = document.getElementById('speaking-indicator');

    // Configurações e variáveis de estado
    let socket;
    let currentRoom = null;
    let username = '';
    let mediaStream = null;
    let audioContext = null;
    let microphoneNode = null;
    let isMicActive = false;
    let analyser = null;
    let audioSources = {};
    let audioDestinations = {};

    // Geração de salas pré-definidas para demonstração
    const defaultRooms = [
        { id: 'sala1', name: 'Sala Principal', users: {} },
        { id: 'sala2', name: 'Reunião de Equipe', users: {} },
        { id: 'sala3', name: 'Bate-Papo', users: {} },
    ];

    // Inicializa a conexão Socket.io
    const initializeSocket = () => {
        socket = io();

        socket.on('connect', () => {
            console.log('Conectado ao servidor Socket.io');
            connectionStatus.textContent = 'Conectado';
            connectionStatus.className = 'status-indicator connected';

            // Atualizar lista de salas quando conectado
            renderRoomsList();
        });

        socket.on('disconnect', () => {
            console.log('Desconectado do servidor Socket.io');
            connectionStatus.textContent = 'Desconectado';
            connectionStatus.className = 'status-indicator disconnected';
        });

        socket.on('roomInfo', (roomInfo) => {
            console.log('Informações da sala recebidas:', roomInfo);
            currentRoom = roomInfo;

            // Mostrar nome da sala
            roomNameElement.textContent = roomInfo.name || `Sala ${roomInfo.id}`;

            // Renderizar lista de usuários
            renderUsersList(roomInfo.users);
        });

        socket.on('userJoined', ({ userId, username, roomInfo }) => {
            console.log(`Usuário entrou: ${username} (${userId})`);

            // Atualizar a lista de usuários
            if (roomInfo) {
                currentRoom = roomInfo;
                renderUsersList(roomInfo.users);
            } else if (currentRoom && userId && username) {
                // Se não recebemos roomInfo completo, adicionamos apenas o usuário
                currentRoom.users[userId] = {
                    id: userId,
                    username: username,
                    isSpeaking: false
                };
                renderUsersList(currentRoom.users);
            }

            // Mostrar notificação
            showNotification(`${username} entrou na sala`);
        });

        socket.on('userLeft', ({ userId, username }) => {
            console.log(`Usuário saiu: ${username} (${userId})`);

            // Remover usuário da lista
            if (currentRoom && currentRoom.users && currentRoom.users[userId]) {
                delete currentRoom.users[userId];
                renderUsersList(currentRoom.users);
            }

            // Limpar recursos de áudio associados a este usuário
            if (audioSources[userId]) {
                audioSources[userId].disconnect();
                delete audioSources[userId];
            }

            if (audioDestinations[userId]) {
                audioDestinations[userId].disconnect();
                delete audioDestinations[userId];
            }

            // Mostrar notificação
            showNotification(`${username} saiu da sala`);
        });

        socket.on('userSpeakingStatus', ({ userId, isSpeaking }) => {
            // Atualizar status de fala do usuário
            if (currentRoom && currentRoom.users && currentRoom.users[userId]) {
                currentRoom.users[userId].isSpeaking = isSpeaking;

                // Atualizar indicador visual
                const userCard = document.querySelector(`.user-card[data-user-id="${userId}"]`);
                if (userCard) {
                    const speakingIndicatorEl = userCard.querySelector('.speaking-indicator');

                    if (isSpeaking) {
                        userCard.classList.add('speaking');
                        speakingIndicatorEl.classList.add('active');
                    } else {
                        userCard.classList.remove('speaking');
                        speakingIndicatorEl.classList.remove('active');
                    }
                }

                // Atualizar indicador global
                updateSpeakingIndicator();
            }
        });

        socket.on('audioData', ({ userId, username, audioData }) => {
            // Processar áudio recebido
            processIncomingAudio(userId, username, audioData);
        });
    };

    // Renderiza a lista de salas disponíveis
    const renderRoomsList = () => {
        roomsList.innerHTML = '';

        defaultRooms.forEach(room => {
            const template = document.getElementById('room-card-template');
            const roomCard = document.importNode(template.content, true).querySelector('.room-card');

            roomCard.querySelector('.room-card-name').textContent = room.name;
            const usersCount = room.users ? Object.keys(room.users).length : 0;
            roomCard.querySelector('.room-users-count').textContent = `${usersCount} usuários`;

            const joinButton = roomCard.querySelector('.join-room-btn');
            joinButton.addEventListener('click', () => {
                joinRoom(room.id);
            });

            roomsList.appendChild(roomCard);
        });
    };

    // Renderiza a lista de usuários na sala atual
    const renderUsersList = (users) => {
        if (!users) return;

        usersList.innerHTML = '';

        Object.values(users).forEach(user => {
            const template = document.getElementById('user-card-template');
            const userCard = document.importNode(template.content, true).querySelector('.user-card');

            userCard.dataset.userId = user.id;
            userCard.querySelector('.username').textContent = user.username;

            const speakingIndicatorEl = userCard.querySelector('.speaking-indicator');
            if (user.isSpeaking) {
                userCard.classList.add('speaking');
                speakingIndicatorEl.classList.add('active');
            }

            // Diferenciar o usuário atual
            if (user.id === socket.id) {
                userCard.style.borderLeft = '4px solid var(--primary-color)';
                userCard.querySelector('.username').textContent += ' (você)';
            }

            usersList.appendChild(userCard);
        });

        // Atualizar indicador de fala
        updateSpeakingIndicator();
    };

    // Atualiza o indicador global de quem está falando
    const updateSpeakingIndicator = () => {
        if (!currentRoom || !currentRoom.users) return;

        const speakingUsers = Object.values(currentRoom.users).filter(user => user.isSpeaking);

        if (speakingUsers.length === 0) {
            speakingIndicator.textContent = 'Ninguém está falando no momento';
            speakingIndicator.className = 'status-indicator';
        } else if (speakingUsers.length === 1) {
            speakingIndicator.textContent = `${speakingUsers[0].username} está falando`;
            speakingIndicator.className = 'status-indicator speaking';
        } else {
            const names = speakingUsers.map(user => user.username).join(', ');
            speakingIndicator.textContent = `${names} estão falando`;
            speakingIndicator.className = 'status-indicator speaking';
        }
    };

    // Exibe uma notificação temporária
    const showNotification = (message) => {
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
                document.body.removeChild(notification);
            }, 300);
        }, 3000);
    };

    // Inicializa o contexto de áudio e recursos relacionados
    const initializeAudioContext = async () => {
        try {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();

            // Solicitar permissão de microfone
            mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });

            // Criar nó de entrada para o microfone
            microphoneNode = audioContext.createMediaStreamSource(mediaStream);

            // Criar analisador para visualização do volume
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 256;
            microphoneNode.connect(analyser);

            // Indicar que o microfone está disponível mas desativado
            micStatusElement.textContent = 'Microfone: Disponível (desativado)';
            micToggleBtn.disabled = false;

            // Iniciar loop de visualização do volume
            visualizeVolume();

            return true;
        } catch (error) {
            console.error('Erro ao acessar o microfone:', error);
            micStatusElement.textContent = 'Erro ao acessar o microfone. Verifique as permissões.';
            micToggleBtn.disabled = true;
            return false;
        }
    };

    // Ativa ou desativa o microfone
    const toggleMicrophone = async () => {
        if (!audioContext) {
            const initialized = await initializeAudioContext();
            if (!initialized) return;
        }

        if (isMicActive) {
            // Desativar microfone
            stopAudioTransmission();
            micToggleBtn.innerHTML = '<i class="fas fa-microphone"></i> Ativar Microfone';
            micStatusElement.textContent = 'Microfone: Disponível (desativado)';
            isMicActive = false;
        } else {
            // Ativar microfone
            startAudioTransmission();
            micToggleBtn.innerHTML = '<i class="fas fa-microphone-slash"></i> Desativar Microfone';
            micStatusElement.textContent = 'Microfone: Ativado';
            isMicActive = true;
        }
    };

    // Inicia a transmissão de áudio
    const startAudioTransmission = () => {
        if (!audioContext || !microphoneNode || !socket) return;

        // Criar processador de script para capturar amostras de áudio
        const scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);

        scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
            if (!isMicActive) return;

            // Obter dados do buffer de entrada
            const inputBuffer = audioProcessingEvent.inputBuffer;
            const inputData = inputBuffer.getChannelData(0);

            // Calcular RMS (Root Mean Square) para detecção de silêncio
            let rms = 0;
            for (let i = 0; i < inputData.length; i++) {
                rms += inputData[i] * inputData[i];
            }
            rms = Math.sqrt(rms / inputData.length);

            // Apenas enviar se o nível de áudio estiver acima de um limite mínimo
            if (rms > 0.01) {
                // Converter para array para transmissão
                const audioArray = Array.from(inputData);
                // public/app.js (continuação)

                // Enviar dados de áudio para o servidor
                socket.emit('audioData', audioArray);
            }
        };

        // Conectar o microfone ao processador e o processador à saída
        microphoneNode.connect(scriptProcessor);
        scriptProcessor.connect(audioContext.destination);

        // Salvar referência ao processador
        window.currentScriptProcessor = scriptProcessor;
    };

    // Para a transmissão de áudio
    const stopAudioTransmission = () => {
        if (window.currentScriptProcessor) {
            window.currentScriptProcessor.disconnect();
            window.currentScriptProcessor = null;
        }
    };

    // Processa o áudio recebido de outros usuários
    const processIncomingAudio = (userId, username, audioData) => {
        if (!audioContext) return;

        // Criar ou obter o nó de destino para este usuário
        if (!audioDestinations[userId]) {
            audioDestinations[userId] = audioContext.createGain();
            audioDestinations[userId].gain.value = 1.0; // Volume normal
            audioDestinations[userId].connect(audioContext.destination);
        }

        // Criar um buffer de áudio a partir dos dados recebidos
        const buffer = new Float32Array(audioData);
        const audioBuffer = audioContext.createBuffer(1, buffer.length, audioContext.sampleRate);
        audioBuffer.getChannelData(0).set(buffer);

        // Criar uma fonte para reproduzir o buffer
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;

        // Conectar a fonte ao destino
        source.connect(audioDestinations[userId]);

        // Desconectar qualquer fonte anterior para este usuário
        if (audioSources[userId]) {
            audioSources[userId].disconnect();
        }

        // Salvar a nova fonte
        audioSources[userId] = source;

        // Iniciar a reprodução
        source.start();
    };

    // Visualiza o nível de volume do microfone
    const visualizeVolume = () => {
        if (!analyser) return;

        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        const updateVolume = () => {
            analyser.getByteFrequencyData(dataArray);

            // Calcular o volume médio
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
                sum += dataArray[i];
            }
            const average = sum / dataArray.length;

            // Atualizar a barra de volume
            const volumePercentage = (average / 255) * 100;
            volumeBar.style.width = `${volumePercentage}%`;

            // Programar a próxima atualização
            requestAnimationFrame(updateVolume);
        };

        updateVolume();
    };

    // Função para entrar em uma sala
    const joinRoom = (roomId) => {
        // Validar entrada
        const name = usernameInput.value.trim();
        if (!name) {
            alert('Por favor, digite seu nome antes de entrar na sala.');
            usernameInput.focus();
            return;
        }

        username = name;

        // Inicializar conexão Socket.io se ainda não estiver inicializada
        if (!socket) {
            initializeSocket();
        }

        // Enviar solicitação para entrar na sala
        socket.emit('joinRoom', {
            username: name,
            roomId: roomId
        });

        // Mostrar tela da sala e esconder tela de login
        loginScreen.classList.add('hidden');
        roomScreen.classList.remove('hidden');

        // Inicializar o contexto de áudio
        if (!audioContext) {
            initializeAudioContext();
        }
    };

    // Função para sair da sala atual
    const leaveRoom = () => {
        // Parar transmissão de áudio
        if (isMicActive) {
            toggleMicrophone();
        }

        // Voltar para a tela de login
        roomScreen.classList.add('hidden');
        loginScreen.classList.remove('hidden');

        // Limpar variáveis de estado
        currentRoom = null;

        // Renderizar lista de salas
        renderRoomsList();
    };

    // Event listeners
    joinCustomRoomBtn.addEventListener('click', () => {
        const roomId = customRoomInput.value.trim();
        if (roomId) {
            joinRoom(roomId);
        } else {
            alert('Por favor, digite um ID de sala válido.');
            customRoomInput.focus();
        }
    });

    customRoomInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            joinCustomRoomBtn.click();
        }
    });

    leaveRoomBtn.addEventListener('click', leaveRoom);

    micToggleBtn.addEventListener('click', toggleMicrophone);

    // Garantir que o áudio seja interrompido ao sair da página
    window.addEventListener('beforeunload', () => {
        if (mediaStream) {
            mediaStream.getTracks().forEach(track => track.stop());
        }

        if (socket) {
            socket.disconnect();
        }
    });

    // Inicialização
    renderRoomsList();

    // Adiciona estilos CSS para notificações
    const style = document.createElement('style');
    style.textContent = `
  .notification {
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 12px 20px;
    background-color: var(--primary-color);
    color: white;
    border-radius: var(--border-radius);
    box-shadow: var(--shadow);
    z-index: 1000;
    transform: translateX(120%);
    transition: transform 0.3s ease;
  }
  
  .notification.show {
    transform: translateX(0);
  }
`;
    document.head.appendChild(style);
});