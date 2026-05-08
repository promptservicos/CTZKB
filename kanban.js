import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getAuth, 
    onAuthStateChanged, 
    signOut 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
    getFirestore, 
    collection, 
    doc, 
    setDoc, 
    deleteDoc, 
    onSnapshot, 
    query,
    limit
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyCY1CffzfAdazxL1_SrDNFq0-cVXOr4jWQ",
    authDomain: "customizakb.firebaseapp.com",
    projectId: "customizakb",
    storageBucket: "customizakb.firebasestorage.app",
    messagingSenderId: "632125493513",
    appId: "1:632125493513:web:b00cb9196b8e74eb9a83d8",
    measurementId: "G-41TV2VHHH8"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const employeesCollection = collection(db, "employees");

const departments = {
    0: { name: "Recrutamento", icon: "fas fa-users", stages: ["Formulário de dados", "Envio para CTZ", "Aprovação CTZ", "Aprovação CBI"] },
    1: { name: "Departamento Pessoal", icon: "fas fa-file-alt", stages: ["Recebimento de RP", "Receber Documentação", "Exame médico", "Aguardando Aprovação", "Assinatura de doc", "Envio CTZ DOC"] },
    2: { name: "Customiza", icon: "fas fa-briefcase", stages: ["Aprovação CTZ", "Integração CTZ"] }
};

// Cache para elementos DOM
const domCache = {
    containers: new Map(),
    badges: new Map(),
    searchInputs: [],
    sortSelects: []
};

let employees = [];
let unsubscribeSnapshot = null;
let currentConfirmCallback = null;
let isViewOnly = false;
let renderScheduled = false;
let pendingRender = false;

// DOM elements
const addBtn = document.getElementById('addEmployeeBtn');
const logoutBtn = document.getElementById('logoutKanbanBtn');
const themeToggle = document.getElementById('themeToggle');
const themeToggleFab = document.getElementById('themeToggleFab');
const employeeModal = document.getElementById('employeeModal');
const confirmModal = document.getElementById('confirmModal');
const loadingOverlay = document.getElementById('loadingOverlay');
const loadingText = document.querySelector('.loading-text');
const employeeForm = document.getElementById('employeeForm');
const modalTitle = document.getElementById('modalTitle');
const editId = document.getElementById('editId');
const confirmMessageSpan = document.getElementById('confirmMessage');
const confirmYesBtn = document.getElementById('confirmYes');
const confirmNoBtn = document.getElementById('confirmNo');
const cancelModalBtn = document.getElementById('cancelModalBtn');
const modalCloseBtn = document.querySelector('.modal-close-btn');
const kanbanBoard = document.getElementById('kanbanBoard');

// ========== UTILITÁRIOS ==========
function setLoading(show, message = 'Carregando...') {
    if (show) {
        loadingText.textContent = message;
        loadingOverlay.classList.remove('hidden');
    } else {
        loadingOverlay.classList.add('hidden');
    }
}

function showError(msg) {
    alert(msg);
    console.error(msg);
}

let toastTimeout = null;
function showTemporaryMessage(msg, type = 'info') {
    // Remove toast existente
    const existingToast = document.querySelector('.toast-message');
    if (existingToast) {
        existingToast.remove();
        if (toastTimeout) clearTimeout(toastTimeout);
    }
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `toast-message toast-${type}`;
    messageDiv.innerHTML = `
        <i class='bx ${type === 'success' ? 'bx-check-circle' : type === 'error' ? 'bx-error-circle' : 'bx-info-circle'}'></i>
        <span>${msg}</span>
    `;
    
    document.body.appendChild(messageDiv);
    
    toastTimeout = setTimeout(() => {
        if (messageDiv.parentNode) {
            messageDiv.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => messageDiv.remove(), 300);
        }
        toastTimeout = null;
    }, 3000);
}

function formatDateTime(isoString) {
    if (!isoString) return '—';
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '—';
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;');
}

