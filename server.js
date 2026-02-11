
require('dotenv').config(); // .envの鍵を読み込む
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const crypto = require('crypto'); // ランダムな文字列を作る用

const nodemailer = require('nodemailer');
const http = require('http'); // HTTP server for Socket.io
const { Server } = require("socket.io"); // Socket.io
const app = express();

// 認証メールのリンク先に使う、あなたのGitHub PagesのURL
const FRONTEND_URL = "https://nakano324.github.io/cross-matrix";

// --- 設定 ---
app.use(express.json()); // JSONを使えるようにする
app.use(cors()); // どこからでもアクセス許可（開発用）
app.use((req, res, next) => {
  console.log(`[Request] ${req.method} ${req.url}`);
  next();
});
app.use(express.static('.')); // カレントディレクトリを静的ファイルとして公開

// --- データベース接続 ---
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDBに接続成功！'))
  .catch((err) => console.error('❌ MongoDB接続エラー:', err));

// --- データの設計図 (Schema) ---
const ProductSchema = new mongoose.Schema({
  name: String,
  price: Number,
  description: String,
  image: String
});
const Product = mongoose.model('Product', ProductSchema);

// ユーザーデータの形（管理者用）に項目を追加
const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true }, // 追加: メールアドレス
  password: { type: String, required: true },
  isVerified: { type: Boolean, default: false }, // 追加: メール認証済みか
  verificationToken: String, // 追加: 認証用トークン
  resetPasswordToken: String, // 追加: パスワードリセット用トークン
  resetPasswordExpires: Date // 追加: リセット用トークンの有効期限
});
const User = mongoose.model('User', UserSchema);

// --- メール送信の設定 (Nodemailer) ---
// .env に EMAIL_USER, EMAIL_PASS を設定してください
const transporter = nodemailer.createTransport({
  host: "smtp-relay.brevo.com", // Gmailのサーバーを直接指定
  port: 2525,              // SSL専用のポート番号
  secure: false,
  requireTLS: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.BREVO_API_KEY
  }
});

// メールを送る関数 (Brevo用)
async function sendEmail(to, subject, text) {
  try {
    // 上で設定した transporter (Brevo) を使って送信
    await transporter.sendMail({
      from: 'huangtailangzhongye@gmail.com', // Brevoに登録したあなたのGmail
      to: to,
      subject: subject,
      text: text
    });
    console.log(`📧 メール送信成功: ${to}`);
  } catch (err) {
    console.error("❌ メール送信エラー:", err);
  }
}

// --- 認証ミドルウェア ---
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token == null) return res.sendStatus(401);

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
}

// --- API (窓口) ---

// --- 認証系 API ---

