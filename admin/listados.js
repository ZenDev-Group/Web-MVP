let currentView = '';
let listData = [];

// Determine which view to render based on URL parameter
function initView() {
    const params = new URLSearchParams(window.location.search);
    currentView = params.get('view') || 'comercios';
    
    // Highlight sidebar active item
    document.querySelectorAll('.sidebar-menu li').forEach(li => li.classList.remove('active'));
    const activeLi = document.getElementById(`menu-${currentView}`);
    if (activeLi) activeLi.classList.add('active');

    // Setup headers and visibility
    const viewTitle = document.getElementById('viewTitle');
    const viewSubtitle = document.getElementById('viewSubtitle');
    const statusFilter = document.getElementById('statusFilter');
    const actionButtonContainer = document.getElementById('actionButtonContainer');

    statusFilter.style.display = 'none';
    actionButtonContainer.innerHTML = '';

    if (currentView === 'comercios') {
        viewTitle.textContent = 'Gestión de Comercios';
        viewSubtitle.textContent = 'Ver, editar y aprobar comercios locales registrados en la plataforma';
        statusFilter.style.display = 'inline-block';
    } else if (currentView === 'agrocomercios') {
        viewTitle.textContent = 'Gestión de Agrocomercios';
        viewSubtitle.textContent = 'Comercios especializados y proveedores del sector agrícola';
        statusFilter.style.display = 'inline-block';
    } else if (currentView === 'cuentas') {
        viewTitle.textContent = 'Cuentas Administrativas';
        viewSubtitle.textContent = 'Usuarios con acceso al panel de control';
    } else if (currentView === 'categorias') {
        viewTitle.textContent = 'Categorías del Directorio';
        viewSubtitle.textContent = 'Rubros y clasificación de los comercios';
        actionButtonContainer.innerHTML = `
            <button class="btn-primary-admin" onclick="openCategoryModal()">
                <span>➕</span> Nueva Categoría
            </button>
        `;
    } else if (currentView === 'suscripciones') {
        viewTitle.textContent = 'Suscripciones de la Guía';
        viewSubtitle.textContent = 'Vigencia real de cada comercio sobre un plan pago o gratuito';
        actionButtonContainer.innerHTML = `
            <button class="btn-primary-admin" onclick="openSubscriptionModal()">
                <span>➕</span> Nueva Suscripción
            </button>
        `;
    } else if (currentView === 'planes') {
        viewTitle.textContent = 'Planes de Suscripción';
        viewSubtitle.textContent = 'Catálogo de planes que se pueden asignar a un comercio';
        actionButtonContainer.innerHTML = `
            <button class="btn-primary-admin" onclick="openPlanModal()">
                <span>➕</span> Nuevo Plan
            </button>
        `;
    } else if (currentView === 'localidades') {
        viewTitle.textContent = 'Localidades';
        viewSubtitle.textContent = 'Cabecera, localidades y alrededores del partido de Colón';
        actionButtonContainer.innerHTML = `
            <button class="btn-primary-admin" onclick="openLocalidadModal()">
                <span>➕</span> Nueva Localidad
            </button>
        `;
    } else if (currentView === 'reclamos') {
        viewTitle.textContent = 'Reclamos de Perfil';
        viewSubtitle.textContent = '"¿Sos el dueño? Reclamá tu perfil" - pedidos de contacto desde fichas gratuitas restringidas';
    } else if (currentView === 'estadisticas') {
        viewTitle.textContent = 'Clics Perdidos';
        viewSubtitle.textContent = 'Intentos de contacto (Ver más / ficha restringida) en comercios sin ficha completa - último 30 días';
        actionButtonContainer.innerHTML = `
            <button class="btn-primary-admin" onclick="descargarClicsPerdidosCSV()">
                <span>⬇️</span> Descargar CSV
            </button>
        `;
    }

    // Attach search and filter event listeners
    document.getElementById('searchInput').addEventListener('input', renderTable);
    statusFilter.addEventListener('change', renderTable);

    fetchData();
}

// Fetch data from API
async function fetchData() {
    let endpoint = '';
    if (currentView === 'comercios') endpoint = '/admin/comercios';
    else if (currentView === 'agrocomercios') endpoint = '/admin/agrocomercios';
    else if (currentView === 'cuentas') endpoint = '/admin/cuentas';
    else if (currentView === 'categorias') endpoint = '/admin/categorias';
    else if (currentView === 'suscripciones') endpoint = '/admin/suscripciones';
    else if (currentView === 'planes') endpoint = '/admin/planes';
    else if (currentView === 'localidades') endpoint = '/admin/localidades';
    else if (currentView === 'reclamos') endpoint = '/admin/reclamos';
    else if (currentView === 'estadisticas') endpoint = '/admin/estadisticas/clics-perdidos';

    try {
        const response = await fetch(`${API_URL}${endpoint}`, {
            headers: getHeaders()
        });

        if (!response.ok) throw new Error('Error fetching data');
        listData = await response.json();
        renderTable();
    } catch (error) {
        console.error(error);
        const tableBody = document.getElementById('tableBody');
        tableBody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: var(--danger); padding: 2rem;">Error al cargar datos desde el servidor.</td></tr>`;
    }
}

