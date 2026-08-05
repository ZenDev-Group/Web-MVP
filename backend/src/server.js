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

  // El token real es el email del usuario devuelto por /api/auth/login - se valida
  // contra la base de cuentas en cada request, sin ningún bypass hardcodeado.
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

// Helper: crea una preferencia de Mercado Pago Checkout Pro para un plan de la guía.
// El precio SIEMPRE sale de `plan.precio` (la base de datos) — nunca de un valor mandado por el cliente.
async function crearPreferenciaGuia(plan, comercio) {
  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) {
    console.log('No MP Access Token configured, skipping preference creation.');
    return null;
  }

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
            title: `Guía de Comercios - ${plan.nombre}`,
            quantity: 1,
            unit_price: parseFloat(plan.precio),
            currency_id: 'ARS'
          }
        ],
        back_urls: {
          success: 'https://comerciantes.com.ar/suscripciones.html?status=success',
          failure: 'https://comerciantes.com.ar/suscripciones.html?status=failure',
          pending: 'https://comerciantes.com.ar/suscripciones.html?status=pending'
        },
        auto_return: 'approved',
        // Prefijo "guia:" para que el webhook distinga estos avisos de otras integraciones futuras.
        external_reference: `guia:${comercio.id}:${plan.id}`
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Mercado Pago API error details:', errorText);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('Error creating Mercado Pago preference:', error);
    return null;
  }
}

// ----------------------------------------------------
// PUBLIC ENDPOINTS
// ----------------------------------------------------

// GET /api/planes - Catálogo público de planes de suscripción de la guía
app.get('/api/planes', async (req, res) => {
  try {
    const rows = await dbAll('SELECT * FROM planes WHERE activo = 1 ORDER BY prioridad ASC, precio ASC');
    res.json(rows);
  } catch (error) {
    console.error('Error in GET /api/planes:', error);
    res.status(500).json({ error: 'Error al obtener los planes.' });
  }
});

// GET /api/categorias - Catálogo público de rubros (misma tabla que usa el admin)
app.get('/api/categorias', async (req, res) => {
  try {
    const rows = await dbAll('SELECT id, slug, nombre FROM categorias ORDER BY nombre ASC');
    res.json(rows);
  } catch (error) {
    console.error('Error in GET /api/categorias:', error);
    res.status(500).json({ error: 'Error al obtener categorías.' });
  }
});

// GET /api/localidades - Catálogo público de localidades del partido
app.get('/api/localidades', async (req, res) => {
  try {
    const rows = await dbAll('SELECT id, nombre, tipo FROM localidades ORDER BY tipo ASC, nombre ASC');
    res.json(rows);
  } catch (error) {
    console.error('Error in GET /api/localidades:', error);
    res.status(500).json({ error: 'Error al obtener localidades.' });
  }
});

// GET /api/comercios - Listado público de comercios activos (lo consume la web y, a futuro, la app)
// Filtros opcionales: ?categoria=slug  ?localidad=id  ?agro=1|0  ?q=texto
app.get('/api/comercios', async (req, res) => {
  try {
    const { categoria, localidad, agro, q } = req.query;

    let sql = `
      SELECT
        c.id, c.nombre_negocio, c.descripcion, c.telefono, c.direccion,
        c.whatsapp, c.instagram, c.facebook, c.sitio_web,
        c.latitud, c.longitud, c.horarios, c.es_agrocomercio, c.plan,
        cat.slug as categoria_slug, cat.nombre as categoria_nombre,
        loc.id as localidad_id, loc.nombre as localidad_nombre,
        (SELECT url FROM comercio_fotos WHERE comercio_id = c.id AND es_portada = 1 LIMIT 1) as foto_portada
      FROM comercios c
      LEFT JOIN categorias cat ON c.categoria_id = cat.id
      LEFT JOIN localidades loc ON c.localidad_id = loc.id
      WHERE c.estado = 'activo'
    `;
    const params = [];

    if (categoria) {
      sql += ' AND cat.slug = ?';
      params.push(categoria);
    }
    if (localidad) {
      sql += ' AND loc.id = ?';
      params.push(localidad);
    }
    if (agro === '1' || agro === '0') {
      sql += ' AND c.es_agrocomercio = ?';
      params.push(agro === '1' ? 1 : 0);
    }
    if (q) {
      sql += ' AND c.nombre_negocio LIKE ?';
      params.push(`%${q}%`);
    }

    sql += ' ORDER BY c.nombre_negocio ASC';

    const rows = await dbAll(sql, params);
    res.json(rows);
  } catch (error) {
    console.error('Error in GET /api/comercios:', error);
    res.status(500).json({ error: 'Error al obtener los comercios.' });
  }
});

