const socket = io();
const videoGrid = document.getElementById('video-grid');
const chat = document.getElementById('chat');
const myPeerConnections = {};
let myVideoStream;
let myScreenStream;

socket.emit('join', { room: ROOM_ID });

// ICE-серверы
const iceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun.stunprotocol.org:3478' },
    { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' }
];

// Функция добавления видео
function addVideoStream(stream, userId, isScreen = false) {
    const video = document.createElement('video');
    video.srcObject = stream;
    video.autoplay = true;
    video.playsinline = true;
    video.muted = (userId === socket.id);
    video.dataset.userId = userId;
    video.dataset.isScreen = isScreen ? 'true' : 'false';
    videoGrid.append(video);
    console.log(`Добавлено видео для ${userId} (экран: ${isScreen})`);
}

// Удаление видео
function removeVideo(userId, isScreen = false) {
    const videos = videoGrid.querySelectorAll('video');
    for (let v of videos) {
        if (v.dataset.userId === userId && v.dataset.isScreen === (isScreen ? 'true' : 'false')) {
            v.remove();
        }
    }
    console.log(`Удалено видео для ${userId} (экран: ${isScreen})`);
}

// Добавление треков ко всем peer (с проверкой на дубликаты)
function addTracksToPeers(stream) {
    Object.entries(myPeerConnections).forEach(([userId, peer]) => {
        if (!peer) return;
        stream.getTracks().forEach(track => {
            if (!peer.getSenders().some(s => s.track === track)) {
                peer.addTrack(track, stream);
                console.log(`Добавлен новый трек к peer ${userId}`);
            } else {
                console.log(`Трек уже добавлен к peer ${userId}, пропуск`);
            }
        });
    });
}

// Удаление треков
function removeTracksFromPeers(stream) {
    Object.entries(myPeerConnections).forEach(([userId, peer]) => {
        if (!peer) return;
        stream.getTracks().forEach(track => {
            const sender = peer.getSenders().find(s => s.track === track);
            if (sender) {
                peer.removeTrack(sender);
                console.log(`Удалён трек из peer ${userId}`);
            }
        });
    });
}

// Включить камеру
document.getElementById('start-video').addEventListener('click', async () => {
    if (!myVideoStream) {
        try {
            myVideoStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            addVideoStream(myVideoStream, socket.id);  // Сразу показываем своё видео
            addTracksToPeers(myVideoStream);  // Добавляем треки, что триггерит negotiation
            socket.emit('toggle_video', { user_id: socket.id, status: 'on', room: ROOM_ID });
            console.log('Камера успешно включена локально');
        } catch (error) {
            console.error('Ошибка доступа к камере:', error);
            alert('Не удалось включить камеру. Проверь разрешения в настройках браузера для localhost и попробуй снова.');
        }
    }
});

// Выключить камеру
document.getElementById('stop-video').addEventListener('click', () => {
    if (myVideoStream) {
        removeTracksFromPeers(myVideoStream);
        myVideoStream.getTracks().forEach(track => track.stop());
        myVideoStream = null;
        removeVideo(socket.id);
        socket.emit('toggle_video', { user_id: socket.id, status: 'off', room: ROOM_ID });
    }
});

// Поделиться экраном
document.getElementById('share-screen').addEventListener('click', async () => {
    if (!myScreenStream) {
        try {
            myScreenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
            addVideoStream(myScreenStream, socket.id, true);  // Сразу показываем свой экран
            addTracksToPeers(myScreenStream);  // Добавляем треки, что триггерит negotiation
            socket.emit('toggle_screen', { user_id: socket.id, status: 'on', room: ROOM_ID });
            console.log('Экран успешно включён локально');
        } catch (error) {
            console.error('Ошибка доступа к экрану:', error);
            alert('Не удалось поделиться экраном. Проверь разрешения и попробуй снова.');
        }
    }
});

// Остановить экран
document.getElementById('stop-screen').addEventListener('click', () => {
    if (myScreenStream) {
        removeTracksFromPeers(myScreenStream);
        myScreenStream.getTracks().forEach(track => track.stop());
        myScreenStream = null;
        removeVideo(socket.id, true);
        socket.emit('toggle_screen', { user_id: socket.id, status: 'off', room: ROOM_ID });
    }
});

// Выключить/включить звук
document.getElementById('mute-audio').addEventListener('click', () => {
    if (myVideoStream) myVideoStream.getAudioTracks().forEach(track => track.enabled = false);
    if (myScreenStream && myScreenStream.getAudioTracks().length > 0) myScreenStream.getAudioTracks().forEach(track => track.enabled = false);
    socket.emit('toggle_audio', { user_id: socket.id, status: 'muted', room: ROOM_ID });
});

document.getElementById('unmute-audio').addEventListener('click', () => {
    if (myVideoStream) myVideoStream.getAudioTracks().forEach(track => track.enabled = true);
    if (myScreenStream && myScreenStream.getAudioTracks().length > 0) myScreenStream.getAudioTracks().forEach(track => track.enabled = true);
    socket.emit('toggle_audio', { user_id: socket.id, status: 'unmuted', room: ROOM_ID });
});

// Выключить/включить микрофон
document.getElementById('mute-mic').addEventListener('click', () => {
    if (myVideoStream && myVideoStream.getAudioTracks().length > 0) myVideoStream.getAudioTracks()[0].enabled = false;
});

document.getElementById('unmute-mic').addEventListener('click', () => {
    if (myVideoStream && myVideoStream.getAudioTracks().length > 0) myVideoStream.getAudioTracks()[0].enabled = true;
});