// Search and filter on client side, then render table rows
function renderTable() {
    const searchVal = document.getElementById('searchInput').value.toLowerCase();
    const statusVal = document.getElementById('statusFilter').value;
    const tableHead = document.getElementById('tableHead');
    const tableBody = document.getElementById('tableBody');
    const recordCount = document.getElementById('recordCount');

    // Filter listData
    const filtered = listData.filter(item => {
        // Apply search
        let matchesSearch = false;
        if (currentView === 'comercios' || currentView === 'agrocomercios') {
            matchesSearch = item.nombre_negocio.toLowerCase().includes(searchVal) ||
                            item.nombre_titular.toLowerCase().includes(searchVal) ||
                            item.email_titular.toLowerCase().includes(searchVal) ||
                            item.direccion.toLowerCase().includes(searchVal);
        } else if (currentView === 'cuentas') {
            matchesSearch = item.email.toLowerCase().includes(searchVal) ||
                            item.rol.toLowerCase().includes(searchVal);
        } else if (currentView === 'categorias') {
            matchesSearch = item.nombre.toLowerCase().includes(searchVal) ||
                            item.slug.toLowerCase().includes(searchVal);
        } else if (currentView === 'suscripciones') {
            matchesSearch = item.nombre_negocio.toLowerCase().includes(searchVal) ||
                            item.plan_nombre.toLowerCase().includes(searchVal);
        } else if (currentView === 'planes') {
            matchesSearch = item.nombre.toLowerCase().includes(searchVal) ||
                            item.slug.toLowerCase().includes(searchVal);
        } else if (currentView === 'localidades') {
            matchesSearch = item.nombre.toLowerCase().includes(searchVal);
        } else if (currentView === 'reclamos') {
            matchesSearch = item.nombre_negocio.toLowerCase().includes(searchVal) ||
                            item.nombre_solicitante.toLowerCase().includes(searchVal);
        } else if (currentView === 'estadisticas') {
            matchesSearch = item.nombre_negocio.toLowerCase().includes(searchVal);
        }

        // Apply status filter (relevant to commerce)
        let matchesStatus = true;
        if ((currentView === 'comercios' || currentView === 'agrocomercios') && statusVal) {
            matchesStatus = item.estado === statusVal;
        }

        return matchesSearch && matchesStatus;
    });

    recordCount.textContent = `${filtered.length} registro(s) encontrado(s)`;

    // Render columns head
    if (currentView === 'comercios' || currentView === 'agrocomercios') {
        tableHead.innerHTML = `
            <tr>
                <th>Negocio</th>
                <th>Titular</th>
                <th>Categoría</th>
                <th>Plan</th>
                <th>Registro</th>
                <th>Estado</th>
                <th>Acciones</th>
            </tr>
        `;
        
        tableBody.innerHTML = filtered.map(c => `
            <tr>
                <td>
                    <div style="font-weight: 600;">${escapeHTML(c.nombre_negocio)}</div>
                    <div style="font-size: 0.8rem; color: var(--text-secondary);">📍 ${escapeHTML(c.direccion)}</div>
                    ${c.licencia_clave ? `
                        <div style="margin-top: 0.3rem; font-size: 0.75rem; color: #3b82f6;">
                            🔑 <span style="font-family: monospace; font-weight: bold; background: rgba(59, 130, 246, 0.1); padding: 0.1rem 0.3rem; border-radius: 4px; border: 1px dashed rgba(59, 130, 246, 0.3);" title="Clave de Licencia del Cliente">${escapeHTML(c.licencia_clave)}</span>
                        </div>
                    ` : ''}
                </td>
                <td>
                    <div>${escapeHTML(c.nombre_titular)}</div>
                    <div style="font-size: 0.8rem; color: var(--text-secondary);">✉ ${escapeHTML(c.email_titular)} | 📱 ${escapeHTML(c.telefono)}</div>
                </td>
                <td>${escapeHTML(c.categoria_nombre || 'Sin categoría')}</td>
                <td><span class="badge-plan ${c.plan}">${c.plan}</span></td>
                <td>${new Date(c.fecha_registro).toLocaleDateString('es-AR')}</td>
                <td><span class="badge-status ${c.estado}">${c.estado}</span></td>
                <td>
                    <div style="display: flex; gap: 0.5rem;">
                        <button class="btn-primary-admin" style="padding: 0.4rem 0.8rem; font-size: 0.8rem; background: var(--bg-card); border: 1px solid var(--border-color);" onclick="openCommerceEdit(${c.id})">Editar</button>
                        <button class="btn-logout" style="padding: 0.4rem 0.8rem; font-size: 0.8rem;" onclick="deleteCommerce(${c.id})">Eliminar</button>
                    </div>
                </td>
            </tr>
        `).join('');
    } else if (currentView === 'cuentas') {
        tableHead.innerHTML = `
            <tr>
                <th>ID</th>
                <th>Email</th>
                <th>Rol</th>
                <th>Fecha Creación</th>
            </tr>
        `;
        
        tableBody.innerHTML = filtered.map(u => `
            <tr>
                <td>${u.id}</td>
                <td><strong>${escapeHTML(u.email)}</strong></td>
                <td><span class="badge-plan freemium" style="text-transform: uppercase;">${escapeHTML(u.rol)}</span></td>
                <td>${new Date(u.fecha_creacion).toLocaleString('es-AR')}</td>
            </tr>
        `).join('');
    } else if (currentView === 'categorias') {
        tableHead.innerHTML = `
            <tr>
                <th>ID</th>
                <th>Slug</th>
                <th>Nombre</th>
            </tr>
        `;

        tableBody.innerHTML = filtered.map(cat => `
            <tr>
                <td>${cat.id}</td>
                <td><code>${escapeHTML(cat.slug)}</code></td>
                <td><strong>${escapeHTML(cat.nombre)}</strong></td>
            </tr>
        `).join('');
    } else if (currentView === 'suscripciones') {
        tableHead.innerHTML = `
            <tr>
                <th>Comercio</th>
                <th>Plan</th>
                <th>Inicio</th>
                <th>Vencimiento</th>
                <th>Estado</th>
                <th>Acciones</th>
            </tr>
        `;

        tableBody.innerHTML = filtered.map(s => `
            <tr>
                <td><strong>${escapeHTML(s.nombre_negocio)}</strong></td>
                <td><span class="badge-plan ${escapeHTML(s.plan_slug)}">${escapeHTML(s.plan_nombre)}</span></td>
                <td>${new Date(s.fecha_inicio).toLocaleDateString('es-AR')}</td>
                <td>${new Date(s.fecha_fin).toLocaleDateString('es-AR')}</td>
                <td><span class="badge-status ${s.estado}">${s.estado}</span></td>
                <td>
                    <button class="btn-primary-admin" style="padding: 0.4rem 0.8rem; font-size: 0.8rem;" onclick="openSubscriptionModal(${s.comercio_id})">Renovar</button>
                    ${s.estado === 'activa' ? `<button class="btn-logout" style="padding: 0.4rem 0.8rem; font-size: 0.8rem; margin-left: 0.4rem;" onclick="cancelarSuscripcion(${s.id})">Cancelar</button>` : ''}
                </td>
            </tr>
        `).join('');
    } else if (currentView === 'planes') {
        tableHead.innerHTML = `
            <tr>
                <th>Plan</th>
                <th>Periodicidad</th>
                <th>Precio</th>
                <th>Fotos máx.</th>
                <th>Ficha completa</th>
                <th>Estado</th>
                <th>Acciones</th>
            </tr>
        `;

        tableBody.innerHTML = filtered.map(p => `
            <tr>
                <td>
                    <div style="font-weight: 600;">${escapeHTML(p.nombre)}</div>
                    <div style="font-size: 0.8rem; color: var(--text-secondary);"><code>${escapeHTML(p.slug)}</code></div>
                </td>
                <td>${escapeHTML(p.periodicidad)}</td>
                <td>$${Number(p.precio).toLocaleString('es-AR')}</td>
                <td>${p.fotos_max}</td>
                <td>${p.acceso_ficha_completa ? '<span class="badge-status activo">Sí</span>' : '<span class="badge-status">No</span>'}</td>
                <td><span class="badge-status ${p.activo ? 'activo' : 'suspendido'}">${p.activo ? 'Activo' : 'Inactivo'}</span></td>
                <td>
                    <div style="display: flex; gap: 0.5rem;">
                        <button class="btn-primary-admin" style="padding: 0.4rem 0.8rem; font-size: 0.8rem; background: var(--bg-card); border: 1px solid var(--border-color);" onclick="openPlanModal(${p.id})">Editar</button>
                        <button class="btn-logout" style="padding: 0.4rem 0.8rem; font-size: 0.8rem;" onclick="eliminarPlan(${p.id})">Eliminar</button>
                    </div>
                </td>
            </tr>
        `).join('');
    } else if (currentView === 'localidades') {
        tableHead.innerHTML = `
            <tr>
                <th>ID</th>
                <th>Nombre</th>
                <th>Tipo</th>
                <th>Acciones</th>
            </tr>
        `;

        tableBody.innerHTML = filtered.map(l => `
            <tr>
                <td>${l.id}</td>
                <td><strong>${escapeHTML(l.nombre)}</strong></td>
                <td>${escapeHTML(l.tipo)}</td>
                <td>
                    <button class="btn-logout" style="padding: 0.4rem 0.8rem; font-size: 0.8rem;" onclick="deleteLocalidad(${l.id})">Eliminar</button>
                </td>
            </tr>
        `).join('');
    } else if (currentView === 'reclamos') {
        tableHead.innerHTML = `
            <tr>
                <th>Comercio</th>
                <th>Solicitante</th>
                <th>Contacto</th>
                <th>Fecha</th>
                <th>Estado</th>
                <th>Acciones</th>
            </tr>
        `;

        tableBody.innerHTML = filtered.map(r => `
            <tr>
                <td>
                    <div style="font-weight: 600;">${escapeHTML(r.nombre_negocio)}</div>
                    <div style="font-size: 0.8rem; color: var(--text-secondary);"><span class="badge-plan ${escapeHTML(r.plan)}">${escapeHTML(r.plan)}</span></div>
                </td>
                <td>${escapeHTML(r.nombre_solicitante)}</td>
                <td style="font-size: 0.85rem;">${escapeHTML(r.telefono_solicitante || '')} ${r.email_solicitante ? '<br>' + escapeHTML(r.email_solicitante) : ''}</td>
                <td>${new Date(r.fecha_creacion).toLocaleDateString('es-AR')}</td>
                <td><span class="badge-status ${r.estado === 'aprobado' ? 'activo' : (r.estado === 'rechazado' ? 'suspendido' : 'pendiente')}">${escapeHTML(r.estado)}</span></td>
                <td>
                    <button class="btn-primary-admin" style="padding: 0.4rem 0.8rem; font-size: 0.8rem; background: var(--bg-card); border: 1px solid var(--border-color);" onclick="abrirReclamoDetalle(${r.id})">Ver / Responder</button>
                </td>
            </tr>
        `).join('');
    } else if (currentView === 'estadisticas') {
        tableHead.innerHTML = `
            <tr>
                <th>Comercio</th>
                <th>Plan actual</th>
                <th>Contacto</th>
                <th>Intentos de contacto</th>
                <th>Acciones</th>
            </tr>
        `;

        tableBody.innerHTML = filtered.map(e => `
            <tr>
                <td><strong>${escapeHTML(e.nombre_negocio)}</strong></td>
                <td><span class="badge-plan ${escapeHTML(e.plan)}">${escapeHTML(e.plan)}</span></td>
                <td style="font-size: 0.85rem;">${escapeHTML(e.telefono || '')}<br>${escapeHTML(e.email_titular || '')}</td>
                <td><strong style="color: var(--primary, #e11d48);">${e.intentos_contacto}</strong></td>
                <td>
                    <button class="btn-primary-admin" style="padding: 0.4rem 0.8rem; font-size: 0.8rem; background: var(--bg-card); border: 1px solid var(--border-color);" onclick="copiarMensajeVenta(${e.comercio_id}, '${escapeHTML(e.nombre_negocio).replace(/'/g, "\\'")}', ${e.intentos_contacto})">Copiar mensaje de venta</button>
                </td>
            </tr>
        `).join('');
    }

    if (filtered.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: var(--text-secondary); padding: 3rem;">No se encontraron registros en el listado.</td></tr>`;
    }
}

