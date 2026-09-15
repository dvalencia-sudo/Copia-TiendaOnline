/* =========================
	Estado y referencias del DOM
	========================= */
/* El navegador solo consume la API; la sesion, el inventario y los permisos viven en el servidor. */
let inventory = []
const cart = JSON.parse(localStorage.getItem('canasta-cart') || '{}')
const $ = (selector) => document.querySelector(selector)
const productGrid = $('#productGrid'),
  categoryTabs = $('#categoryTabs'),
  cartCount = $('#cartCount'),
  cartList = $('#cartList'),
  cartTotal = $('#cartTotal'),
  orderPanel = $('#orderPanel'),
  orderBackdrop = $('#orderBackdrop'),
  adminPanel = $('#adminPanel'),
  loginDialog = $('#loginDialog'),
  loginBackdrop = $('#loginBackdrop'),
  adminMessage = $('#adminMessage')
let activeCategory = 'Todos'
let editingId = null

/* Formatea cualquier valor numerico como precio con dos decimales. */
function money(value) {
  return `$${Number(value).toFixed(2)}`
}

/* Cliente HTTP comun: envia JSON, conserva las cookies de sesion y normaliza errores. */
async function request(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  })
  const data = response.status === 204 ? null : await response.json()
  if (!response.ok)
    throw new Error(data?.error || 'No se pudo completar la solicitud.')
  return data
}

/* =========================
	Catalogo publico
	========================= */
/* Carga publica del inventario: nunca se confia en un inventario guardado por el cliente. */
async function loadInventory() {
  inventory = await request('/api/products')
  renderAll()
}

/* Obtiene las categorias y agrega el filtro general. */
function getCategories() {
  return ['Todos', ...new Set(inventory.map((product) => product.category))]
}

/* Dibuja los botones de categoria y conecta sus eventos de filtrado. */
function renderTabs() {
  const categories = getCategories()
  if (!categories.includes(activeCategory)) activeCategory = 'Todos'
  categoryTabs.innerHTML = categories
    .map(
      (category) =>
        `<button class="category-tab${category === activeCategory ? ' active' : ''}" type="button" role="tab" aria-selected="${category === activeCategory}" data-category="${category}">${category}</button>`,
    )
    .join('')
  categoryTabs.querySelectorAll('.category-tab').forEach((tab) =>
    tab.addEventListener('click', () => {
      activeCategory = tab.dataset.category
      renderTabs()
      renderProducts()
    }),
  )
}

/* Construye las tarjetas visibles y conecta los controles de cantidad. */
function renderProducts() {
  const visible =
    activeCategory === 'Todos'
      ? inventory
      : inventory.filter((product) => product.category === activeCategory)
  productGrid.innerHTML = visible
    .map((product) => {
      const quantity = cart[product.id] || 0
      const visual = product.image
        ? `<img src="${product.image}" alt="${product.name}">`
        : `<span>${product.icon}</span>`
      return `<article class="product-card"><div class="product-visual product-${product.category.toLowerCase()}">${visual}<small>${product.category}</small></div><div class="product-info"><h3>${product.name}</h3><p>${product.description}</p><span class="product-unit">Por ${product.unit}</span><strong class="product-price">${money(product.price)}</strong><span class="stock-label${product.stock === 0 ? ' out' : ''}">${product.stock === 0 ? 'Agotado' : `${product.stock} disponibles`}</span></div><div class="qty-control"><div class="qty-buttons"><button type="button" data-action="decrease" data-id="${product.id}" ${quantity === 0 ? 'disabled' : ''}>-</button><span>${quantity}</span><button type="button" data-action="increase" data-id="${product.id}" ${product.stock === 0 || quantity >= product.stock ? 'disabled' : ''}>+</button></div><button class="add-button" type="button" data-action="increase" data-id="${product.id}" ${product.stock === 0 || quantity >= product.stock ? 'disabled' : ''}>${quantity ? 'Añadir otra' : 'Añadir'}</button></div></article>`
    })
    .join('')
  productGrid
    .querySelectorAll('[data-action]')
    .forEach((button) =>
      button.addEventListener('click', () =>
        changeQuantity(
          button.dataset.id,
          button.dataset.action === 'increase' ? 1 : -1,
        ),
      ),
    )
}

/* Ajusta la cantidad sin permitir valores negativos ni superar el stock. */
function changeQuantity(id, change) {
  const product = inventory.find((item) => item.id === id)
  if (!product) return
  const next = Math.min(product.stock, Math.max(0, (cart[id] || 0) + change))
  if (next) cart[id] = next
  else delete cart[id]
  localStorage.setItem('canasta-cart', JSON.stringify(cart))
  renderProducts()
  renderCart()
}

