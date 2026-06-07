# Documentación del Panel de Administración (Web-MVP)

Esta documentación describe la arquitectura, la estructura del panel de administración integrado y el plan técnico para migrar los datos mock actuales a datos reales listos para producción.

---

## 1. Arquitectura del Panel

El panel administrativo es una aplicación web clásica integrada en la estructura de frontend existente:

```
Web-MVP/
├── admin/                  # Interfaz del administrador
│   ├── index.html          # Login y Resumen (Métricas)
│   ├── tablero.html        # Tablero JIRA (Kanban Drag & Drop)
│   ├── listados.html       # Listado de Comercios, Agrocomercios, etc.
│   ├── admin-style.css     # Estilos premium (modo oscuro)
│   └── *.js                # Lógica del frontend del panel
└── backend/                # Servidor API REST
    ├── src/
    │   ├── db.js           # Inicialización de SQLite y semillas
    │   └── server.js       # Endpoints Express y lógica de negocio
    └── database.sqlite     # Archivo físico de la base de datos
```

---

## 2. Datos Mock Existentes y su Estado Actual

Actualmente, el proyecto está diseñado como un **MVP (Producto Mínimo Viable)** y utiliza datos simulados o lógicas simplificadas para agilizar las pruebas:

| Módulo / Dato Mock | Estado Actual en el Código | Limitación del MVP |
| :--- | :--- | :--- |
| **Credenciales de Admin** | Almacenadas en texto plano en la tabla `usuarios_cuentas` y sincronizadas desde el archivo `.env`. | No es seguro para producción; las contraseñas deben estar encriptadas. |
| **Métricas Financieras** | Se calculan sumando el valor estimado de los planes contratados por comercios en estado `'activo'`. | No refleja ingresos reales pagados, sino una facturación potencial/teórica. |
| **Suscripción y Pago** | Genera una preferencia en Mercado Pago Checkout Pro (`crearPreferenciaMercadoPago`) y redirige al usuario. | No hay un canal de retorno automático que confirme que el pago se acreditó. |
| **Activación de Licencias** | Cuando el administrador edita un comercio y cambia su estado a `'activo'` de forma manual, se genera o reactiva su clave de licencia. | Es un proceso manual que requiere intervención del administrador. |
| **Base de Datos** | **SQLite** (`database.sqlite` como archivo local). | No está optimizado para múltiples escrituras simultáneas en servidores en la nube. |

---

## 3. Plan de Migración: De Datos Mock a Producción (Paso a Paso)

Para convertir este MVP en un sistema automatizado de producción, se deben realizar las siguientes tareas técnicas:

### Paso 1: Autenticación Segura (Contraseñas y Sesiones)
*   **Qué se necesita**: Instalar `bcryptjs` para encriptación y `jsonwebtoken` (JWT) para sesiones seguras.
*   **Cambio en backend**:
    *   Al registrar o sembrar usuarios, hashear la contraseña:
        ```javascript
        const hash = await bcrypt.hash(passwordInput, 10);
        ```
    *   En el endpoint `POST /api/auth/login`, validar con `bcrypt.compare` y firmar un token JWT con fecha de expiración, en lugar de retornar el email del usuario como token.

### Paso 2: Integración de Webhooks de Mercado Pago (Automatización del Pago)
*   **Qué se necesita**: Un endpoint público (`POST /api/webhooks/mercadopago`) configurado en el panel de desarrolladores de Mercado Pago.
*   **Flujo de Producción**:
```mermaid
sequenceDiagram
    Cliente->>Frontend: Confirma Formulario Suscripción
    Frontend->>API: POST /api/subscriptions
    API->>Mercado Pago API: Crear Preferencia de Pago
    Mercado Pago API-->>API: Retorna link de pago (init_point)
    API-->>Frontend: Retorna link de pago
    Frontend->>Mercado Pago: Redirección al checkout
    Cliente->>Mercado Pago: Paga exitosamente
    Mercado Pago->>API (Webhook): Notificación de Pago Aprobado (IPN)
    API->>Base de Datos: Cambia estado a 'activo' y genera Licencia
    API->>Cliente: Envía email automático con su clave de licencia
```

*   **Implementación del Webhook**:
    ```javascript
    app.post('/api/webhooks/mercadopago', async (req, res) => {
        const { topic, id } = req.query; // MP envía el ID del recurso de pago
        if (topic === 'payment') {
            const paymentDetails = await obtenerDetallesPagoMercadoPago(id);
            if (paymentDetails.status === 'approved') {
                const commerceId = paymentDetails.external_reference; // ID enviado al crear preferencia
                
                // 1. Activar el comercio en la Base de Datos
                await dbRun("UPDATE comercios SET estado = 'activo' WHERE id = ?", [commerceId]);
                
                // 2. Generar y asociar Licencia
                const clave = generarClaveLicencia();
                await crearLicenciaActiva(commerceId, clave);
                
                // 3. (Opcional) Notificar al cliente por email o marcar tarea JIRA como completada
            }
        }
        res.sendStatus(200); // Responder 200 inmediatamente a Mercado Pago
    });
    ```

### Paso 3: Base de Datos Productiva (PostgreSQL)
*   **Qué se necesita**: Un servidor de base de datos relacional robusto (como **PostgreSQL** alojado en Render, Supabase o AWS).
*   **Cambio en backend**:
    *   Reemplazar la librería `sqlite3` por `pg` (o un ORM como Prisma / Sequelize).
    *   Migrar las consultas SQL para que sean compatibles con PostgreSQL (principalmente cambiar `AUTOINCREMENT` por `SERIAL` o usar UUID nativos).

### Paso 4: Despliegue en la Nube
*   **Qué se necesita**: Una cuenta en Render.com, Railway o Fly.io.
*   **Configuración**:
    *   Subir el código a un repositorio Git (ya hecho).
    *   Vincular el servicio en la nube y configurar las variables de entorno de producción en el panel de control del proveedor:
        *   `PORT=8080`
        *   `DATABASE_URL=postgresql://user:pass@host:port/dbname`
        *   `MP_ACCESS_TOKEN` (Tu token de producción de Mercado Pago)
        *   `LICENSE_SECRET` (Llave para firmar criptográficamente las licencias)
        *   `ADMIN_USER` y `ADMIN_PASS` (Tus nuevas credenciales reales)