// GET /api/comercios/:id - Detalle público de un comercio activo (ficha)
app.get('/api/comercios/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const comercio = await dbGet(`
      SELECT
        c.id, c.nombre_negocio, c.descripcion, c.telefono, c.direccion,
        c.whatsapp, c.instagram, c.facebook, c.sitio_web,
        c.latitud, c.longitud, c.horarios, c.es_agrocomercio, c.plan,
        cat.slug as categoria_slug, cat.nombre as categoria_nombre,
        loc.id as localidad_id, loc.nombre as localidad_nombre,
        (SELECT url FROM comercio_fotos WHERE comercio_id = c.id AND es_portada = 1 LIMIT 1) as foto_portada
      FROM comercios c
      LEFT JOIN categorias cat ON c.categoria_id = cat.id
      LEFT JOIN localidades loc ON c.localidad_id = loc.id
      WHERE c.id = ? AND c.estado = 'activo'
    `, [id]);

    if (!comercio) {
      return res.status(404).json({ error: 'Comercio no encontrado.' });
    }

    // Plan activo (si tiene una suscripción vigente) - el frontend lo usa para decidir si
    // muestra contacto directo (Sticky CTA Bar) o no, tal como especifica el plan de negocio.
    const planInfo = await dbGet(`
      SELECT p.slug as plan_slug, p.nombre as plan_nombre, p.prioridad, p.con_estadisticas, p.acceso_ficha_completa
      FROM suscripciones s
      JOIN planes p ON s.plan_id = p.id
      WHERE s.comercio_id = ? AND s.estado = 'activa'
      ORDER BY s.fecha_fin DESC
      LIMIT 1
    `, [id]);

    // La ficha completa (single-comercio / single-agro) es un beneficio que se otorga por
    // plan - se controla desde el catálogo de planes en el admin (columna acceso_ficha_completa),
    // no por nombres de slug hardcodeados, para que un plan nuevo también pueda darla.
    const esPremium = !!planInfo && planInfo.acceso_ficha_completa === 1;

    if (!esPremium) {
      return res.json({
        id: comercio.id,
        nombre_negocio: comercio.nombre_negocio,
        categoria_slug: comercio.categoria_slug,
        categoria_nombre: comercio.categoria_nombre,
        localidad_nombre: comercio.localidad_nombre,
        plan_info: planInfo || null,
        acceso_restringido: true,
      });
    }

    const fotos = await dbAll(
      'SELECT url, orden, es_portada FROM comercio_fotos WHERE comercio_id = ? ORDER BY orden ASC',
      [id]
    );

    // Showcase de productos/servicios y testimonios aprobados (sección 3.C/3.D del plan de
    // tarjetas/landing) - solo se arma para comercios con ficha completa, igual que fotos.
    const productos = await dbAll(
      'SELECT id, nombre, descripcion, precio, foto_url, orden FROM comercio_productos WHERE comercio_id = ? ORDER BY orden ASC',
      [id]
    );
    const testimonios = await dbAll(
      'SELECT id, autor_nombre, texto FROM comercio_testimonios WHERE comercio_id = ? AND aprobado = 1 ORDER BY fecha_creacion DESC',
      [id]
    );

    // horarios_json llega como texto crudo - el frontend lo parsea y calcula "Abierto ahora"
    // con la hora local del dispositivo (sección 3.B del plan), el backend no interpreta zona horaria.
    let horariosJson = null;
    try {
      horariosJson = comercio.horarios_json ? JSON.parse(comercio.horarios_json) : null;
    } catch (e) {
      horariosJson = null;
    }

    res.json({
      ...comercio,
      horarios_json: horariosJson,
      fotos,
      productos,
      testimonios,
      plan_info: planInfo,
      acceso_restringido: false
    });
  } catch (error) {
    console.error('Error in GET /api/comercios/:id:', error);
    res.status(500).json({ error: 'Error al obtener el comercio.' });
  }
});

// POST /api/comercios/:id/reclamar - "¿Sos el dueño de este comercio? Reclamá tu perfil"
// (sección 5.1 del plan de tarjetas/landing: el gancho principal para vender Premium a partir
// de una ficha gratuita restringida). Público, no requiere que el comercio ya sea Premium.
app.post('/api/comercios/:id/reclamar', async (req, res) => {
  const { id } = req.params;
  const { nombre, telefono, email, mensaje } = req.body;

  if (!nombre || (!telefono && !email)) {
    return res.status(400).json({ error: 'Nombre y al menos un dato de contacto (teléfono o email) son requeridos.' });
  }

  try {
    const comercio = await dbGet("SELECT id, nombre_negocio FROM comercios WHERE id = ? AND estado = 'activo'", [id]);
    if (!comercio) {
      return res.status(404).json({ error: 'Comercio no encontrado.' });
    }

    const result = await dbRun(`
      INSERT INTO reclamos_perfil (comercio_id, nombre_solicitante, telefono_solicitante, email_solicitante, mensaje, estado)
      VALUES (?, ?, ?, ?, ?, 'pendiente')
    `, [id, nombre, telefono || null, email || null, mensaje || null]);

    // Mismo patrón que el resto del ecosistema (alta de suscripción, webhook de MP): un reclamo
    // de perfil real le crea al equipo de ventas una tarea de seguimiento en el Kanban.
    await dbRun(`
      INSERT INTO tareas_trabajo (titulo, descripcion, estado, prioridad, comercio_id, fecha_limite)
      VALUES (?, ?, 'todo', 'alta', ?, ?)
    `, [
      `Reclamo de perfil: ${comercio.nombre_negocio}`,
      `${nombre} dice ser el dueño de "${comercio.nombre_negocio}" y reclamó su perfil desde la ficha pública.\n` +
        `Contacto: ${telefono || 'sin teléfono'} ${email ? '| ' + email : ''}\n` +
        `Mensaje: ${mensaje || '(sin mensaje)'}\n\n` +
        `Acción: contactar para ofrecer upgrade a Premium (WhatsApp, catálogo, mapa, horarios).`,
      id,
      new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    ]);

    res.status(201).json({ success: true, message: 'Reclamo recibido. El equipo se va a poner en contacto.', reclamoId: result.lastID });
  } catch (error) {
    console.error('Error in POST /api/comercios/:id/reclamar:', error);
    res.status(500).json({ error: 'Error al registrar el reclamo.' });
  }
});

// POST /api/tracking/evento - Registro de búsquedas y clics (sección 5.2 del plan: alimenta el
// Panel de Estadísticas Premium y el reporte de "clics perdidos" para vender Premium a comercios
// gratuitos/destacados). Público, sin autenticación, pensado para no bloquear nunca la UI si falla.
const TIPOS_EVENTO_VALIDOS = [
  'busqueda',
  'click_ver_mas',
  'visita_restringida',
  'visita_ficha',
  'click_whatsapp',
  'click_llamar',
  'click_como_llegar',
  'click_reclamar_perfil'
];

app.post('/api/tracking/evento', async (req, res) => {
  const { comercio_id, tipo, termino_busqueda, origen } = req.body;

  if (!tipo || !TIPOS_EVENTO_VALIDOS.includes(tipo)) {
    return res.status(400).json({ error: 'Tipo de evento inválido.' });
  }

  try {
    await dbRun(`
      INSERT INTO eventos_tracking (comercio_id, tipo, termino_busqueda, origen)
      VALUES (?, ?, ?, ?)
    `, [comercio_id || null, tipo, termino_busqueda || null, origen || null]);
    res.status(201).json({ success: true });
  } catch (error) {
    console.error('Error in POST /api/tracking/evento:', error);
    res.status(500).json({ error: 'Error al registrar el evento.' });
  }
});

// POST /api/subscriptions - Register new directory commerce (Comerciantes)
app.post('/api/subscriptions', async (req, res) => {
  try {
    const {
      plan, // slug real del catálogo `planes` (ej: "gratuito", "destacado-mensual")
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
      return res.status(400).json({ error: 'Faltan campos obligatorios para la suscripción.' });
    }

    // El plan tiene que existir en el catálogo real - nunca se confía en un precio mandado por el cliente
    const planRow = await dbGet('SELECT * FROM planes WHERE slug = ? AND activo = 1', [plan]);
    if (!planRow) {
      return res.status(400).json({ error: 'El plan seleccionado no existe o no está disponible.' });
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
    const taskDesc = `Nuevo comercio registrado vía formulario de suscripciones del directorio.\n` +
      `- Plan: ${plan.toUpperCase()}\n` +
      `- Titular: ${ownerName}\n` +
      `- Email: ${email} | Tel: ${phone}\n` +
      `- Ubicación: ${address}\n` +
      `- Redes: WhatsApp (${whatsapp || 'N/A'}) | Instagram (${instagram || 'N/A'})\n\n` +
      `Acción requerida: Verificar datos, coordinar activación y cambiar estado a Activo.`;

    const priority = 'media';
    const deadline = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(); // 48 hours to complete

    await dbRun(`
      INSERT INTO tareas_trabajo (
        titulo, descripcion, estado, prioridad, comercio_id, fecha_limite
      ) VALUES (?, ?, ?, ?, ?, ?)
    `, [taskTitle, taskDesc, 'todo', priority, commerceId, deadline]);

    console.log(`New directory subscription registered: ${businessName} (ID: ${commerceId}), created JIRA verification task.`);

    // Si el plan es pago, se genera el link de Mercado Pago; si es gratuito, no hace falta cobrar nada.
    let initPoint = null;
    if (planRow.precio > 0) {
      const preference = await crearPreferenciaGuia(planRow, { id: commerceId });
      initPoint = preference ? preference.init_point : null;
    }

    res.status(201).json({
      success: true,
      message: 'Suscripción de comercio registrada con éxito.',
      commerceId,
      initPoint
    });

  } catch (error) {
    console.error('Error in POST /api/subscriptions:', error);
    res.status(500).json({ error: 'Error interno del servidor al registrar la suscripción.' });
  }
});

// Activa (o renueva) la suscripción de un comercio a un plan de la guía.
// La misma lógica que usa POST /api/admin/suscripciones para el alta manual -
// el webhook de Mercado Pago la reutiliza para el alta automática.
async function activarSuscripcionGuia(comercioId, planRow, { monto, metodo, mpPaymentId, fechaInicio }) {
  await dbRun("UPDATE suscripciones SET estado = 'cancelada' WHERE comercio_id = ? AND estado = 'activa'", [comercioId]);

  const inicio = fechaInicio ? new Date(fechaInicio) : new Date();
  const fin = new Date(inicio);
  if (planRow.periodicidad === 'anual') {
    fin.setFullYear(fin.getFullYear() + 1);
  } else {
    fin.setMonth(fin.getMonth() + 1);
  }

  const inicioStr = inicio.toISOString().replace('T', ' ').substring(0, 19);
  const finStr = fin.toISOString().replace('T', ' ').substring(0, 19);

  await dbRun(`
    INSERT INTO suscripciones (comercio_id, plan_id, fecha_inicio, fecha_fin, estado, monto, metodo, mp_payment_id)
    VALUES (?, ?, ?, ?, 'activa', ?, ?, ?)
  `, [comercioId, planRow.id, inicioStr, finStr, monto, metodo, mpPaymentId || null]);

  await dbRun("UPDATE comercios SET estado = 'activo', plan = ? WHERE id = ?", [planRow.slug, comercioId]);

  await dbRun(`
    INSERT INTO tareas_trabajo (titulo, descripcion, estado, prioridad, comercio_id, fecha_limite)
    VALUES (?, ?, 'todo', 'media', ?, ?)
  `, [
    `Moderar contenido de comercio recién pagado (ID ${comercioId})`,
    `El pago se confirmó automáticamente vía Mercado Pago y el comercio ya está activo y visible.\nRevisar fotos/descripción en las próximas 24-48hs.`,
    comercioId,
    new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
  ]);
}

// POST /api/webhooks/mercadopago - Confirmación automática de pago para suscripciones de la guía.
// Nunca se confía en el cuerpo del aviso: siempre se re-consulta el pago real contra la API de Mercado Pago.
app.post('/api/webhooks/mercadopago', async (req, res) => {
  const topic = req.query.topic || req.query.type;
  const paymentId = req.query.id || req.query['data.id'] || (req.body && req.body.data && req.body.data.id);

  // Loguear el aviso crudo de inmediato, antes de cualquier otra cosa, para no perder nada.
  const logResult = await dbRun(
    'INSERT INTO webhooks_log (tipo, mp_id, payload, procesado) VALUES (?, ?, ?, 0)',
    [topic || 'desconocido', paymentId ? paymentId.toString() : null, JSON.stringify({ query: req.query, body: req.body })]
  );

  // Siempre respondemos 200 rápido, incluso si no hay nada que procesar - así Mercado Pago no reintenta sin sentido.
  res.sendStatus(200);

  try {
    if (topic !== 'payment' || !paymentId) return;

    const token = process.env.MP_ACCESS_TOKEN;
    if (!token) {
      console.log('Webhook recibido pero no hay MP_ACCESS_TOKEN configurado, no se puede verificar el pago.');
      return;
    }

    // Fuente de verdad: la API de Mercado Pago, nunca el body del aviso.
    const paymentRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!paymentRes.ok) {
      console.error(`No se pudo verificar el pago ${paymentId} contra la API de Mercado Pago (status ${paymentRes.status}).`);
      return;
    }

    const payment = await paymentRes.json();
    const externalReference = payment.external_reference || '';

    if (!externalReference.startsWith('guia:')) {
      // No es un pago de la guía (podría ser de otra integración futura) - no hacemos nada.
      return;
    }

    if (payment.status !== 'approved') {
      console.log(`Pago ${paymentId} con estado '${payment.status}', todavía no se activa nada.`);
      return;
    }

    // Idempotencia: si ya procesamos este pago, no lo duplicamos.
    const yaExiste = await dbGet('SELECT id FROM suscripciones WHERE mp_payment_id = ?', [paymentId.toString()]);
    if (yaExiste) {
      console.log(`Pago ${paymentId} ya había sido procesado, se ignora el aviso duplicado.`);
      await dbRun('UPDATE webhooks_log SET procesado = 1 WHERE id = ?', [logResult.lastID]);
      return;
    }

    const [, comercioIdStr, planIdStr] = externalReference.split(':');
    const comercio = await dbGet('SELECT * FROM comercios WHERE id = ?', [comercioIdStr]);
    const planRow = await dbGet('SELECT * FROM planes WHERE id = ?', [planIdStr]);

    if (!comercio || !planRow) {
      console.error(`Webhook: no se encontró el comercio ${comercioIdStr} o el plan ${planIdStr} de la referencia ${externalReference}.`);
      return;
    }

    await activarSuscripcionGuia(comercio.id, planRow, {
      monto: payment.transaction_amount,
      metodo: 'mercado_pago',
      mpPaymentId: paymentId.toString()
    });

    console.log(`Suscripción activada automáticamente por Mercado Pago: comercio ${comercio.id}, plan ${planRow.slug}.`);
    await dbRun('UPDATE webhooks_log SET procesado = 1 WHERE id = ?', [logResult.lastID]);

  } catch (error) {
    console.error('Error procesando webhook de Mercado Pago:', error);
  }
});

// Reuseable function to validate license against the separated vendemax_licencias table
const validateVendeMaxLicenseHandler = async (req, res) => {
  const { email, clave, machineFingerprint } = req.body;

  if (!email || !clave) {
    return res.status(400).json({ mensaje: 'Faltan parámetros requeridos (email, clave).' });
  }

  try {
    const lic = await dbGet('SELECT * FROM vendemax_licencias WHERE email = ? AND clave = ?', [
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
      await dbRun('UPDATE vendemax_licencias SET machine_fingerprint = ? WHERE id = ?', [machineFingerprint, lic.id]);
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
    console.error('Error al validar licencia de VendeMax:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor al verificar la licencia.' });
  }
};

// POST /api/licencia/validar - Verify desktop app license key (Used by existing C# desktop apps)
app.post('/api/licencia/validar', validateVendeMaxLicenseHandler);

// POST /api/vendemax/licencia/validar - Decoupled route for new integrations
app.post('/api/vendemax/licencia/validar', validateVendeMaxLicenseHandler);

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

// GET /api/admin/stats - Overview metrics (DIRECTORY ONLY)
app.get('/api/admin/stats', requireAdmin, async (req, res) => {
  try {
    const totalComercios = await dbGet('SELECT COUNT(*) as count FROM comercios');
    const totalAgrocomercios = await dbGet('SELECT COUNT(*) as count FROM comercios WHERE es_agrocomercio = 1');
    const pendingComercios = await dbGet("SELECT COUNT(*) as count FROM comercios WHERE estado = 'pendiente'");
    const activeComercios = await dbGet("SELECT COUNT(*) as count FROM comercios WHERE estado = 'activo'");
    const totalCuentas = await dbGet('SELECT COUNT(*) as count FROM usuarios_cuentas');
    
    // Revenue real: se suma el precio de planes.precio para cada suscripción activa (no vencida),
    // normalizando lo anual a su equivalente mensual para el estimado de "Ingresos Mensuales".
    const now = new Date();
    const activeSubs = await dbAll(`
      SELECT s.fecha_fin, s.monto, p.precio, p.periodicidad
      FROM suscripciones s
      JOIN planes p ON s.plan_id = p.id
      WHERE s.estado = 'activa'
    `);

    let monthlyRevenue = 0;
    let totalSalesValue = 0;
    activeSubs.forEach(s => {
      if (new Date(s.fecha_fin) < now) return; // vencida, no cuenta aunque el job diario no haya corrido todavía
      const monto = s.monto !== undefined && s.monto !== null ? s.monto : s.precio;
      totalSalesValue += monto;
      monthlyRevenue += s.periodicidad === 'anual' ? monto / 12 : monto;
    });
    monthlyRevenue = Math.round(monthlyRevenue);

    // Count tasks for directory only
    const tasksTodo = await dbGet("SELECT COUNT(*) as count FROM tareas_trabajo WHERE estado = 'todo' AND vendemax_suscripcion_id IS NULL");
    const tasksInProgress = await dbGet("SELECT COUNT(*) as count FROM tareas_trabajo WHERE estado = 'in_progress' AND vendemax_suscripcion_id IS NULL");

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
    // Include category name and active license key in the output (ONLY Directory Comercios)
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
  const {
    nombre_negocio, telefono, direccion, descripcion, plan, estado, es_agrocomercio,
    localidad_id, latitud, longitud, horarios, horarios_json, facebook, sitio_web
  } = req.body;

  try {
    // Check if commerce exists
    const commerce = await dbGet('SELECT * FROM comercios WHERE id = ?', [id]);
    if (!commerce) {
      return res.status(404).json({ error: 'Comercio no encontrado.' });
    }

    await dbRun(`
      UPDATE comercios
      SET nombre_negocio = ?, telefono = ?, direccion = ?, descripcion = ?, plan = ?, estado = ?, es_agrocomercio = ?,
          localidad_id = ?, latitud = ?, longitud = ?, horarios = ?, horarios_json = ?, facebook = ?, sitio_web = ?
      WHERE id = ?
    `, [
      nombre_negocio || commerce.nombre_negocio,
      telefono || commerce.telefono,
      direccion || commerce.direccion,
      descripcion !== undefined ? descripcion : commerce.descripcion,
      plan || commerce.plan,
      estado || commerce.estado,
      es_agrocomercio !== undefined ? es_agrocomercio : commerce.es_agrocomercio,
      localidad_id !== undefined ? (localidad_id || null) : commerce.localidad_id,
      latitud !== undefined ? (latitud === '' ? null : latitud) : commerce.latitud,
      longitud !== undefined ? (longitud === '' ? null : longitud) : commerce.longitud,
      horarios !== undefined ? horarios : commerce.horarios,
      // horarios_json llega del admin ya serializado como string JSON (o null para "sin cargar")
      horarios_json !== undefined ? horarios_json : commerce.horarios_json,
      facebook !== undefined ? facebook : commerce.facebook,
      sitio_web !== undefined ? sitio_web : commerce.sitio_web,
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
// LOCALIDADES ENDPOINTS (partido de Colón: cabecera, localidades, alrededores)
// ----------------------------------------------------

// GET /api/admin/localidades
app.get('/api/admin/localidades', requireAdmin, async (req, res) => {
  try {
    const rows = await dbAll('SELECT * FROM localidades ORDER BY tipo ASC, nombre ASC');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener localidades.' });
  }
});

// POST /api/admin/localidades
app.post('/api/admin/localidades', requireAdmin, async (req, res) => {
  const { nombre, tipo } = req.body;
  if (!nombre) {
    return res.status(400).json({ error: 'Nombre requerido.' });
  }

  try {
    await dbRun('INSERT INTO localidades (nombre, tipo) VALUES (?, ?)', [nombre, tipo || 'localidad']);
    res.status(201).json({ success: true, message: 'Localidad creada.' });
  } catch (error) {
    res.status(500).json({ error: 'Error al crear localidad (puede que el nombre ya exista).' });
  }
});

// DELETE /api/admin/localidades/:id
app.delete('/api/admin/localidades/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    await dbRun('DELETE FROM localidades WHERE id = ?', [id]);
    res.json({ success: true, message: 'Localidad eliminada con éxito.' });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar localidad.' });
  }
});

// ----------------------------------------------------
// PLANES ENDPOINTS (catálogo de suscripción de la guía)
// ----------------------------------------------------

// GET /api/admin/planes
app.get('/api/admin/planes', requireAdmin, async (req, res) => {
  try {
    const rows = await dbAll('SELECT * FROM planes ORDER BY prioridad ASC, precio ASC');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener planes.' });
  }
});

// POST /api/admin/planes - Crear un plan nuevo en el catálogo
app.post('/api/admin/planes', requireAdmin, async (req, res) => {
  const { slug, nombre, periodicidad, precio, fotos_max, prioridad, con_estadisticas, acceso_ficha_completa, activo } = req.body;

  if (!slug || !nombre) {
    return res.status(400).json({ error: 'Slug y nombre son requeridos.' });
  }

  try {
    const result = await dbRun(`
      INSERT INTO planes (slug, nombre, periodicidad, precio, fotos_max, prioridad, con_estadisticas, acceso_ficha_completa, activo)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      slug.trim().toLowerCase(),
      nombre,
      periodicidad || 'mensual',
      precio !== undefined ? precio : 0,
      fotos_max !== undefined ? fotos_max : 1,
      prioridad !== undefined ? prioridad : 0,
      con_estadisticas ? 1 : 0,
      acceso_ficha_completa ? 1 : 0,
      activo !== undefined ? (activo ? 1 : 0) : 1
    ]);

    res.status(201).json({ success: true, message: 'Plan creado correctamente.', planId: result.lastID });
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'Ya existe un plan con ese slug.' });
    }
    console.error('Error in POST /api/admin/planes:', error);
    res.status(500).json({ error: 'Error al crear el plan.' });
  }
});