// ----------------------------------------------------
// RECLAMOS DE PERFIL ("¿Sos el dueño? Reclamá tu perfil")
// ----------------------------------------------------

let reclamoActualId = null;

function abrirReclamoDetalle(id) {
    const r = listData.find(x => x.id == id);
    if (!r) return;
    reclamoActualId = id;

    document.getElementById('reclamoDetalle').innerHTML = `
        <div><strong>Comercio:</strong> ${escapeHTML(r.nombre_negocio)} (plan actual: ${escapeHTML(r.plan)})</div>
        <div><strong>Solicitante:</strong> ${escapeHTML(r.nombre_solicitante)}</div>
        <div><strong>Teléfono:</strong> ${escapeHTML(r.telefono_solicitante || 'N/A')}</div>
        <div><strong>Email:</strong> ${escapeHTML(r.email_solicitante || 'N/A')}</div>
        <div><strong>Mensaje:</strong> ${escapeHTML(r.mensaje || '(sin mensaje)')}</div>
        <div><strong>Estado actual:</strong> <span class="badge-status ${r.estado === 'aprobado' ? 'activo' : (r.estado === 'rechazado' ? 'suspendido' : 'pendiente')}">${escapeHTML(r.estado)}</span></div>
    `;
    document.getElementById('reclamoModal').classList.add('active');
}

