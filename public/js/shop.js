/* Shop front-end: talks to the Node API and fills the template pages. */
(function () {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const money = (n) => "$" + Number(n).toFixed(2);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const params = new URLSearchParams(location.search);

  async function api(method, url, body) {
    const res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
      credentials: "same-origin"
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Something went wrong");
    return data;
  }

  // ----- toast -----
  let toastTimer;
  function toast(msg, isError) {
    let el = $("#shop_toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "shop_toast";
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.className = isError ? "error show" : "show";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2500);
  }

  // ----- header: cart badge, account menu, search -----
  let me = null;
  async function refreshHeader() {
    try {
      const [cart, user] = await Promise.all([api("GET", "/api/cart"), api("GET", "/api/auth/me")]);
      me = user;
      $$("#checkout_items").forEach((el) => (el.textContent = cart.count));
      const menu = $(".account_selection");
      if (menu) {
        menu.innerHTML = user
          ? `<li><a href="orders.html"><i class="fa fa-list" aria-hidden="true"></i>My orders</a></li>
             ${user.role === "admin" ? '<li><a href="admin.html"><i class="fa fa-cog" aria-hidden="true"></i>Admin</a></li>' : ""}
             <li><a href="#" id="logout_link"><i class="fa fa-sign-out" aria-hidden="true"></i>Sign out (${esc(user.name)})</a></li>`
          : `<li><a href="account.html"><i class="fa fa-sign-in" aria-hidden="true"></i>Sign In</a></li>
             <li><a href="account.html?mode=register"><i class="fa fa-user-plus" aria-hidden="true"></i>Register</a></li>`;
        $("#logout_link")?.addEventListener("click", async (e) => {
          e.preventDefault();
          await api("POST", "/api/auth/logout");
          location.href = "index.html";
        });
      }
      $$("[data-account-label]").forEach((el) => (el.textContent = user ? user.name : "My Account"));
    } catch (e) { /* server offline */ }
  }

  function wireSearch() {
    const icon = $(".navbar_user .fa-search");
    if (!icon) return;
    icon.closest("a").addEventListener("click", (e) => {
      e.preventDefault();
      const q = prompt("Search products");
      if (q) location.href = "categories.html?q=" + encodeURIComponent(q);
    });
  }

  async function addToCart(productId, qty = 1) {
    try {
      const cart = await api("POST", "/api/cart", { productId, qty });
      $$("#checkout_items").forEach((el) => (el.textContent = cart.count));
      toast("Added to cart");
    } catch (e) { toast(e.message, true); }
  }

  // ----- product card (uses the template's markup) -----
  function productCard(p) {
    const off = p.oldPrice && p.oldPrice > p.price ? `<div class="product_bubble product_bubble_right product_bubble_red d-flex flex-column align-items-center"><span>-${money(p.oldPrice - p.price)}</span></div>` : "";
    const soldOut = p.stock <= 0;
    return `
      <div class="product-item">
        <div class="product ${p.oldPrice ? "discount" : ""} product_filter">
          <div class="product_image"><a href="single.html?id=${p.id}"><img src="${esc(p.image)}" alt="${esc(p.name)}"></a></div>
          ${off}
          <div class="product_info">
            <h6 class="product_name"><a href="single.html?id=${p.id}">${esc(p.name)}</a></h6>
            <div class="product_price">${money(p.price)}${p.oldPrice ? `<span>${money(p.oldPrice)}</span>` : ""}</div>
          </div>
        </div>
        <div class="red_button add_to_cart_button ${soldOut ? "disabled" : ""}"><a href="#" data-add="${p.id}">${soldOut ? "sold out" : "add to cart"}</a></div>
      </div>`;
  }

  function wireAddButtons(root) {
    $$("[data-add]", root).forEach((a) => a.addEventListener("click", (e) => {
      e.preventDefault();
      if (a.closest(".disabled")) return;
      addToCart(Number(a.dataset.add));
    }));
  }

  function renderGrid(grid, products) {
    grid.innerHTML = products.length ? products.map(productCard).join("") : '<p class="shop_empty">No products match. Try another word or category.</p>';
    wireAddButtons(grid);
    if (window.jQuery && jQuery.fn.isotope && jQuery(grid).data("isotope")) {
      jQuery(grid).isotope("destroy");
    }
  }

  // ----- home page -----
  async function initHome() {
    const grid = $("#home_grid");
    if (!grid) return;
    const [cats, products] = await Promise.all([api("GET", "/api/categories"), api("GET", "/api/products")]);
    const filters = $("#home_filters");
    filters.innerHTML = ["All", ...cats].map((c, i) => `<li class="grid_sorting_button button d-flex flex-column justify-content-center align-items-center ${i === 0 ? "active" : ""}" data-cat="${esc(c)}">${esc(c)}</li>`).join("");
    const show = (cat) => renderGrid(grid, cat === "All" ? products : products.filter((p) => p.category === cat));
    $$("li", filters).forEach((li) => li.addEventListener("click", () => {
      $$("li", filters).forEach((x) => x.classList.remove("active"));
      li.classList.add("active");
      show(li.dataset.cat);
    }));
    show("All");
    const banners = $$("[data-banner-cat]");
    banners.forEach((a, i) => {
      const c = cats[i];
      if (c) { a.textContent = c; a.href = "categories.html?category=" + encodeURIComponent(c); }
    });
  }

  // ----- category / shop page -----
  async function initCategories() {
    const grid = $("#shop_grid");
    if (!grid) return;
    const current = params.get("category") || "All";
    const q = params.get("q") || "";
    const cats = await api("GET", "/api/categories");
    const list = $("#shop_categories");
    list.innerHTML = ["All", ...cats].map((c) =>
      `<li class="${c === current ? "active" : ""}"><a href="categories.html?category=${encodeURIComponent(c)}">${c === current ? '<span><i class="fa fa-angle-double-right" aria-hidden="true"></i></span>' : ""}${esc(c)}</a></li>`).join("");
    $("#shop_breadcrumb").textContent = q ? `Search: ${q}` : current;
    const search = $("#shop_search");
    search.value = q;
    $("#shop_search_form").addEventListener("submit", (e) => {
      e.preventDefault();
      location.href = "categories.html?category=" + encodeURIComponent(current) + "&q=" + encodeURIComponent(search.value);
    });
    const products = await api("GET", `/api/products?category=${encodeURIComponent(current)}&q=${encodeURIComponent(q)}`);
    $("#shop_count").textContent = `Showing ${products.length} product${products.length === 1 ? "" : "s"}`;
    renderGrid(grid, products);
  }

  // ----- single product -----
  async function initSingle() {
    if (!$("#single_name")) return;
    const id = Number(params.get("id"));
    let p;
    try { p = await api("GET", "/api/products/" + id); }
    catch { $("#single_name").textContent = "Product not found"; return; }
    document.title = p.name;
    $("#single_name").textContent = p.name;
    $("#single_desc").textContent = p.desc;
    $("#single_price").textContent = money(p.price);
    const old = $("#single_old_price");
    old.textContent = p.oldPrice ? money(p.oldPrice) : "";
    old.style.display = p.oldPrice ? "" : "none";
    $("#single_image").style.backgroundImage = `url(${p.image})`;
    $("#single_category").textContent = p.category;
    $("#single_category").href = "categories.html?category=" + encodeURIComponent(p.category);
    $("#single_stock").textContent = p.stock > 0 ? `${p.stock} in stock` : "Sold out";
    let qty = 1;
    const qv = $("#quantity_value");
    $(".quantity_selector .minus").addEventListener("click", () => { qty = Math.max(1, qty - 1); qv.textContent = qty; });
    $(".quantity_selector .plus").addEventListener("click", () => { qty = Math.min(p.stock, qty + 1); qv.textContent = qty; });
    $("#single_add").addEventListener("click", (e) => { e.preventDefault(); if (p.stock > 0) addToCart(p.id, qty); });
  }

  // ----- cart page -----
  async function initCart() {
    const box = $("#cart_box");
    if (!box) return;
    async function draw(cart) {
      if (!cart.items.length) {
        box.innerHTML = '<p class="shop_empty">Your cart is empty.</p><div class="red_button shop_now_button"><a href="categories.html">browse products</a></div>';
        return;
      }
      box.innerHTML = `
        <table class="shop_table">
          <thead><tr><th>Product</th><th>Price</th><th>Quantity</th><th>Total</th><th></th></tr></thead>
          <tbody>${cart.items.map((i) => `
            <tr>
              <td><a href="single.html?id=${i.product.id}">${esc(i.product.name)}</a></td>
              <td>${money(i.product.price)}</td>
              <td><input type="number" min="0" max="${i.product.stock}" value="${i.qty}" data-qty="${i.product.id}"></td>
              <td>${money(i.product.price * i.qty)}</td>
              <td><a href="#" data-remove="${i.product.id}" class="shop_remove">remove</a></td>
            </tr>`).join("")}
          </tbody>
        </table>
        <div class="shop_total">Subtotal: <strong>${money(cart.subtotal)}</strong></div>
        <div class="red_button shop_now_button"><a href="checkout.html">check out</a></div>`;
      $$("[data-qty]", box).forEach((inp) => inp.addEventListener("change", async () => {
        try { draw(await api("PUT", "/api/cart/" + inp.dataset.qty, { qty: inp.value })); refreshHeader(); }
        catch (e) { toast(e.message, true); }
      }));
      $$("[data-remove]", box).forEach((a) => a.addEventListener("click", async (e) => {
        e.preventDefault();
        draw(await api("DELETE", "/api/cart/" + a.dataset.remove)); refreshHeader();
      }));
    }
    draw(await api("GET", "/api/cart"));
  }

  // ----- checkout page -----
  async function initCheckout() {
    const form = $("#checkout_form");
    if (!form) return;
    const user = await api("GET", "/api/auth/me");
    if (!user) { location.href = "account.html?next=checkout.html"; return; }
    form.name.value = user.name;
    const cart = await api("GET", "/api/cart");
    $("#checkout_summary").innerHTML = cart.items.length
      ? cart.items.map((i) => `<div class="shop_line"><span>${i.qty} × ${esc(i.product.name)}</span><span>${money(i.product.price * i.qty)}</span></div>`).join("") +
        `<div class="shop_line shop_line_total"><span>Total</span><span>${money(cart.subtotal)}</span></div>`
      : '<p class="shop_empty">Your cart is empty.</p>';
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (form.card.value.replace(/\s/g, "").length < 12) return toast("Enter a card number (any 12+ digits in this demo)", true);
      try {
        const order = await api("POST", "/api/orders", { name: form.name.value, address: form.address.value, city: form.city.value, zip: form.zip.value });
        location.href = "orders.html?placed=" + order.id;
      } catch (err) { toast(err.message, true); }
    });
  }

  // ----- orders page -----
  async function initOrders() {
    const box = $("#orders_box");
    if (!box) return;
    const user = await api("GET", "/api/auth/me");
    if (!user) { location.href = "account.html?next=orders.html"; return; }
    if (params.get("placed")) toast("Order #" + params.get("placed") + " placed");
    const orders = await api("GET", "/api/orders");
    box.innerHTML = orders.length ? orders.map(orderCard).join("") : '<p class="shop_empty">No orders yet.</p><div class="red_button shop_now_button"><a href="categories.html">start shopping</a></div>';
  }
  function orderCard(o) {
    return `<div class="shop_order">
      <div class="shop_line"><strong>Order #${o.id}</strong><span class="shop_status shop_status_${o.status.toLowerCase()}">${esc(o.status)}</span></div>
      <div class="shop_muted">${new Date(o.date).toLocaleDateString()} · ships to ${esc(o.shipping.address)}, ${esc(o.shipping.city)} ${esc(o.shipping.zip)}</div>
      ${o.items.map((i) => `<div class="shop_line"><span>${i.qty} × ${esc(i.name)}</span><span>${money(i.price * i.qty)}</span></div>`).join("")}
      <div class="shop_line shop_line_total"><span>Total</span><span>${money(o.total)}</span></div>
    </div>`;
  }

  // ----- account page -----
  async function initAccount() {
    const form = $("#account_form");
    if (!form) return;
    let mode = params.get("mode") === "register" ? "register" : "login";
    const next = params.get("next") || "index.html";
    const user = await api("GET", "/api/auth/me");
    if (user) { location.href = next; return; }
    function paint() {
      $("#account_title").textContent = mode === "login" ? "Sign in" : "Create account";
      $("#account_name_row").style.display = mode === "login" ? "none" : "";
      $("#account_submit").textContent = mode === "login" ? "sign in" : "create account";
      $("#account_switch").textContent = mode === "login" ? "New here? Create an account" : "Already have an account? Sign in";
    }
    $("#account_switch").addEventListener("click", (e) => { e.preventDefault(); mode = mode === "login" ? "register" : "login"; paint(); });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        await api("POST", "/api/auth/" + mode, { name: form.name.value, email: form.email.value, password: form.password.value });
        location.href = next;
      } catch (err) { toast(err.message, true); }
    });
    paint();
  }

  // ----- admin page -----
  async function initAdmin() {
    const root = $("#admin_root");
    if (!root) return;
    const user = await api("GET", "/api/auth/me");
    if (!user || user.role !== "admin") { root.innerHTML = '<p class="shop_empty">Admins only. <a href="account.html?next=admin.html">Sign in</a> with an admin account.</p>'; return; }
    const form = $("#admin_product_form");
    let editing = null;

    async function drawProducts() {
      const [cats, products] = await Promise.all([api("GET", "/api/categories"), api("GET", "/api/products")]);
      form.category.innerHTML = cats.map((c) => `<option>${esc(c)}</option>`).join("") + '<option value="__new">+ New category…</option>';
      $("#admin_products").innerHTML = `<table class="shop_table">
        <thead><tr><th>Product</th><th>Category</th><th>Price</th><th>Stock</th><th></th></tr></thead>
        <tbody>${products.map((p) => `<tr>
          <td>${esc(p.name)}</td><td>${esc(p.category)}</td><td>${money(p.price)}</td>
          <td class="${p.stock <= 5 ? "shop_low" : ""}">${p.stock}</td>
          <td><a href="#" data-edit="${p.id}">edit</a> · <a href="#" data-del="${p.id}" class="shop_remove">remove</a></td></tr>`).join("")}</tbody></table>`;
      $$("[data-edit]").forEach((a) => a.addEventListener("click", (e) => {
        e.preventDefault();
        const p = products.find((x) => x.id === Number(a.dataset.edit));
        editing = p.id;
        ["name", "price", "oldPrice", "stock", "image", "desc"].forEach((k) => (form[k].value = p[k] ?? ""));
        form.category.value = p.category;
        $("#admin_form_title").textContent = "Edit product";
        $("#admin_cancel").style.display = "";
        form.scrollIntoView({ behavior: "smooth" });
      }));
      $$("[data-del]").forEach((a) => a.addEventListener("click", async (e) => {
        e.preventDefault();
        if (!confirm("Remove this product?")) return;
        await api("DELETE", "/api/admin/products/" + a.dataset.del);
        toast("Product removed"); drawProducts();
      }));
    }

    async function drawOrders() {
      const orders = await api("GET", "/api/admin/orders");
      const revenue = orders.reduce((s, o) => s + o.total, 0);
      $("#admin_stats").textContent = `${orders.length} orders · ${money(revenue)} revenue`;
      $("#admin_orders").innerHTML = orders.length ? `<table class="shop_table">
        <thead><tr><th>Order</th><th>Customer</th><th>Items</th><th>Total</th><th>Status</th></tr></thead>
        <tbody>${orders.map((o) => `<tr>
          <td>#${o.id}<div class="shop_muted">${new Date(o.date).toLocaleDateString()}</div></td>
          <td>${esc(o.customer?.name || "—")}</td>
          <td>${o.items.map((i) => `${i.qty}× ${esc(i.name)}`).join(", ")}</td>
          <td>${money(o.total)}</td>
          <td><select data-status="${o.id}">${["Processing", "Shipped", "Delivered", "Cancelled"].map((s) => `<option ${s === o.status ? "selected" : ""}>${s}</option>`).join("")}</select></td>
        </tr>`).join("")}</tbody></table>` : '<p class="shop_empty">No orders yet.</p>';
      $$("[data-status]").forEach((sel) => sel.addEventListener("change", async () => {
        await api("PUT", "/api/admin/orders/" + sel.dataset.status, { status: sel.value });
        toast("Order updated");
      }));
    }

    form.category.addEventListener("change", () => {
      if (form.category.value === "__new") {
        const c = prompt("New category name");
        if (c) { form.category.insertAdjacentHTML("afterbegin", `<option>${esc(c)}</option>`); form.category.value = c; }
        else form.category.selectedIndex = 0;
      }
    });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const body = { name: form.name.value, category: form.category.value, price: form.price.value, oldPrice: form.oldPrice.value || null, stock: form.stock.value, image: form.image.value || "images/product_1.png", desc: form.desc.value };
      try {
        if (editing) { await api("PUT", "/api/admin/products/" + editing, body); toast("Product updated"); }
        else { await api("POST", "/api/admin/products", body); toast("Product added"); }
        resetForm(); drawProducts();
      } catch (err) { toast(err.message, true); }
    });
    function resetForm() { editing = null; form.reset(); $("#admin_form_title").textContent = "Add product"; $("#admin_cancel").style.display = "none"; }
    $("#admin_cancel").addEventListener("click", (e) => { e.preventDefault(); resetForm(); });
    drawProducts(); drawOrders();
  }

  document.addEventListener("DOMContentLoaded", () => {
    refreshHeader();
    wireSearch();
    initHome(); initCategories(); initSingle(); initCart(); initCheckout(); initOrders(); initAccount(); initAdmin();
  });
})();