// ========== FIREBASE OPERATIONS ==========
async function addEmployeeToFirestore(employeeData) {
    const newId = Date.now().toString();
    const docRef = doc(employeesCollection, newId);
    await setDoc(docRef, { ...employeeData, id: newId });
}

async function updateEmployeeInFirestore(id, updatedData) {
    const docRef = doc(employeesCollection, id);
    await setDoc(docRef, updatedData, { merge: true });
}

async function deleteEmployeeFromFirestore(id) {
    const docRef = doc(employeesCollection, id);
    await deleteDoc(docRef);
}

function subscribeToEmployees() {
    if (unsubscribeSnapshot) unsubscribeSnapshot();
    const q = query(employeesCollection);
    unsubscribeSnapshot = onSnapshot(q, (snapshot) => {
        const newEmployees = [];
        snapshot.forEach(doc => newEmployees.push(doc.data()));
        newEmployees.sort((a,b) => a.id - b.id);
        employees = newEmployees;
        
        // Renderização otimizada com requestAnimationFrame
        if (!renderScheduled) {
            renderScheduled = true;
            requestAnimationFrame(() => {
                renderAllCards();
                renderScheduled = false;
            });
        }
    }, (error) => {
        console.error("Erro no Firestore:", error);
        showError("Erro ao carregar dados.");
    });
}

// ========== FILTROS E ORDENAÇÃO OTIMIZADOS ==========
const sortComparators = {
    nome_asc: (a, b) => a.nome.localeCompare(b.nome),
    nome_desc: (a, b) => b.nome.localeCompare(a.nome),
    criacao_asc: (a, b) => new Date(a.dataCriacao) - new Date(b.dataCriacao),
    criacao_desc: (a, b) => new Date(b.dataCriacao) - new Date(a.dataCriacao),
    polo_asc: (a, b) => (a.polo || '').localeCompare(b.polo || ''),
    admissao_asc: (a, b) => (a.dataAdmissao || '').localeCompare(b.dataAdmissao || ''),
    admissao_desc: (a, b) => (b.dataAdmissao || '').localeCompare(a.dataAdmissao || '')
};

function getFilteredAndSorted(deptId, searchTerm, sortType) {
    let filtered = employees;
    const lowerSearchTerm = searchTerm ? searchTerm.toLowerCase() : '';
    
    if (lowerSearchTerm) {
        filtered = [];
        for (let i = 0; i < employees.length; i++) {
            const e = employees[i];
            if (e.departamento === deptId && 
                (e.nome.toLowerCase().includes(lowerSearchTerm) || 
                 (e.polo && e.polo.toLowerCase().includes(lowerSearchTerm)))) {
                filtered.push(e);
            }
        }
    } else {
        filtered = [];
        for (let i = 0; i < employees.length; i++) {
            if (employees[i].departamento === deptId) {
                filtered.push(employees[i]);
            }
        }
    }
    
    const comparator = sortComparators[sortType];
    if (comparator) {
        filtered.sort(comparator);
    }
    
    return filtered;
}