// PUT /api/admin/planes/:id
app.put('/api/admin/planes/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { nombre, periodicidad, precio, fotos_max, prioridad, con_estadisticas, acceso_ficha_completa, activo } = req.body;

  try {
    const plan = await dbGet('SELECT * FROM planes WHERE id = ?', [id]);
    if (!plan) {
      return res.status(404).json({ error: 'Plan no encontrado.' });
    }

    await dbRun(`
      UPDATE planes
      SET nombre = ?, periodicidad = ?, precio = ?, fotos_max = ?, prioridad = ?, con_estadisticas = ?, acceso_ficha_completa = ?, activo = ?
      WHERE id = ?
    `, [
      nombre || plan.nombre,
      periodicidad || plan.periodicidad,
      precio !== undefined ? precio : plan.precio,
      fotos_max !== undefined ? fotos_max : plan.fotos_max,
      prioridad !== undefined ? prioridad : plan.prioridad,
      con_estadisticas !== undefined ? (con_estadisticas ? 1 : 0) : plan.con_estadisticas,
      acceso_ficha_completa !== undefined ? (acceso_ficha_completa ? 1 : 0) : plan.acceso_ficha_completa,
      activo !== undefined ? (activo ? 1 : 0) : plan.activo,
      id
    ]);

    res.json({ success: true, message: 'Plan actualizado correctamente.' });
  } catch (error) {
    console.error('Error in PUT /api/admin/planes/:id:', error);
    res.status(500).json({ error: 'Error al actualizar el plan.' });
  }
});

