let tasks = [];
let merchants = [];

// Drag and drop event handlers
function allowDrop(ev) {
    ev.preventDefault();
}

function drag(ev, id) {
    ev.dataTransfer.setData("text/plain", id);
    document.getElementById(`task-card-${id}`).classList.add('dragging');
}

async function drop(ev, columnState) {
    ev.preventDefault();
    const id = ev.dataTransfer.getData("text/plain");
    const draggedCard = document.getElementById(`task-card-${id}`);
    if (draggedCard) draggedCard.classList.remove('dragging');

    // Find the task in memory
    const taskIndex = tasks.findIndex(t => t.id == id);
    if (taskIndex !== -1 && tasks[taskIndex].estado !== columnState) {
        const previousState = tasks[taskIndex].estado;
        
        // Optimistic UI update
        tasks[taskIndex].estado = columnState;
        renderTasks();

        try {
            const response = await fetch(`${API_URL}/admin/tareas/${id}`, {
                method: 'PUT',
                headers: getHeaders(),
                body: JSON.stringify({ estado: columnState })
            });

            if (!response.ok) {
                throw new Error('Error updating task state on the server');
            }
            
            console.log(`Task ${id} moved to ${columnState}`);
        } catch (error) {
            console.error(error);
            alert('Error al mover la tarea en el servidor. Revirtiendo...');
            // Rollback optimistic update
            tasks[taskIndex].estado = previousState;
            renderTasks();
        }
    }
}

// Load tasks from API
async function loadTasks() {
    try {
        const response = await fetch(`${API_URL}/admin/tareas`, {
            headers: getHeaders()
        });
        if (!response.ok) throw new Error('Error fetching tasks');
        tasks = await response.json();
        renderTasks();
    } catch (error) {
        console.error(error);
    }
}

// Load merchants list for dropdown select in modal
async function loadMerchants() {
    try {
        const response = await fetch(`${API_URL}/admin/comercios`, {
            headers: getHeaders()
        });
        if (!response.ok) throw new Error('Error fetching merchants');
        merchants = await response.json();
        
        const select = document.getElementById('taskCommerceInput');
        if (select) {
            select.innerHTML = '<option value="">Ninguno</option>' + 
                merchants.map(m => `<option value="${m.id}">${m.nombre_negocio}</option>`).join('');
        }
    } catch (error) {
        console.error(error);
    }
}

// Render task cards in columns
function renderTasks() {
    const todoCards = document.getElementById('todo-cards');
    const inprogressCards = document.getElementById('inprogress-cards');
    const doneCards = document.getElementById('done-cards');

    if (!todoCards || !inprogressCards || !doneCards) return;

    // Reset column contents
    todoCards.innerHTML = '';
    inprogressCards.innerHTML = '';
    doneCards.innerHTML = '';

    let todoCount = 0;
    let inprogressCount = 0;
    let doneCount = 0;

    tasks.forEach(task => {
        const deadlineText = task.fecha_limite 
            ? new Date(task.fecha_limite).toLocaleDateString('es-AR') 
            : 'Sin fecha';
            
        const cardHtml = `
            <div class="kanban-card" id="task-card-${task.id}" draggable="true" ondragstart="drag(event, ${task.id})" ondragend="this.classList.remove('dragging')">
                <span class="card-header-badge ${task.prioridad}">${task.prioridad}</span>
                <h4>${escapeHTML(task.titulo)}</h4>
                <p>${escapeHTML(task.descripcion || 'Sin descripción.')}</p>
                <div class="card-footer">
                    <span class="card-owner">${task.comercio_nombre ? escapeHTML(task.comercio_nombre) : 'Interno'}</span>
                    <span style="color: var(--text-secondary);">📅 ${deadlineText}</span>
                </div>
                <div style="position: absolute; top: 1rem; right: 1rem;" class="card-actions">
                    <button class="card-btn" onclick="openEditModal(${task.id})" title="Editar">✏️</button>
                    <button class="card-btn delete" onclick="deleteTask(${task.id})" title="Eliminar">🗑️</button>
                </div>
            </div>
        `;

        if (task.estado === 'todo') {
            todoCards.innerHTML += cardHtml;
            todoCount++;
        } else if (task.estado === 'in_progress') {
            inprogressCards.innerHTML += cardHtml;
            inprogressCount++;
        } else if (task.estado === 'done') {
            doneCards.innerHTML += cardHtml;
            doneCount++;
        }
    });

    // Update column badge counters
    document.getElementById('count-todo').textContent = todoCount;
    document.getElementById('count-inprogress').textContent = inprogressCount;
    document.getElementById('count-done').textContent = doneCount;
}