// Обработка нового пользователя
socket.on('user_joined', (data) => {
    if (data.user_id === socket.id) return;
    console.log(`Новый пользователь: ${data.user_id}`);

    const peer = new RTCPeerConnection({ iceServers });
    myPeerConnections[data.user_id] = peer;
    peer.makingOffer = false;
    peer.pendingNegotiation = false;
    peer.isPolite = socket.id > data.user_id;  // Polite, если мой ID больше (уступает)

    // Добавляем текущие треки (это может триггерить negotiation)
    if (myVideoStream) addTracksToPeers(myVideoStream);
    if (myScreenStream) addTracksToPeers(myScreenStream);

    peer.onnegotiationneeded = async () => {
        if (peer.makingOffer) {
            console.log(`Negotiation needed, но makingOffer=true, queue`);
            peer.pendingNegotiation = true;
            return;
        }
        if (peer.signalingState !== 'stable') {
            console.log(`Negotiation needed, но not stable, queue`);
            peer.pendingNegotiation = true;
            return;
        }
        try {
            peer.makingOffer = true;
            const offer = await peer.createOffer();
            await peer.setLocalDescription(offer);
            socket.emit('offer', { sdp: offer, to: data.user_id, from: socket.id, room: ROOM_ID });
            console.log(`Авто-offer отправлен к ${data.user_id} (onnegotiationneeded)`);
        } catch (error) {
            console.error(`Ошибка onnegotiationneeded для ${data.user_id}: ${error}`);
        } finally {
            peer.makingOffer = false;
            if (peer.pendingNegotiation) {
                peer.pendingNegotiation = false;
                peer.onnegotiationneeded();  // Обработка очереди
            }
        }
    };

    peer.ontrack = (event) => {
        addVideoStream(event.streams[0], data.user_id, event.streams[0].id.includes('screen'));
    };

    peer.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('ice-candidate', { candidate: event.candidate, to: data.user_id, room: ROOM_ID });
            console.log(`Отправлен ICE-кандидат к ${data.user_id}`);
        }
    };

    peer.oniceconnectionstatechange = () => {
        console.log(`ICE state for ${data.user_id}: ${peer.iceConnectionState}`);
        if (peer.iceConnectionState === 'failed') {
            console.warn(`ICE failed for ${data.user_id}`);
            peer.restartIce();
        }
    };

    peer.onsignalingstatechange = () => {
        console.log(`Signaling state for ${data.user_id}: ${peer.signalingState}`);
        if (peer.signalingState === 'stable' && peer.pendingNegotiation) {
            peer.pendingNegotiation = false;
            peer.onnegotiationneeded();  // Обработка очереди после stable
        }
    };
});

// Обработка offer
socket.on('offer', async (data) => {
    if (data.from === socket.id) return;
    console.log(`Получен offer от ${data.from}`);

    let peer = myPeerConnections[data.from];
    if (!peer) return;

    try {
        const collision = peer.signalingState !== 'stable';
        const ignoreOffer = !peer.isPolite && collision;  // Игнор, если не polite и коллизия
        if (ignoreOffer) {
            console.log(`Offer ignored (collision, not polite)`);
            return;
        }

        if (collision && peer.isPolite) {
            await peer.setLocalDescription({ type: 'rollback' });
            console.log(`Rollback выполнен для разрешения коллизии (polite)`);
        }

        await peer.setRemoteDescription(data.sdp);

        // Добавляем треки
        if (myVideoStream) addTracksToPeers(myVideoStream);
        if (myScreenStream) addTracksToPeers(myScreenStream);

        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        socket.emit('answer', { sdp: answer, to: data.from, room: ROOM_ID });
        console.log(`Отправлен answer к ${data.from}`);
    } catch (error) {
        console.error(`Ошибка обработки offer от ${data.from}: ${error}`);
    }
});

// Обработка answer
socket.on('answer', async (data) => {
    const peer = myPeerConnections[data.from];
    if (peer) {
        try {
            await peer.setRemoteDescription(data.sdp);
            console.log(`Установлен answer от ${data.from}`);
        } catch (error) {
            console.error(`Ошибка установки answer от ${data.from}: ${error}`);
        }
    }
});

// Обработка ICE
socket.on('ice-candidate', async (data) => {
    const peer = myPeerConnections[data.from];
    if (peer) {
        try {
            await peer.addIceCandidate(data.candidate);
            console.log(`Добавлен ICE-кандидат от ${data.from}`);
        } catch (error) {
            console.error(`Ошибка добавления ICE от ${data.from}: ${error}`);
        }
    }
});

// Статусы
socket.on('video_status', (data) => {
    const p = document.createElement('p');
    p.textContent = `${data.user_id.slice(0, 8)} ${data.status === 'on' ? 'включил камеру' : 'выключил камеру'}`;
    chat.appendChild(p);
    if (data.status === 'off') removeVideo(data.user_id);
});

socket.on('screen_status', (data) => {
    const p = document.createElement('p');
    p.textContent = `${data.user_id.slice(0, 8)} ${data.status === 'on' ? 'начал демонстрацию экрана' : 'остановил демонстрацию экрана'}`;
    chat.appendChild(p);
    if (data.status === 'off') removeVideo(data.user_id, true);
});

socket.on('audio_status', (data) => {
    const p = document.createElement('p');
    p.textContent = `${data.user_id.slice(0, 8)} ${data.status === 'muted' ? 'выключил звук' : 'включил звук'}`;
    chat.appendChild(p);
});

// Чат
socket.on('message', (msg) => {
    const p = document.createElement('p');
    p.textContent = msg;
    chat.appendChild(p);
});

document.getElementById('send-message').addEventListener('click', () => {
    const input = document.getElementById('message-input');
    socket.emit('message', { msg: input.value, room: ROOM_ID });
    input.value = '';
});