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
        }

        // Apply status filter (only relevant to commerce)
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
    }

    if (filtered.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: var(--text-secondary); padding: 3rem;">No se encontraron registros en el listado.</td></tr>`;
    }
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
        alert('Error al eliminar comercio.');
    }
}

// ----------------------------------------------------
// EDIT COMMERCE MODAL OPERATIONS
// ----------------------------------------------------

function openCommerceEdit(id) {
    const item = listData.find(c => c.id == id);
    if (!item) return;

    document.getElementById('editCommId').value = item.id;
    document.getElementById('commName').value = item.nombre_negocio;
    document.getElementById('commPhone').value = item.telefono;
    document.getElementById('commAddress').value = item.direccion;
    document.getElementById('commDesc').value = item.descripcion || '';
    document.getElementById('commPlan').value = item.plan;
    document.getElementById('commStatus').value = item.estado;
    document.getElementById('commIsAgro').checked = item.es_agrocomercio === 1;

    document.getElementById('editCommerceModal').classList.add('active');
}

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
        es_agrocomercio: document.getElementById('commIsAgro').checked ? 1 : 0
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
        alert('Error al guardar cambios del comercio.');
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
