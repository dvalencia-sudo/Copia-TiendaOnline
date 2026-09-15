import { createServer } from 'node:http'
import { readFile, writeFile } from 'node:fs/promises'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

/* Configuracion y estado general del servidor. */
const root = fileURLToPath(new URL('.', import.meta.url))
const inventoryPath = join(root, 'basic_baseData', 'inventario.json')
const port = Number(process.env.PORT || 8080)
const sessions = new Map()
const failedLogins = new Map()
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jfif': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
}

/* Obtiene las contrasenas administrativas configuradas en el entorno. */
function configuredPasswords() {
  return [process.env.ADMIN_PASSWORD_1, process.env.ADMIN_PASSWORD_2].filter(
    Boolean,
  )
}
/* Compara hashes de igual longitud para evitar comparaciones directas de contrasenas. */
function safeMatch(value, expected) {
  const left = createHash('sha256').update(value).digest()
  const right = createHash('sha256').update(expected).digest()
  return timingSafeEqual(left, right)
}
/* Busca una cookie concreta dentro de la cabecera de la solicitud. */
function cookieValue(request, name) {
  return request.headers.cookie
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1)
}
/* Comprueba que la sesion exista y que no haya expirado. */
function isAdmin(request) {
  const token = cookieValue(request, 'admin_session')
  const expires = sessions.get(token)
  if (!token || !expires || expires < Date.now()) {
    sessions.delete(token)
    return false
  }
  return true
}
/* Serializa respuestas JSON y aplica cabeceras comunes. */
function send(response, status, body, headers = {}) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  })
  response.end(body === null ? '' : JSON.stringify(body))
}
/* Lee el cuerpo JSON de una solicitud y limita su tamano. */
function readBody(request) {
  return new Promise((resolve, reject) => {
    let raw = ''
    request.on('data', (chunk) => {
      raw += chunk
      if (raw.length > 1000000) request.destroy()
    })
    request.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {})
      } catch {
        reject(new Error('JSON invalido'))
      }
    })
    request.on('error', reject)
  })
}
/* Lee y guarda el inventario persistido en el archivo JSON. */
async function readInventory() {
  return JSON.parse(await readFile(inventoryPath, 'utf8'))
}
async function saveInventory(products) {
  await writeFile(
    inventoryPath,
    `${JSON.stringify(products, null, 2)}\n`,
    'utf8',
  )
}
/* Normaliza los campos recibidos y asigna un id si el producto es nuevo. */
function normalizeProduct(
  input,
  id = input.id || randomBytes(12).toString('hex'),
) {
  return {
    id,
    name: String(input.name || '').trim(),
    category: String(input.category || '').trim(),
    unit: String(input.unit || '').trim(),
    price: Number(input.price),
    stock: Number(input.stock),
    icon: String(input.icon || '🛒').trim(),
    description: String(input.description || '').trim(),
    image: String(input.image || '').trim(),
  }
}
/* Valida campos obligatorios y rangos numericos antes de guardar. */
function validateProduct(product) {
  if (!product.name || !product.category || !product.unit)
    return 'Nombre, categoria y unidad son obligatorios.'
  if (!Number.isFinite(product.price) || product.price < 0)
    return 'El precio no es valido.'
  if (!Number.isInteger(product.stock) || product.stock < 0)
    return 'El stock debe ser un entero no negativo.'
  return null
}

/* Sirve la interfaz y los recursos publicos sin permitir salir del proyecto. */
async function serveStatic(request, response) {
  const requested =
    request.url === '/'
      ? '/index.html'
      : new URL(request.url, 'http://localhost').pathname
  const filePath = normalize(join(root, requested))
  if (!filePath.startsWith(root)) return response.end('Ruta no valida')
  try {
    const content = await readFile(filePath)
    response.writeHead(200, {
      'Content-Type':
        mimeTypes[extname(filePath)] || 'application/octet-stream',
    })
    response.end(content)
  } catch {
    response.writeHead(404)
    response.end('No encontrado')
  }
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`)
    /* Catalogo publico: solo permite consultar el inventario. */
    if (request.method === 'GET' && url.pathname === '/api/products')
      return send(response, 200, await readInventory())
    /* Inicio de sesion: limita intentos fallidos y crea una cookie HttpOnly. */
    if (request.method === 'POST' && url.pathname === '/api/login') {
      const { password } = await readBody(request)
      const address = request.socket.remoteAddress || 'unknown'
      const attempts = failedLogins.get(address)
      if (attempts && attempts.until > Date.now())
        return send(response, 429, {
          error: 'Demasiados intentos. Espera un minuto.',
        })
      const valid = configuredPasswords().some((configured) =>
        safeMatch(String(password || ''), configured),
      )
      if (!valid) {
        const next =
          attempts && attempts.until > Date.now() ? attempts.count + 1 : 1
        failedLogins.set(address, {
          count: next,
          until: next >= 5 ? Date.now() + 60000 : Date.now() + 60000,
        })
        return send(response, 401, { error: 'Clave incorrecta.' })
      }
      failedLogins.delete(address)
      const token = randomBytes(32).toString('hex')
      sessions.set(token, Date.now() + 8 * 60 * 60 * 1000)
      const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
      return send(
        response,
        200,
        { authenticated: true },
        {
          'Set-Cookie': `admin_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${secure}`,
        },
      )
    }
    /* Cierre de sesion y consulta del estado de autenticacion. */
    if (request.method === 'POST' && url.pathname === '/api/logout') {
      sessions.delete(cookieValue(request, 'admin_session'))
      return send(
        response,
        200,
        { authenticated: false },
        {
          'Set-Cookie':
            'admin_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0',
        },
      )
    }
    if (request.method === 'GET' && url.pathname === '/api/session')
      return send(response, 200, { authenticated: isAdmin(request) })
    /* Las rutas administrativas requieren una sesion valida. */
    if (url.pathname.startsWith('/api/admin/') && !isAdmin(request))
      return send(response, 401, { error: 'Necesitas iniciar sesion.' })
    /* Alta de productos despues de normalizar y validar los datos. */
    if (request.method === 'POST' && url.pathname === '/api/admin/products') {
      const body = normalizeProduct(await readBody(request))
      const error = validateProduct(body)
      if (error) return send(response, 400, { error })
      const products = await readInventory()
      products.push(body)
      await saveInventory(products)
      return send(response, 201, body)
    }
    if (url.pathname.startsWith('/api/admin/products/')) {
      const id = url.pathname.split('/').pop()
      const products = await readInventory()
      const index = products.findIndex((product) => product.id === id)
      if (index < 0)
        return send(response, 404, { error: 'Producto no encontrado.' })
      /* Edicion o eliminacion del producto identificado en la URL. */
      if (request.method === 'PUT') {
        const body = normalizeProduct(await readBody(request), id)
        const error = validateProduct(body)
        if (error) return send(response, 400, { error })
        products[index] = body
        await saveInventory(products)
        return send(response, 200, body)
      }
      if (request.method === 'DELETE') {
        products.splice(index, 1)
        await saveInventory(products)
        return send(response, 204, null)
      }
    }
    /* Las solicitudes GET restantes corresponden a archivos de la interfaz. */
    if (request.method === 'GET') return serveStatic(request, response)
    return send(response, 404, { error: 'Ruta no encontrada.' })
  } catch (error) {
    console.error(error)
    send(response, 500, { error: 'Error interno del servidor.' })
  }
})

server.listen(port, () =>
  console.log(`Canasta Fresca disponible en http://localhost:${port}`),
)