// DELETE /api/admin/planes/:id - Solo si ningún comercio lo usó nunca (histórico incluido)
app.delete('/api/admin/planes/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const plan = await dbGet('SELECT * FROM planes WHERE id = ?', [id]);
    if (!plan) {
      return res.status(404).json({ error: 'Plan no encontrado.' });
    }

    const enUso = await dbGet('SELECT COUNT(*) as count FROM suscripciones WHERE plan_id = ?', [id]);
    if (enUso.count > 0) {
      return res.status(409).json({
        error: `No se puede eliminar: hay ${enUso.count} suscripción(es) (activas o históricas) usando este plan. Desactivalo en vez de eliminarlo.`
      });
    }

    await dbRun('DELETE FROM planes WHERE id = ?', [id]);
    res.json({ success: true, message: 'Plan eliminado correctamente.' });
  } catch (error) {
    console.error('Error in DELETE /api/admin/planes/:id:', error);
    res.status(500).json({ error: 'Error al eliminar el plan.' });
  }
});

// ----------------------------------------------------
// SUSCRIPCIONES ENDPOINTS (vigencia real de cada comercio sobre un plan de la guía)
// ----------------------------------------------------

// GET /api/admin/suscripciones
app.get('/api/admin/suscripciones', requireAdmin, async (req, res) => {
  try {
    const rows = await dbAll(`
      SELECT s.*, c.nombre_negocio, p.nombre as plan_nombre, p.slug as plan_slug, p.periodicidad, p.precio
      FROM suscripciones s
      JOIN comercios c ON s.comercio_id = c.id
      JOIN planes p ON s.plan_id = p.id
      ORDER BY s.fecha_fin DESC
    `);

    // Marcar como vencida al vuelo si ya pasó la fecha_fin, aunque todavía no exista un job diario
    const now = new Date();
    const withComputedState = rows.map(r => {
      if (r.estado === 'activa' && new Date(r.fecha_fin) < now) {
        return { ...r, estado: 'vencida' };
      }
      return r;
    });

    res.json(withComputedState);
  } catch (error) {
    console.error('Error in GET /api/admin/suscripciones:', error);
    res.status(500).json({ error: 'Error al obtener suscripciones.' });
  }
});