function closeReclamoModal() {
    document.getElementById('reclamoModal').classList.remove('active');
    reclamoActualId = null;
}

async function responderReclamo(estado) {
    if (!reclamoActualId) return;
    try {
        const response = await fetch(`${API_URL}/admin/reclamos/${reclamoActualId}`, {
            method: 'PUT',
            headers: getHeaders(),
            body: JSON.stringify({ estado })
        });
        if (!response.ok) throw new Error('Error updating reclamo');
        closeReclamoModal();
        fetchData();
    } catch (error) {
        console.error(error);
        alert('Error al actualizar el reclamo.');
    }
}

// ----------------------------------------------------
// ESTADÍSTICAS - reporte de clics perdidos (gancho de venta para comercios gratuitos)
// ----------------------------------------------------

function descargarClicsPerdidosCSV() {
    const url = `${API_URL}/admin/estadisticas/clics-perdidos?format=csv`;
    fetch(url, { headers: getHeaders() })
        .then(res => res.blob())
        .then(blob => {
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'clics-perdidos.csv';
            a.click();
        })
        .catch(err => {
            console.error(err);
            alert('Error al descargar el reporte.');
        });
}

// Arma el mensaje de venta sugerido por el plan (sección 5.2) y lo copia al portapapeles,
// listo para pegar en WhatsApp/email al comerciante.
function copiarMensajeVenta(comercioId, nombreNegocio, intentos) {
    const mensaje = `Hola! Vimos que ${intentos} vecino${intentos === 1 ? '' : 's'} de Colón intentaron contactar a "${nombreNegocio}" esta semana a través de comerciantes.com.ar, pero tu ficha todavía no tiene el contacto directo activado. Activá tu plan Premium hoy para habilitar WhatsApp, mapa y catálogo, y no perder más ventas.`;
    navigator.clipboard.writeText(mensaje).then(() => {
        alert('Mensaje copiado al portapapeles.');
    }).catch(() => {
        prompt('Copiá el mensaje manualmente:', mensaje);
    });
}

// Delete commerce from table row
async function deleteCommerce(id) {
    if (!confirm('¿Estás seguro de que deseas eliminar este comercio permanentemente? Se borrarán sus datos asociados.')) return;

    try {
        const response = await fetch(`${API_URL}/admin/comercios/${id}`, {
            method: 'DELETE',
            headers: getHeaders()
        });

        if (!response.ok) throw new Error('Error deleting commerce');
        alert('Comercio eliminado con éxito.');
        fetchData();
    } catch (error) {
        console.error(error);
        alert('Error al eliminar.');
    }
}

// ----------------------------------------------------
// EDIT COMMERCE/SUBSCRIPTION MODAL OPERATIONS
// ----------------------------------------------------

async function openCommerceEdit(id) {
    const item = listData.find(c => c.id == id);
    if (!item) return;

    document.getElementById('editCommId').value = item.id;
    document.getElementById('commName').value = item.nombre_negocio;
    document.getElementById('commPhone').value = item.telefono;
    document.getElementById('commAddress').value = item.direccion;
    document.getElementById('commDesc').value = item.descripcion || '';

    document.getElementById('commIsAgro').checked = item.es_agrocomercio === 1;

    // Los planes del directorio se toman del catálogo real en `planes`,
    // la misma fuente que usa la vista de Suscripciones. Se espera a que termine de cargar
    // (y de poblar planesCache) antes de decidir si el showcase de productos va visible.
    await poblarPlanesComercio(item.plan);
    document.getElementById('commStatus').value = item.estado;

    document.getElementById('commLat').value = item.latitud || '';
    document.getElementById('commLng').value = item.longitud || '';
    document.getElementById('commHorarios').value = item.horarios || '';
    document.getElementById('commFacebook').value = item.facebook || '';
    document.getElementById('commSitioWeb').value = item.sitio_web || '';

    poblarLocalidades(item.localidad_id);
    cargarFotosComercio(item.id);
    renderHorariosEstructurados(item.horarios_json);
    poblarShowcaseComercio(item);

    document.getElementById('editCommerceModal').classList.add('active');
}

// ----------------------------------------------------
// HORARIO ESTRUCTURADO POR DÍA (badge "Abierto ahora / Cerrado" de la landing Premium)
// Índice del array = Date.getDay() en JS (0=domingo..6=sábado), para que el frontend público
// no tenga que convertir nada al calcular si está abierto con la hora local del dispositivo.
// ----------------------------------------------------

const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

