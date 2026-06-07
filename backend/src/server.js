const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
require('dotenv').config();
const { initDb, dbAll, dbRun, dbGet } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', '..')));

// Helper to generate a 16-character alphanumeric license key (VMAX-XXXX-XXXX-XXXX)
function generarClaveLicencia() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let key = 'VMAX-';
  for (let i = 0; i < 12; i++) {
    if (i > 0 && i % 4 === 0) key += '-';
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return key;
}

// Middleware for checking Admin authorization
const requireAdmin = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Acceso no autorizado. Se requiere token.' });
  }

  const token = authHeader.split(' ')[1];
  if (token === 'admin-session-token') {
    return next();
  }

  // Double check in database users (for custom user logins)
  try {
    const user = await dbGet('SELECT * FROM usuarios_cuentas WHERE email = ?', [token]);
    if (user && user.rol === 'admin') {
      return next();
    }
  } catch (err) {
    // Ignore and reject
  }

  return res.status(403).json({ error: 'Permisos insuficientes.' });
};

// Helper to create Mercado Pago Checkout Pro Preference
async function crearPreferenciaMercadoPago(plan, precio, negocio, commerceId) {
  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) {
    console.log("No MP Access Token configured, skipping preference creation.");
    return null;
  }

  const planTitles = {
    'freemium': 'VendeMax - Alta Plan Freemium (15 Días)',
    'premium-mensual': 'VendeMax - Suscripción Premium Mensual',
    'premium-anual': 'VendeMax - Suscripción Premium Anual',
    'vip': 'VendeMax - Suscripción Anual VIP'
  };

  const title = planTitles[plan] || `VendeMax - Plan ${plan.toUpperCase()}`;

  try {
    const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        items: [
          {
            title: title,
            quantity: 1,
            unit_price: parseFloat(precio),
            currency_id: 'ARS'
          }
        ],
        back_urls: {
          success: 'https://comerciantes.com.ar/vendemax.html?status=success',
          failure: 'https://comerciantes.com.ar/vendemax.html?status=failure',
          pending: 'https://comerciantes.com.ar/vendemax.html?status=pending'
        },
        auto_return: 'approved',
        external_reference: commerceId.toString()
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Mercado Pago API error details:', errorText);
      return null;
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error creating Mercado Pago preference:', error);
    return null;
  }
}

// ----------------------------------------------------
// PUBLIC ENDPOINTS
// ----------------------------------------------------

