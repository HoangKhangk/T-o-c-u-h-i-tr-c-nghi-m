// API đã khai báo trong script.js
let currentUser = null;

// ─── INIT ────────────────────────────────────────────
async function initAuth() {
    try {
        const res = await fetch(`${API}/users.php`, { credentials: 'include' });
        const json = await res.json();
        if (json.success) setUser(json.data);
        else clearUser();
    } catch (e) {
        clearUser();
    }
}

// ─── UI STATE ────────────────────────────────────────
function setUser(user) {
    currentUser = user;
    document.getElementById('btn-login').style.display    = 'none';
    document.getElementById('user-menu').style.display    = 'flex';
    document.getElementById('user-initial').textContent   = user.username[0].toUpperCase();
    document.getElementById('user-dropdown-name').textContent  = user.username;
    document.getElementById('user-dropdown-email').textContent = user.email;
    lucide.createIcons();
}

function clearUser() {
    currentUser = null;
    document.getElementById('btn-login').style.display  = 'inline-flex';
    document.getElementById('user-menu').style.display  = 'none';
    lucide.createIcons();
}

// ─── MODAL ───────────────────────────────────────────
function openAuthModal(tab = 'login') {
    switchAuthTab(tab);
    document.getElementById('authModal').classList.add('open');
    lucide.createIcons();
    setTimeout(() => {
        const el = tab === 'login'
            ? document.getElementById('login-email')
            : document.getElementById('reg-username');
        el?.focus();
    }, 100);
}

function closeAuthModal() {
    document.getElementById('authModal').classList.remove('open');
    clearAuthErrors();
}

function switchAuthTab(tab) {
    const isLogin = tab === 'login';
    document.getElementById('tab-login').classList.toggle('active', isLogin);
    document.getElementById('tab-register').classList.toggle('active', !isLogin);
    document.getElementById('form-login').style.display    = isLogin ? 'block' : 'none';
    document.getElementById('form-register').style.display = isLogin ? 'none'  : 'block';
    clearAuthErrors();
}

function clearAuthErrors() {
    document.getElementById('login-error').textContent    = '';
    document.getElementById('register-error').textContent = '';
}

function toggleUserDropdown() {
    document.getElementById('user-dropdown').classList.toggle('open');
}

// Đóng dropdown khi click ra ngoài
document.addEventListener('click', e => {
    const menu = document.getElementById('user-menu');
    if (menu && !menu.contains(e.target)) {
        document.getElementById('user-dropdown').classList.remove('open');
    }
});

// ─── LOGIN ───────────────────────────────────────────
async function submitLogin(e) {
    e.preventDefault();
    const email    = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const errEl    = document.getElementById('login-error');
    const btn      = document.getElementById('login-btn');

    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader-circle"></i> Đang đăng nhập...';
    lucide.createIcons();
    errEl.textContent = '';

    try {
        const res  = await fetch(`${API}/users.php`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'login', email, password })
        });
        const json = await res.json();

        if (json.success) {
            setUser(json.data);
            closeAuthModal();
            showToast(`Chào mừng, ${json.data.username}!`);
            document.getElementById('form-login').reset();
        } else {
            errEl.textContent = json.error || 'Đăng nhập thất bại';
        }
    } catch (err) {
        errEl.textContent = 'Lỗi kết nối server';
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i data-lucide="log-in"></i> Đăng nhập';
        lucide.createIcons();
    }
}

// ─── REGISTER ────────────────────────────────────────
async function submitRegister(e) {
    e.preventDefault();
    const username = document.getElementById('reg-username').value.trim();
    const email    = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const errEl    = document.getElementById('register-error');
    const btn      = document.getElementById('register-btn');

    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader-circle"></i> Đang tạo tài khoản...';
    lucide.createIcons();
    errEl.textContent = '';

    try {
        const res  = await fetch(`${API}/users.php`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'register', username, email, password })
        });
        const json = await res.json();

        if (json.success) {
            setUser(json.data);
            closeAuthModal();
            showToast(`Tạo tài khoản thành công! Chào ${json.data.username} 🎉`);
            document.getElementById('form-register').reset();
        } else {
            errEl.textContent = json.error || 'Đăng ký thất bại';
        }
    } catch (err) {
        errEl.textContent = 'Lỗi kết nối server';
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i data-lucide="user-plus"></i> Tạo tài khoản';
        lucide.createIcons();
    }
}

// ─── LOGOUT ──────────────────────────────────────────
async function logout() {
    document.getElementById('user-dropdown').classList.remove('open');
    try {
        await fetch(`${API}/users.php`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'logout' })
        });
    } catch (e) {}
    clearUser();
    showToast('Đã đăng xuất');
}

// ─── BOOT ────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', initAuth);