function renderHorariosEstructurados(horariosJsonStr) {
    let horarios = [];
    try {
        horarios = horariosJsonStr ? JSON.parse(horariosJsonStr) : [];
    } catch (e) {
        horarios = [];
    }

    const cont = document.getElementById('commHorariosEstructurados');
    cont.innerHTML = DIAS_SEMANA.map((nombreDia, i) => {
        const d = horarios[i] || { cerrado: true, apertura: '', cierre: '' };
        return `
            <div style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem;" data-dia="${i}">
                <span style="width: 90px; flex-shrink: 0;">${nombreDia}</span>
                <label style="display: flex; align-items: center; gap: 0.3rem; flex-shrink: 0;">
                    <input type="checkbox" class="dia-cerrado" ${d.cerrado ? 'checked' : ''} onchange="this.closest('[data-dia]').querySelectorAll('.dia-hora').forEach(inp => inp.disabled = this.checked)">
                    Cerrado
                </label>
                <input type="time" class="form-input dia-hora dia-apertura" style="padding: 0.3rem; width: 110px;" value="${d.apertura || ''}" ${d.cerrado ? 'disabled' : ''}>
                <span>a</span>
                <input type="time" class="form-input dia-hora dia-cierre" style="padding: 0.3rem; width: 110px;" value="${d.cierre || ''}" ${d.cerrado ? 'disabled' : ''}>
            </div>
        `;
    }).join('');
}

function leerHorariosEstructurados() {
    const filas = document.querySelectorAll('#commHorariosEstructurados [data-dia]');
    const horarios = [];
    let algunoCargado = false;
    filas.forEach(fila => {
        const cerrado = fila.querySelector('.dia-cerrado').checked;
        const apertura = fila.querySelector('.dia-apertura').value;
        const cierre = fila.querySelector('.dia-cierre').value;
        if (cerrado || (apertura && cierre)) algunoCargado = true;
        horarios.push({ cerrado, apertura: apertura || null, cierre: cierre || null });
    });
    return algunoCargado ? JSON.stringify(horarios) : null;
}

// ----------------------------------------------------
// SHOWCASE DE PRODUCTOS/SERVICIOS Y TESTIMONIOS (dentro del modal de edición de comercio)
// ----------------------------------------------------

function poblarShowcaseComercio(item) {
    const plan = planesCache.find(p => p.slug === item.plan);
    const max = plan ? plan.productos_max : 0;

    const productosGroup = document.getElementById('commProductosGroup');
    const testimoniosGroup = document.getElementById('commTestimoniosGroup');

    document.getElementById('commProductosMax').textContent = max;
    productosGroup.style.display = max > 0 ? 'block' : 'none';
    testimoniosGroup.style.display = max > 0 ? 'block' : 'none';

    if (max > 0) {
        cargarProductosComercio(item.id);
        cargarTestimoniosComercio(item.id);
    }
}

async function cargarProductosComercio(comercioId) {
    const list = document.getElementById('commProductosList');
    list.innerHTML = '<p style="font-size: 0.8rem; color: var(--text-secondary);">Cargando productos...</p>';
    try {
        const response = await fetch(`${API_URL}/admin/comercios/${comercioId}/productos`, { headers: getHeaders() });
        const productos = await response.json();
        renderProductosComercio(productos);
    } catch (error) {
        console.error('Error loading productos:', error);
        list.innerHTML = '<p style="font-size: 0.8rem; color: var(--danger);">Error al cargar los productos.</p>';
    }
}

function renderProductosComercio(productos) {
    const list = document.getElementById('commProductosList');
    if (!productos.length) {
        list.innerHTML = '<p style="font-size: 0.8rem; color: var(--text-secondary);">Todavía no hay productos/servicios cargados.</p>';
        return;
    }
    list.innerHTML = productos.map(p => `
        <div style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.8rem;">
            ${p.foto_url ? `<img src="${escapeHTML(p.foto_url)}" alt="" style="width: 32px; height: 32px; object-fit: cover; border-radius: 4px; border: 1px solid var(--border-color);" onerror="this.style.opacity='0.3'">` : ''}
            <span style="flex: 1;">${escapeHTML(p.nombre)}${p.precio ? ' — $' + Number(p.precio).toLocaleString('es-AR') : ''}</span>
            <button type="button" class="btn-logout" style="padding: 0.2rem 0.5rem; font-size: 0.7rem;" onclick="eliminarProductoComercio(${p.id})">Eliminar</button>
        </div>
    `).join('');
}

async function agregarProductoComercio() {
    const comercioId = document.getElementById('editCommId').value;
    const nombre = document.getElementById('commNuevoProdNombre').value.trim();
    const precio = document.getElementById('commNuevoProdPrecio').value.trim();
    const foto_url = document.getElementById('commNuevoProdFoto').value.trim();
    if (!nombre) return;

    try {
        const response = await fetch(`${API_URL}/admin/comercios/${comercioId}/productos`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ nombre, precio: precio || undefined, foto_url: foto_url || undefined })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Error al agregar el producto');
        document.getElementById('commNuevoProdNombre').value = '';
        document.getElementById('commNuevoProdPrecio').value = '';
        document.getElementById('commNuevoProdFoto').value = '';
        cargarProductosComercio(comercioId);
    } catch (error) {
        console.error(error);
        alert(error.message || 'Error al agregar el producto.');
    }
}

async function eliminarProductoComercio(productoId) {
    const comercioId = document.getElementById('editCommId').value;
    if (!confirm('¿Eliminar este producto/servicio?')) return;
    try {
        await fetch(`${API_URL}/admin/comercios/${comercioId}/productos/${productoId}`, {
            method: 'DELETE',
            headers: getHeaders()
        });
        cargarProductosComercio(comercioId);
    } catch (error) {
        console.error(error);
    }
}

async function cargarTestimoniosComercio(comercioId) {
    const list = document.getElementById('commTestimoniosList');
    list.innerHTML = '<p style="font-size: 0.8rem; color: var(--text-secondary);">Cargando testimonios...</p>';
    try {
        const response = await fetch(`${API_URL}/admin/comercios/${comercioId}/testimonios`, { headers: getHeaders() });
        const testimonios = await response.json();
        renderTestimoniosComercio(testimonios);
    } catch (error) {
        console.error('Error loading testimonios:', error);
        list.innerHTML = '<p style="font-size: 0.8rem; color: var(--danger);">Error al cargar los testimonios.</p>';
    }
}