// POST /api/subscriptions - Register new commerce
app.post('/api/subscriptions', async (req, res) => {
  try {
    const {
      plan,
      businessName,
      category, // category slug
      phone,
      address,
      description,
      ownerName,
      email,
      dni,
      whatsapp,
      instagram
    } = req.body;

    if (!businessName || !phone || !address || !ownerName || !email || !dni || !plan) {
      return res.status(400).json({ error: 'Faltan campos obligatorios obligatorios para la suscripción.' });
    }

    // Resolve category_id from category slug
    let categoryId = null;
    if (category) {
      const dbCat = await dbGet('SELECT id FROM categorias WHERE slug = ?', [category.toLowerCase()]);
      if (dbCat) {
        categoryId = dbCat.id;
      }
    }

    // Check if it's an agrocomercio based on slug, business name or description containing agricultural terms
    const agroKeywords = ['agro', 'campo', 'semill', 'cosecha', 'rural', 'fertiliz', 'tractor', 'veterinaria'];
    const isAgroByText = agroKeywords.some(keyword => 
      businessName.toLowerCase().includes(keyword) || 
      (description && description.toLowerCase().includes(keyword))
    );
    const esAgrocomercio = (category === 'agro' || isAgroByText) ? 1 : 0;

    // Insert commerce with 'pendiente' status
    const result = await dbRun(`
      INSERT INTO comercios (
        nombre_negocio, categoria_id, telefono, direccion, descripcion, 
        nombre_titular, email_titular, dni_titular, whatsapp, instagram, 
        plan, estado, es_agrocomercio
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      businessName,
      categoryId,
      phone,
      address,
      description || '',
      ownerName,
      email,
      dni,
      whatsapp || '',
      instagram || '',
      plan,
      'pendiente',
      esAgrocomercio
    ]);

    const commerceId = result.lastID;

    // AUTO-CREATE JIRA TASK for this new registration
    const taskTitle = `Verificar registro de: ${businessName}`;
    const taskDesc = `Nuevo comercio registrado vía formulario de suscripciones.\n` +
      `- Plan: ${plan.toUpperCase()}\n` +
      `- Titular: ${ownerName}\n` +
      `- Email: ${email} | Tel: ${phone}\n` +
      `- Ubicación: ${address}\n` +
      `- Redes: WhatsApp (${whatsapp || 'N/A'}) | Instagram (${instagram || 'N/A'})\n\n` +
      `Acción requerida: Verificar datos, coordinar pago del plan y cambiar estado a Activo.`;

    const priority = plan === 'vip' || plan === 'premium-anual' ? 'alta' : 'media';
    const deadline = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(); // 48 hours to complete

    await dbRun(`
      INSERT INTO tareas_trabajo (
        titulo, descripcion, estado, prioridad, comercio_id, fecha_limite
      ) VALUES (?, ?, ?, ?, ?, ?)
    `, [taskTitle, taskDesc, 'todo', priority, commerceId, deadline]);

    console.log(`New subscription registered: ${businessName} (ID: ${commerceId}), created JIRA verification task.`);

    // Determine price dynamically based on plan
    let precio = 20000;
    if (plan === 'premium-anual') precio = 200000;
    else if (plan === 'vip') precio = 80000;

    // Create Mercado Pago preference
    const preference = await crearPreferenciaMercadoPago(plan, precio, businessName, commerceId);

    res.status(201).json({ 
      success: true, 
      message: 'Suscripción registrada con éxito.',
      commerceId,
      initPoint: preference ? preference.init_point : null
    });

  } catch (error) {
    console.error('Error in POST /api/subscriptions:', error);
    res.status(500).json({ error: 'Error interno del servidor al registrar la suscripción.' });
  }
});

// POST /api/licencia/validar - Verify desktop app license key with HMAC security
app.post('/api/licencia/validar', async (req, res) => {
  const { email, clave, machineFingerprint } = req.body;

  if (!email || !clave) {
    return res.status(400).json({ mensaje: 'Faltan parámetros requeridos (email, clave).' });
  }

  try {
    const lic = await dbGet('SELECT * FROM licencias WHERE email = ? AND clave = ?', [
      email.trim().toLowerCase(), 
      clave.trim().toUpperCase()
    ]);

    if (!lic) {
      return res.status(404).json({ mensaje: 'Licencia no encontrada. Verifique el email y la clave.' });
    }

    if (lic.estado !== 'activo') {
      return res.status(403).json({ mensaje: `La licencia no está activa (estado actual: ${lic.estado}).` });
    }

    // Verificar vencimiento
    const vencimiento = new Date(lic.fecha_vencimiento);
    if (vencimiento < new Date()) {
      return res.status(403).json({ mensaje: 'La licencia ha vencido. Renueve su suscripción.' });
    }

    // Verificar o registrar el machine fingerprint (bloqueo por hardware)
    if (!lic.machine_fingerprint) {
      await dbRun('UPDATE licencias SET machine_fingerprint = ? WHERE id = ?', [machineFingerprint, lic.id]);
      lic.machine_fingerprint = machineFingerprint;
    } else if (lic.machine_fingerprint !== machineFingerprint) {
      return res.status(403).json({ mensaje: 'Esta licencia ya está activa en otra computadora.' });
    }

    // Construir el payload JSON para enviar al cliente
    const payloadObj = {
      valido: true,
      email: lic.email,
      clave: lic.clave,
      fechaVencimiento: lic.fecha_vencimiento,
      timestamp: Date.now()
    };

    const payloadStr = JSON.stringify(payloadObj);

    // Calcular la firma digital HMAC-SHA256 para prevenir alteraciones locales
    const sharedSecret = process.env.LICENSE_SECRET || 'hexastrategy_vendemax_secret_key_default';
    const hmac = crypto.createHmac('sha256', sharedSecret);
    hmac.update(payloadStr);
    const signature = hmac.digest('hex');

    res.json({
      payload: payloadStr,
      signature: signature
    });

  } catch (error) {
    console.error('Error al validar licencia:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor al verificar la licencia.' });
  }
});

// ----------------------------------------------------
// ADMIN AUTHENTICATION
// ----------------------------------------------------

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email y contraseña requeridos.' });
  }

  try {
    const user = await dbGet('SELECT * FROM usuarios_cuentas WHERE email = ?', [email]);
    if (!user || user.password !== password) {
      return res.status(401).json({ error: 'Credenciales inválidas.' });
    }

    // Basic token for simplicity in the MVP
    res.json({
      success: true,
      token: user.email, // Use email as session token for easy lookup
      user: {
        id: user.id,
        email: user.email,
        rol: user.rol
      }
    });

  } catch (error) {
    console.error('Error in POST /api/auth/login:', error);
    res.status(500).json({ error: 'Error interno del servidor al autenticar.' });
  }
});

// ----------------------------------------------------
// ADMIN PROTECTED ENDPOINTS
// ----------------------------------------------------

// GET /api/admin/stats - Overview metrics
app.get('/api/admin/stats', requireAdmin, async (req, res) => {
  try {
    const totalComercios = await dbGet('SELECT COUNT(*) as count FROM comercios');
    const totalAgrocomercios = await dbGet('SELECT COUNT(*) as count FROM comercios WHERE es_agrocomercio = 1');
    const pendingComercios = await dbGet("SELECT COUNT(*) as count FROM comercios WHERE estado = 'pendiente'");
    const activeComercios = await dbGet("SELECT COUNT(*) as count FROM comercios WHERE estado = 'activo'");
    const totalCuentas = await dbGet('SELECT COUNT(*) as count FROM usuarios_cuentas');
    
    // Revenue estimates (Sum monthly rates and one-off fees)
    // Premium Monthly: $20.000 / month, VIP/Premium Annual: full price
    const activeMerchants = await dbAll("SELECT plan FROM comercios WHERE estado = 'activo'");
    let monthlyRevenue = 0;
    let totalSalesValue = 0;
    activeMerchants.forEach(m => {
      if (m.plan === 'premium-mensual') {
        monthlyRevenue += 20000;
        totalSalesValue += 20000;
      } else if (m.plan === 'premium-anual') {
        totalSalesValue += 200000;
      } else if (m.plan === 'vip') {
        totalSalesValue += 80000;
      } else if (m.plan === 'freemium') {
        totalSalesValue += 20000;
      }
    });

    const tasksTodo = await dbGet("SELECT COUNT(*) as count FROM tareas_trabajo WHERE estado = 'todo'");
    const tasksInProgress = await dbGet("SELECT COUNT(*) as count FROM tareas_trabajo WHERE estado = 'in_progress'");

    res.json({
      totalComercios: totalComercios.count,
      totalAgrocomercios: totalAgrocomercios.count,
      pendingComercios: pendingComercios.count,
      activeComercios: activeComercios.count,
      totalCuentas: totalCuentas.count,
      monthlyRevenue,
      totalSalesValue,
      tasksPending: tasksTodo.count + tasksInProgress.count
    });
  } catch (error) {
    console.error('Error in GET /api/admin/stats:', error);
    res.status(500).json({ error: 'Error al obtener métricas.' });
  }
});

// GET /api/admin/cuentas
app.get('/api/admin/cuentas', requireAdmin, async (req, res) => {
  try {
    const rows = await dbAll('SELECT id, email, rol, fecha_creacion FROM usuarios_cuentas ORDER BY fecha_creacion DESC');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener cuentas.' });
  }
});

// GET /api/admin/comercios
app.get('/api/admin/comercios', requireAdmin, async (req, res) => {
  try {
    // Include category name and active license key in the output
    const rows = await dbAll(`
      SELECT c.*, cat.nombre as categoria_nombre, l.clave as licencia_clave, l.estado as licencia_estado, l.fecha_vencimiento as licencia_vencimiento
      FROM comercios c
      LEFT JOIN categorias cat ON c.categoria_id = cat.id
      LEFT JOIN licencias l ON c.id = l.comercio_id
      ORDER BY c.fecha_registro DESC
    `);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener comercios.' });
  }
});

// GET /api/admin/agrocomercios
app.get('/api/admin/agrocomercios', requireAdmin, async (req, res) => {
  try {
    const rows = await dbAll(`
      SELECT c.*, cat.nombre as categoria_nombre, l.clave as licencia_clave, l.estado as licencia_estado, l.fecha_vencimiento as licencia_vencimiento
      FROM comercios c
      LEFT JOIN categorias cat ON c.categoria_id = cat.id
      LEFT JOIN licencias l ON c.id = l.comercio_id
      WHERE c.es_agrocomercio = 1
      ORDER BY c.fecha_registro DESC
    `);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener agrocomercios.' });
  }
});

// PUT /api/admin/comercios/:id
app.put('/api/admin/comercios/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { nombre_negocio, telefono, direccion, descripcion, plan, estado, es_agrocomercio } = req.body;

  try {
    // Check if commerce exists
    const commerce = await dbGet('SELECT * FROM comercios WHERE id = ?', [id]);
    if (!commerce) {
      return res.status(404).json({ error: 'Comercio no encontrado.' });
    }

    await dbRun(`
      UPDATE comercios 
      SET nombre_negocio = ?, telefono = ?, direccion = ?, descripcion = ?, plan = ?, estado = ?, es_agrocomercio = ?
      WHERE id = ?
    `, [
      nombre_negocio || commerce.nombre_negocio,
      telefono || commerce.telefono,
      direccion || commerce.direccion,
      descripcion !== undefined ? descripcion : commerce.descripcion,
      plan || commerce.plan,
      estado || commerce.estado,
      es_agrocomercio !== undefined ? es_agrocomercio : commerce.es_agrocomercio,
      id
    ]);

    // Lógica inteligente de licencias: generar o reactivar al pasar a 'activo'
    const finalEstado = estado || commerce.estado;
    if (finalEstado === 'activo') {
      const existingLicense = await dbGet('SELECT * FROM licencias WHERE comercio_id = ?', [id]);
      
      let dias = 30;
      const planFinal = plan || commerce.plan;
      if (planFinal === 'premium-anual') dias = 365;
      else if (planFinal === 'vip') dias = 3650;
      else if (planFinal === 'freemium') dias = 15;
      
      const fechaVencimiento = new Date();
      fechaVencimiento.setDate(fechaVencimiento.getDate() + dias);
      const fechaVencimientoStr = fechaVencimiento.toISOString().replace('T', ' ').substring(0, 19);

      if (!existingLicense) {
        const clave = generarClaveLicencia();
        await dbRun(`
          INSERT INTO licencias (comercio_id, email, clave, estado, fecha_vencimiento)
          VALUES (?, ?, ?, ?, ?)
        `, [id, commerce.email_titular, clave, 'activo', fechaVencimientoStr]);
        console.log(`Generated new license for ${commerce.email_titular}: ${clave}`);
      } else {
        // Reactivar y extender vencimiento si cambió de plan/estado
        await dbRun(`
          UPDATE licencias 
          SET fecha_vencimiento = ?, estado = 'activo'
          WHERE id = ?
        `, [fechaVencimientoStr, existingLicense.id]);
      }
    } else if (estado && estado !== 'activo' && commerce.estado === 'activo') {
      // Si el comercio pasa a inactivo/suspendido/pendiente, suspendemos la licencia
      await dbRun("UPDATE licencias SET estado = 'suspendido' WHERE comercio_id = ?", [id]);
      console.log(`Suspended license for commerce ID: ${id}`);
    }

    res.json({ success: true, message: 'Comercio y licencia actualizados correctamente.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al actualizar comercio y su licencia.' });
  }
});

// DELETE /api/admin/comercios/:id
app.delete('/api/admin/comercios/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    await dbRun('DELETE FROM comercios WHERE id = ?', [id]);
    res.json({ success: true, message: 'Comercio eliminado con éxito.' });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar comercio.' });
  }
});

// GET /api/admin/categorias
app.get('/api/admin/categorias', requireAdmin, async (req, res) => {
  try {
    const rows = await dbAll('SELECT * FROM categorias ORDER BY nombre ASC');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener categorías.' });
  }
});

// POST /api/admin/categorias
app.post('/api/admin/categorias', requireAdmin, async (req, res) => {
  const { slug, nombre } = req.body;
  if (!slug || !nombre) {
    return res.status(400).json({ error: 'Slug y nombre requeridos.' });
  }

  try {
    await dbRun('INSERT INTO categorias (slug, nombre) VALUES (?, ?)', [slug.toLowerCase(), nombre]);
    res.status(201).json({ success: true, message: 'Categoría creada.' });
  } catch (error) {
    res.status(500).json({ error: 'Error al crear categoría (puede que el slug ya exista).' });
  }
});

// ----------------------------------------------------
// JIRA-STYLE WORK TASKS ENDPOINTS
// ----------------------------------------------------

// GET /api/admin/tareas
app.get('/api/admin/tareas', requireAdmin, async (req, res) => {
  try {
    const rows = await dbAll(`
      SELECT t.*, c.nombre_negocio as comercio_nombre 
      FROM tareas_trabajo t
      LEFT JOIN comercios c ON t.comercio_id = c.id
      ORDER BY t.fecha_creacion DESC
    `);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener tareas.' });
  }
});

// POST /api/admin/tareas
app.post('/api/admin/tareas', requireAdmin, async (req, res) => {
  const { titulo, descripcion, estado, prioridad, comercio_id, fecha_limite } = req.body;
  if (!titulo) {
    return res.status(400).json({ error: 'El título de la tarea es obligatorio.' });
  }

  try {
    await dbRun(`
      INSERT INTO tareas_trabajo (titulo, descripcion, estado, prioridad, comercio_id, fecha_limite)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      titulo,
      descripcion || '',
      estado || 'todo',
      prioridad || 'media',
      comercio_id || null,
      fecha_limite || null
    ]);
    res.status(201).json({ success: true, message: 'Tarea creada correctamente.' });
  } catch (error) {
    res.status(500).json({ error: 'Error al crear la tarea.' });
  }
});

