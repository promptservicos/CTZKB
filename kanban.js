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
    orderBy 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Configuração do Firebase
const firebaseConfig = {
    apiKey: "AIzaSyCY1CffzfAdazxL1_SrDNFq0-cVXOr4jWQ",
    authDomain: "customizakb.firebaseapp.com",
    projectId: "customizakb",
    storageBucket: "customizakb.firebasestorage.app",
    messagingSenderId: "632125493513",
    appId: "1:632125493513:web:b00cb9196b8e74eb9a83d8",
    measurementId: "G-41TV2VHHH8"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Referência à coleção "employees" (será criada automaticamente)
const employeesCollection = collection(db, "employees");

// Definição dos departamentos e etapas (nomes atualizados)
const departments = {
    0: { 
        name: "Recrutamento", 
        icon: "fas fa-users", 
        stages: [
            "Formulário de dados",
            "Envio para CTZ",
            "Aprovação CTZ",
            "Aprovação CBI"
        ]
    },
    1: { 
        name: "Departamento Pessoal", 
        icon: "fas fa-file-alt", 
        stages: [
            "Recebimento de RP",
            "Receber Documentação",
            "Exame médico",
            "Assinatura de doc",
            "Envio CTZ DOC"
        ]
    },
    2: { 
        name: "Customiza", 
        icon: "fas fa-briefcase", 
        stages: [
            "Aprovação CTZ",
            "Integração CTZ"
        ]
    }
};

let employees = [];          // cache local
let unsubscribeSnapshot = null;
let currentConfirmCallback = null;

// DOM elements
const addBtn = document.getElementById('addEmployeeBtn');
const logoutBtn = document.getElementById('logoutKanbanBtn');
const themeToggle = document.getElementById('themeToggle');
const employeeModal = document.getElementById('employeeModal');
const confirmModal = document.getElementById('confirmModal');
const loadingOverlay = document.getElementById('loadingOverlay');
const employeeForm = document.getElementById('employeeForm');
const modalTitle = document.getElementById('modalTitle');
const editId = document.getElementById('editId');
const confirmMessageSpan = document.getElementById('confirmMessage');
const confirmYesBtn = document.getElementById('confirmYes');
const confirmNoBtn = document.getElementById('confirmNo');
const cancelModalBtn = document.getElementById('cancelModalBtn');
const modalClose = document.querySelector('.modal-close');
const kanbanBoard = document.getElementById('kanbanBoard');

// Máscara CPF
function applyCpfMask(value) {
    return value.replace(/\D/g, '')
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d{1,2})/, '$1-$2')
        .replace(/(-\d{2})\d+?$/, '$1');
}
function setupCpfMask(el) {
    el.addEventListener('input', (e) => {
        e.target.value = applyCpfMask(e.target.value);
    });
}
setupCpfMask(document.getElementById('empCpf'));

function setLoading(show) {
    if (show) loadingOverlay.classList.remove('hidden');
    else loadingOverlay.classList.add('hidden');
}

