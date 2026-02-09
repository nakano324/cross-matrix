
require('dotenv').config(); // .envの鍵を読み込む
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const crypto = require('crypto'); // ランダムな文字列を作る用

const nodemailer = require('nodemailer');

const app = express();

// 認証メールのリンク先に使う、あなたのGitHub PagesのURL
const FRONTEND_URL = "https://nakano324.github.io/cross-matrix";

// --- 設定 ---
app.use(express.json()); // JSONを使えるようにする
app.use(cors()); // どこからでもアクセス許可（開発用）

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
  host: "smtp.resend.com", // Gmailのサーバーを直接指定
  port: 2525,              // SSL専用のポート番号
  secure: false,
  requireTLS: true,
  auth: {
    user: "resend",
    pass: process.env.RESEND_API_KEY
  }
});

// メールを送る関数
async function sendEmail(to, subject, text) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.log("⚠️ EMAIL設定がありません。コンソールに内容を表示します。");
    console.log(`[メール送信] To: ${to}`);
    console.log(`[件名] ${subject}`);
    console.log(`[本文] ${text}`);
    return;
  }

  try {
    await transporter.sendMail({
      from: 'onboarding@resend.dev',
      to,
      subject,
      text
    });
    console.log(`📧 メール送信成功: ${to}`);
  } catch (err) {
    console.error("❌ メール送信エラー:", err);
    console.log(`[本文バックアップ] ${text}`);
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
    const { username, email, password } = req.body;

    // 重複チェック
    const existingUser = await User.findOne({ $or: [{ username }, { email }] });
    if (existingUser) {
      return res.status(400).json({ error: 'ユーザー名またはメールアドレスが既に使用されています' });
    }

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
    const { username, password } = req.body;
    const user = await User.findOne({ username });
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

// --- サーバー開始 ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 サーバー起動: http://localhost:${PORT}`);
});