// PUT /api/admin/tareas/:id
app.put('/api/admin/tareas/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { titulo, descripcion, estado, prioridad, fecha_limite } = req.body;

  try {
    const task = await dbGet('SELECT * FROM tareas_trabajo WHERE id = ?', [id]);
    if (!task) {
      return res.status(404).json({ error: 'Tarea no encontrada.' });
    }

    // If task is being moved to 'done' and is associated with a pending commerce,
    // we could auto-activate it, or let the administrator do it manually.
    // For now, update task properties
    await dbRun(`
      UPDATE tareas_trabajo 
      SET titulo = ?, descripcion = ?, estado = ?, prioridad = ?, fecha_limite = ?
      WHERE id = ?
    `, [
      titulo || task.titulo,
      descripcion !== undefined ? descripcion : task.descripcion,
      estado || task.estado,
      prioridad || task.prioridad,
      fecha_limite !== undefined ? fecha_limite : task.fecha_limite,
      id
    ]);

    res.json({ success: true, message: 'Tarea actualizada correctamente.' });
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar la tarea.' });
  }
});

// DELETE /api/admin/tareas/:id
app.delete('/api/admin/tareas/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    await dbRun('DELETE FROM tareas_trabajo WHERE id = ?', [id]);
    res.json({ success: true, message: 'Tarea eliminada con éxito.' });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar la tarea.' });
  }
});


// Start server after database initialization
initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}).catch(err => {
  console.error('Failed to initialize database, server not started:', err);
});
