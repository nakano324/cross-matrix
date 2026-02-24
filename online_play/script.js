// =========================================
// Socket.io Setup
// =========================================

// File protocol check
if (location.protocol === 'file:') {
    const correctUrl = 'http://localhost:3000/online_play/index.html';
    alert(`【重要】\n現在、ファイルを直接開いています (file://)。\nこれではオンライン機能は動きません。\n\nブラウザのアドレスバーに以下を入力して移動してください:\n${correctUrl}`);
    // Stop execution (throw error)
    throw new Error('Opened via file protocol');
}

let socket;
try {
    const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    const BACKEND_URL = 'https://cross-matrix-shop-api.onrender.com';

    // Auto-switch: Localhost -> Relative path, Production (GitHub Pages) -> Render Backend
    socket = isLocal ? io() : io(BACKEND_URL);
} catch (e) {
    console.error('Socket.io not loaded:', e);
    alert('Socket.io failed to load. Ensure you are accessing this page via the server (http://localhost:3000/online_play/index.html).');
}

if (socket) {
    socket.on('connect', () => {
        console.log('Connected to server with ID:', socket.id);
        const statusMsg = document.getElementById('room-status-msg');
        if (statusMsg) statusMsg.textContent = 'Server Connected: ' + socket.id;
    });

    socket.on('disconnect', () => {
        console.log('Disconnected from server');
        const statusMsg = document.getElementById('room-status-msg');
        if (statusMsg) statusMsg.textContent = 'Server Disconnected';
    });
}

// =========================================
// 状態管理 (State Management)
// =========================================

// WebRTC
let peerConnection = null;
let localStream = null;
const rtcConfig = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

// 盤面の状態: 20マス(4列x5行)の配列。各要素はカードオブジェクトの配列(スタック)。
let boardState = Array.from({ length: 20 }, () => []);

// デッキの状態: カードオブジェクトの配列
let deckState = [];

// 選択中のカード (デッキから配置用)
let selectedDeckCard = null;

// 移動元のカード情報 (盤面内移動用)
let moveSource = null; // { cellIndex: number, cardIndex: number, card: object, isGroup: boolean }

// オンライン状態
let currentRoomId = null;
let myRole = null; // 'player' or 'spectator'

// =========================================
// 初期化・ダミーデータ生成
// =========================================

function init() {
    setupLobbyEvents();
    setupSocketListeners();
    setupEventListeners(); // 共通UIイベント

    // デッキ初期化 (あとでサーバーから同期するかもだが一旦生成)
    generateDummyDeck();
}

function generateDummyDeck() {
    deckState = [];
    for (let i = 1; i <= 10; i++) {
        deckState.push({
            id: `card-${i}`, // Base ID
            name: `Card ${i}`,
            imageUrl: `https://placehold.jp/3d4070/ffffff/63x88.png?text=Card${i}`
        });
    }
}

// =========================================
// ロビー & Socket Logic
// =========================================

function setupLobbyEvents() {
    const btnCreate = document.getElementById('btn-create-room');
    const btnJoinPlayer = document.getElementById('btn-join-player');
    const btnJoinSpectator = document.getElementById('btn-join-spectator');
    const inputRoom = document.getElementById('input-room-id');

    if (btnCreate) {
        btnCreate.addEventListener('click', () => {
            console.log('Create Room clicked');
            const roomId = Math.floor(1000 + Math.random() * 9000).toString();
            joinRoom(roomId, 'player');
        });
    } else {
        console.error('btn-create-room not found');
    }

    if (btnJoinPlayer) {
        btnJoinPlayer.addEventListener('click', () => {
            console.log('Join Player clicked');
            const roomId = inputRoom.value;
            if (roomId.length === 4) joinRoom(roomId, 'player');
            else alert('4桁のRoom IDを入力してください');
        });
    }

    if (btnJoinSpectator) {
        btnJoinSpectator.addEventListener('click', () => {
            console.log('Join Spectator clicked');
            const roomId = inputRoom.value;
            if (roomId.length === 4) joinRoom(roomId, 'spectator');
            else alert('4桁のRoom IDを入力してください');
        });
    }
}