// A. ユーザー登録（メール認証付き）
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password } = req.body;

    // 重複チェック
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'メールアドレスが既に使用されています' });
    }

    // ユーザー名自動生成 (例: emailの@前 + ランダム4文字)
    const randomSuffix = Math.random().toString(36).slice(-4);
    const username = email.split('@')[0] + '_' + randomSuffix;

    const hashedPassword = await bcrypt.hash(password, 10);
    // ランダムな認証トークン生成
    const verificationToken = crypto.randomBytes(32).toString('hex');

    const user = new User({
      username,
      email,
      password: hashedPassword,
      verificationToken: verificationToken,
      isVerified: false // 最初は未認証
    });
    await user.save();

    // 認証メール送信 (ローカルホスト前提のリンク)
    const verifyUrl = `${FRONTEND_URL}/verify-email.html?token=${verificationToken}`;
    await sendEmail(email, '【Cross Matrix】メールアドレスの確認', `以下のリンクをクリックして登録を完了してください:\n\n${verifyUrl}`);

    res.status(201).json({ message: '登録を受け付けました。メールを確認して本登録を行ってください。' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// A-2. メール認証実行
app.get('/api/auth/verify-email', async (req, res) => {
  try {
    const { token } = req.query;
    const user = await User.findOne({ verificationToken: token });

    if (!user) return res.status(400).json({ error: '無効なトークンです' });

    user.isVerified = true;
    user.verificationToken = undefined; // トークンを消す
    await user.save();

    res.json({ message: 'メール認証が完了しました！ログインしてください。' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// B. ログイン (認証済みチェック追加)
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: 'ユーザーが見つかりません' });

    // メール認証チェック
    if (!user.isVerified) {
      return res.status(400).json({ error: 'メール認証が完了していません。メールを確認してください。' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(400).json({ error: 'パスワードが違います' });

    const token = jwt.sign({ username: user.username }, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.json({ token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// C. パスワードリセット依頼
app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user) return res.status(400).json({ error: '登録されていないメールアドレスです' });

    // リセットトークン生成
    const token = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = token;
    user.resetPasswordExpires = Date.now() + 3600000; // 1時間有効
    await user.save();

    const resetUrl = `${FRONTEND_URL}/reset-password.html?token=${token}`;
    await sendEmail(email, '【Cross Matrix】パスワード再設定', `以下のリンクからパスワードを再設定してください:\n\n${resetUrl}\n\n(リンクは1時間有効です)`);

    res.json({ message: '再設定メールを送信しました。' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// D. パスワードリセット実行
app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() } // 期限切れでないか
    });

    if (!user) return res.status(400).json({ error: 'トークンが無効か期限切れです' });

    // パスワード更新
    user.password = await bcrypt.hash(newPassword, 10);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.json({ message: 'パスワードを変更しました。ログインしてください。' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- デッキ系 API ---

// デッキの設計図
const DeckSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  cards: [{
    cardId: { type: String, required: true },
    count: { type: Number, required: true, default: 1 }
  }]
}, { timestamps: true });

const Deck = mongoose.model('Deck', DeckSchema);

// 1. 自分のデッキ一覧を取得
app.get('/api/decks', authenticateToken, async (req, res) => {
  try {
    // req.user.username から UserID を探す必要がある (Tokenにはusernameしか入れてないので)
    const user = await User.findOne({ username: req.user.username });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const decks = await Deck.find({ userId: user._id }).sort({ updatedAt: -1 });
    res.json(decks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. デッキを保存 (新規作成 or 更新)
app.post('/api/decks', authenticateToken, async (req, res) => {
  try {
    const { name, cards, id } = req.body; // idがあれば更新
    const user = await User.findOne({ username: req.user.username });
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (id) {
      // 更新 (自分のデッキか確認)
      let deck = await Deck.findOne({ _id: id, userId: user._id });
      if (!deck) return res.status(404).json({ error: 'Deck not found or access denied' });

      deck.name = name;
      deck.cards = cards;
      await deck.save();
      res.json(deck);
    } else {
      // 新規作成
      const newDeck = new Deck({
        userId: user._id,
        name: name || 'No Name Deck',
        cards: cards
      });
      await newDeck.save();
      res.json(newDeck);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. デッキ詳細を取得 (共有用などにPublicにするか迷うが、一旦PublicでOK?)
// 今回は「自分の作ったデッキ」なので、編集画面で使うならAuth必須かもだが、閲覧は自由？
// 一旦 authenticateToken 無しで誰でも見れるようにしておく (URL共有のため)
app.get('/api/decks/:id', async (req, res) => {
  try {
    const deck = await Deck.findById(req.params.id);
    if (!deck) return res.status(404).json({ error: 'Deck not found' });
    res.json(deck);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. デッキ削除
app.delete('/api/decks/:id', authenticateToken, async (req, res) => {
  try {
    const user = await User.findOne({ username: req.user.username });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const result = await Deck.deleteOne({ _id: req.params.id, userId: user._id });
    if (result.deletedCount === 0) return res.status(404).json({ error: 'Deck not found or access denied' });

    res.json({ message: 'Deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- 商品系 API ---

// 1. 商品一覧をゲットする（誰でもOK）
app.get('/api/products', async (req, res) => {
  try {
    const products = await Product.find(); // DBから全商品を探す
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. 商品を追加する（誰でもOK）
app.post('/api/products', async (req, res) => {
  try {
    const newProduct = new Product(req.body); // 送られてきたデータを作る
    await newProduct.save(); // DBに保存！
    res.json(newProduct);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. サーバー起動確認用
app.get('/', (req, res) => {
  res.send('ショップAPIサーバー、元気に稼働中！');
});

// 4. 商品を削除する（誰でもOK）
app.delete('/api/products/:id', async (req, res) => {
  try {
    await Product.findByIdAndDelete(req.params.id); // 指定されたIDの商品を消す
    res.json({ message: '削除しました' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Socket.io Logic (Room & Game State) ---
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Adjust in production
    methods: ["GET", "POST"]
  }
});

// Store room states if needed (simple in-memory for now)
// rooms[roomId] = { players: [socketId, ...], spectators: [socketId, ...] }
const rooms = {};

io.on('connection', (socket) => {
  console.log('a user connected:', socket.id);

  // 1. Join Room
  socket.on('join_room', ({ roomId, role }) => {
    console.log(`[Socket] Join request from ${socket.id} for room ${roomId} as ${role}`);
    // Basic validation
    if (!roomId) return;

    socket.join(roomId);

    // Initialize room if not exists
    if (!rooms[roomId]) {
      rooms[roomId] = { players: [], spectators: [] };
    }

    const room = rooms[roomId];

    if (role === 'player') {
      // Check if room is full (max 2 players)
      if (room.players.length >= 2) {
        // Already full, maybe force to spectator or reject?
        // For now, let's just emit an error or handle it on client
        socket.emit('error_message', 'Room is full for players.');
        return;
      }
      room.players.push(socket.id);
      console.log(`User ${socket.id} joined room ${roomId} as Player`);
    } else {
      room.spectators.push(socket.id);
      console.log(`User ${socket.id} joined room ${roomId} as Spectator`);

      // Request state from a player to sync spectator
      if (room.players.length > 0) {
        // Ask the first player to send their state
        io.to(room.players[0]).emit('request_state', { requesterId: socket.id });
      }
    }

    // Notify room
    io.to(roomId).emit('room_update', {
      playerCount: room.players.length,
      spectatorCount: room.spectators.length
    });
  });

  // 2. Game Actions (Relay to room)
  socket.on('game_action', (data) => {
    // data should include roomId and action details
    const { roomId, action, payload } = data;
    // Broadcast to others in the room
    socket.to(roomId).emit('game_update', { action, payload, from: socket.id });
  });

  // 3. Sync State (Response to request_state)
  socket.on('sync_state', (data) => {
    const { targetId, state } = data;
    io.to(targetId).emit('state_synced', state);
  });

  // WebRTC Signaling (Offer, Answer, Candidate)
  socket.on('signal', (data) => {
    const { roomId, type, payload } = data;
    socket.to(roomId).emit('signal', { type, payload, from: socket.id });
  });

  socket.on('disconnect', () => {
    console.log('user disconnected:', socket.id);
    // Cleanup room logic (remove user from room arrays)
    for (const roomId in rooms) {
      const room = rooms[roomId];
      if (room.players.includes(socket.id)) {
        room.players = room.players.filter(id => id !== socket.id);
        io.to(roomId).emit('player_left', socket.id);
      }
      if (room.spectators.includes(socket.id)) {
        room.spectators = room.spectators.filter(id => id !== socket.id);
      }
      // Clean up empty rooms if needed
    }
  });
});

// --- サーバー開始 ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 サーバー起動: http://localhost:${PORT}`);
});