// ========== RENDERIZAÇÃO OTIMIZADA ==========
function renderBoard() {
    kanbanBoard.innerHTML = '';
    domCache.containers.clear();
    domCache.badges.clear();
    
    for (let deptId = 0; deptId <= 2; deptId++) {
        const dept = departments[deptId];
        const block = document.createElement('div');
        block.className = 'department-block';
        block.dataset.department = deptId;
        
        const header = document.createElement('div');
        header.className = 'department-header';
        header.innerHTML = `
            <div class="dept-title">
                <i class="${dept.icon}"></i>
                <h2>${dept.name}</h2>
            </div>
            <div class="department-controls">
                <div class="dept-search-box">
                    <i class='bx bx-search'></i>
                    <input type="text" class="dept-search-input" placeholder="Buscar..." data-dept="${deptId}">
                </div>
                <select class="dept-sort-select" data-dept="${deptId}">
                    <option value="nome_asc">Nome A-Z</option>
                    <option value="nome_desc">Nome Z-A</option>
                    <option value="criacao_asc">Criação ↑</option>
                    <option value="criacao_desc">Criação ↓</option>
                    <option value="polo_asc">Polo A-Z</option>
                    <option value="admissao_asc">Admissão ↑</option>
                    <option value="admissao_desc" selected>Admissão ↓</option>
                </select>
            </div>
        `;
        block.appendChild(header);
        
        const columnsContainer = document.createElement('div');
        columnsContainer.className = 'columns-container';
        
        dept.stages.forEach((stageName, stageIdx) => {
            const column = document.createElement('div');
            column.className = 'kanban-column';
            column.dataset.dept = deptId;
            column.dataset.substage = stageIdx;
            
            const colHeader = document.createElement('div');
            colHeader.className = 'column-header';
            colHeader.innerHTML = `
                <h3 title="${stageName}">${stageName}</h3>
                <span class="column-count" id="count-${deptId}-${stageIdx}">0</span>
            `;
            column.appendChild(colHeader);
            
            const cardsContainer = document.createElement('div');
            cardsContainer.className = 'cards-container';
            cardsContainer.id = `container-${deptId}-${stageIdx}`;
            column.appendChild(cardsContainer);
            columnsContainer.appendChild(column);
            
            // Cache dos containers
            domCache.containers.set(`container-${deptId}-${stageIdx}`, cardsContainer);
            domCache.badges.set(`count-${deptId}-${stageIdx}`, colHeader.querySelector('.column-count'));
        });
        
        block.appendChild(columnsContainer);
        kanbanBoard.appendChild(block);
    }
    
    attachEvents();
    renderAllCards();
}

function renderAllCards() {
    // Limpar containers usando cache
    for (let [id, container] of domCache.containers) {
        container.innerHTML = '';
    }
    
    for (let [id, badge] of domCache.badges) {
        badge.innerText = '0';
    }
    
    // Buscar valores atuais dos filtros
    const searchValues = {};
    const sortValues = {};
    
    document.querySelectorAll('.dept-search-input').forEach(input => {
        searchValues[input.dataset.dept] = input.value;
    });
    document.querySelectorAll('.dept-sort-select').forEach(select => {
        sortValues[select.dataset.dept] = select.value;
    });
    
    // Renderizar cada departamento
    for (let deptId = 0; deptId <= 2; deptId++) {
        const searchTerm = searchValues[deptId] || '';
        const sortType = sortValues[deptId] || 'admissao_desc';
        
        const filteredList = getFilteredAndSorted(deptId, searchTerm, sortType);
        
        // Agrupar por etapa
        const grouped = {};
        for (let i = 0; i < filteredList.length; i++) {
            const emp = filteredList[i];
            const stage = emp.subEtapa !== undefined ? emp.subEtapa : 0;
            if (!grouped[stage]) grouped[stage] = [];
            grouped[stage].push(emp);
        }
        
        // Atualizar badges e containers
        const stagesCount = departments[deptId].stages.length;
        for (let s = 0; s < stagesCount; s++) {
            const badge = domCache.badges.get(`count-${deptId}-${s}`);
            if (badge) badge.innerText = (grouped[s] || []).length;
            
            const container = domCache.containers.get(`container-${deptId}-${s}`);
            if (container && grouped[s]) {
                const fragment = document.createDocumentFragment();
                for (let i = 0; i < grouped[s].length; i++) {
                    fragment.appendChild(createCardElement(grouped[s][i]));
                }
                container.appendChild(fragment);
            }
        }
    }
    
    attachDragAndDrop();
}

