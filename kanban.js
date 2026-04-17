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
    query 
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
    1: { name: "Departamento Pessoal", icon: "fas fa-file-alt", stages: ["Recebimento de RP", "Receber Documentação", "Exame médico", "Assinatura de doc", "Envio CTZ DOC"] },
    2: { name: "Customiza", icon: "fas fa-briefcase", stages: ["Aprovação CTZ", "Integração CTZ"] }
};

let employees = [];
let unsubscribeSnapshot = null;
let currentConfirmCallback = null;

// ---------- Controle de permissão (somente leitura para um e-mail específico) ----------
let isViewOnly = false; // será definido após login

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

function setLoading(show) {
    if (show) loadingOverlay.classList.remove('hidden');
    else loadingOverlay.classList.add('hidden');
}

function showError(msg) {
    alert(msg);
    console.error(msg);
}

function formatDateTime(isoString) {
    if (!isoString) return '—';
    const d = new Date(isoString);
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

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
        employees = [];
        snapshot.forEach(doc => employees.push(doc.data()));
        employees.sort((a,b) => a.id - b.id);
        renderAllCards();
    }, (error) => {
        console.error("Erro no Firestore:", error);
        showError("Erro ao carregar dados. Verifique as regras do Firestore.");
    });
}

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
                    <option value="admissao_asc">Admissão ↑ (mais antigo)</option>
                    <option value="admissao_desc" selected>Admissão ↓ (mais recente)</option>
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
            colHeader.innerHTML = `<h3>${stageName}</h3><span class="column-count" id="count-${deptId}-${stageIdx}">0</span>`;
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
    renderAllCards();
    attachEvents();
    attachDragAndDrop();
}

function getFilteredAndSorted(deptId, searchTerm, sortType) {
    let filtered = employees.filter(e => e.departamento === deptId);
    if (searchTerm) {
        const term = searchTerm.toLowerCase();
        filtered = filtered.filter(e => e.nome.toLowerCase().includes(term) || (e.polo && e.polo.toLowerCase().includes(term)));
    }
    switch(sortType) {
        case 'nome_asc': filtered.sort((a,b) => a.nome.localeCompare(b.nome)); break;
        case 'nome_desc': filtered.sort((a,b) => b.nome.localeCompare(a.nome)); break;
        case 'criacao_asc': filtered.sort((a,b) => new Date(a.dataCriacao) - new Date(b.dataCriacao)); break;
        case 'criacao_desc': filtered.sort((a,b) => new Date(b.dataCriacao) - new Date(a.dataCriacao)); break;
        case 'polo_asc': filtered.sort((a,b) => (a.polo || '').localeCompare(b.polo || '')); break;
        case 'admissao_asc': filtered.sort((a,b) => (a.dataAdmissao || '').localeCompare(b.dataAdmissao || '')); break;
        case 'admissao_desc': filtered.sort((a,b) => (b.dataAdmissao || '').localeCompare(a.dataAdmissao || '')); break;
        default: filtered.sort((a,b) => a.nome.localeCompare(b.nome));
    }
    return filtered;
}

function renderAllCards() {
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
        const sortType = sortSelect ? sortSelect.value : 'admissao_desc';
        const filteredList = getFilteredAndSorted(deptId, searchTerm, sortType);
        const grouped = {};
        filteredList.forEach(emp => { if (!grouped[emp.subEtapa]) grouped[emp.subEtapa] = []; grouped[emp.subEtapa].push(emp); });
        const stagesCount = departments[deptId].stages.length;
        for (let s = 0; s < stagesCount; s++) {
            const container = document.getElementById(`container-${deptId}-${s}`);
            const badge = document.getElementById(`count-${deptId}-${s}`);
            if (badge) badge.innerText = (grouped[s] || []).length;
            if (container && grouped[s]) grouped[s].forEach(emp => container.appendChild(createCardElement(emp)));
        }
    }
    attachDragAndDrop();
}