// Modal open helper for creating tasks
function openCreateModal() {
    document.getElementById('modalTitle').textContent = 'Nueva Tarea';
    document.getElementById('taskId').value = '';
    document.getElementById('taskForm').reset();
    document.getElementById('taskModal').classList.add('active');
}

// Modal open helper for editing tasks
function openEditModal(id) {
    const task = tasks.find(t => t.id == id);
    if (!task) return;

    document.getElementById('modalTitle').textContent = 'Editar Tarea';
    document.getElementById('taskId').value = task.id;
    document.getElementById('taskTitleInput').value = task.titulo;
    document.getElementById('taskDescInput').value = task.descripcion || '';
    document.getElementById('taskPriorityInput').value = task.prioridad;
    document.getElementById('taskCommerceInput').value = task.comercio_id || '';
    
    if (task.fecha_limite) {
        // format ISO string to yyyy-MM-dd
        const date = new Date(task.fecha_limite);
        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');
        document.getElementById('taskDeadlineInput').value = `${yyyy}-${mm}-${dd}`;
    } else {
        document.getElementById('taskDeadlineInput').value = '';
    }

    document.getElementById('taskModal').classList.add('active');
}

// Close Modal
function closeModal() {
    document.getElementById('taskModal').classList.remove('active');
}

// Form submit: Create or Update Task
document.getElementById('taskForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const id = document.getElementById('taskId').value;
    const title = document.getElementById('taskTitleInput').value;
    const description = document.getElementById('taskDescInput').value;
    const priority = document.getElementById('taskPriorityInput').value;
    const commerceId = document.getElementById('taskCommerceInput').value;
    const deadline = document.getElementById('taskDeadlineInput').value;

    const data = {
        titulo: title,
        descripcion: description,
        prioridad: priority,
        comercio_id: commerceId ? parseInt(commerceId) : null,
        fecha_limite: deadline ? new Date(deadline).toISOString() : null
    };

    try {
        let response;
        if (id) {
            // Update
            response = await fetch(`${API_URL}/admin/tareas/${id}`, {
                method: 'PUT',
                headers: getHeaders(),
                body: JSON.stringify(data)
            });
        } else {
            // Create
            response = await fetch(`${API_URL}/admin/tareas`, {
                method: 'POST',
                headers: getHeaders(),
                body: JSON.stringify({ ...data, estado: 'todo' })
            });
        }

        if (!response.ok) throw new Error('Error saving task');
        
        closeModal();
        loadTasks();
    } catch (error) {
        console.error(error);
        alert('Ocurrió un error al guardar la tarea.');
    }
});

// Delete task
async function deleteTask(id) {
    if (!confirm('¿Estás seguro de que deseas eliminar esta tarea permanentemente?')) return;

    try {
        const response = await fetch(`${API_URL}/admin/tareas/${id}`, {
            method: 'DELETE',
            headers: getHeaders()
        });

        if (!response.ok) throw new Error('Error deleting task');
        loadTasks();
    } catch (error) {
        console.error(error);
        alert('Error al eliminar la tarea.');
    }
}

// Helper to escape HTML tags to prevent XSS
function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, 
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
}

// Initial loads
document.addEventListener('DOMContentLoaded', () => {
    loadTasks();
    loadMerchants();
});