// Template de card para reutilização
function createCardElement(emp) {
    const cardDiv = document.createElement('div');
    cardDiv.className = 'card';
    cardDiv.dataset.id = emp.id;
    let expanded = false;
    
    const currentDept = emp.departamento;
    const currentStage = emp.subEtapa;
    const hasPrev = !(currentDept === 0 && currentStage === 0);
    const hasNext = !(currentDept === 2 && currentStage === departments[2].stages.length - 1);

    const header = document.createElement('div');
    header.className = 'card-header';
    
    let buttonsHtml = '';
    if (!isViewOnly) {
        buttonsHtml = `
            <div class="card-actions-row">
                <button class="move-btn move-left" ${!hasPrev ? 'disabled' : ''}><i class='bx bx-chevron-left'></i></button>
                <button class="move-btn move-right" ${!hasNext ? 'disabled' : ''}><i class='bx bx-chevron-right'></i></button>
                <button class="delete-card-btn"><i class='bx bx-trash-alt'></i></button>
                <button class="expand-btn"><i class='bx bx-chevron-down'></i></button>
            </div>
        `;
    } else {
        buttonsHtml = `
            <div class="card-actions-row">
                <button class="expand-btn"><i class='bx bx-chevron-down'></i></button>
            </div>
        `;
    }
    
    header.innerHTML = `
        <div class="card-info">
            <div class="card-nome">${escapeHtml(emp.nome)}</div>
        </div>
        ${buttonsHtml}
    `;
    cardDiv.appendChild(header);

    const details = document.createElement('div');
    details.className = 'card-details';
    details.innerHTML = `
        <div class="detail-row"><span class="detail-label">Polo</span><span class="detail-value">${escapeHtml(emp.polo || '—')}</span></div>
        <div class="detail-row"><span class="detail-label">Admissão</span><span class="detail-value">${emp.dataAdmissao || '—'}</span></div>
        <div class="detail-row"><span class="detail-label">Turno</span><span class="detail-value">${emp.turno || '—'}</span></div>
        <div class="detail-row"><span class="detail-label">Expediente</span><span class="detail-value">${emp.inicioExpediente || '—'} às ${emp.fimExpediente || '—'}</span></div>
        <div class="detail-row"><span class="detail-label">Criado em</span><span class="detail-value">${formatDateTime(emp.dataCriacao)}</span></div>
        <div class="detail-row"><span class="detail-label">Última movimentação</span><span class="detail-value">${formatDateTime(emp.ultimaMovimentacao)}</span></div>
    `;

    if (!isViewOnly) {
        const editDiv = document.createElement('div');
        editDiv.className = 'edit-fields';
        editDiv.style.display = 'none';
        editDiv.innerHTML = `
            <input type="text" class="edit-nome" placeholder="Nome" value="${escapeHtml(emp.nome)}">
            <input type="text" class="edit-polo" placeholder="Polo" value="${escapeHtml(emp.polo || '')}">
            <input type="date" class="edit-admissao" value="${emp.dataAdmissao || ''}">
            <select class="edit-turno">
                <option value="">Selecione turno</option>
                <option value="Manhã" ${emp.turno === 'Manhã' ? 'selected' : ''}>Manhã</option>
                <option value="Tarde" ${emp.turno === 'Tarde' ? 'selected' : ''}>Tarde</option>
                <option value="Noite" ${emp.turno === 'Noite' ? 'selected' : ''}>Noite</option>
                <option value="Integral" ${emp.turno === 'Integral' ? 'selected' : ''}>Integral</option>
            </select>
            <input type="time" class="edit-inicio" value="${emp.inicioExpediente || ''}" placeholder="Início">
            <input type="time" class="edit-fim" value="${emp.fimExpediente || ''}" placeholder="Término">
            <div class="edit-actions">
                <button class="btn-save-edit">Salvar</button>
                <button class="btn-cancel-edit">Cancelar</button>
            </div>
        `;
        details.appendChild(editDiv);
        
        const editButton = document.createElement('button');
        editButton.className = 'btn-edit-card';
        editButton.innerHTML = '<i class="bx bx-info-circle"></i> Informações';
        details.appendChild(editButton);
        
        const editFieldsDiv = editDiv;
        const saveEdit = editFieldsDiv.querySelector('.btn-save-edit');
        const cancelEdit = editFieldsDiv.querySelector('.btn-cancel-edit');
        
        editButton.addEventListener('click', () => {
            editFieldsDiv.style.display = 'flex';
            editButton.style.display = 'none';
        });
        
        saveEdit.addEventListener('click', async () => {
            const newNome = editFieldsDiv.querySelector('.edit-nome').value.trim();
            if (!newNome) return;
            emp.nome = newNome;
            emp.polo = editFieldsDiv.querySelector('.edit-polo').value;
            emp.dataAdmissao = editFieldsDiv.querySelector('.edit-admissao').value;
            emp.turno = editFieldsDiv.querySelector('.edit-turno').value;
            emp.inicioExpediente = editFieldsDiv.querySelector('.edit-inicio').value;
            emp.fimExpediente = editFieldsDiv.querySelector('.edit-fim').value;
            await updateEmployeeInFirestore(emp.id, emp);
            showTemporaryMessage('Funcionário atualizado!', 'success');
        });
        
        cancelEdit.addEventListener('click', () => {
            editFieldsDiv.style.display = 'none';
            editButton.style.display = 'block';
        });
    }
    
    cardDiv.appendChild(details);

    const expandBtn = header.querySelector('.expand-btn');
    expandBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        expanded = !expanded;
        if (expanded) cardDiv.classList.add('expanded');
        else cardDiv.classList.remove('expanded');
    });

    if (!isViewOnly) {
        const moveLeft = header.querySelector('.move-left');
        const moveRight = header.querySelector('.move-right');
        const deleteBtn = header.querySelector('.delete-card-btn');
        
        if (moveLeft) {
            moveLeft.addEventListener('click', (e) => {
                e.stopPropagation();
                let newDept = currentDept, newStage = currentStage - 1;
                if (newStage < 0) {
                    if (currentDept > 0) {
                        newDept = currentDept - 1;
                        newStage = departments[newDept].stages.length - 1;
                    } else return;
                }
                const targetStageName = departments[newDept].stages[newStage];
                showConfirm(`Mover "${emp.nome}" para ${departments[newDept].name} → ${targetStageName}?`, async () => {
                    emp.departamento = newDept;
                    emp.subEtapa = newStage;
                    emp.ultimaMovimentacao = new Date().toISOString();
                    await updateEmployeeInFirestore(emp.id, emp);
                    showTemporaryMessage(`Movido para: ${departments[newDept].name} - ${targetStageName}`, 'success');
                });
            });
        }
        if (moveRight) {
            moveRight.addEventListener('click', (e) => {
                e.stopPropagation();
                let newDept = currentDept, newStage = currentStage + 1;
                if (newStage >= departments[currentDept].stages.length) {
                    if (currentDept < 2) {
                        newDept = currentDept + 1;
                        newStage = 0;
                    } else return;
                }
                const targetStageName = departments[newDept].stages[newStage];
                showConfirm(`Mover "${emp.nome}" para ${departments[newDept].name} → ${targetStageName}?`, async () => {
                    emp.departamento = newDept;
                    emp.subEtapa = newStage;
                    emp.ultimaMovimentacao = new Date().toISOString();
                    await updateEmployeeInFirestore(emp.id, emp);
                    showTemporaryMessage(`Movido para: ${departments[newDept].name} - ${targetStageName}`, 'success');
                });
            });
        }
        if (deleteBtn) {
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                showConfirm(`Remover "${emp.nome}" permanentemente?`, async () => {
                    await deleteEmployeeFromFirestore(emp.id);
                    showTemporaryMessage('Funcionário removido!', 'success');
                });
            });
        }
    }

    return cardDiv;
}