function joinRoom(roomId, role) {
    if (!socket) {
        alert('Cannot join room: Socket not connected.');
        return;
    }
    currentRoomId = roomId;
    myRole = role;
    socket.emit('join_room', { roomId, role });

    // UI更新
    const lobbyView = document.getElementById('lobby-view');
    const boardView = document.getElementById('board-view');
    if (lobbyView) lobbyView.classList.remove('active');
    if (boardView) boardView.classList.add('active'); // 盤面へ

    const roomIdEl = document.getElementById('current-room-id');
    if (roomIdEl) roomIdEl.textContent = roomId;

    const roleEl = document.getElementById('role-display');
    if (roleEl) roleEl.textContent = role === 'player' ? 'Player' : 'Spectator (View Only)';

    // カメラ起動
    startCamera();

    // 表示更新
    renderBoard();
    renderDeck();
}

function setupSocketListeners() {
    // エラーメッセージ
    socket.on('error_message', (msg) => {
        alert(msg);
        location.reload(); // リセット
    });

    // 部屋情報の更新 (人数など)
    socket.on('room_update', (data) => {
        console.log('Room Status:', data);
    });

    // ゲームアクション受信
    socket.on('game_update', (data) => {
        // data = { action, payload, from }
        handleRemoteAction(data);
    });

    // 状態リクエスト (観戦者が来たときなど)
    socket.on('request_state', (data) => {
        // 自分がPlayerなら現在の盤面を送る
        if (myRole === 'player') {
            socket.emit('sync_state', {
                targetId: data.requesterId,
                state: {
                    board: boardState,
                    // デッキは共有しないが、盤面にあるカード情報は送る
                }
            });
        }
    });

    // 状態同期 (観戦者が受け取る)
    socket.on('state_synced', (state) => {
        if (state.board) {
            boardState = state.board;
            renderBoard();
        }
    });

    // WebRTC: 入室通知 (2人目が入ってきたら、1人目がOfferを作る)
    socket.on('player_joined', async (data) => {
        if (myRole !== 'player') return;
        console.log('Player joined, initiating offer...', data.newPlayerId);

        setupWebRTC();
        try {
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            socket.emit('signal', {
                roomId: currentRoomId,
                type: 'offer',
                payload: offer
            });
        } catch (err) {
            console.error('Error creating offer:', err);
        }
    });

    // WebRTC: シグナリング受信
    socket.on('signal', async (data) => {
        if (myRole !== 'player') return; // Spectator doesn't handle WebRTC mapping for now
        const { type, payload, from } = data;

        try {
            if (!peerConnection) setupWebRTC();

            if (type === 'offer') {
                console.log('Received offer, creating answer...');
                await peerConnection.setRemoteDescription(new RTCSessionDescription(payload));
                const answer = await peerConnection.createAnswer();
                await peerConnection.setLocalDescription(answer);
                socket.emit('signal', {
                    roomId: currentRoomId,
                    type: 'answer',
                    payload: answer
                });
            } else if (type === 'answer') {
                console.log('Received answer');
                await peerConnection.setRemoteDescription(new RTCSessionDescription(payload));
            } else if (type === 'candidate') {
                console.log('Received ICE candidate');
                await peerConnection.addIceCandidate(new RTCIceCandidate(payload));
            }
        } catch (err) {
            console.error('WebRTC Signaling Error:', err);
        }
    });

    socket.on('player_left', (playerId) => {
        console.log('Player left:', playerId);
        cleanupWebRTC();
    });
}

