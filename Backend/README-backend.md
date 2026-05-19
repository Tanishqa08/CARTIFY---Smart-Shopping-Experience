Node.js Express backend for local product + cart API

1. Install dependencies

   npm init -y
   npm install express cors

2. Start server

   node server.js

3. API endpoints

   GET  /api/products        -> list products from db.json
   GET  /api/products/:id    -> product detail
   GET  /api/cart            -> read cart (cart.json created automatically)
   POST /api/cart            -> add or update cart item (body: {id, title, price, image, quantity})
   PUT  /api/cart/:id        -> set quantity
   DELETE /api/cart/:id     -> remove item

4. Notes

- server writes to cart.json in the same directory to persist cart state locally.
- This is a simple dev server for prototyping only; do not expose to the public without proper security.