// Cria o cartão com ou sem botões de ação, dependendo de isViewOnly
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
    
    // Parte fixa: nome do funcionário
    let buttonsHtml = '';
    if (!isViewOnly) {
        // Usuário normal: botões de mover, excluir e expandir (expandir é permitido)
        buttonsHtml = `
            <div class="card-actions-row">
                <button class="move-btn move-left" ${!hasPrev ? 'disabled style="opacity:0.4;"' : ''}><i class="fas fa-arrow-left"></i></button>
                <button class="move-btn move-right" ${!hasNext ? 'disabled style="opacity:0.4;"' : ''}><i class="fas fa-arrow-right"></i></button>
                <button class="delete-card-btn"><i class="fas fa-trash-alt"></i></button>
                <button class="expand-btn"><i class="fas fa-chevron-down"></i></button>
            </div>
        `;
    } else {
        // Usuário restrito: apenas o botão de expandir (visualizar detalhes)
        buttonsHtml = `
            <div class="card-actions-row">
                <button class="expand-btn"><i class="fas fa-chevron-down"></i></button>
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

    // Detalhes do cartão (sempre visíveis após expandir)
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

    // Se NÃO for usuário restrito, adiciona os campos de edição e o botão "Editar"
    if (!isViewOnly) {
        const editDiv = document.createElement('div');
        editDiv.className = 'edit-fields';
        editDiv.style.display = 'none';
        editDiv.innerHTML = `
            <input type="text" class="edit-nome" value="${escapeHtml(emp.nome)}">
            <input type="text" class="edit-polo" value="${escapeHtml(emp.polo || '')}">
            <input type="date" class="edit-admissao" value="${emp.dataAdmissao || ''}">
            <select class="edit-turno">
                <option value="">Selecione</option>
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
        editButton.textContent = '✎ Editar';
        details.appendChild(editButton);
        
        // Lógica de edição inline
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
        });
        cancelEdit.addEventListener('click', () => {
            editFieldsDiv.style.display = 'none';
            editButton.style.display = 'block';
        });
    }
    
    cardDiv.appendChild(details);

    // Evento do botão expandir/colapsar
    const expandBtn = header.querySelector('.expand-btn');
    expandBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        expanded = !expanded;
        if (expanded) cardDiv.classList.add('expanded');
        else cardDiv.classList.remove('expanded');
    });

    // Se não for restrito, adiciona eventos de mover e excluir
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
                });
            });
        }
        if (deleteBtn) {
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                showConfirm(`Remover "${emp.nome}" permanentemente?`, async () => await deleteEmployeeFromFirestore(emp.id));
            });
        }
    }

    return cardDiv;
}

// Drag and drop somente para usuários com permissão
function attachDragAndDrop() {
    if (isViewOnly) return; // usuário restrito: nada de arrastar
    
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

function openEmployeeModal(employee = null) {
    if (isViewOnly) return; // usuário restrito não pode abrir modal de adicionar/editar
    
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
        modalTitle.innerText = 'Adicionar funcionário';
        editId.value = '';
        employeeForm.reset();
        document.getElementById('empAdmissao').value = '';
    }
    employeeModal.classList.remove('hidden');
}

employeeForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (isViewOnly) return; // segurança extra
    
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
        }
    } else {
        const newEmployee = {
            id: Date.now().toString(),
            nome, polo, dataAdmissao: admissao, turno, inicioExpediente: inicio, fimExpediente: fim,
            departamento: 0, subEtapa: 0,
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

function checkAuth() {
    setLoading(true);
    onAuthStateChanged(auth, (user) => {
        setLoading(false);
        if (!user) {
            window.location.href = 'index.html';
        } else {
            // Define permissão baseada no e-mail
            isViewOnly = (user.email === "ctz@promptservicos.com.br");
            
            // Esconde/desabilita o botão "Novo Funcionário" se for somente leitura
            if (isViewOnly) {
                addBtn.style.display = 'none';
            } else {
                addBtn.style.display = 'flex';
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

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;');
}

initTheme();
checkAuth();