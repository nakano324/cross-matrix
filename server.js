require('dotenv').config(); // .envの鍵を読み込む
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();

// --- 設定 ---
app.use(express.json()); // JSONを使えるようにする
app.use(cors()); // どこからでもアクセス許可（開発用）

// --- データベース接続 ---
// .envファイルに書いたURLを使って接続します
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDBに接続成功！'))
  .catch((err) => console.error('❌ MongoDB接続エラー:', err));

// --- データの設計図 (Schema) ---
// 商品データの形を決めます
const ProductSchema = new mongoose.Schema({
  name: String,
  price: Number,
  description: String,
  image: String
});
const Product = mongoose.model('Product', ProductSchema);

// --- API (窓口) ---

// 1. 商品一覧をゲットする
app.get('/api/products', async (req, res) => {
  try {
    const products = await Product.find(); // DBから全商品を探す
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. 商品を追加する（テスト用）
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

// 4. 商品を削除する
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