function renderTestimoniosComercio(testimonios) {
    const list = document.getElementById('commTestimoniosList');
    if (!testimonios.length) {
        list.innerHTML = '<p style="font-size: 0.8rem; color: var(--text-secondary);">Todavía no hay testimonios cargados.</p>';
        return;
    }
    list.innerHTML = testimonios.map(t => `
        <div style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.8rem;">
            <span style="flex: 1;"><strong>${escapeHTML(t.autor_nombre)}:</strong> "${escapeHTML(t.texto)}"</span>
            <button type="button" class="btn-primary-admin" style="padding: 0.2rem 0.5rem; font-size: 0.7rem; ${t.aprobado ? '' : 'background: var(--bg-card); border: 1px solid var(--border-color);'}" onclick="toggleAprobarTestimonio(${t.id}, ${t.aprobado ? 0 : 1})">${t.aprobado ? 'Aprobado ✓' : 'Aprobar'}</button>
            <button type="button" class="btn-logout" style="padding: 0.2rem 0.5rem; font-size: 0.7rem;" onclick="eliminarTestimonioComercio(${t.id})">Eliminar</button>
        </div>
    `).join('');
}

async function agregarTestimonioComercio() {
    const comercioId = document.getElementById('editCommId').value;
    const autor_nombre = document.getElementById('commNuevoTestiAutor').value.trim();
    const texto = document.getElementById('commNuevoTestiTexto').value.trim();
    if (!autor_nombre || !texto) return;

    try {
        const response = await fetch(`${API_URL}/admin/comercios/${comercioId}/testimonios`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ autor_nombre, texto })
        });
        if (!response.ok) throw new Error('Error adding testimonio');
        document.getElementById('commNuevoTestiAutor').value = '';
        document.getElementById('commNuevoTestiTexto').value = '';
        cargarTestimoniosComercio(comercioId);
    } catch (error) {
        console.error(error);
        alert('Error al agregar el testimonio.');
    }
}

async function toggleAprobarTestimonio(testimonioId, aprobado) {
    const comercioId = document.getElementById('editCommId').value;
    try {
        await fetch(`${API_URL}/admin/comercios/${comercioId}/testimonios/${testimonioId}`, {
            method: 'PUT',
            headers: getHeaders(),
            body: JSON.stringify({ aprobado })
        });
        cargarTestimoniosComercio(comercioId);
    } catch (error) {
        console.error(error);
    }
}

async function eliminarTestimonioComercio(testimonioId) {
    const comercioId = document.getElementById('editCommId').value;
    if (!confirm('¿Eliminar este testimonio?')) return;
    try {
        await fetch(`${API_URL}/admin/comercios/${comercioId}/testimonios/${testimonioId}`, {
            method: 'DELETE',
            headers: getHeaders()
        });
        cargarTestimoniosComercio(comercioId);
    } catch (error) {
        console.error(error);
    }
}

// ----------------------------------------------------
// LOCALIDADES (para el select del modal de comercio + vista propia)
// ----------------------------------------------------

let localidadesCache = [];
let planesCache = [];

async function poblarPlanesComercio(selectedSlug) {
    try {
        if (planesCache.length === 0) {
            const response = await fetch(`${API_URL}/admin/planes`, { headers: getHeaders() });
            if (response.ok) planesCache = await response.json();
        }
        const select = document.getElementById('commPlan');
        select.innerHTML = planesCache.map(p => `<option value="${p.slug}">${escapeHTML(p.nombre)}</option>`).join('');
        select.value = selectedSlug || '';
    } catch (error) {
        console.error('Error loading planes:', error);
    }
}

async function poblarLocalidades(selectedId) {
    try {
        if (localidadesCache.length === 0) {
            const response = await fetch(`${API_URL}/admin/localidades`, { headers: getHeaders() });
            if (response.ok) localidadesCache = await response.json();
        }
        const select = document.getElementById('commLocalidad');
        select.innerHTML = '<option value="">Sin especificar</option>' +
            localidadesCache.map(l => `<option value="${l.id}">${escapeHTML(l.nombre)}</option>`).join('');
        select.value = selectedId || '';
    } catch (error) {
        console.error('Error loading localidades:', error);
    }
}

function openLocalidadModal() {
    document.getElementById('localidadForm').reset();
    document.getElementById('localidadModal').classList.add('active');
}

function closeLocalidadModal() {
    document.getElementById('localidadModal').classList.remove('active');
}

document.getElementById('localidadForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nombre = document.getElementById('locNombre').value;
    const tipo = document.getElementById('locTipo').value;

    try {
        const response = await fetch(`${API_URL}/admin/localidades`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ nombre, tipo })
        });
        if (!response.ok) throw new Error('Error creating localidad');
        localidadesCache = []; // invalidate cache para que el modal de comercio la recargue
        closeLocalidadModal();
        alert('Localidad creada correctamente.');
        fetchData();
    } catch (error) {
        console.error(error);
        alert('Error al crear localidad. Puede que el nombre ya exista.');
    }
});

async function deleteLocalidad(id) {
    if (!confirm('¿Estás seguro de que deseas eliminar esta localidad?')) return;
    try {
        const response = await fetch(`${API_URL}/admin/localidades/${id}`, {
            method: 'DELETE',
            headers: getHeaders()
        });
        if (!response.ok) throw new Error('Error deleting localidad');
        localidadesCache = [];
        fetchData();
    } catch (error) {
        console.error(error);
        alert('Error al eliminar.');
    }
}

// ----------------------------------------------------
// GALERÍA DE FOTOS DEL COMERCIO (dentro del modal de edición)
// ----------------------------------------------------

async function cargarFotosComercio(comercioId) {
    const list = document.getElementById('commFotosList');
    list.innerHTML = '<p style="font-size: 0.8rem; color: var(--text-secondary);">Cargando fotos...</p>';
    try {
        const response = await fetch(`${API_URL}/admin/comercios/${comercioId}/fotos`, { headers: getHeaders() });
        const fotos = await response.json();
        renderFotosComercio(fotos);
    } catch (error) {
        console.error('Error loading fotos:', error);
        list.innerHTML = '<p style="font-size: 0.8rem; color: var(--danger);">Error al cargar las fotos.</p>';
    }
}