function formatDateTime(isoString) {
    if (!isoString) return '—';
    const d = new Date(isoString);
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

// ------------------- FIRESTORE OPERATIONS -------------------
async function addEmployeeToFirestore(employeeData) {
    const newId = Date.now().toString(); // ou use doc().id
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

// Inicializa o listener em tempo real
function subscribeToEmployees() {
    if (unsubscribeSnapshot) unsubscribeSnapshot();
    const q = query(employeesCollection);
    unsubscribeSnapshot = onSnapshot(q, (snapshot) => {
        employees = [];
        snapshot.forEach(doc => {
            employees.push(doc.data());
        });
        // Ordenar opcionalmente
        employees.sort((a,b) => a.id - b.id);
        renderAllCards();   // recria todos os cartões com os novos dados
    }, (error) => {
        console.error("Erro no Firestore:", error);
        showLoginError("Erro ao carregar dados. Verifique sua conexão.");
    });
}

// ------------------- RENDERIZAÇÃO DO BOARD -------------------
function renderBoard() {
    kanbanBoard.innerHTML = '';
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
                <div class="search-box">
                    <i class="fas fa-search"></i>
                    <input type="text" class="search-input" placeholder="Filtrar..." data-dept="${deptId}">
                </div>
                <select class="sort-select" data-dept="${deptId}">
                    <option value="nome_asc">A-Z</option>
                    <option value="nome_desc">Z-A</option>
                    <option value="criacao_asc">Data criação ↑</option>
                    <option value="criacao_desc">Data criação ↓</option>
                    <option value="polo_asc">Polo A-Z</option>
                    <option value="admissao_desc">Admissão ↑</option>
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
                <h3>${stageName}</h3>
                <span class="column-count" id="count-${deptId}-${stageIdx}">0</span>
            `;
            column.appendChild(colHeader);
            
            const cardsContainer = document.createElement('div');
            cardsContainer.className = 'cards-container';
            cardsContainer.id = `container-${deptId}-${stageIdx}`;
            column.appendChild(cardsContainer);
            
            columnsContainer.appendChild(column);
        });
        
        block.appendChild(columnsContainer);
        kanbanBoard.appendChild(block);
    }
    
    renderAllCards();  // preenche com os dados atuais de 'employees'
    attachEvents();
    attachDragAndDrop();
}

function getFilteredAndSorted(deptId, searchTerm, sortType) {
    let filtered = employees.filter(e => e.departamento === deptId);
    if (searchTerm) {
        const term = searchTerm.toLowerCase();
        filtered = filtered.filter(e =>
            e.nome.toLowerCase().includes(term) ||
            (e.cpf && e.cpf.includes(term)) ||
            (e.polo && e.polo.toLowerCase().includes(term))
        );
    }
    switch(sortType) {
        case 'nome_asc': filtered.sort((a,b) => a.nome.localeCompare(b.nome)); break;
        case 'nome_desc': filtered.sort((a,b) => b.nome.localeCompare(a.nome)); break;
        case 'criacao_asc': filtered.sort((a,b) => new Date(a.dataCriacao) - new Date(b.dataCriacao)); break;
        case 'criacao_desc': filtered.sort((a,b) => new Date(b.dataCriacao) - new Date(a.dataCriacao)); break;
        case 'polo_asc': filtered.sort((a,b) => (a.polo || '').localeCompare(b.polo || '')); break;
        case 'admissao_desc': filtered.sort((a,b) => (b.dataAdmissao || '').localeCompare(a.dataAdmissao || '')); break;
        default: filtered.sort((a,b) => a.nome.localeCompare(b.nome));
    }
    return filtered;
}

function renderAllCards() {
    // Limpar contadores e containers
    for (let deptId = 0; deptId <= 2; deptId++) {
        const stagesCount = departments[deptId].stages.length;
        for (let s = 0; s < stagesCount; s++) {
            const container = document.getElementById(`container-${deptId}-${s}`);
            if (container) container.innerHTML = '';
            const badge = document.getElementById(`count-${deptId}-${s}`);
            if (badge) badge.innerText = '0';
        }
    }
    
    for (let deptId = 0; deptId <= 2; deptId++) {
        const searchInput = document.querySelector(`.search-input[data-dept="${deptId}"]`);
        const sortSelect = document.querySelector(`.sort-select[data-dept="${deptId}"]`);
        const searchTerm = searchInput ? searchInput.value : '';
        const sortType = sortSelect ? sortSelect.value : 'nome_asc';
        const filteredList = getFilteredAndSorted(deptId, searchTerm, sortType);
        
        const grouped = {};
        filteredList.forEach(emp => {
            if (!grouped[emp.subEtapa]) grouped[emp.subEtapa] = [];
            grouped[emp.subEtapa].push(emp);
        });
        
        const stagesCount = departments[deptId].stages.length;
        for (let s = 0; s < stagesCount; s++) {
            const container = document.getElementById(`container-${deptId}-${s}`);
            const badge = document.getElementById(`count-${deptId}-${s}`);
            if (badge) badge.innerText = (grouped[s] || []).length;
            if (container && grouped[s]) {
                grouped[s].forEach(emp => {
                    const card = createCardElement(emp);
                    container.appendChild(card);
                });
            }
        }
    }
    attachDragAndDrop();
}

// Criação do cartão (igual, mas chama funções do Firestore nas ações)
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
    header.innerHTML = `
        <div class="card-info">
            <div class="card-nome">${escapeHtml(emp.nome)}</div>
            <div class="card-cpf">${emp.cpf || '—'}</div>
        </div>
        <div class="card-actions">
            <button class="move-btn move-left" ${!hasPrev ? 'disabled style="opacity:0.4;"' : ''}><i class="fas fa-arrow-left"></i></button>
            <button class="move-btn move-right" ${!hasNext ? 'disabled style="opacity:0.4;"' : ''}><i class="fas fa-arrow-right"></i></button>
            <button class="delete-card-btn"><i class="fas fa-trash-alt"></i></button>
            <button class="expand-btn"><i class="fas fa-chevron-down"></i></button>
        </div>
    `;
    cardDiv.appendChild(header);
    
    const details = document.createElement('div');
    details.className = 'card-details';
    details.innerHTML = `
        <div class="detail-row"><span class="detail-label">Polo</span><span class="detail-value">${escapeHtml(emp.polo || '—')}</span></div>
        <div class="detail-row"><span class="detail-label">Admissão</span><span class="detail-value">${emp.dataAdmissao || '—'}</span></div>
        <div class="detail-row"><span class="detail-label">Criado em</span><span class="detail-value">${formatDateTime(emp.dataCriacao)}</span></div>
        <div class="detail-row"><span class="detail-label">Última movimentação</span><span class="detail-value">${formatDateTime(emp.ultimaMovimentacao)}</span></div>
        <div class="edit-fields" style="display: none;">
            <input type="text" class="edit-nome" value="${escapeHtml(emp.nome)}">
            <input type="text" class="edit-cpf" value="${emp.cpf || ''}" maxlength="14">
            <input type="text" class="edit-polo" value="${escapeHtml(emp.polo || '')}">
            <input type="date" class="edit-admissao" value="${emp.dataAdmissao || ''}">
            <div class="edit-actions">
                <button class="btn-save-edit">Salvar</button>
                <button class="btn-cancel-edit">Cancelar</button>
            </div>
        </div>
        <button class="btn-edit-card">✎ Editar</button>
    `;
    cardDiv.appendChild(details);
    
    const editCpf = details.querySelector('.edit-cpf');
    if (editCpf) setupCpfMask(editCpf);
    
    // Eventos
    const expandBtn = header.querySelector('.expand-btn');
    expandBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        expanded = !expanded;
        if (expanded) cardDiv.classList.add('expanded');
        else cardDiv.classList.remove('expanded');
    });
    
    const moveLeft = header.querySelector('.move-left');
    const moveRight = header.querySelector('.move-right');
    
    if (moveLeft) moveLeft.addEventListener('click', (e) => {
        e.stopPropagation();
        let newDept = currentDept;
        let newStage = currentStage - 1;
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
        });
    });
    
    if (moveRight) moveRight.addEventListener('click', (e) => {
        e.stopPropagation();
        let newDept = currentDept;
        let newStage = currentStage + 1;
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
        });
    });
    
    const deleteBtn = header.querySelector('.delete-card-btn');
    deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        showConfirm(`Remover "${emp.nome}" permanentemente?`, async () => {
            await deleteEmployeeFromFirestore(emp.id);
        });
    });
    
    const editBtn = details.querySelector('.btn-edit-card');
    const editFieldsDiv = details.querySelector('.edit-fields');
    const saveEdit = editFieldsDiv.querySelector('.btn-save-edit');
    const cancelEdit = editFieldsDiv.querySelector('.btn-cancel-edit');
    
    editBtn.addEventListener('click', () => {
        editFieldsDiv.style.display = 'flex';
        editBtn.style.display = 'none';
        editFieldsDiv.querySelector('.edit-nome').value = emp.nome;
        editFieldsDiv.querySelector('.edit-cpf').value = emp.cpf || '';
        editFieldsDiv.querySelector('.edit-polo').value = emp.polo || '';
        editFieldsDiv.querySelector('.edit-admissao').value = emp.dataAdmissao || '';
    });
    
    saveEdit.addEventListener('click', async () => {
        const newNome = editFieldsDiv.querySelector('.edit-nome').value.trim();
        if (!newNome) return;
        emp.nome = newNome;
        emp.cpf = editFieldsDiv.querySelector('.edit-cpf').value;
        emp.polo = editFieldsDiv.querySelector('.edit-polo').value;
        emp.dataAdmissao = editFieldsDiv.querySelector('.edit-admissao').value;
        await updateEmployeeInFirestore(emp.id, emp);
    });
    
    cancelEdit.addEventListener('click', () => {
        editFieldsDiv.style.display = 'none';
        editBtn.style.display = 'block';
    });
    
    return cardDiv;
}

// Drag & drop global
function attachDragAndDrop() {
    const cards = document.querySelectorAll('.card');
    cards.forEach(card => {
        card.setAttribute('draggable', 'true');
        card.removeEventListener('dragstart', dragStart);
        card.removeEventListener('dragend', dragEnd);
        card.addEventListener('dragstart', dragStart);
        card.addEventListener('dragend', dragEnd);
    });
    const containers = document.querySelectorAll('.cards-container');
    containers.forEach(container => {
        container.removeEventListener('dragover', dragOver);
        container.removeEventListener('drop', drop);
        container.addEventListener('dragover', dragOver);
        container.addEventListener('drop', drop);
    });
}

let draggedId = null;
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
        });
    }
}

function attachEvents() {
    document.querySelectorAll('.search-input').forEach(input => {
        input.removeEventListener('input', renderAllCards);
        input.addEventListener('input', renderAllCards);
    });
    document.querySelectorAll('.sort-select').forEach(select => {
        select.removeEventListener('change', renderAllCards);
        select.addEventListener('change', renderAllCards);
    });
}

// Modal de adicionar/editar (sem departamento/etapa – sempre Recrutamento etapa 0)
function openEmployeeModal(employee = null) {
    if (employee) {
        modalTitle.innerText = 'Editar funcionário';
        editId.value = employee.id;
        document.getElementById('empNome').value = employee.nome;
        document.getElementById('empCpf').value = employee.cpf || '';
        document.getElementById('empPolo').value = employee.polo || '';
        document.getElementById('empAdmissao').value = employee.dataAdmissao || '';
    } else {
        modalTitle.innerText = 'Adicionar funcionário';
        editId.value = '';
        employeeForm.reset();
    }
    employeeModal.classList.remove('hidden');
}

employeeForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nome = document.getElementById('empNome').value.trim();
    if (!nome) return;
    let cpf = applyCpfMask(document.getElementById('empCpf').value);
    const polo = document.getElementById('empPolo').value;
    const admissao = document.getElementById('empAdmissao').value;
    const idEdit = editId.value;
    
    if (idEdit) {
        const idx = employees.findIndex(e => e.id == idEdit);
        if (idx !== -1) {
            const emp = employees[idx];
            emp.nome = nome;
            emp.cpf = cpf;
            emp.polo = polo;
            emp.dataAdmissao = admissao;
            await updateEmployeeInFirestore(emp.id, emp);
        }
    } else {
        const newEmployee = {
            id: Date.now().toString(),
            nome: nome,
            cpf: cpf,
            polo: polo,
            dataAdmissao: admissao,
            departamento: 0,
            subEtapa: 0,
            dataCriacao: new Date().toISOString(),
            ultimaMovimentacao: new Date().toISOString()
        };
        await addEmployeeToFirestore(newEmployee);
    }
    employeeModal.classList.add('hidden');
});

addBtn.addEventListener('click', () => openEmployeeModal());
cancelModalBtn.addEventListener('click', () => employeeModal.classList.add('hidden'));
modalClose?.addEventListener('click', () => employeeModal.classList.add('hidden'));

function showConfirm(msg, onConfirm) {
    confirmMessageSpan.innerText = msg;
    confirmModal.classList.remove('hidden');
    currentConfirmCallback = onConfirm;
}
confirmYesBtn.addEventListener('click', () => {
    confirmModal.classList.add('hidden');
    if (currentConfirmCallback) currentConfirmCallback();
    currentConfirmCallback = null;
});
confirmNoBtn.addEventListener('click', () => {
    confirmModal.classList.add('hidden');
    currentConfirmCallback = null;
});

// Tema claro/escuro
function initTheme() {
    const saved = localStorage.getItem('theme');
    if (saved === 'light') {
        document.body.classList.add('light-mode');
        themeToggle.innerHTML = '<i class="fas fa-sun"></i> Tema';
    } else {
        themeToggle.innerHTML = '<i class="fas fa-moon"></i> Tema';
    }
}
themeToggle.addEventListener('click', () => {
    document.body.classList.toggle('light-mode');
    const isLight = document.body.classList.contains('light-mode');
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
    themeToggle.innerHTML = isLight ? '<i class="fas fa-sun"></i> Tema' : '<i class="fas fa-moon"></i> Tema';
});

// Autenticação e inicialização
function checkAuth() {
    setLoading(true);
    onAuthStateChanged(auth, (user) => {
        setLoading(false);
        if (!user) {
            window.location.href = 'index.html';
        } else {
            // Usuário logado: monta o board e escuta o Firestore
            renderBoard();
            subscribeToEmployees(); // começa a escutar mudanças
        }
    });
}

logoutBtn.addEventListener('click', async () => {
    setLoading(true);
    await signOut(auth);
    if (unsubscribeSnapshot) unsubscribeSnapshot();
    window.location.href = 'index.html';
});

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;');
}

// Inicialização
initTheme();
checkAuth();