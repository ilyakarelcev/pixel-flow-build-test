import { 
    handleGoogleLogin, handleEmailLogin, handleEmailRegister, handleLogout,
    saveProfileInfo, populateProfileModal, getSelectedProfileColor, currentUserProfile
} from './auth.js';
import { openModal, closeModal, showToast } from './ui.js';
import { initChat } from './chat.js';
import { initStream } from './stream.js';
import { db, ref, push, serverTimestamp } from './firebase.js';

document.addEventListener('DOMContentLoaded', () => {
    // Component init
    initChat();
    initStream();

    // Timer logic MVP (Hardcoded 16 April 2026, 19:00 MSK for example)
    const targetDate = new Date('2026-04-16T19:00:00+03:00').getTime();
    const daysEl = document.getElementById('timer-days');
    const hoursEl = document.getElementById('timer-hours');
    const minsEl = document.getElementById('timer-mins');
    const secsEl = document.getElementById('timer-secs');
    
    if (daysEl) {
        setInterval(() => {
            const now = new Date().getTime();
            const dist = targetDate - now;
            if (dist > 0) {
                daysEl.textContent = Math.floor(dist / (1000 * 60 * 60 * 24)).toString().padStart(2, '0');
                hoursEl.textContent = Math.floor((dist % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)).toString().padStart(2, '0');
                minsEl.textContent = Math.floor((dist % (1000 * 60 * 60)) / (1000 * 60)).toString().padStart(2, '0');
                secsEl.textContent = Math.floor((dist % (1000 * 60)) / 1000).toString().padStart(2, '0');
            } else {
                daysEl.textContent = "00";
                hoursEl.textContent = "00";
                minsEl.textContent = "00";
                secsEl.textContent = "00";
            }
        }, 1000);
    }

    // Modal bindings
    document.getElementById('btn-login')?.addEventListener('click', () => {
        switchAuthTab('login');
        openModal('auth-modal');
    });
    
    document.getElementById('btn-register')?.addEventListener('click', () => {
        switchAuthTab('register');
        openModal('auth-modal');
    });

    document.getElementById('btn-profile')?.addEventListener('click', () => {
        populateProfileModal();
        openModal('profile-modal');
    });
    
    document.getElementById('btn-logout')?.addEventListener('click', handleLogout);

    // Apply specific logic (Speaker Form)
    document.getElementById('btn-apply-speaker')?.addEventListener('click', () => {
        openModal('apply-modal');
    });
    
    document.getElementById('btn-submit-apply')?.addEventListener('click', async () => {
        const tg = document.getElementById('apply-tg').value;
        const title = document.getElementById('apply-title').value;
        const desc = document.getElementById('apply-desc').value;
        const comment = document.getElementById('apply-comment').value;

        if(!tg || !title || !desc) {
            showToast('Заполните обязательные поля');
            return;
        }

        const payload = {
            telegram: tg,
            title: title,
            description: desc,
            comment: comment,
            timestamp: serverTimestamp(),
            uid: currentUserProfile ? currentUserProfile.uid : 'anonymous'
        };

        try {
            await push(ref(db, 'applications'), payload);
            showToast('Заявка успешно отправлена!');
            closeModal('apply-modal');
            
            document.getElementById('apply-tg').value = '';
            document.getElementById('apply-title').value = '';
            document.getElementById('apply-desc').value = '';
            document.getElementById('apply-comment').value = '';
        } catch(e) {
            showToast('Ошибка: ' + e.message);
        }
    });

    // Auth logic
    document.getElementById('btn-google-auth')?.addEventListener('click', handleGoogleLogin);
    
    document.getElementById('btn-email-action')?.addEventListener('click', () => {
        const email = document.getElementById('auth-email').value;
        const pass = document.getElementById('auth-pass').value;
        if(!email || !pass) {
            showToast('Введите почту и пароль');
            return;
        }
        
        if (currentAuthMode === 'login') {
            handleEmailLogin(email, pass);
        } else {
            handleEmailRegister(email, pass);
        }
    });

    const authTabs = document.querySelectorAll('.auth-tab');
    authTabs.forEach(tab => {
        tab.addEventListener('click', () => switchAuthTab(tab.dataset.mode));
    });

    // Profile logic
    document.getElementById('btn-save-profile')?.addEventListener('click', async () => {
        const btn = document.getElementById('btn-save-profile');
        const nick = document.getElementById('profile-nickname').value;
        const color = getSelectedProfileColor();
        const fileInput = document.getElementById('profile-avatar-file');
        const file = fileInput.files[0];

        btn.disabled = true;
        btn.textContent = 'Сохранение...';

        const ok = await saveProfileInfo(nick, color, file);
        if(ok) {
            closeModal('profile-modal');
        }

        btn.disabled = false;
        btn.textContent = 'Сохранить';
    });
});

let currentAuthMode = 'login';
function switchAuthTab(mode) {
    currentAuthMode = mode;
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`.auth-tab[data-mode="${mode}"]`).classList.add('active');
    
    document.getElementById('btn-email-action').textContent = mode === 'login' ? 'Войти' : 'Зарегистрироваться';
}
