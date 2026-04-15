import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getAuth, 
    signInWithEmailAndPassword, 
    onAuthStateChanged, 
    signOut 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

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

// --- Elementos DOM ---
const loginEmail = document.getElementById('loginEmail');
const loginPassword = document.getElementById('loginPassword');
const loginError = document.getElementById('loginError');
const loginBtn = document.getElementById('loginBtn');
const loadingOverlay = document.getElementById('loadingOverlay');
const togglePasswordBtn = document.getElementById('togglePassword');
const themeToggle = document.getElementById('themeToggle');

// --- Controle de tema claro/escuro ---
function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') {
        document.body.classList.add('light-mode');
        themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
    } else {
        document.body.classList.remove('light-mode');
        themeToggle.innerHTML = '<i class="fas fa-moon"></i>';
    }
}

function toggleTheme() {
    if (document.body.classList.contains('light-mode')) {
        document.body.classList.remove('light-mode');
        localStorage.setItem('theme', 'dark');
        themeToggle.innerHTML = '<i class="fas fa-moon"></i>';
    } else {
        document.body.classList.add('light-mode');
        localStorage.setItem('theme', 'light');
        themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
    }
}

themeToggle.addEventListener('click', toggleTheme);
initTheme();

// --- Mostrar/ocultar senha ---
let passwordVisible = false;
togglePasswordBtn.addEventListener('click', () => {
    passwordVisible = !passwordVisible;
    if (passwordVisible) {
        loginPassword.type = 'text';
        togglePasswordBtn.innerHTML = '<i class="fas fa-eye"></i>';
    } else {
        loginPassword.type = 'password';
        togglePasswordBtn.innerHTML = '<i class="fas fa-eye-slash"></i>';
    }
});

// Helper loading
function setLoading(isLoading) {
    if (isLoading) loadingOverlay.classList.remove('hidden');
    else loadingOverlay.classList.add('hidden');
}

function showLoginError(msg) {
    loginError.textContent = msg;
    loginError.classList.remove('hidden');
    setTimeout(() => loginError.classList.add('hidden'), 4000);
}

// --- Login com e-mail/senha ---
loginBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    const email = loginEmail.value.trim();
    const password = loginPassword.value;

    if (!email || !password) {
        showLoginError('Preencha e-mail e senha.');
        return;
    }

    setLoading(true);
    try {
        await signInWithEmailAndPassword(auth, email, password);
        // O redirecionamento será feito no onAuthStateChanged
    } catch (error) {
        let msg = 'Erro ao entrar. ';
        switch (error.code) {
            case 'auth/invalid-email': msg = 'E-mail inválido.'; break;
            case 'auth/user-disabled': msg = 'Usuário desativado.'; break;
            case 'auth/user-not-found': msg = 'Usuário não encontrado.'; break;
            case 'auth/wrong-password': msg = 'Senha incorreta.'; break;
            default: msg = error.message;
        }
        showLoginError(msg);
    } finally {
        setLoading(false);
    }
});

// --- Observer de autenticação ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        // Redireciona para a página kanban.html
        window.location.href = 'kanban.html';
    }
    // Se não estiver logado, permanece na página de login (não faz nada)
});