// Tiny JSON-file database. Good for a prototype; swap for SQLite/Postgres later.
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");

const FILE = path.join(__dirname, "..", "data", "db.json");

const SEED = {
  categories: ["Clothing", "Car care", "Home", "Electronics"],
  products: [
    { id: 1, name: "Heavyweight cotton tee", category: "Clothing", price: 28, oldPrice: null, stock: 40, image: "images/product_1.png", desc: "240gsm combed cotton, boxy fit, garment-dyed." },
    { id: 2, name: "Selvedge denim jacket", category: "Clothing", price: 149, oldPrice: 179, stock: 12, image: "images/product_2.png", desc: "14oz Japanese denim, copper rivets, unwashed." },
    { id: 3, name: "Merino crew sweater", category: "Clothing", price: 95, oldPrice: null, stock: 18, image: "images/product_3.png", desc: "Extra-fine merino, machine washable." },
    { id: 4, name: "Ceramic spray coating", category: "Car care", price: 34, oldPrice: null, stock: 60, image: "images/product_4.png", desc: "SiO2 hydrophobic layer, 6 months of protection." },
    { id: 5, name: "Two-bucket wash kit", category: "Car care", price: 59, oldPrice: 69, stock: 25, image: "images/product_5.png", desc: "Grit guards, pH-neutral shampoo, microfiber mitt." },
    { id: 6, name: "Interior detailer", category: "Car care", price: 16, oldPrice: null, stock: 80, image: "images/product_6.png", desc: "Matte finish for dash and door panels, UV blockers." },
    { id: 7, name: "Tire shine gel", category: "Car care", price: 14, oldPrice: null, stock: 70, image: "images/product_7.png", desc: "No-sling formula, applicator included." },
    { id: 8, name: "Linen duvet cover", category: "Home", price: 120, oldPrice: null, stock: 15, image: "images/product_8.png", desc: "Stonewashed European flax, queen size." },
    { id: 9, name: "Cast iron skillet 12\"", category: "Home", price: 45, oldPrice: null, stock: 30, image: "images/product_9.png", desc: "Pre-seasoned, oven safe to 500°F." },
    { id: 10, name: "USB-C wall charger 65W", category: "Electronics", price: 39, oldPrice: null, stock: 50, image: "images/product_10.png", desc: "GaN, dual port, folding plug." },
    { id: 11, name: "Noise-isolating earbuds", category: "Electronics", price: 79, oldPrice: 99, stock: 22, image: "images/product_1.png", desc: "Wired, 3 tip sizes, inline mic." }
  ],
  users: [
    { id: 1, name: "Admin", email: "admin@shop.test", passwordHash: bcrypt.hashSync("admin", 8), role: "admin" },
    { id: 2, name: "Sam Rivera", email: "sam@shop.test", passwordHash: bcrypt.hashSync("sam", 8), role: "customer" }
  ],
  orders: []
};

let data;

function load() {
  if (!fs.existsSync(FILE)) {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(SEED, null, 2));
  }
  data = JSON.parse(fs.readFileSync(FILE, "utf8"));
  return data;
}

function save() {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

function nextId(list) {
  return list.reduce((m, x) => Math.max(m, x.id), 0) + 1;
}

module.exports = { load, save, nextId, get: () => data };