/* Actualiza el contador, el total y las lineas del carrito. */
function renderCart() {
  const items = inventory.filter((product) => cart[product.id] > 0)
  cartCount.textContent = items.reduce(
    (sum, product) => sum + cart[product.id],
    0,
  )
  cartTotal.textContent = money(
    items.reduce((sum, product) => sum + product.price * cart[product.id], 0),
  )
  cartList.innerHTML = items.length
    ? items
        .map(
          (product) =>
            `<li class="cart-item"><span><strong>${product.name}</strong><small>${cart[product.id]} ${product.unit}</small></span><strong>${money(product.price * cart[product.id])}</strong><button type="button" data-remove="${product.id}">&#10005;</button></li>`,
        )
        .join('')
    : '<li class="cart-empty">Aun no has añadido nada.</li>'
  cartList.querySelectorAll('[data-remove]').forEach((button) =>
    button.addEventListener('click', () => {
      delete cart[button.dataset.remove]
      localStorage.setItem('canasta-cart', JSON.stringify(cart))
      renderProducts()
      renderCart()
    }),
  )
}

/* =========================
	Paneles y autenticacion
	========================= */
/* Abre o cierra el panel lateral del pedido y su fondo. */
function toggleOrder(open) {
  orderPanel.classList.toggle('open', open)
  orderBackdrop.classList.toggle('open', open)
  orderPanel.setAttribute('aria-hidden', String(!open))
}

/* Abre o cierra el dialogo de acceso y enfoca la contraseña. */
function toggleLogin(open) {
  loginDialog.classList.toggle('open', open)
  loginBackdrop.classList.toggle('open', open)
  loginDialog.setAttribute('aria-hidden', String(!open))
  if (open) $('#adminPassword').focus()
}

/* Abre o cierra el panel administrativo y refresca su lista. */
function toggleAdmin(open) {
  adminPanel.classList.toggle('open', open)
  adminPanel.setAttribute('aria-hidden', String(!open))
  if (open) renderAdminList()
}

/* Muestra mensajes temporales en el panel administrativo. */
function showAdminMessage(message) {
  adminMessage.textContent = message
  window.setTimeout(() => {
    adminMessage.textContent = ''
  }, 3500)
}

/* Eventos globales de navegacion, cierre de paneles y tecla Escape. */
$('#cartToggle').addEventListener('click', () => toggleOrder(true))
$('#closeOrder').addEventListener('click', () => toggleOrder(false))
orderBackdrop.addEventListener('click', () => toggleOrder(false))
$('#adminToggle').addEventListener('click', async () => {
  try {
    const session = await request('/api/session')
    if (session.authenticated) toggleAdmin(true)
    else toggleLogin(true)
  } catch {
    toggleLogin(true)
  }
})
$('#closeAdmin').addEventListener('click', () => toggleAdmin(false))
$('#closeLogin').addEventListener('click', () => toggleLogin(false))
loginBackdrop.addEventListener('click', () => toggleLogin(false))
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    toggleOrder(false)
    toggleLogin(false)
    toggleAdmin(false)
  }
})

/* Envia la contraseña al servidor y abre el inventario si es valida. */
$('#loginForm').addEventListener('submit', async (event) => {
  event.preventDefault()
  const form = event.currentTarget
  $('#loginError').textContent = ''
  try {
    await request('/api/login', {
      method: 'POST',
      body: JSON.stringify({ password: new FormData(form).get('password') }),
    })
    form.reset()
    toggleLogin(false)
    toggleAdmin(true)
  } catch (error) {
    $('#loginError').textContent = error.message
  }
})

/* Cierra la sesion administrativa en el servidor y en la interfaz. */
$('#logoutAdmin').addEventListener('click', async () => {
  await request('/api/logout', { method: 'POST' })
  toggleAdmin(false)
})

/* El mismo formulario cubre alta y edición, pero ambas operaciones se validan en el servidor. */
const productForm = $('#productForm')
/* Convierte el formulario en un producto y decide entre crear o actualizar. */
productForm.addEventListener('submit', async (event) => {
  event.preventDefault()
  const data = new FormData(productForm)
  const product = Object.fromEntries(data.entries())
  product.price = Number(product.price)
  product.stock = Number(product.stock)
  try {
    await request(
      editingId ? `/api/admin/products/${editingId}` : '/api/admin/products',
      { method: editingId ? 'PUT' : 'POST', body: JSON.stringify(product) },
    )
    const wasEditing = Boolean(editingId)
    resetProductForm()
    await loadInventory()
    showAdminMessage(wasEditing ? 'Producto actualizado.' : 'Producto añadido.')
  } catch (error) {
    showAdminMessage(error.message)
  }
})

