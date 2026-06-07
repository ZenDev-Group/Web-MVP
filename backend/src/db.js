const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const dbFile = path.resolve(__dirname, '..', process.env.DB_FILE || 'database.sqlite');
const db = new sqlite3.Database(dbFile, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log(`Connected to SQLite database at: ${dbFile}`);
  }
});

// Helper functions for running queries with Promises
const dbRun = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
};

const dbAll = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

const dbGet = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

async function initDb() {
  // 1. Create Categorías Table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS categorias (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      nombre TEXT NOT NULL
    )
  `);

  // 2. Create Cuentas (Users) Table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS usuarios_cuentas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      rol TEXT NOT NULL DEFAULT 'admin',
      fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 3. Create Comercios Table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS comercios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre_negocio TEXT NOT NULL,
      categoria_id INTEGER,
      telefono TEXT NOT NULL,
      direccion TEXT NOT NULL,
      descripcion TEXT,
      nombre_titular TEXT NOT NULL,
      email_titular TEXT NOT NULL,
      dni_titular TEXT NOT NULL,
      whatsapp TEXT,
      instagram TEXT,
      plan TEXT NOT NULL,
      estado TEXT NOT NULL DEFAULT 'pendiente',
      es_agrocomercio INTEGER DEFAULT 0,
      fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (categoria_id) REFERENCES categorias (id)
    )
  `);

  // 4. Create VendeMax Suscripciones Table (SEPARATED)
  await dbRun(`
    CREATE TABLE IF NOT EXISTS vendemax_suscripciones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre_negocio TEXT NOT NULL,
      telefono TEXT NOT NULL,
      direccion TEXT NOT NULL,
      descripcion TEXT,
      nombre_titular TEXT NOT NULL,
      email_titular TEXT NOT NULL,
      dni_titular TEXT NOT NULL,
      whatsapp TEXT,
      instagram TEXT,
      plan TEXT NOT NULL,
      estado TEXT NOT NULL DEFAULT 'pendiente',
      fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 5. Create Tareas (JIRA tasks) Table with support for both types
  await dbRun(`
    CREATE TABLE IF NOT EXISTS tareas_trabajo (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      titulo TEXT NOT NULL,
      descripcion TEXT,
      estado TEXT NOT NULL DEFAULT 'todo',
      prioridad TEXT NOT NULL DEFAULT 'media',
      comercio_id INTEGER,
      vendemax_suscripcion_id INTEGER,
      fecha_limite DATETIME,
      fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (comercio_id) REFERENCES comercios (id) ON DELETE SET NULL,
      FOREIGN KEY (vendemax_suscripcion_id) REFERENCES vendemax_suscripciones (id) ON DELETE SET NULL
    )
  `);

  // Try to add the vendemax_suscripcion_id column if it doesn't exist (migrations fallback)
  try {
    await dbRun('ALTER TABLE tareas_trabajo ADD COLUMN vendemax_suscripcion_id INTEGER');
    console.log('Added column vendemax_suscripcion_id to tareas_trabajo.');
  } catch (e) {
    // Column already exists, safe to ignore
  }

  // 6. Create Licencias Table (For Comerciantes directory if needed)
  await dbRun(`
    CREATE TABLE IF NOT EXISTS licencias (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      comercio_id INTEGER UNIQUE,
      email TEXT UNIQUE NOT NULL,
      clave TEXT UNIQUE NOT NULL,
      estado TEXT NOT NULL DEFAULT 'activo',
      fecha_vencimiento DATETIME NOT NULL,
      machine_fingerprint TEXT,
      fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (comercio_id) REFERENCES comercios (id) ON DELETE CASCADE
    )
  `);

  // 7. Create VendeMax Licencias Table (SEPARATED)
  await dbRun(`
    CREATE TABLE IF NOT EXISTS vendemax_licencias (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      suscripcion_id INTEGER UNIQUE,
      email TEXT UNIQUE NOT NULL,
      clave TEXT UNIQUE NOT NULL,
      estado TEXT NOT NULL DEFAULT 'activo',
      fecha_vencimiento DATETIME NOT NULL,
      machine_fingerprint TEXT,
      fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (suscripcion_id) REFERENCES vendemax_suscripciones (id) ON DELETE CASCADE
    )
  `);

  console.log('Database tables verified/created successfully.');

  // Seed Categories if empty
  const catCount = await dbGet('SELECT COUNT(*) as count FROM categorias');
  if (catCount.count === 0) {
    const defaultCategories = [
      { slug: 'gastronomia', nombre: 'Gastronomía' },
      { slug: 'comerciantes', nombre: 'Comerciantes / Tiendas' },
      { slug: 'artesanias', nombre: 'Artesanías' },
      { slug: 'servicios', nombre: 'Servicios' },
      { slug: 'indumentaria', nombre: 'Indumentaria & Calzado' },
      { slug: 'agro', nombre: 'Agro y Campo' },
      { slug: 'otros', nombre: 'Otros Rubros' }
    ];

    for (const cat of defaultCategories) {
      await dbRun('INSERT INTO categorias (slug, nombre) VALUES (?, ?)', [cat.slug, cat.nombre]);
    }
    console.log('Seeded default categories.');
  }

  // Seed or Update Default Admin User
  const adminUser = process.env.ADMIN_USER || 'admin';
  const adminPass = process.env.ADMIN_PASS || 'admin123';
  const email = adminUser.includes('@') ? adminUser : `${adminUser}@comerciantes.com.ar`;

  const user = await dbGet("SELECT * FROM usuarios_cuentas WHERE rol = 'admin' LIMIT 1");
  if (!user) {
    await dbRun('INSERT INTO usuarios_cuentas (email, password, rol) VALUES (?, ?, ?)', [
      email,
      adminPass,
      'admin'
    ]);
    console.log('Seeded default admin user.');
  } else {
    await dbRun('UPDATE usuarios_cuentas SET email = ?, password = ? WHERE id = ?', [
      email,
      adminPass,
      user.id
    ]);
    console.log('Updated admin user credentials to match .env config.');
  }

  // SEED SPECIFIC VENDEMAX ADMIN USER
  const gustavEmail = 'iamgustav.olivera@gmail.com';
  const gustavUser = await dbGet("SELECT * FROM usuarios_cuentas WHERE email = ?", [gustavEmail]);
  if (!gustavUser) {
    await dbRun('INSERT INTO usuarios_cuentas (email, password, rol) VALUES (?, ?, ?)', [
      gustavEmail,
      adminPass, // Uses the same admin password configured or admin123
      'admin'
    ]);
    console.log(`Seeded VendeMax admin user: ${gustavEmail}`);
  }

  // Seed some dummy merchants/comercios if empty to showcase in lists (ONLY COMERCIANTES NOW)
  const commCount = await dbGet('SELECT COUNT(*) as count FROM comercios');
  if (commCount.count === 0) {
    const cats = await dbAll('SELECT id, slug FROM categorias');
    const catMap = {};
    cats.forEach(c => catMap[c.slug] = c.id);

    const dummyMerchants = [
      {
        nombre_negocio: 'Panadería Don Juan',
        categoria_id: catMap['gastronomia'],
        telefono: '3447-451234',
        direccion: 'Alejo Peyret 123, Colón',
        descripcion: 'El mejor pan artesanal de Colón, facturas y especialidades dulces.',
        nombre_titular: 'Juan Gómez',
        email_titular: 'juan@donjuan.com',
        dni_titular: '28456123',
        whatsapp: '5493447451234',
        instagram: '@panaderiadonjuan',
        plan: 'gratuito', // Regular directory plan
        estado: 'activo',
        es_agrocomercio: 0
      },
      {
        nombre_negocio: 'Ferretería El Tornillo',
        categoria_id: catMap['comerciantes'],
        telefono: '3447-421188',
        direccion: '12 de Abril 567, Colón',
        descripcion: 'Todo en ferretería, herramientas, bulonería y pinturas.',
        nombre_titular: 'Fabián Angeloni',
        email_titular: 'fabian@eltornillo.com',
        dni_titular: '30456789',
        whatsapp: '5493447421188',
        instagram: '@ferreteriaeltornillo',
        plan: 'destacado', // Regular directory plan
        estado: 'activo',
        es_agrocomercio: 0
      },
      {
        nombre_negocio: 'Boutique Sol & Luna',
        categoria_id: catMap['indumentaria'],
        telefono: '3447-482200',
        direccion: 'Urquiza 890, Colón',
        descripcion: 'Moda y calzado para damas y caballeros. Últimas tendencias.',
        nombre_titular: 'María Sol',
        email_titular: 'sol@solyluna.com',
        dni_titular: '32987654',
        whatsapp: '5493447482200',
        instagram: '@solyluna_boutique',
        plan: 'destacado',
        estado: 'activo',
        es_agrocomercio: 0
      },
      {
        nombre_negocio: 'Agroservicios Colón',
        categoria_id: catMap['agro'],
        telefono: '3447-495511',
        direccion: 'Ruta 135 Km 5, Colón',
        descripcion: 'Venta de insumos agrícolas, fertilizantes y asesoramiento agronómico.',
        nombre_titular: 'Roberto Cardozo',
        email_titular: 'roberto@agroservicioscolon.com',
        dni_titular: '25112233',
        whatsapp: '5493447495511',
        instagram: '@agroservicios_colon',
        plan: 'destacado',
        estado: 'activo',
        es_agrocomercio: 1
      },
      {
        nombre_negocio: 'Semillería La Pradera',
        categoria_id: catMap['agro'],
        telefono: '3447-438899',
        direccion: 'Pellegrini 410, Colón',
        descripcion: 'Semillas forrajeras, alimentos balanceados y pet shop.',
        nombre_titular: 'Carlos Pradera',
        email_titular: 'carlos@lapradera.com',
        dni_titular: '22883344',
        whatsapp: '5493447438899',
        instagram: '@semillerialapradera',
        plan: 'gratuito',
        estado: 'pendiente',
        es_agrocomercio: 1
      }
    ];

    for (const m of dummyMerchants) {
      await dbRun(`
        INSERT INTO comercios (
          nombre_negocio, categoria_id, telefono, direccion, descripcion, 
          nombre_titular, email_titular, dni_titular, whatsapp, instagram, 
          plan, estado, es_agrocomercio
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        m.nombre_negocio, m.categoria_id, m.telefono, m.direccion, m.descripcion,
        m.nombre_titular, m.email_titular, m.dni_titular, m.whatsapp, m.instagram,
        m.plan, m.estado, m.es_agrocomercio
      ]);
    }
    console.log('Seeded default dummy merchants.');
  }

  // Seed VendeMax Suscripciones if empty
  const vmCount = await dbGet('SELECT COUNT(*) as count FROM vendemax_suscripciones');
  if (vmCount.count === 0) {
    const dummySubscriptions = [
      {
        nombre_negocio: 'Kiosco El Trébol',
        telefono: '3447-458899',
        direccion: 'San Martín 456, Colón',
        descripcion: 'Kiosco y almacén rápido, requiere licencia de VendeMax.',
        nombre_titular: 'Claudio Trébol',
        email_titular: 'claudio@trebol.com',
        dni_titular: '29883344',
        whatsapp: '5493447458899',
        instagram: '@kiosco_el_trebol',
        plan: 'premium-mensual',
        estado: 'activo'
      },
      {
        nombre_negocio: 'Supermercado Sol',
        telefono: '3447-493322',
        direccion: 'Ferrari 789, Colón',
        descripcion: 'Supermercado de barrio, control de inventario robusto.',
        nombre_titular: 'Gustavo Soler',
        email_titular: 'gustavo@supersol.com',
        dni_titular: '27665544',
        whatsapp: '5493447493322',
        instagram: '@supermercado_sol',
        plan: 'premium-anual',
        estado: 'activo'
      },
      {
        nombre_negocio: 'Minimarket Express',
        telefono: '3447-414433',
        direccion: 'Peyret 850, Colón',
        descripcion: 'Minimarket 24hs, alta de plan piloto.',
        nombre_titular: 'Romina Express',
        email_titular: 'romina@express.com',
        dni_titular: '34998877',
        whatsapp: '5493447414433',
        instagram: '@minimarket_express',
        plan: 'freemium',
        estado: 'pendiente'
      }
    ];

    for (const s of dummySubscriptions) {
      await dbRun(`
        INSERT INTO vendemax_suscripciones (
          nombre_negocio, telefono, direccion, descripcion, 
          nombre_titular, email_titular, dni_titular, whatsapp, instagram, 
          plan, estado
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        s.nombre_negocio, s.telefono, s.direccion, s.descripcion,
        s.nombre_titular, s.email_titular, s.dni_titular, s.whatsapp, s.instagram,
        s.plan, s.estado
      ]);
    }
    console.log('Seeded dummy VendeMax subscriptions.');

    // Seed VendeMax Licencias
    const activeSubs = await dbAll("SELECT id, email_titular, plan FROM vendemax_suscripciones WHERE estado = 'activo'");
    for (const s of activeSubs) {
      let dias = 30;
      if (s.plan === 'premium-anual') dias = 365;
      
      const fechaVencimiento = new Date();
      fechaVencimiento.setDate(fechaVencimiento.getDate() + dias);
      const fechaVencimientoStr = fechaVencimiento.toISOString().replace('T', ' ').substring(0, 19);
      
      let clave = s.email_titular.includes('claudio') ? 'VMAX-KIO-TREBOL-8899' : 'VMAX-SUPER-SOL-3322';
      
      await dbRun(`
        INSERT INTO vendemax_licencias (suscripcion_id, email, clave, estado, fecha_vencimiento)
        VALUES (?, ?, ?, ?, ?)
      `, [s.id, s.email_titular, clave, 'activo', fechaVencimientoStr]);
    }
    console.log('Seeded licenses for active VendeMax subscriptions.');
  }

  // Seed default tasks for JIRA board if empty
  const taskCount = await dbGet('SELECT COUNT(*) as count FROM tareas_trabajo');
  if (taskCount.count === 0) {
    const merchants = await dbAll('SELECT id, nombre_negocio FROM comercios');
    const vmSubs = await dbAll('SELECT id, nombre_negocio FROM vendemax_suscripciones');
    
    const semilleria = merchants.find(m => m.nombre_negocio.includes('Semillería'));
    const donJuan = merchants.find(m => m.nombre_negocio.includes('Don Juan'));
    const express = vmSubs.find(s => s.nombre_negocio.includes('Express'));

    const dummyTasks = [
      {
        titulo: 'Verificar datos de registro de Semillería La Pradera',
        descripcion: 'Revisar la dirección física y DNI del titular. Llamar por teléfono para verificar contacto comercial.',
        estado: 'todo',
        prioridad: 'alta',
        comercio_id: semilleria ? semilleria.id : null,
        vendemax_suscripcion_id: null,
        fecha_limite: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()
      },
      {
        titulo: 'Verificar registro VendeMax: Minimarket Express',
        descripcion: 'Nuevo registro de VendeMax en plan Freemium. Coordinar entrega de instalador y verificar datos del titular Romina Express.',
        estado: 'todo',
        prioridad: 'media',
        comercio_id: null,
        vendemax_suscripcion_id: express ? express.id : null,
        fecha_limite: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString()
      },
      {
        titulo: 'Diseñar perfil premium para Panadería Don Juan',
        descripcion: 'Subir logo, galería de fotos de panes y configurar botón de pedido de WhatsApp.',
        estado: 'done',
        prioridad: 'media',
        comercio_id: donJuan ? donJuan.id : null,
        vendemax_suscripcion_id: null,
        fecha_limite: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString()
      }
    ];

    for (const t of dummyTasks) {
      await dbRun(`
        INSERT INTO tareas_trabajo (
          titulo, descripcion, estado, prioridad, comercio_id, vendemax_suscripcion_id, fecha_limite
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        t.titulo, t.descripcion, t.estado, t.prioridad, t.comercio_id, t.vendemax_suscripcion_id, t.fecha_limite
      ]);
    }
    console.log('Seeded default JIRA-style tasks (directory and VendeMax).');
  }
}

module.exports = {
  db,
  dbRun,
  dbAll,
  dbGet,
  initDb
};
