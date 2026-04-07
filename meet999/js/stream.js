import { db, ref, onValue, update, push } from './firebase.js';
import { query, limitToLast, onChildAdded, increment } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-database.js";

const loadTime = Date.now();
const applausesRef = ref(db, 'applauses');
const applauseCountRef = ref(db, 'applauseCount');

export function initStream() {
    const toggleChatBtn = document.getElementById('toggle-chat');
    const sidebar = document.getElementById('stream-sidebar');
    const applauseBtn = document.getElementById('applause-btn');
    const likeCountEl = document.getElementById('like-count');
    
    if(toggleChatBtn && sidebar) {
        toggleChatBtn.addEventListener('click', () => {
            sidebar.classList.toggle('hidden');
            if(sidebar.classList.contains('hidden')) {
                toggleChatBtn.textContent = 'Открыть чат';
            } else {
                toggleChatBtn.textContent = 'Закрыть чат';
            }
        });
    }

    if(applauseBtn) {
        applauseBtn.addEventListener('click', () => {
            // Push event for animation
            push(applausesRef, { ts: Date.now(), rand: Math.random() });
            // Increment total counter
            update(ref(db, '/'), {
                applauseCount: increment(1)
            });
        });
    }

    // Listen for new applauses for UI flyup animation
    const applausesQuery = query(applausesRef, limitToLast(10));
    onChildAdded(applausesQuery, (snapshot) => {
        const val = snapshot.val();
        if(val && val.ts > loadTime) {
            spawnApplauseAnimation();
        }
    });

    // Listen for total count
    onValue(applauseCountRef, (snapshot) => {
        if(likeCountEl) {
            likeCountEl.textContent = snapshot.val() || 0;
        }
    });
}

function spawnApplauseAnimation() {
    const container = document.body;
    const icon = document.createElement('div');
    icon.innerHTML = '👏';
    icon.className = 'applause-flyer';
    
    // Slight random horizontal offset
    const offset = (Math.random() - 0.5) * 40;
    icon.style.marginLeft = `${offset}px`;
    
    container.appendChild(icon);
    
    setTimeout(() => {
        icon.remove();
    }, 1500);
}