/* Restablece el formulario al modo de alta. */
function resetProductForm() {
  editingId = null
  productForm.reset()
  $('#productId').value = ''
  $('#productUnit').value = 'libra'
  $('#saveProduct').textContent = 'Añadir producto'
  $('#cancelEdit').hidden = true
}

/* Carga los datos del producto elegido en el formulario de edicion. */
function editProduct(id) {
  const product = inventory.find((item) => item.id === id)
  if (!product) return
  editingId = id
  Object.entries({
    productId: product.id,
    productName: product.name,
    productCategory: product.category,
    productUnit: product.unit,
    productPrice: product.price,
    productStock: product.stock,
    productImage: product.image,
    productDescription: product.description,
  }).forEach(([field, value]) => {
    $(`#${field}`).value = value
  })
  $('#saveProduct').textContent = 'Guardar cambios'
  $('#cancelEdit').hidden = false
  $('#productName').focus()
}
$('#cancelEdit').addEventListener('click', resetProductForm)
const inventoryList = $('#inventoryList')
inventoryList.addEventListener('click', (event) => {
  const editButton = event.target.closest('[data-edit]')
  const deleteButton = event.target.closest('[data-delete]')
  if (editButton) editProduct(editButton.dataset.edit)
  if (deleteButton) removeProduct(deleteButton.dataset.delete)
})

/* Confirma y elimina un producto del servidor y del carrito local. */
async function removeProduct(id) {
  const product = inventory.find((item) => item.id === id)
  if (!product || !window.confirm(`¿Quitar ${product.name} del inventario?`))
    return
  try {
    await request(`/api/admin/products/${id}`, { method: 'DELETE' })
    delete cart[id]
    localStorage.setItem('canasta-cart', JSON.stringify(cart))
    await loadInventory()
    showAdminMessage('Producto eliminado.')
  } catch (error) {
    showAdminMessage(error.message)
  }
}

/* Dibuja la lista administrativa para editar o eliminar productos. */
function renderAdminList() {
  inventoryList.innerHTML = inventory
    .map(
      (product) =>
        `<article class="inventory-row"><div>${product.image ? `<img src="${product.image}" alt="">` : `<span class="inventory-icon">${product.icon}</span>`}<div><strong>${product.name}</strong><span>${product.category} · ${money(product.price)} / ${product.unit} · ${product.stock} en stock</span></div></div><div><button class="secondary-button" type="button" data-edit="${product.id}">Editar</button><button class="danger-button" type="button" data-delete="${product.id}">Quitar</button></div></article>`,
    )
    .join('')
}

/* Centraliza el refresco de las vistas dependientes del inventario. */
function renderAll() {
  renderTabs()
  renderProducts()
  renderCart()
  renderAdminList()
}

/* Valida el pedido y prepara el mensaje para WhatsApp. */
$('#orderForm').addEventListener('submit', (event) => {
  event.preventDefault()
  const items = inventory.filter((product) => cart[product.id] > 0)
  if (!items.length) return
  const data = new FormData(event.currentTarget)
  const total = items.reduce(
    (sum, product) => sum + product.price * cart[product.id],
    0,
  )
  const lines = items.map(
    (product) =>
      `${product.name} x${cart[product.id]} ${product.unit} - ${money(product.price * cart[product.id])}`,
  )
  const message = [
    'Nuevo pedido - Canasta Fresca',
    '',
    ...lines,
    '',
    `Total: ${money(total)}`,
    `Cliente: ${data.get('clienteNombre')}`,
    `Direccion: ${data.get('clienteDireccion')}`,
    'Entrega: plazo maximo de 2 dias',
    `Forma de pago: ${data.get('clientePago')}`,
    `Notas: ${data.get('clienteNotas') || 'Ninguna'}`,
  ].join('\n')
  window.open(
    `https://wa.me/593987322188?text=${encodeURIComponent(message)}`,
    '_blank',
  )
})

/* Punto de entrada: carga el inventario y muestra un error si la API no responde. */
loadInventory().catch(() => {
  productGrid.innerHTML =
    '<p class="inventory-error">No se pudo cargar el inventario. Inicia el servidor de Canasta Fresca.</p>'
})
