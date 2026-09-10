const express = require("express");
const session = require("express-session");
const path = require("path");
const bcrypt = require("bcryptjs");
const db = require("./db");

db.load();
const app = express();
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || "change-me-in-production",
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }
}));
app.use(express.static(path.join(__dirname, "..", "public")));
// Fallback: serve the template assets (images, js, plugins, styles) from the project root
app.use(express.static(path.join(__dirname, "..")));

// ---------- helpers ----------
const publicUser = (u) => u && { id: u.id, name: u.name, email: u.email, role: u.role };
const currentUser = (req) => db.get().users.find((u) => u.id === req.session.userId) || null;
const requireLogin = (req, res, next) => currentUser(req) ? next() : res.status(401).json({ error: "Sign in first" });
const requireAdmin = (req, res, next) => currentUser(req)?.role === "admin" ? next() : res.status(403).json({ error: "Admins only" });
const cartOf = (req) => (req.session.cart = req.session.cart || {});
function cartView(req) {
  const cart = cartOf(req);
  const items = Object.entries(cart)
    .map(([id, qty]) => {
      const p = db.get().products.find((x) => x.id === Number(id));
      return p && { product: p, qty };
    })
    .filter(Boolean);
  const subtotal = items.reduce((s, i) => s + i.qty * i.product.price, 0);
  const count = items.reduce((s, i) => s + i.qty, 0);
  return { items, subtotal, count };
}

// ---------- catalog ----------
app.get("/api/categories", (req, res) => res.json(db.get().categories));

app.get("/api/products", (req, res) => {
  const { category, q } = req.query;
  const needle = (q || "").toLowerCase().trim();
  const list = db.get().products.filter((p) =>
    (!category || category === "All" || p.category === category) &&
    (!needle || p.name.toLowerCase().includes(needle) || p.desc.toLowerCase().includes(needle))
  );
  res.json(list);
});

app.get("/api/products/:id", (req, res) => {
  const p = db.get().products.find((x) => x.id === Number(req.params.id));
  p ? res.json(p) : res.status(404).json({ error: "Product not found" });
});

// ---------- cart (stored in session) ----------
app.get("/api/cart", (req, res) => res.json(cartView(req)));

app.post("/api/cart", (req, res) => {
  const { productId, qty = 1 } = req.body;
  const p = db.get().products.find((x) => x.id === Number(productId));
  if (!p) return res.status(404).json({ error: "Product not found" });
  const cart = cartOf(req);
  const next = (cart[p.id] || 0) + Number(qty);
  if (next > p.stock) return res.status(400).json({ error: `Only ${p.stock} in stock` });
  cart[p.id] = next;
  res.json(cartView(req));
});

app.put("/api/cart/:id", (req, res) => {
  const cart = cartOf(req);
  const qty = Number(req.body.qty);
  const p = db.get().products.find((x) => x.id === Number(req.params.id));
  if (!p) return res.status(404).json({ error: "Product not found" });
  if (qty <= 0) delete cart[p.id];
  else if (qty > p.stock) return res.status(400).json({ error: `Only ${p.stock} in stock` });
  else cart[p.id] = qty;
  res.json(cartView(req));
});

app.delete("/api/cart/:id", (req, res) => {
  delete cartOf(req)[req.params.id];
  res.json(cartView(req));
});

// ---------- auth ----------
app.get("/api/auth/me", (req, res) => res.json(publicUser(currentUser(req))));

app.post("/api/auth/register", (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: "Name, email and password are required" });
  const users = db.get().users;
  if (users.some((u) => u.email.toLowerCase() === email.toLowerCase())) return res.status(400).json({ error: "That email already has an account" });
  const user = { id: db.nextId(users), name, email, passwordHash: bcrypt.hashSync(password, 8), role: "customer" };
  users.push(user);
  db.save();
  req.session.userId = user.id;
  res.json(publicUser(user));
});

app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body;
  const user = db.get().users.find((u) => u.email.toLowerCase() === (email || "").toLowerCase());
  if (!user || !bcrypt.compareSync(password || "", user.passwordHash)) return res.status(401).json({ error: "Email or password doesn't match" });
  req.session.userId = user.id;
  res.json(publicUser(user));
});

app.post("/api/auth/logout", (req, res) => {
  delete req.session.userId;
  res.json({ ok: true });
});

// ---------- orders ----------
app.post("/api/orders", requireLogin, (req, res) => {
  const { items, subtotal } = cartView(req);
  if (items.length === 0) return res.status(400).json({ error: "Your cart is empty" });
  const { name, address, city, zip } = req.body;
  if (!name || !address || !city || !zip) return res.status(400).json({ error: "Enter a full shipping address" });
  const data = db.get();
  const order = {
    id: data.orders.length ? Math.max(...data.orders.map((o) => o.id)) + 1 : 1001,
    userId: currentUser(req).id,
    items: items.map((i) => ({ productId: i.product.id, name: i.product.name, price: i.product.price, qty: i.qty })),
    total: subtotal,
    shipping: { name, address, city, zip },
    status: "Processing",
    date: new Date().toISOString()
  };
  items.forEach((i) => { i.product.stock -= i.qty; });
  data.orders.unshift(order);
  db.save();
  req.session.cart = {};
  res.json(order);
});

app.get("/api/orders", requireLogin, (req, res) => {
  const me = currentUser(req);
  res.json(db.get().orders.filter((o) => o.userId === me.id));
});

// ---------- admin ----------
app.post("/api/admin/products", requireAdmin, (req, res) => {
  const { name, category, price, stock, desc = "", image = "images/product_1.png", oldPrice = null } = req.body;
  if (!name || !category || price == null || stock == null) return res.status(400).json({ error: "Name, category, price and stock are required" });
  const data = db.get();
  const p = { id: db.nextId(data.products), name, category, price: Number(price), oldPrice: oldPrice ? Number(oldPrice) : null, stock: Number(stock), image, desc };
  data.products.push(p);
  if (!data.categories.includes(category)) data.categories.push(category);
  db.save();
  res.json(p);
});

app.put("/api/admin/products/:id", requireAdmin, (req, res) => {
  const data = db.get();
  const p = data.products.find((x) => x.id === Number(req.params.id));
  if (!p) return res.status(404).json({ error: "Product not found" });
  const { name, category, price, stock, desc, image, oldPrice } = req.body;
  Object.assign(p, {
    name: name ?? p.name, category: category ?? p.category, desc: desc ?? p.desc, image: image ?? p.image,
    price: price != null ? Number(price) : p.price, stock: stock != null ? Number(stock) : p.stock,
    oldPrice: oldPrice === undefined ? p.oldPrice : (oldPrice ? Number(oldPrice) : null)
  });
  if (!data.categories.includes(p.category)) data.categories.push(p.category);
  db.save();
  res.json(p);
});

app.delete("/api/admin/products/:id", requireAdmin, (req, res) => {
  const data = db.get();
  data.products = data.products.filter((x) => x.id !== Number(req.params.id));
  db.save();
  res.json({ ok: true });
});

app.get("/api/admin/orders", requireAdmin, (req, res) => {
  const data = db.get();
  res.json(data.orders.map((o) => ({ ...o, customer: publicUser(data.users.find((u) => u.id === o.userId)) })));
});

app.put("/api/admin/orders/:id", requireAdmin, (req, res) => {
  const o = db.get().orders.find((x) => x.id === Number(req.params.id));
  if (!o) return res.status(404).json({ error: "Order not found" });
  o.status = req.body.status || o.status;
  db.save();
  res.json(o);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Shop running at http://localhost:${PORT}`));