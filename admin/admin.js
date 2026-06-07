const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname === ''
    ? 'http://localhost:3000/api'
    : '/api';

// Check auth token
function checkAuth() {
    const token = localStorage.getItem('adminToken');
    const path = window.location.pathname;
    
    // If not logged in and not on login page, redirect to index
    if (!token && !path.endsWith('index.html') && path.includes('/admin/')) {
        window.location.href = 'index.html';
        return false;
    }
    return true;
}

// Get standard auth headers
function getHeaders() {
    return {
        'Authorization': `Bearer ${localStorage.getItem('adminToken')}`,
        'Content-Type': 'application/json'
    };
}

// Handle login
function initLogin() {
    const loginForm = document.getElementById('loginForm');
    if (!loginForm) return;

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const emailInput = document.getElementById('email').value;
        const passwordInput = document.getElementById('password').value;
        const errorMsg = document.getElementById('errorMsg');
        
        if (errorMsg) errorMsg.style.display = 'none';

        try {
            const response = await fetch(`${API_URL}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: emailInput, password: passwordInput })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Error al iniciar sesión');
            }

            // Save session
            localStorage.setItem('adminToken', data.token);
            localStorage.setItem('adminEmail', data.user.email);
            
            // Reload page to show dashboard
            window.location.reload();
        } catch (error) {
            console.error('Login error:', error);
            if (errorMsg) {
                errorMsg.textContent = error.message;
                errorMsg.style.display = 'block';
            }
        }
    });
}

// Handle logout
function logout() {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminEmail');
    window.location.href = 'index.html';
}

// Fetch stats and populate overview cards
async function loadStats() {
    const token = localStorage.getItem('adminToken');
    if (!token) return;

    try {
        const response = await fetch(`${API_URL}/admin/stats`, {
            headers: getHeaders()
        });

        if (!response.ok) {
            if (response.status === 401 || response.status === 403) {
                logout(); // session expired or invalid
                return;
            }
            throw new Error('Error fetching stats');
        }

        const stats = await response.json();

        // Populate elements if they exist
        const valComercios = document.getElementById('val-comercios');
        const valAgro = document.getElementById('val-agro');
        const valPendientes = document.getElementById('val-pendientes');
        const valIngresos = document.getElementById('val-ingresos');
        const valVentasTotal = document.getElementById('val-ventas-total');
        const valTareas = document.getElementById('val-tareas');

        if (valComercios) valComercios.textContent = stats.totalComercios;
        if (valAgro) valAgro.textContent = stats.totalAgrocomercios;
        if (valPendientes) valPendientes.textContent = stats.pendingComercios;
        if (valIngresos) valIngresos.textContent = '$' + stats.monthlyRevenue.toLocaleString('es-AR');
        if (valVentasTotal) valVentasTotal.textContent = '$' + stats.totalSalesValue.toLocaleString('es-AR');
        if (valTareas) valTareas.textContent = stats.tasksPending;

        // Render recent pending registrations
        loadRecentPending();

    } catch (error) {
        console.error('Error loading dashboard stats:', error);
    }
}

// Fetch recent pending comercios to display on dashboard overview page
async function loadRecentPending() {
    const listContainer = document.getElementById('recent-pending-list');
    if (!listContainer) return;

    try {
        const response = await fetch(`${API_URL}/admin/comercios`, {
            headers: getHeaders()
        });
        const comercios = await response.json();
        
        const pending = comercios.filter(c => c.estado === 'pendiente').slice(0, 5);
        
        if (pending.length === 0) {
            listContainer.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-secondary);">No hay solicitudes pendientes</td></tr>';
            return;
        }

        listContainer.innerHTML = pending.map(c => `
            <tr>
                <td><strong>${c.nombre_negocio}</strong></td>
                <td>${c.nombre_titular}</td>
                <td><span class="badge-plan ${c.plan}">${c.plan}</span></td>
                <td>${new Date(c.fecha_registro).toLocaleDateString('es-AR')}</td>
                <td>
                    <button class="btn-primary-admin" onclick="quickApprove(${c.id})" style="padding: 0.35rem 0.75rem; font-size: 0.8rem;">Aprobar</button>
                </td>
            </tr>
        `).join('');

    } catch (error) {
        console.error('Error loading recent pending list:', error);
    }
}

// Quick approve commerce from overview dashboard page
async function quickApprove(id) {
    if (!confirm('¿Estás seguro de que deseas aprobar y activar este comercio?')) return;
    
    try {
        const response = await fetch(`${API_URL}/admin/comercios/${id}`, {
            method: 'PUT',
            headers: getHeaders(),
            body: JSON.stringify({ estado: 'activo' })
        });

        if (response.ok) {
            alert('Comercio aprobado con éxito.');
            loadStats();
        } else {
            alert('Error al aprobar el comercio.');
        }
    } catch (error) {
        console.error('Error in quickApprove:', error);
    }
}

// Toggle user sidebar profiles and headers info
function setupUserProfile() {
    const email = localStorage.getItem('adminEmail');
    const profileEmailEl = document.getElementById('user-email');
    const avatarEl = document.getElementById('user-avatar');
    
    if (profileEmailEl && email) {
        profileEmailEl.textContent = email;
    }
    if (avatarEl && email) {
        avatarEl.textContent = email.charAt(0).toUpperCase();
    }

    // Dynamic VendeMax sidebar menu item for main admin only
    const sidebarMenu = document.querySelector('.sidebar-menu');
    if (sidebarMenu && email === 'iamgustav.olivera@gmail.com') {
        if (!document.getElementById('menu-vendemax')) {
            const li = document.createElement('li');
            li.id = 'menu-vendemax';
            
            const params = new URLSearchParams(window.location.search);
            const view = params.get('view');
            if (view === 'vendemax') {
                li.classList.add('active');
                // Remove active class from other elements
                document.querySelectorAll('.sidebar-menu li').forEach(item => {
                    if (item !== li) item.classList.remove('active');
                });
            }
            
            li.innerHTML = `<a href="listados.html?view=vendemax"><span>🖥️</span> VendeMax</a>`;
            sidebarMenu.appendChild(li);
        }
    }
}

// Run on page load
document.addEventListener('DOMContentLoaded', () => {
    if (checkAuth()) {
        setupUserProfile();
        
        const loginForm = document.getElementById('loginForm');
        const adminDashboard = document.getElementById('adminDashboard');
        
        const token = localStorage.getItem('adminToken');
        
        if (token) {
            // Logged in: show dashboard structure, hide login form
            if (loginForm) loginForm.style.display = 'none';
            if (adminDashboard) adminDashboard.style.display = 'block';
            loadStats();
        } else {
            // Not logged in (on index.html): show login form, hide dashboard
            if (loginForm) loginForm.style.display = 'block';
            if (adminDashboard) adminDashboard.style.display = 'none';
            initLogin();
        }
    }
});