// POST /api/admin/suscripciones - Alta o renovación manual de una suscripción
app.post('/api/admin/suscripciones', requireAdmin, async (req, res) => {
  const { comercio_id, plan_id, fecha_inicio, monto, metodo } = req.body;

  if (!comercio_id || !plan_id) {
    return res.status(400).json({ error: 'Comercio y plan son requeridos.' });
  }

  try {
    const comercio = await dbGet('SELECT * FROM comercios WHERE id = ?', [comercio_id]);
    if (!comercio) {
      return res.status(404).json({ error: 'Comercio no encontrado.' });
    }

    const plan = await dbGet('SELECT * FROM planes WHERE id = ?', [plan_id]);
    if (!plan) {
      return res.status(404).json({ error: 'Plan no encontrado.' });
    }

    // Cualquier suscripción activa previa de este comercio queda reemplazada
    await dbRun("UPDATE suscripciones SET estado = 'cancelada' WHERE comercio_id = ? AND estado = 'activa'", [comercio_id]);

    const inicio = fecha_inicio ? new Date(fecha_inicio) : new Date();
    const fin = new Date(inicio);
    if (plan.periodicidad === 'anual') {
      fin.setFullYear(fin.getFullYear() + 1);
    } else {
      fin.setMonth(fin.getMonth() + 1);
    }

    const inicioStr = inicio.toISOString().replace('T', ' ').substring(0, 19);
    const finStr = fin.toISOString().replace('T', ' ').substring(0, 19);

    const result = await dbRun(`
      INSERT INTO suscripciones (comercio_id, plan_id, fecha_inicio, fecha_fin, estado, monto, metodo)
      VALUES (?, ?, ?, ?, 'activa', ?, ?)
    `, [comercio_id, plan_id, inicioStr, finStr, monto !== undefined ? monto : plan.precio, metodo || 'manual']);

    // El comercio queda activo y su campo de compatibilidad "plan" se sincroniza con el slug del plan nuevo
    await dbRun("UPDATE comercios SET estado = 'activo', plan = ? WHERE id = ?", [plan.slug, comercio_id]);

    res.status(201).json({ success: true, message: 'Suscripción creada correctamente.', suscripcionId: result.lastID });
  } catch (error) {
    console.error('Error in POST /api/admin/suscripciones:', error);
    res.status(500).json({ error: 'Error al crear la suscripción.' });
  }
});

