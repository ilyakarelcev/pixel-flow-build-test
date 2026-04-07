import { 
    auth, db, ref, get, set, update, 
    signInWithPopup, signInWithRedirect, getRedirectResult, googleProvider, 
    createUserWithEmailAndPassword, signInWithEmailAndPassword, 
    signOut, onAuthStateChanged,
    storage, storageRef, uploadBytes, getDownloadURL
} from './firebase.js';
import { showToast, openModal, closeModal } from './ui.js';

let currentUser = null;
export let currentUserProfile = null;
const predefinedColors = [
    '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e', 
    '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6', 
    '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e'
];

async function fetchUserProfile(uid, email) {
    const userRef = ref(db, `users/${uid}`);
    const snapshot = await get(userRef);
    if (snapshot.exists()) {
        currentUserProfile = snapshot.val();
    } else {
        // Create default profile
        const defaultNickname = email.split('@')[0];
        const randomColor = predefinedColors[Math.floor(Math.random() * predefinedColors.length)];
        currentUserProfile = {
            email: email,
            nickname: defaultNickname + Math.floor(Math.random() * 1000), // ensure some uniqueness
            avatar: '',
            userColor: randomColor,
            isSpeaker: false
        };
        await set(userRef, currentUserProfile);
    }
    updateHeaderUI();
    checkSpeakerStatus();
}

function updateHeaderUI() {
    const loggedOutSection = document.getElementById('header-logged-out');
    const loggedInSection = document.getElementById('header-logged-in');
    
    if (currentUser && currentUserProfile) {
        if(loggedOutSection) loggedOutSection.classList.add('hidden');
        if(loggedInSection) loggedInSection.classList.remove('hidden');
        
        const avatarEl = document.getElementById('header-avatar');
        const nicknameEl = document.getElementById('header-nickname');
        if (nicknameEl) nicknameEl.textContent = currentUserProfile.nickname;
        
        if (avatarEl) {
            setupAvatarElement(avatarEl, currentUserProfile);
        }
    } else {
        if(loggedOutSection) loggedOutSection.classList.remove('hidden');
        if(loggedInSection) loggedInSection.classList.add('hidden');
    }
}

export function setupAvatarElement(el, profile) {
    if (profile.avatar) {
        el.style.backgroundImage = `url(${profile.avatar})`;
        el.textContent = '';
        el.style.backgroundColor = 'transparent';
    } else {
        el.style.backgroundImage = 'none';
        el.style.backgroundColor = profile.userColor;
        let initials = profile.nickname.substring(0, 2).toUpperCase();
        el.textContent = initials;
    }
}

function checkSpeakerStatus() {
    if (currentUserProfile && currentUserProfile.isSpeaker) {
        document.body.classList.add('has-speaker-banner');
    } else {
        document.body.classList.remove('has-speaker-banner');
    }
}

// Auth State Observer
onAuthStateChanged(auth, async (user) => {
    console.log('Auth state changed:', user ? 'Logged in' : 'Logged out');
    if (user) {
        currentUser = user;
        try {
            await fetchUserProfile(user.uid, user.email);
            console.log('Profile fetched:', currentUserProfile);
        } catch (e) {
            console.error('Error fetching profile:', e);
            showToast('Ошибка загрузки профиля: ' + e.message);
        }
        document.dispatchEvent(new CustomEvent('authStateChanged', { detail: { user: currentUser, profile: currentUserProfile }}));
    } else {
        currentUser = null;
        currentUserProfile = null;
        updateHeaderUI();
        checkSpeakerStatus();
        document.dispatchEvent(new CustomEvent('authStateChanged', { detail: { user: null, profile: null }}));
    }
});

// Exposed Functions for UI
export async function handleGoogleLogin() {
    try {
        // Redirection is more reliable for GitHub Pages and COOP issues
        await signInWithRedirect(auth, googleProvider);
    } catch (error) {
        showToast('Ошибка входа: ' + error.message);
    }
}

// Handle redirect result
getRedirectResult(auth).then((result) => {
    if (result?.user) {
        showToast('Успешный вход!');
    }
}).catch((error) => {
    if (error.code !== 'auth/unauthorized-domain') {
        showToast('Ошибка авторизации: ' + error.message);
    }
});

export async function handleEmailRegister(email, password) {
    try {
        await createUserWithEmailAndPassword(auth, email, password);
        closeModal('auth-modal');
        showToast('Регистрация успешна!');
    } catch (error) {
        showToast('Ошибка регистрации: ' + error.message);
    }
}

export async function handleEmailLogin(email, password) {
    try {
        await signInWithEmailAndPassword(auth, email, password);
        closeModal('auth-modal');
        showToast('Успешный вход!');
    } catch (error) {
        showToast('Ошибка входа: ' + error.message);
    }
}

export async function handleLogout() {
    await signOut(auth);
    showToast('Вы вышли из профиля');
}

// Profile update
export async function saveProfileInfo(newNickname, newColor, file) {
    if (!currentUser) return false;
    
    try {
        let updates = {};
        
        // Check nickname uniqueness if changed
        if (newNickname !== currentUserProfile.nickname) {
            const usersRef = ref(db, 'users');
            const snap = await get(usersRef);
            let exists = false;
            if (snap.exists()) {
                const users = snap.val();
                for (let id in users) {
                    if (users[id].nickname === newNickname) exists = true;
                }
            }
            if (exists) {
                showToast('Этот никнейм уже занят');
                return false;
            }
            updates.nickname = newNickname;
        }
        
        if (newColor && newColor !== currentUserProfile.userColor) {
            updates.userColor = newColor;
        }
        
        if (file) {
            if(file.size > 2 * 1024 * 1024) {
                showToast('Файл слишком большой (до 2МБ)');
                return false;
            }
            const fileRef = storageRef(storage, `avatars/${currentUser.uid}`);
            console.log('Uploading file...');
            await uploadBytes(fileRef, file);
            const url = await getDownloadURL(fileRef);
            updates.avatar = url;
            console.log('File uploaded:', url);
        }
        
        if (Object.keys(updates).length > 0) {
            await update(ref(db, `users/${currentUser.uid}`), updates);
            Object.assign(currentUserProfile, updates);
            updateHeaderUI();
            showToast('Профиль обновлен');
            document.dispatchEvent(new CustomEvent('profileUpdated'));
        }
        return true;
    } catch (e) {
        console.error('Save error:', e);
        if (e.message.includes('CORS')) {
            showToast('Ошибка CORS: Настройте Firebase Storage (см. инструкцию)');
        } else {
            showToast('Ошибка сохранения: ' + e.message);
        }
        return false;
    }
}

export function populateProfileModal() {
    if(!currentUserProfile) return;
    
    const nickInput = document.getElementById('profile-nickname');
    if(nickInput) nickInput.value = currentUserProfile.nickname;
    
    const palette = document.getElementById('profile-colors');
    if(palette) {
        palette.innerHTML = '';
        predefinedColors.forEach(color => {
            const div = document.createElement('div');
            div.className = 'color-option';
            div.style.backgroundColor = color;
            if(color === currentUserProfile.userColor) div.classList.add('selected');
            div.onclick = () => {
                document.querySelectorAll('.color-option').forEach(el => el.classList.remove('selected'));
                div.classList.add('selected');
                div.dataset.color = color;
            };
            palette.appendChild(div);
        });
    }
}

export function getSelectedProfileColor() {
    const selected = document.querySelector('.color-option.selected');
    return selected ? selected.style.backgroundColor || selected.dataset.color : currentUserProfile.userColor;
}

export function getCurrentUser() {
    return currentUser;
}