function renderFotosComercio(fotos) {
    const list = document.getElementById('commFotosList');
    if (!fotos.length) {
        list.innerHTML = '<p style="font-size: 0.8rem; color: var(--text-secondary);">Todavía no hay fotos cargadas.</p>';
        return;
    }
    list.innerHTML = fotos.map(f => `
        <div style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.8rem;">
            <img src="${escapeHTML(f.url)}" alt="" style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px; border: 1px solid var(--border-color);" onerror="this.style.opacity='0.3'">
            <span style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHTML(f.url)}</span>
            ${f.es_portada
                ? '<span class="badge-status activo">Portada</span>'
                : `<button type="button" class="btn-primary-admin" style="padding: 0.2rem 0.5rem; font-size: 0.7rem;" onclick="marcarFotoPortada(${f.id})">Portada</button>`}
            <button type="button" class="btn-logout" style="padding: 0.2rem 0.5rem; font-size: 0.7rem;" onclick="eliminarFotoComercio(${f.id})">Eliminar</button>
        </div>
    `).join('');
}

async function agregarFotoComercio() {
    const comercioId = document.getElementById('editCommId').value;
    const urlInput = document.getElementById('commNuevaFotoUrl');
    const url = urlInput.value.trim();
    if (!url) return;

    try {
        const response = await fetch(`${API_URL}/admin/comercios/${comercioId}/fotos`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ url })
        });
        if (!response.ok) throw new Error('Error adding photo');
        urlInput.value = '';
        cargarFotosComercio(comercioId);
    } catch (error) {
        console.error(error);
        alert('Error al agregar la foto.');
    }
}

async function marcarFotoPortada(fotoId) {
    const comercioId = document.getElementById('editCommId').value;
    try {
        await fetch(`${API_URL}/admin/comercios/${comercioId}/fotos/${fotoId}`, {
            method: 'PUT',
            headers: getHeaders()
        });
        cargarFotosComercio(comercioId);
    } catch (error) {
        console.error(error);
    }
}

async function eliminarFotoComercio(fotoId) {
    const comercioId = document.getElementById('editCommId').value;
    if (!confirm('¿Eliminar esta foto?')) return;
    try {
        await fetch(`${API_URL}/admin/comercios/${comercioId}/fotos/${fotoId}`, {
            method: 'DELETE',
            headers: getHeaders()
        });
        cargarFotosComercio(comercioId);
    } catch (error) {
        console.error(error);
    }
}

// ----------------------------------------------------
// SUSCRIPCIONES (alta y renovación manual)
// ----------------------------------------------------

async function openSubscriptionModal(preselectComercioId) {
    document.getElementById('subscriptionForm').reset();

    const comercioSelect = document.getElementById('subComercio');
    const planSelect = document.getElementById('subPlan');
    comercioSelect.innerHTML = '<option value="">Cargando...</option>';
    planSelect.innerHTML = '<option value="">Cargando...</option>';

    try {
        const [comerciosRes, planesRes] = await Promise.all([
            fetch(`${API_URL}/admin/comercios`, { headers: getHeaders() }),
            fetch(`${API_URL}/admin/planes`, { headers: getHeaders() })
        ]);
        const comercios = await comerciosRes.json();
        const planes = await planesRes.json();

        comercioSelect.innerHTML = '<option value="">Seleccionar comercio...</option>' +
            comercios.map(c => `<option value="${c.id}">${escapeHTML(c.nombre_negocio)}</option>`).join('');
        planSelect.innerHTML = '<option value="">Seleccionar plan...</option>' +
            planes.map(p => `<option value="${p.id}">${escapeHTML(p.nombre)} ($${Number(p.precio).toLocaleString('es-AR')})</option>`).join('');

        if (preselectComercioId) comercioSelect.value = preselectComercioId;
    } catch (error) {
        console.error('Error loading comercios/planes:', error);
    }

    document.getElementById('subFechaInicio').value = new Date().toISOString().substring(0, 10);
    document.getElementById('subscriptionModal').classList.add('active');
}

function closeSubscriptionModal() {
    document.getElementById('subscriptionModal').classList.remove('active');
}

// ----------------------------------------------------
// PLANES (catálogo de suscripción - crear, editar, eliminar)
// ----------------------------------------------------

function openPlanModal(id) {
    document.getElementById('planForm').reset();
    document.getElementById('editPlanId').value = '';
    document.getElementById('planModalTitulo').textContent = 'Nuevo Plan';
    document.getElementById('planSlug').disabled = false;
    document.getElementById('planActivo').checked = true;

    if (id) {
        const plan = listData.find(p => p.id == id);
        if (!plan) return;
        document.getElementById('editPlanId').value = plan.id;
        document.getElementById('planModalTitulo').textContent = `Editar Plan: ${plan.nombre}`;
        document.getElementById('planSlug').value = plan.slug;
        document.getElementById('planSlug').disabled = true; // el slug no se puede cambiar una vez creado
        document.getElementById('planNombre').value = plan.nombre;
        document.getElementById('planPeriodicidad').value = plan.periodicidad;
        document.getElementById('planPrecio').value = plan.precio;
        document.getElementById('planFotosMax').value = plan.fotos_max;
        document.getElementById('planPrioridad').value = plan.prioridad;
        document.getElementById('planConEstadisticas').checked = !!plan.con_estadisticas;
        document.getElementById('planAccesoFichaCompleta').checked = !!plan.acceso_ficha_completa;
        document.getElementById('planActivo').checked = !!plan.activo;
    }

    document.getElementById('planModal').classList.add('active');
}

function closePlanModal() {
    document.getElementById('planModal').classList.remove('active');
}