// ========== DRAG AND DROP OTIMIZADO ==========
let draggedId = null;
let dragEnabled = true;

function attachDragAndDrop() {
    if (isViewOnly || !dragEnabled) return;
    
    const cards = document.querySelectorAll('.card');
    for (let i = 0; i < cards.length; i++) {
        const card = cards[i];
        card.setAttribute('draggable', 'true');
    }
    
    const containers = document.querySelectorAll('.cards-container');
    for (let i = 0; i < containers.length; i++) {
        const container = containers[i];
        container.addEventListener('dragover', dragOver);
        container.addEventListener('drop', drop);
    }
}

function dragStart(e) {
    draggedId = e.target.closest('.card').dataset.id;
    e.dataTransfer.setData('text/plain', draggedId);
}

function dragEnd() { draggedId = null; }

function dragOver(e) { e.preventDefault(); }

function drop(e) {
    e.preventDefault();
    const targetContainer = e.target.closest('.cards-container');
    if (!targetContainer) return;
    const column = targetContainer.closest('.kanban-column');
    const targetDept = parseInt(column.dataset.dept);
    const targetSub = parseInt(column.dataset.substage);
    const emp = employees.find(e => e.id == draggedId);
    
    if (emp && (emp.departamento !== targetDept || emp.subEtapa !== targetSub)) {
        const targetStageName = departments[targetDept].stages[targetSub];
        showConfirm(`Mover "${emp.nome}" para ${departments[targetDept].name} → ${targetStageName}?`, async () => {
            emp.departamento = targetDept;
            emp.subEtapa = targetSub;
            emp.ultimaMovimentacao = new Date().toISOString();
            await updateEmployeeInFirestore(emp.id, emp);
            showTemporaryMessage(`Movido para: ${departments[targetDept].name} - ${targetStageName}`, 'success');
        });
    }
}