// PUT /api/admin/suscripciones/:id - Corrección manual de fechas/estado (incluye cancelar)
app.put('/api/admin/suscripciones/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { fecha_inicio, fecha_fin, estado, monto } = req.body;

  try {
    const sub = await dbGet('SELECT * FROM suscripciones WHERE id = ?', [id]);
    if (!sub) {
      return res.status(404).json({ error: 'Suscripción no encontrada.' });
    }

    const nuevoEstado = estado || sub.estado;

    await dbRun(`
      UPDATE suscripciones
      SET fecha_inicio = ?, fecha_fin = ?, estado = ?, monto = ?
      WHERE id = ?
    `, [
      fecha_inicio ? new Date(fecha_inicio).toISOString().replace('T', ' ').substring(0, 19) : sub.fecha_inicio,
      fecha_fin ? new Date(fecha_fin).toISOString().replace('T', ' ').substring(0, 19) : sub.fecha_fin,
      nuevoEstado,
      monto !== undefined ? monto : sub.monto,
      id
    ]);

    // El campo de compatibilidad comercios.plan tiene que reflejar la suscripción
    // realmente vigente hoy - si se cancela/vence esta, o vuelve a quedar gratuito
    // o toma el slug de otra activa (no debería haber más de una a la vez).
    if (nuevoEstado !== 'activa') {
      const otraActiva = await dbGet(
        `SELECT p.slug FROM suscripciones s JOIN planes p ON s.plan_id = p.id
         WHERE s.comercio_id = ? AND s.estado = 'activa' AND s.id != ?
         ORDER BY s.fecha_fin DESC LIMIT 1`,
        [sub.comercio_id, id]
      );
      await dbRun('UPDATE comercios SET plan = ? WHERE id = ?', [otraActiva ? otraActiva.slug : 'gratuito', sub.comercio_id]);
    } else {
      const plan = await dbGet('SELECT slug FROM planes WHERE id = ?', [sub.plan_id]);
      await dbRun("UPDATE comercios SET plan = ?, estado = 'activo' WHERE id = ?", [plan.slug, sub.comercio_id]);
    }

    res.json({ success: true, message: 'Suscripción actualizada correctamente.' });
  } catch (error) {
    console.error('Error in PUT /api/admin/suscripciones/:id:', error);
    res.status(500).json({ error: 'Error al actualizar la suscripción.' });
  }
});

// ----------------------------------------------------
// COMERCIO FOTOS ENDPOINTS (galería pública, por URL)
// ----------------------------------------------------

// GET /api/admin/comercios/:id/fotos
app.get('/api/admin/comercios/:id/fotos', requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const rows = await dbAll('SELECT * FROM comercio_fotos WHERE comercio_id = ? ORDER BY orden ASC', [id]);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener las fotos del comercio.' });
  }
});

// POST /api/admin/comercios/:id/fotos
app.post('/api/admin/comercios/:id/fotos', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'La URL de la foto es requerida.' });
  }

  try {
    const countRow = await dbGet('SELECT COUNT(*) as count FROM comercio_fotos WHERE comercio_id = ?', [id]);
    const esPrimera = countRow.count === 0 ? 1 : 0;

    const result = await dbRun(`
      INSERT INTO comercio_fotos (comercio_id, url, orden, es_portada)
      VALUES (?, ?, ?, ?)
    `, [id, url, countRow.count, esPrimera]);

    res.status(201).json({ success: true, fotoId: result.lastID });
  } catch (error) {
    res.status(500).json({ error: 'Error al agregar la foto.' });
  }
});

// PUT /api/admin/comercios/:id/fotos/:fotoId - marcar como portada
app.put('/api/admin/comercios/:id/fotos/:fotoId', requireAdmin, async (req, res) => {
  const { id, fotoId } = req.params;
  try {
    await dbRun('UPDATE comercio_fotos SET es_portada = 0 WHERE comercio_id = ?', [id]);
    await dbRun('UPDATE comercio_fotos SET es_portada = 1 WHERE id = ? AND comercio_id = ?', [fotoId, id]);
    res.json({ success: true, message: 'Foto de portada actualizada.' });
  } catch (error) {
    res.status(500).json({ error: 'Error al marcar la foto como portada.' });
  }
});

