# Canasta Fresca Basic

## Ejecutar localmente

La tienda debe ejecutarse mediante `server.mjs`; abrir `index.html` directamente no activa la API ni el control de acceso.

En PowerShell, desde `Tienda-online-basic`, define las claves solo en la sesión actual de la terminal:

```powershell
$env:ADMIN_PASSWORD_1 = 'tu-primera-clave'
$env:ADMIN_PASSWORD_2 = 'tu-segunda-clave'
$env:NODE_ENV = 'development'
$env:PORT = '8080'
npm start
```

Después abre `http://localhost:8080`. Si cierras esa terminal, tendrás que volver a definir las variables.

Para producción, crea las variables `ADMIN_PASSWORD_1`, `ADMIN_PASSWORD_2`, `NODE_ENV=production` y `PORT` en el apartado **Environment variables / Secrets** de tu proveedor de hosting. No las pongas en el repositorio ni en el panel público de la aplicación. El proveedor debe soportar Node.js, procesos persistentes y almacenamiento de archivos persistente, porque el inventario se guarda en `basic_baseData/inventario.json`.

Las claves no están guardadas en este proyecto. No las escribas en HTML, JavaScript, JSON, `.env` versionado ni capturas de pantalla. En producción, usa las variables secretas del proveedor de hosting.

El catálogo público se lee desde `basic_baseData/inventario.json`. Las operaciones de administración requieren una sesión `HttpOnly` y se validan de nuevo en el servidor. Las imágenes de presentación viven en `basic_baseData/img/`.