// ========== EVENTOS OTIMIZADOS (com debounce) ==========
let debounceTimeout = null;

function attachEvents() {
    // Debounce para inputs de busca
    const searchInputs = document.querySelectorAll('.dept-search-input');
    searchInputs.forEach(input => {
        input.removeEventListener('input', handleSearchInput);
        input.addEventListener('input', handleSearchInput);
    });
    
    const sortSelects = document.querySelectorAll('.dept-sort-select');
    sortSelects.forEach(select => {
        select.removeEventListener('change', handleSortChange);
        select.addEventListener('change', handleSortChange);
    });
}

function handleSearchInput() {
    if (debounceTimeout) clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
        renderAllCards();
        debounceTimeout = null;
    }, 150);
}

function handleSortChange() {
    renderAllCards();
}

// ========== MODAL ==========
function openEmployeeModal(employee = null) {
    if (isViewOnly) return;
    
    if (employee) {
        modalTitle.innerText = 'Editar funcionário';
        editId.value = employee.id;
        document.getElementById('empNome').value = employee.nome;
        document.getElementById('empPolo').value = employee.polo || '';
        document.getElementById('empAdmissao').value = employee.dataAdmissao || '';
        document.getElementById('empTurno').value = employee.turno || '';
        document.getElementById('empInicio').value = employee.inicioExpediente || '';
        document.getElementById('empFim').value = employee.fimExpediente || '';
    } else {
        modalTitle.innerText = 'Novo Funcionário';
        editId.value = '';
        employeeForm.reset();
    }
    employeeModal.style.display = 'flex';
}

employeeForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (isViewOnly) return;
    
    const nome = document.getElementById('empNome').value.trim();
    if (!nome) return;
    const polo = document.getElementById('empPolo').value;
    const admissao = document.getElementById('empAdmissao').value;
    const turno = document.getElementById('empTurno').value;
    const inicio = document.getElementById('empInicio').value;
    const fim = document.getElementById('empFim').value;
    const idEdit = editId.value;
    
    if (idEdit) {
        const idx = employees.findIndex(e => e.id == idEdit);
        if (idx !== -1) {
            const emp = employees[idx];
            emp.nome = nome;
            emp.polo = polo;
            emp.dataAdmissao = admissao;
            emp.turno = turno;
            emp.inicioExpediente = inicio;
            emp.fimExpediente = fim;
            await updateEmployeeInFirestore(emp.id, emp);
            showTemporaryMessage('Funcionário atualizado!', 'success');
        }
    } else {
        const newEmployee = {
            id: Date.now().toString(),
            nome, polo, dataAdmissao: admissao, turno, 
            inicioExpediente: inicio, fimExpediente: fim,
            departamento: 0, subEtapa: 0,
            dataCriacao: new Date().toISOString(),
            ultimaMovimentacao: new Date().toISOString()
        };
        await addEmployeeToFirestore(newEmployee);
        showTemporaryMessage('Funcionário adicionado!', 'success');
    }
    employeeModal.style.display = 'none';
});

addBtn.addEventListener('click', () => openEmployeeModal());
cancelModalBtn.addEventListener('click', () => employeeModal.style.display = 'none');
modalCloseBtn?.addEventListener('click', () => employeeModal.style.display = 'none');

// ========== CONFIRMAÇÃO ==========
function showConfirm(msg, onConfirm) {
    confirmMessageSpan.innerText = msg;
    confirmModal.style.display = 'flex';
    currentConfirmCallback = onConfirm;
}

confirmYesBtn.addEventListener('click', () => {
    confirmModal.style.display = 'none';
    if (currentConfirmCallback) currentConfirmCallback();
    currentConfirmCallback = null;
});

confirmNoBtn.addEventListener('click', () => {
    confirmModal.style.display = 'none';
    currentConfirmCallback = null;
});

window.addEventListener('click', (e) => {
    if (e.target === confirmModal) confirmModal.style.display = 'none';
    if (e.target === employeeModal) employeeModal.style.display = 'none';
});

// ========== EXPORTAR EXCEL ==========
document.getElementById('exportExcelBtn').addEventListener('click', () => {
    try {
        let allFilteredEmployees = [];
        
        for (let deptId = 0; deptId <= 2; deptId++) {
            const searchInput = document.querySelector(`.dept-search-input[data-dept="${deptId}"]`);
            const sortSelect = document.querySelector(`.dept-sort-select[data-dept="${deptId}"]`);
            const searchTerm = searchInput ? searchInput.value : '';
            const sortType = sortSelect ? sortSelect.value : 'admissao_desc';
            const filtered = getFilteredAndSorted(deptId, searchTerm, sortType);
            allFilteredEmployees.push(...filtered);
        }
        
        if (allFilteredEmployees.length === 0) {
            alert("Nenhum funcionário para exportar.");
            return;
        }
        
        const worksheetData = [
            ["Nome", "Etapa (progresso)", "Polo", "Data Admissão", "Turno", "Início Expediente", "Fim Expediente", "Data Criação", "Última Movimentação"]
        ];
        
        for (let i = 0; i < allFilteredEmployees.length; i++) {
            const emp = allFilteredEmployees[i];
            const deptName = departments[emp.departamento]?.name || "Desconhecido";
            const stageName = departments[emp.departamento]?.stages[emp.subEtapa] || "Etapa inválida";
            let globalStage = 0;
            if (emp.departamento === 0) globalStage = emp.subEtapa + 1;
            else if (emp.departamento === 1) globalStage = 4 + emp.subEtapa + 1;
            else globalStage = 10 + emp.subEtapa + 1;
            const stageWithProgress = `${deptName} - ${stageName} (${globalStage}/12)`;
            
            worksheetData.push([
                emp.nome || "",
                stageWithProgress,
                emp.polo || "",
                emp.dataAdmissao || "",
                emp.turno || "",
                emp.inicioExpediente || "",
                emp.fimExpediente || "",
                formatDateTime(emp.dataCriacao),
                formatDateTime(emp.ultimaMovimentacao)
            ]);
        }
        
        const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Customiza Kanban");
        
        worksheet['!cols'] = [
            {wch:25}, {wch:35}, {wch:15}, {wch:12}, {wch:10}, {wch:12}, {wch:12}, {wch:18}, {wch:18}
        ];
        
        const fileName = `customiza_kanban_${new Date().toISOString().slice(0,19).replace(/:/g, '-')}.xlsx`;
        XLSX.writeFile(workbook, fileName);
        showTemporaryMessage('Exportação concluída!', 'success');
    } catch (error) {
        console.error("Erro ao exportar Excel:", error);
        alert("Falha ao gerar o arquivo Excel.");
    }
});