// DELETE /api/admin/comercios/:id/fotos/:fotoId
app.delete('/api/admin/comercios/:id/fotos/:fotoId', requireAdmin, async (req, res) => {
  const { fotoId } = req.params;
  try {
    await dbRun('DELETE FROM comercio_fotos WHERE id = ?', [fotoId]);
    res.json({ success: true, message: 'Foto eliminada.' });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar la foto.' });
  }
});

// ----------------------------------------------------
// COMERCIO PRODUCTOS ENDPOINTS (showcase de 4-6 productos/servicios, solo planes con productos_max > 0)
// ----------------------------------------------------

// GET /api/admin/comercios/:id/productos
app.get('/api/admin/comercios/:id/productos', requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const rows = await dbAll('SELECT * FROM comercio_productos WHERE comercio_id = ? ORDER BY orden ASC', [id]);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener los productos del comercio.' });
  }
});

// POST /api/admin/comercios/:id/productos
app.post('/api/admin/comercios/:id/productos', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { nombre, descripcion, precio, foto_url } = req.body;

  if (!nombre) {
    return res.status(400).json({ error: 'El nombre del producto/servicio es requerido.' });
  }

  try {
    const comercio = await dbGet('SELECT id FROM comercios WHERE id = ?', [id]);
    if (!comercio) {
      return res.status(404).json({ error: 'Comercio no encontrado.' });
    }

    // El máximo de productos lo define el plan activo del comercio (planes.productos_max),
    // mismo criterio que fotos_max - un comercio sin plan con showcase no puede cargar ninguno.
    const planInfo = await dbGet(`
      SELECT p.productos_max FROM suscripciones s
      JOIN planes p ON s.plan_id = p.id
      WHERE s.comercio_id = ? AND s.estado = 'activa'
      ORDER BY s.fecha_fin DESC LIMIT 1
    `, [id]);
    const maxPermitido = planInfo ? planInfo.productos_max : 0;

    const countRow = await dbGet('SELECT COUNT(*) as count FROM comercio_productos WHERE comercio_id = ?', [id]);
    if (countRow.count >= maxPermitido) {
      return res.status(409).json({
        error: `El plan actual de este comercio permite hasta ${maxPermitido} producto(s)/servicio(s) en el showcase. Subí el plan o eliminá uno existente.`
      });
    }

    const result = await dbRun(`
      INSERT INTO comercio_productos (comercio_id, nombre, descripcion, precio, foto_url, orden)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [id, nombre, descripcion || null, precio !== undefined && precio !== '' ? precio : null, foto_url || null, countRow.count]);

    res.status(201).json({ success: true, productoId: result.lastID });
  } catch (error) {
    console.error('Error in POST /api/admin/comercios/:id/productos:', error);
    res.status(500).json({ error: 'Error al agregar el producto.' });
  }
});

// PUT /api/admin/comercios/:id/productos/:productoId
app.put('/api/admin/comercios/:id/productos/:productoId', requireAdmin, async (req, res) => {
  const { id, productoId } = req.params;
  const { nombre, descripcion, precio, foto_url, orden } = req.body;

  try {
    const producto = await dbGet('SELECT * FROM comercio_productos WHERE id = ? AND comercio_id = ?', [productoId, id]);
    if (!producto) {
      return res.status(404).json({ error: 'Producto no encontrado.' });
    }

    await dbRun(`
      UPDATE comercio_productos
      SET nombre = ?, descripcion = ?, precio = ?, foto_url = ?, orden = ?
      WHERE id = ?
    `, [
      nombre || producto.nombre,
      descripcion !== undefined ? descripcion : producto.descripcion,
      precio !== undefined && precio !== '' ? precio : producto.precio,
      foto_url !== undefined ? foto_url : producto.foto_url,
      orden !== undefined ? orden : producto.orden,
      productoId
    ]);

    res.json({ success: true, message: 'Producto actualizado correctamente.' });
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar el producto.' });
  }
});

// DELETE /api/admin/comercios/:id/productos/:productoId
app.delete('/api/admin/comercios/:id/productos/:productoId', requireAdmin, async (req, res) => {
  const { productoId } = req.params;
  try {
    await dbRun('DELETE FROM comercio_productos WHERE id = ?', [productoId]);
    res.json({ success: true, message: 'Producto eliminado.' });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar el producto.' });
  }
});

// ----------------------------------------------------
// COMERCIO TESTIMONIOS ENDPOINTS (reseñas moderadas antes de publicarse)
// ----------------------------------------------------

// GET /api/admin/comercios/:id/testimonios
app.get('/api/admin/comercios/:id/testimonios', requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const rows = await dbAll('SELECT * FROM comercio_testimonios WHERE comercio_id = ? ORDER BY fecha_creacion DESC', [id]);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener los testimonios del comercio.' });
  }
});

// POST /api/admin/comercios/:id/testimonios - el admin los carga a mano (el plan de negocio
// no define todavía un formulario público de reseñas) y decide si quedan aprobados de una o no.
app.post('/api/admin/comercios/:id/testimonios', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { autor_nombre, texto, aprobado } = req.body;

  if (!autor_nombre || !texto) {
    return res.status(400).json({ error: 'Autor y texto del testimonio son requeridos.' });
  }

  try {
    const comercio = await dbGet('SELECT id FROM comercios WHERE id = ?', [id]);
    if (!comercio) {
      return res.status(404).json({ error: 'Comercio no encontrado.' });
    }

    const result = await dbRun(`
      INSERT INTO comercio_testimonios (comercio_id, autor_nombre, texto, aprobado)
      VALUES (?, ?, ?, ?)
    `, [id, autor_nombre, texto, aprobado ? 1 : 0]);

    res.status(201).json({ success: true, testimonioId: result.lastID });
  } catch (error) {
    res.status(500).json({ error: 'Error al agregar el testimonio.' });
  }
});

// PUT /api/admin/comercios/:id/testimonios/:testimonioId - editar texto y/o aprobar/desaprobar
app.put('/api/admin/comercios/:id/testimonios/:testimonioId', requireAdmin, async (req, res) => {
  const { id, testimonioId } = req.params;
  const { autor_nombre, texto, aprobado } = req.body;

  try {
    const testimonio = await dbGet('SELECT * FROM comercio_testimonios WHERE id = ? AND comercio_id = ?', [testimonioId, id]);
    if (!testimonio) {
      return res.status(404).json({ error: 'Testimonio no encontrado.' });
    }

    await dbRun(`
      UPDATE comercio_testimonios SET autor_nombre = ?, texto = ?, aprobado = ? WHERE id = ?
    `, [
      autor_nombre || testimonio.autor_nombre,
      texto || testimonio.texto,
      aprobado !== undefined ? (aprobado ? 1 : 0) : testimonio.aprobado,
      testimonioId
    ]);

    res.json({ success: true, message: 'Testimonio actualizado correctamente.' });
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar el testimonio.' });
  }
});

// DELETE /api/admin/comercios/:id/testimonios/:testimonioId
app.delete('/api/admin/comercios/:id/testimonios/:testimonioId', requireAdmin, async (req, res) => {
  const { testimonioId } = req.params;
  try {
    await dbRun('DELETE FROM comercio_testimonios WHERE id = ?', [testimonioId]);
    res.json({ success: true, message: 'Testimonio eliminado.' });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar el testimonio.' });
  }
});

// ----------------------------------------------------
// RECLAMOS DE PERFIL ENDPOINTS ("¿Sos el dueño? Reclamá tu perfil" - sección 5.1 del plan)
// ----------------------------------------------------

// GET /api/admin/reclamos
app.get('/api/admin/reclamos', requireAdmin, async (req, res) => {
  try {
    const rows = await dbAll(`
      SELECT r.*, c.nombre_negocio, c.plan
      FROM reclamos_perfil r
      JOIN comercios c ON r.comercio_id = c.id
      ORDER BY r.fecha_creacion DESC
    `);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener los reclamos de perfil.' });
  }
});

// PUT /api/admin/reclamos/:id - marcar como contactado/aprobado/rechazado (seguimiento manual,
// no otorga Premium automáticamente: el equipo de ventas cierra el upgrade con el comerciante)
app.put('/api/admin/reclamos/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { estado } = req.body;

  if (!estado || !['pendiente', 'contactado', 'aprobado', 'rechazado'].includes(estado)) {
    return res.status(400).json({ error: 'Estado inválido.' });
  }

  try {
    const reclamo = await dbGet('SELECT * FROM reclamos_perfil WHERE id = ?', [id]);
    if (!reclamo) {
      return res.status(404).json({ error: 'Reclamo no encontrado.' });
    }

    await dbRun('UPDATE reclamos_perfil SET estado = ? WHERE id = ?', [estado, id]);
    res.json({ success: true, message: 'Reclamo actualizado correctamente.' });
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar el reclamo.' });
  }
});

// ----------------------------------------------------
// ESTADÍSTICAS ENDPOINTS (Panel de Estadísticas Premium + reporte de "clics perdidos" gratuitos)
// ----------------------------------------------------

// GET /api/admin/estadisticas/clics-perdidos - sección 5.2 del plan: "120 vecinos intentaron
// contactar a tu negocio esta semana" - cuenta clics en "Ver más" y visitas a la ficha restringida
// de comercios SIN ficha completa, para que el Community Manager los use como argumento de venta.
app.get('/api/admin/estadisticas/clics-perdidos', requireAdmin, async (req, res) => {
  try {
    const dias = parseInt(req.query.dias) || 30;
    const formato = req.query.format;

    const rows = await dbAll(`
      SELECT c.id as comercio_id, c.nombre_negocio, c.plan, c.email_titular, c.telefono,
             COUNT(*) as intentos_contacto
      FROM eventos_tracking e
      JOIN comercios c ON e.comercio_id = c.id
      WHERE e.tipo IN ('click_ver_mas', 'visita_restringida')
        AND e.fecha >= datetime('now', ?)
      GROUP BY c.id
      ORDER BY intentos_contacto DESC
    `, [`-${dias} days`]);

    if (formato === 'csv') {
      const header = 'comercio_id,nombre_negocio,plan,email_titular,telefono,intentos_contacto\n';
      const body = rows.map(r =>
        [r.comercio_id, `"${(r.nombre_negocio || '').replace(/"/g, '""')}"`, r.plan, r.email_titular, r.telefono, r.intentos_contacto].join(',')
      ).join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="clics-perdidos-${dias}dias.csv"`);
      return res.send(header + body);
    }

    res.json(rows);
  } catch (error) {
    console.error('Error in GET /api/admin/estadisticas/clics-perdidos:', error);
    res.status(500).json({ error: 'Error al obtener el reporte de clics perdidos.' });
  }
});

// GET /api/admin/comercios/:id/estadisticas - Panel de Estadísticas de un comercio Premium
// (sección 4 de la matriz: "visitas, clicks a WhatsApp" como justificador del gasto)
app.get('/api/admin/comercios/:id/estadisticas', requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const dias = parseInt(req.query.dias) || 30;

    const porTipo = await dbAll(`
      SELECT tipo, COUNT(*) as total
      FROM eventos_tracking
      WHERE comercio_id = ? AND fecha >= datetime('now', ?)
      GROUP BY tipo
    `, [id, `-${dias} days`]);

    const porDia = await dbAll(`
      SELECT date(fecha) as dia, tipo, COUNT(*) as total
      FROM eventos_tracking
      WHERE comercio_id = ? AND fecha >= datetime('now', ?)
      GROUP BY dia, tipo
      ORDER BY dia ASC
    `, [id, `-${dias} days`]);

    res.json({ dias, por_tipo: porTipo, por_dia: porDia });
  } catch (error) {
    console.error('Error in GET /api/admin/comercios/:id/estadisticas:', error);
    res.status(500).json({ error: 'Error al obtener las estadísticas del comercio.' });
  }
});

// ----------------------------------------------------
// JIRA-STYLE WORK TASKS ENDPOINTS
// ----------------------------------------------------

// GET /api/admin/tareas
app.get('/api/admin/tareas', requireAdmin, async (req, res) => {
  try {
    const rows = await dbAll(`
      SELECT t.*, 
             CASE 
               WHEN t.comercio_id IS NOT NULL THEN c.nombre_negocio
               WHEN t.vendemax_suscripcion_id IS NOT NULL THEN v.nombre_negocio
               ELSE 'General / Sin vincular'
             END as comercio_nombre
      FROM tareas_trabajo t
      LEFT JOIN comercios c ON t.comercio_id = c.id
      LEFT JOIN vendemax_suscripciones v ON t.vendemax_suscripcion_id = v.id
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