document.getElementById('planForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const editId = document.getElementById('editPlanId').value;
    const data = {
        slug: document.getElementById('planSlug').value.trim(),
        nombre: document.getElementById('planNombre').value,
        periodicidad: document.getElementById('planPeriodicidad').value,
        precio: parseFloat(document.getElementById('planPrecio').value) || 0,
        fotos_max: parseInt(document.getElementById('planFotosMax').value) || 0,
        prioridad: parseInt(document.getElementById('planPrioridad').value) || 0,
        con_estadisticas: document.getElementById('planConEstadisticas').checked,
        acceso_ficha_completa: document.getElementById('planAccesoFichaCompleta').checked,
        activo: document.getElementById('planActivo').checked
    };

    try {
        const response = await fetch(`${API_URL}/admin/planes${editId ? `/${editId}` : ''}`, {
            method: editId ? 'PUT' : 'POST',
            headers: getHeaders(),
            body: JSON.stringify(data)
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Error al guardar el plan');
        closePlanModal();
        alert('Plan guardado correctamente.');
        fetchData();
    } catch (error) {
        console.error(error);
        alert(error.message || 'Error al guardar el plan.');
    }
});

async function eliminarPlan(id) {
    if (!confirm('¿Eliminar este plan del catálogo? Esta acción no se puede deshacer.')) return;

    try {
        const response = await fetch(`${API_URL}/admin/planes/${id}`, {
            method: 'DELETE',
            headers: getHeaders()
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Error al eliminar el plan');
        alert('Plan eliminado correctamente.');
        fetchData();
    } catch (error) {
        console.error(error);
        if (error.message && error.message.includes('suscripci')) {
            if (confirm(`${error.message}\n\n¿Querés desactivarlo en cambio? (deja de ofrecerse para nuevas suscripciones, pero conserva el historial)`)) {
                try {
                    const plan = listData.find(p => p.id == id);
                    await fetch(`${API_URL}/admin/planes/${id}`, {
                        method: 'PUT',
                        headers: getHeaders(),
                        body: JSON.stringify({ ...plan, activo: false })
                    });
                    alert('Plan desactivado.');
                    fetchData();
                } catch (e2) {
                    alert('Error al desactivar el plan.');
                }
            }
        } else {
            alert(error.message || 'Error al eliminar el plan.');
        }
    }
}

async function cancelarSuscripcion(id) {
    if (!confirm('¿Cancelar esta suscripción? El comercio vuelve al plan gratuito (pierde la ficha completa y el contacto directo).')) return;

    try {
        const response = await fetch(`${API_URL}/admin/suscripciones/${id}`, {
            method: 'PUT',
            headers: getHeaders(),
            body: JSON.stringify({ estado: 'cancelada' })
        });
        if (!response.ok) throw new Error('Error cancelling subscription');
        alert('Suscripción cancelada. El comercio vuelve al plan gratuito.');
        fetchData();
    } catch (error) {
        console.error(error);
        alert('Error al cancelar la suscripción.');
    }
}

document.getElementById('subscriptionForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {
        comercio_id: parseInt(document.getElementById('subComercio').value),
        plan_id: parseInt(document.getElementById('subPlan').value),
        fecha_inicio: document.getElementById('subFechaInicio').value || undefined
    };

    try {
        const response = await fetch(`${API_URL}/admin/suscripciones`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(data)
        });
        if (!response.ok) throw new Error('Error creating subscription');
        closeSubscriptionModal();
        alert('Suscripción guardada correctamente.');
        fetchData();
    } catch (error) {
        console.error(error);
        alert('Error al guardar la suscripción.');
    }
});

function closeCommerceModal() {
    document.getElementById('editCommerceModal').classList.remove('active');
}

// Edit commerce form submit handler
document.getElementById('commerceForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('editCommId').value;

    const data = {
        nombre_negocio: document.getElementById('commName').value,
        telefono: document.getElementById('commPhone').value,
        direccion: document.getElementById('commAddress').value,
        descripcion: document.getElementById('commDesc').value,
        plan: document.getElementById('commPlan').value,
        estado: document.getElementById('commStatus').value,
        es_agrocomercio: document.getElementById('commIsAgro').checked ? 1 : 0,
        localidad_id: document.getElementById('commLocalidad').value ? parseInt(document.getElementById('commLocalidad').value) : null,
        latitud: document.getElementById('commLat').value || null,
        longitud: document.getElementById('commLng').value || null,
        horarios: document.getElementById('commHorarios').value,
        horarios_json: leerHorariosEstructurados(),
        facebook: document.getElementById('commFacebook').value,
        sitio_web: document.getElementById('commSitioWeb').value
    };

    try {
        const response = await fetch(`${API_URL}/admin/comercios/${id}`, {
            method: 'PUT',
            headers: getHeaders(),
            body: JSON.stringify(data)
        });

        if (!response.ok) throw new Error('Error updating commerce');
        closeCommerceModal();
        alert('Comercio actualizado correctamente.');
        fetchData();
    } catch (error) {
        console.error(error);
        alert('Error al guardar cambios.');
    }
});

// ----------------------------------------------------
// CREATE CATEGORY MODAL OPERATIONS
// ----------------------------------------------------

function openCategoryModal() {
    document.getElementById('categoryForm').reset();
    document.getElementById('categoryModal').classList.add('active');
}

function closeCategoryModal() {
    document.getElementById('categoryModal').classList.remove('active');
}

// Category form submit handler
document.getElementById('categoryForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const slug = document.getElementById('catSlug').value;
    const nombre = document.getElementById('catName').value;

    try {
        const response = await fetch(`${API_URL}/admin/categorias`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ slug, nombre })
        });

        if (!response.ok) throw new Error('Error creating category');
        closeCategoryModal();
        alert('Categoría creada correctamente.');
        fetchData();
    } catch (error) {
        console.error(error);
        alert('Error al crear categoría. Asegurá que el slug sea único.');
    }
});

// Helper to escape HTML tags to prevent XSS
function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, 
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
}

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    initView();
});