// ========== TEMA ==========
function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    const themeIcon = themeToggle?.querySelector('i');
    const fabIcon = themeToggleFab?.querySelector('i');
    
    if (savedTheme === 'dark') {
        document.body.classList.add('dark');
        if (themeIcon) {
            themeIcon.classList.remove('bx-moon');
            themeIcon.classList.add('bx-sun');
        }
        if (fabIcon) {
            fabIcon.classList.remove('bx-moon');
            fabIcon.classList.add('bx-sun');
        }
        if (themeToggle) themeToggle.innerHTML = '<i class="bx bx-sun"></i> Tema';
    } else {
        document.body.classList.remove('dark');
        if (themeIcon) {
            themeIcon.classList.remove('bx-sun');
            themeIcon.classList.add('bx-moon');
        }
        if (fabIcon) {
            fabIcon.classList.remove('bx-sun');
            fabIcon.classList.add('bx-moon');
        }
        if (themeToggle) themeToggle.innerHTML = '<i class="bx bx-moon"></i> Tema';
    }
}

function toggleTheme() {
    document.body.classList.toggle('dark');
    const isDark = document.body.classList.contains('dark');
    const themeIcon = themeToggle?.querySelector('i');
    const fabIcon = themeToggleFab?.querySelector('i');
    
    if (isDark) {
        if (themeIcon) {
            themeIcon.classList.remove('bx-moon');
            themeIcon.classList.add('bx-sun');
        }
        if (fabIcon) {
            fabIcon.classList.remove('bx-moon');
            fabIcon.classList.add('bx-sun');
        }
        if (themeToggle) themeToggle.innerHTML = '<i class="bx bx-sun"></i> Tema';
        localStorage.setItem('theme', 'dark');
    } else {
        if (themeIcon) {
            themeIcon.classList.remove('bx-sun');
            themeIcon.classList.add('bx-moon');
        }
        if (fabIcon) {
            fabIcon.classList.remove('bx-sun');
            fabIcon.classList.add('bx-moon');
        }
        if (themeToggle) themeToggle.innerHTML = '<i class="bx bx-moon"></i> Tema';
        localStorage.setItem('theme', 'light');
    }
}

themeToggle?.addEventListener('click', toggleTheme);
themeToggleFab?.addEventListener('click', toggleTheme);

// ========== AUTH ==========
function checkAuth() {
    setLoading(true);
    onAuthStateChanged(auth, (user) => {
        setLoading(false);
        if (!user) {
            window.location.href = 'index.html';
        } else {
            isViewOnly = (user.email === "ctz@promptservicos.com.br");
            if (addBtn) {
                addBtn.style.display = isViewOnly ? 'none' : 'flex';
            }
            renderBoard();
            subscribeToEmployees();
        }
    });
}

logoutBtn.addEventListener('click', async () => {
    setLoading(true);
    await signOut(auth);
    if (unsubscribeSnapshot) unsubscribeSnapshot();
    window.location.href = 'index.html';
});

// ========== INICIALIZAÇÃO ==========
initTheme();
checkAuth();