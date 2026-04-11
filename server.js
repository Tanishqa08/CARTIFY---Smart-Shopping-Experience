const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 4000;
const DB_PATH = path.join(__dirname, 'db.json');
const CART_PATH = path.join(__dirname, 'cart.json');

app.use(cors());
app.use(express.json());
// serve static files from project root so frontend can fetch / and /api/* from same origin
app.use(express.static(path.join(__dirname)));

// ensure cart file exists
(async () => {
  try {
    await fs.access(CART_PATH);
  } catch (e) {
    await writeJson(CART_PATH, []);
    console.log('Created empty cart.json');
  }
})();

async function readJson(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

async function writeJson(filePath, data) {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
}

// GET /api/products -> return products array from db.json
app.get('/api/products', async (req, res) => {
  const db = await readJson(DB_PATH);
  const products = db && Array.isArray(db.products) ? db.products : [];
  res.json(products);
});

// GET /api/products/:id
app.get('/api/products/:id', async (req, res) => {
  const id = req.params.id;
  const db = await readJson(DB_PATH);
  const products = db && Array.isArray(db.products) ? db.products : [];
  const product = products.find(p => String(p.id) === String(id));
  if (!product) return res.status(404).json({ error: 'Product not found' });
  res.json(product);
});

// GET /api/cart
app.get('/api/cart', async (req, res) => {
  const cart = await readJson(CART_PATH) || [];
  console.log('/api/cart ->', cart.length, 'items');
  res.json(cart);
});

// POST /api/cart  -> add or update item { id, name, price, image, quantity }
app.post('/api/cart', async (req, res) => {
  const item = req.body;
  console.log('POST /api/cart received:', item);
  if (!item || !item.id) return res.status(400).json({ error: 'Invalid item' });
  const cart = (await readJson(CART_PATH)) || [];
  const idx = cart.findIndex(i => String(i.id) === String(item.id));
  if (idx > -1) {
    // update quantity (replace or add)
    cart[idx].quantity = (item.quantity != null) ? Number(item.quantity) : (cart[idx].quantity || 1);
    cart[idx] = { ...cart[idx], ...item };
  } else {
    cart.push({ ...item, quantity: item.quantity != null ? Number(item.quantity) : 1 });
  }
  await writeJson(CART_PATH, cart);
  console.log('cart.json updated, items:', cart.length);
  res.json(cart);
});

// PUT /api/cart/:id -> set quantity or replace
app.put('/api/cart/:id', async (req, res) => {
  const id = req.params.id;
  const { quantity } = req.body;
  console.log('PUT /api/cart/' + id + ' ->', quantity);
  const cart = (await readJson(CART_PATH)) || [];
  const idx = cart.findIndex(i => String(i.id) === String(id));
  if (idx === -1) return res.status(404).json({ error: 'Item not in cart' });
  if (quantity == null) return res.status(400).json({ error: 'Quantity required' });
  cart[idx].quantity = Number(quantity);
  if (cart[idx].quantity <= 0) cart.splice(idx, 1);
  await writeJson(CART_PATH, cart);
  console.log('cart.json updated, items:', cart.length);
  res.json(cart);
});

// DELETE /api/cart/:id -> remove item
app.delete('/api/cart/:id', async (req, res) => {
  const id = req.params.id;
  console.log('DELETE /api/cart/' + id);
  let cart = (await readJson(CART_PATH)) || [];
  cart = cart.filter(i => String(i.id) !== String(id));
  await writeJson(CART_PATH, cart);
  console.log('cart.json updated, items:', cart.length);
  res.json(cart);
});

// simple health
app.get('/api/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => console.log(`Backend API running on http://localhost:${PORT}`));