// =========================================
// WebRTC Logic
// =========================================
function setupWebRTC() {
    if (peerConnection) return;
    peerConnection = new RTCPeerConnection(rtcConfig);

    if (localStream) {
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
    }

    peerConnection.ontrack = (event) => {
        const remoteVideo = document.getElementById('remote-video');
        if (remoteVideo && remoteVideo.srcObject !== event.streams[0]) {
            remoteVideo.srcObject = event.streams[0];
        }
    };

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('signal', {
                roomId: currentRoomId,
                type: 'candidate',
                payload: event.candidate
            });
        }
    };

    peerConnection.onconnectionstatechange = () => {
        console.log("WebRTC Connection State:", peerConnection.connectionState);
    };
}

function cleanupWebRTC() {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    const remoteVideo = document.getElementById('remote-video');
    if (remoteVideo) remoteVideo.srcObject = null;
}

// リモートアクションの処理
function handleRemoteAction(data) {
    const { action, payload } = data;

    if (action === 'place_card') {
        // { cellIndex, card }
        const { cellIndex, card } = payload;
        boardState[cellIndex].push(card);
        renderBoard();
    } else if (action === 'move_card') {
        // { fromIndex, fromCardIndex, toIndex }
        const { fromIndex, fromCardIndex, toIndex } = payload;
        const sourceStack = boardState[fromIndex];
        if (sourceStack && sourceStack[fromCardIndex]) {
            const [movedCard] = sourceStack.splice(fromCardIndex, 1);
            boardState[toIndex].push(movedCard);
            renderBoard();
        }
    } else if (action === 'move_stack') {
        // { fromIndex, toIndex }
        const { fromIndex, toIndex } = payload;
        const sourceStack = boardState[fromIndex];
        if (sourceStack && sourceStack.length > 0) {
            // 全て移動
            const movedCards = sourceStack.splice(0, sourceStack.length);
            boardState[toIndex].push(...movedCards);
            renderBoard();
        }
    } else if (action === 'remove_card') {
        // { cellIndex, cardIndex }
        const { cellIndex, cardIndex } = payload;
        const stack = boardState[cellIndex];
        if (stack && stack[cardIndex]) {
            stack.splice(cardIndex, 1);
            renderBoard();
        }
    } else if (action === 'remove_stack') {
        // { cellIndex }
        const { cellIndex } = payload;
        const stack = boardState[cellIndex];
        if (stack) {
            boardState[cellIndex] = []; // 全削除
            renderBoard();
        }
    }
}

// アクション送信ラッパー
function sendGameAction(action, payload) {
    // 観戦者は送信しない
    if (myRole !== 'player') return;

    socket.emit('game_action', {
        roomId: currentRoomId,
        action,
        payload
    });
}

// =========================================
// レンダリング (View Logic)
// =========================================

// 盤面の描画
function renderBoard() {
    const boardGrid = document.getElementById('board-grid');
    boardGrid.innerHTML = ''; // クリア

    boardState.forEach((stack, index) => {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.dataset.index = index;

        // カーソルやハイライト処理 (自分の操作のみ)
        if (myRole === 'player') {
            if (selectedDeckCard || moveSource) {
                cell.classList.add('highlight');
            }
        }

        if (stack.length > 0) {
            const topCard = stack[stack.length - 1];
            const img = document.createElement('img');
            img.src = topCard.imageUrl;
            img.className = 'card-img';
            cell.appendChild(img);

            if (stack.length > 1) {
                const badge = document.createElement('div');
                badge.className = 'badge';
                badge.textContent = stack.length;
                cell.appendChild(badge);
            }
        }

        // タップイベント
        cell.addEventListener('click', () => handleCellClick(index));

        boardGrid.appendChild(cell);
    });
}

// デッキの描画
function renderDeck() {
    const deckContainer = document.getElementById('board-deck');
    if (!deckContainer) return;

    // 観戦者はデッキを見ない、あるいは空にする
    if (myRole !== 'player') {
        deckContainer.innerHTML = '<div style="color:white; font-size:12px;">Spectator Mode</div>';
        return;
    }

    deckContainer.innerHTML = '';

    deckState.forEach((card) => {
        const cardEl = document.createElement('div');
        cardEl.className = 'deck-card';

        if (selectedDeckCard && selectedDeckCard.id === card.id) {
            cardEl.classList.add('selected');
        }

        const img = document.createElement('img');
        img.src = card.imageUrl;
        img.style.pointerEvents = 'none';

        cardEl.appendChild(img);

        cardEl.addEventListener('click', (e) => {
            e.stopPropagation();
            handleDeckCardClick(card);
        });

        deckContainer.appendChild(cardEl);
    });
}

// =========================================
// イベントハンドラ (Controller Logic)
// =========================================

function setupEventListeners() {
    document.getElementById('btn-board').addEventListener('click', () => switchView('board'));
    document.getElementById('btn-control').addEventListener('click', () => switchView('control'));
    document.getElementById('btn-close-modal').addEventListener('click', closeModal);
}

function switchView(viewName) {
    document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));

    if (viewName === 'board') {
        document.getElementById('board-view').classList.add('active');
        document.getElementById('btn-board').classList.add('active');
        // ロビーに戻るボタンなどが欲しければここに追加
        if (!currentRoomId) {
            // 部屋に入ってなければロビーを表示
            document.getElementById('lobby-view').classList.add('active');
            document.getElementById('board-view').classList.remove('active');
        }
    } else {
        document.getElementById('control-view').classList.add('active');
        document.getElementById('btn-control').classList.add('active');
    }
}

function handleDeckCardClick(card) {
    if (myRole !== 'player') return;

    if (selectedDeckCard && selectedDeckCard.id === card.id) {
        selectedDeckCard = null;
    } else {
        selectedDeckCard = card;
        // 既に移動モードならキャンセル
        moveSource = null;

        const controlView = document.getElementById('control-view');
        if (controlView.classList.contains('active')) {
            setTimeout(() => switchView('board'), 200);
        }
    }
    renderDeck();
    renderBoard(); // ハイライト更新
}

function handleCellClick(index) {
    if (myRole !== 'player') return; // 観戦者は操作不可

    const stack = boardState[index];

    // 1. 移動待機中
    if (moveSource) {
        if (moveSource.cellIndex === index) {
            // 同じセルをクリックしたらキャンセル
            moveSource = null;
            renderBoard();
            return;
        }

        if (moveSource.isGroup) {
            // まとめて移動
            const sourceStack = boardState[moveSource.cellIndex];
            // ソースから全移動
            const movedCards = sourceStack.splice(0, sourceStack.length);
            boardState[index].push(...movedCards);

            sendGameAction('move_stack', {
                fromIndex: moveSource.cellIndex,
                toIndex: index
            });
        } else {
            // 1枚移動
            const sourceStack = boardState[moveSource.cellIndex];
            if (sourceStack[moveSource.cardIndex]) {
                const [movedCard] = sourceStack.splice(moveSource.cardIndex, 1);
                boardState[index].push(movedCard);

                sendGameAction('move_card', {
                    fromIndex: moveSource.cellIndex,
                    fromCardIndex: moveSource.cardIndex,
                    toIndex: index
                });
            }
        }

        moveSource = null;
        renderBoard();
        return;
    }

    // 2. デッキから配置 (Infinite Deck: 元のカードは消さない)
    if (selectedDeckCard) {
        // 新しいユニークIDを持ったカードインスタンスを生成
        const newCard = {
            ...selectedDeckCard,
            id: selectedDeckCard.id + '-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5)
        };

        stack.push(newCard);

        // 送信
        sendGameAction('place_card', {
            cellIndex: index,
            card: newCard
        });

        // 以前はここで deckState.filter... で削除していたが、削除しないように変更

        selectedDeckCard = null;
        renderBoard();
        renderDeck();
        return;
    }

    // 3. スタック確認
    if (stack.length > 0) {
        openStackModal(index);
    }
}

function openStackModal(cellIndex) {
    const stack = boardState[cellIndex];
    if (stack.length === 0) return;

    const modal = document.getElementById('stack-modal');
    const list = document.getElementById('stack-list');
    list.innerHTML = '';

    // ヘッダー部分に「まとめて操作」ボタンを追加
    const headerActions = document.createElement('div');
    headerActions.style.marginBottom = '10px';
    headerActions.style.display = 'flex';
    headerActions.style.gap = '10px';
    headerActions.style.justifyContent = 'center';

    if (myRole === 'player') {
        const btnMoveAll = document.createElement('button');
        btnMoveAll.textContent = 'まとめて移動';
        btnMoveAll.onclick = () => startGroupMove(cellIndex);
        headerActions.appendChild(btnMoveAll);

        const btnDisposeAll = document.createElement('button');
        btnDisposeAll.textContent = 'すべて破棄';
        btnDisposeAll.style.backgroundColor = '#ff4444';
        btnDisposeAll.style.color = 'white';
        btnDisposeAll.onclick = () => disposeStack(cellIndex);
        headerActions.appendChild(btnDisposeAll);
    }

    list.appendChild(headerActions);


    stack.forEach((card, cardIndex) => {
        const cardContainer = document.createElement('div');
        cardContainer.className = 'modal-card-container';
        cardContainer.style.display = 'flex';
        cardContainer.style.flexDirection = 'column';
        cardContainer.style.alignItems = 'center';
        cardContainer.style.margin = '5px';

        const cardEl = document.createElement('div');
        cardEl.className = 'modal-card';

        const img = document.createElement('img');
        img.src = card.imageUrl;
        img.style.width = '100%';
        img.style.borderRadius = '4px';
        cardEl.appendChild(img);

        // Playerのみ操作可能
        if (myRole === 'player') {
            cardEl.addEventListener('click', () => {
                startMove(cellIndex, cardIndex, card);
            });
        }
        cardContainer.appendChild(cardEl);

        // 個別破棄ボタン
        if (myRole === 'player') {
            const btnDispose = document.createElement('button');
            btnDispose.textContent = '破棄';
            btnDispose.style.fontSize = '10px';
            btnDispose.style.marginTop = '2px';
            btnDispose.style.backgroundColor = '#ff4444';
            btnDispose.style.color = 'white';
            btnDispose.onclick = (e) => {
                e.stopPropagation();
                disposeCard(cellIndex, cardIndex);
            };
            cardContainer.appendChild(btnDispose);
        }

        list.appendChild(cardContainer);
    });

    modal.classList.remove('hidden');
}

function closeModal() {
    document.getElementById('stack-modal').classList.add('hidden');
}

function startMove(cellIndex, cardIndex, card) {
    moveSource = { cellIndex, cardIndex, card, isGroup: false };
    closeModal();
    renderBoard(); // ハイライトのため再描画
}

function startGroupMove(cellIndex) {
    moveSource = { cellIndex, isGroup: true };
    closeModal();
    renderBoard();
}

function disposeCard(cellIndex, cardIndex) {
    if (!confirm('このカードを破棄しますか？')) return;

    const stack = boardState[cellIndex];
    stack.splice(cardIndex, 1);

    sendGameAction('remove_card', {
        cellIndex,
        cardIndex
    });

    closeModal();
    renderBoard();
}

function disposeStack(cellIndex) {
    if (!confirm('この束をすべて破棄しますか？')) return;

    boardState[cellIndex] = [];

    sendGameAction('remove_stack', {
        cellIndex
    });

    closeModal();
    renderBoard();
}

// カメラ起動処理 (変更なし、ただし部屋に入ってから呼ぶ)
async function startCamera() {
    const localVideo = document.getElementById('local-video');
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } },
                audio: true // 音声もONに変更
            });
            localStream = stream;
            localVideo.srcObject = stream;

            setupWebRTC(); // WebRTCセットアップ
        } catch (err) {
            console.error("Camera access denied or error:", err);
            setupWebRTC(); // 失敗しても受信ができるようにセットアップ
        }
    } else {
        setupWebRTC();
    }
}

// アプリ開始
document.addEventListener('DOMContentLoaded', init);
