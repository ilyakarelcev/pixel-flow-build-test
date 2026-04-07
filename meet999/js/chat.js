import { db, ref, onValue, push, serverTimestamp, update, remove, get } from './firebase.js';
import { currentUserProfile, setupAvatarElement, getCurrentUser } from './auth.js';
import { showToast } from './ui.js';

let messagesRef = ref(db, 'chat_messages');
let usersCache = {};
let messagesLocal = [];

let editingMessageId = null;
let replyingToMessageId = null;

export function initChat() {
    const chatContainer = document.getElementById('chat-messages');
    if (!chatContainer) return;

    // Expandable textarea
    const textarea = document.getElementById('chat-input');
    if(textarea) {
        textarea.addEventListener('input', function() {
            this.style.height = '44px';
            this.style.height = (this.scrollHeight) + 'px';
        });
        textarea.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
    }

    const sendBtn = document.getElementById('chat-send-btn');
    if(sendBtn) {
        sendBtn.addEventListener('click', sendMessage);
    }
    
    document.getElementById('cancel-chat-state')?.addEventListener('click', cancelChatState);

    // Listen to messages
    onValue(messagesRef, async (snapshot) => {
        if (!snapshot.exists()) {
            chatContainer.innerHTML = '<div style="text-align:center; padding: 20px; color: var(--text-secondary)">Нет сообщений</div>';
            return;
        }
        
        // simple cache population for usernames/avatars
        // in MVP it's fine to fetch or use snapshot data if we included it 
        // to simplify, we store author info in the message itself to avoid N+1 queries
        // but we might need real-time updates. We'll store snapshot of profile in msg for speed.
        
        const data = snapshot.val();
        messagesLocal = Object.keys(data).map(key => ({ id: key, ...data[key] })).sort((a, b) => a.timestamp - b.timestamp);
        renderMessages(messagesLocal);
    });

    // Close context menu on outside click
    document.addEventListener('click', (e) => {
        if(!e.target.closest('#chat-context-menu')) {
            document.getElementById('chat-context-menu')?.classList.remove('active');
        }
    });

    document.getElementById('ctx-reply')?.addEventListener('click', onCtxReply);
    document.getElementById('ctx-edit')?.addEventListener('click', onCtxEdit);
    document.getElementById('ctx-delete')?.addEventListener('click', onCtxDelete);
}

function escapeHtml(unsafe) {
    return (unsafe || '').toString()
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

function linkify(text) {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return text.replace(urlRegex, function(url) {
        return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
    });
}

function renderDateSeparator(timestamp) {
    const date = new Date(timestamp);
    const months = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
    return `${date.getDate()} ${months[date.getMonth()]}`;
}

function renderMessages(messages) {
    const container = document.getElementById('chat-messages');
    if(!container) return;
    
    container.innerHTML = '';
    let lastDateStr = null;

    messages.forEach(msg => {
        // Date separator
        if (msg.timestamp) {
            const dateStr = renderDateSeparator(msg.timestamp);
            if (dateStr !== lastDateStr) {
                const sep = document.createElement('div');
                sep.className = 'chat-date-separator';
                sep.innerHTML = `<span>${dateStr}</span>`;
                container.appendChild(sep);
                lastDateStr = dateStr;
            }
        }

        const isOwn = getCurrentUser() && msg.uid === getCurrentUser().uid;
        
        const wrap = document.createElement('div');
        wrap.className = `chat-message-wrap ${isOwn ? 'own' : ''}`;
        wrap.id = `msg-${msg.id}`;

        const avatar = document.createElement('div');
        avatar.className = 'avatar';
        setupAvatarElement(avatar, msg.authorProfile || { nickname: '?', userColor: '#999' });

        const bubbleWrap = document.createElement('div');
        bubbleWrap.style.flex = "1";
        if(isOwn) bubbleWrap.style.display = "flex";
        if(isOwn) bubbleWrap.style.justifyContent = "flex-end";

        const bubble = document.createElement('div');
        bubble.className = 'chat-bubble';
        
        // Context menu trigger
        bubble.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            showContextMenu(e.pageX, e.pageY, msg, isOwn);
        });

        let contentHtml = '';

        if (!isOwn) {
            contentHtml += `<div class="chat-author" style="color: ${msg.authorProfile?.userColor || '#fff'}">${escapeHtml(msg.authorProfile?.nickname || 'Unknown')}</div>`;
        }

        if (msg.replyTo) {
            const replyMsg = messages.find(m => m.id === msg.replyTo);
            if (replyMsg) {
                contentHtml += `
                    <div class="chat-reply-preview" onclick="document.getElementById('msg-${replyMsg.id}')?.scrollIntoView({behavior: 'smooth'})">
                        <div class="chat-reply-author">${escapeHtml(replyMsg.authorProfile?.nickname || 'Unknown')}</div>
                        <div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(replyMsg.text)}</div>
                    </div>
                `;
            }
        }

        contentHtml += `<div class="chat-text">${linkify(escapeHtml(msg.text).replace(/\n/g, '<br>'))}</div>`;

        let timeStr = '';
        if (msg.timestamp) {
             const d = new Date(msg.timestamp);
             timeStr = d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
        }

        contentHtml += `
            <div class="chat-meta">
                ${msg.isEdited ? '<span>✏️ Edit</span>' : ''}
                <span>${timeStr}</span>
            </div>
        `;

        bubble.innerHTML = contentHtml;
        bubbleWrap.appendChild(bubble);
        wrap.appendChild(avatar);
        wrap.appendChild(bubbleWrap);
        
        container.appendChild(wrap);
    });

    // Auto scroll
    container.scrollTo(0, container.scrollHeight);
}

async function sendMessage() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text) return;
    
    if (text.length > 1000) {
        showToast('Сообщение слишком длинное (макс 1000)');
        return;
    }

    if (!getCurrentUser() || !currentUserProfile) {
        showToast('Пожалуйста, войдите в профиль');
        return;
    }

    const payload = {
        text: text,
        uid: getCurrentUser().uid,
        authorProfile: {
            nickname: currentUserProfile.nickname,
            userColor: currentUserProfile.userColor,
            avatar: currentUserProfile.avatar || ''
        },
        timestamp: serverTimestamp()
    };

    if (editingMessageId) {
        payload.isEdited = true;
        // Don't update timestamp on edit
        delete payload.timestamp; 
        await update(ref(db, `chat_messages/${editingMessageId}`), payload);
        showToast('Сообщение изменено');
    } else {
        if (replyingToMessageId) {
            payload.replyTo = replyingToMessageId;
        }
        await push(messagesRef, payload);
    }

    input.value = '';
    input.style.height = '44px';
    cancelChatState();
}

let activeContextMenuMsg = null;

function showContextMenu(x, y, msg, isOwn) {
    activeContextMenuMsg = msg;
    const menu = document.getElementById('chat-context-menu');
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.classList.add('active');

    document.getElementById('ctx-edit').style.display = isOwn ? 'flex' : 'none';
    document.getElementById('ctx-delete').style.display = isOwn ? 'flex' : 'none';
}

function onCtxReply() {
    if(!activeContextMenuMsg) return;
    replyingToMessageId = activeContextMenuMsg.id;
    editingMessageId = null;
    updateChatStateUI(`Ответ: ${activeContextMenuMsg.text.substring(0, 20)}...`);
    document.getElementById('chat-input').focus();
    document.getElementById('chat-context-menu').classList.remove('active');
}

function onCtxEdit() {
    if(!activeContextMenuMsg) return;
    editingMessageId = activeContextMenuMsg.id;
    replyingToMessageId = null;
    document.getElementById('chat-input').value = activeContextMenuMsg.text;
    updateChatStateUI(`Редактирование...`);
    document.getElementById('chat-input').focus();
    document.getElementById('chat-context-menu').classList.remove('active');
}

async function onCtxDelete() {
    if(!activeContextMenuMsg) return;
    if(confirm('Удалить сообщение?')) {
        await remove(ref(db, `chat_messages/${activeContextMenuMsg.id}`));
    }
    document.getElementById('chat-context-menu').classList.remove('active');
}

function updateChatStateUI(text) {
    const stateVal = document.getElementById('chat-state-val');
    const stateWrap = document.getElementById('chat-input-state');
    if(stateVal && stateWrap) {
        stateVal.textContent = text;
        stateWrap.classList.add('active');
    }
}

function cancelChatState() {
    editingMessageId = null;
    replyingToMessageId = null;
    const stateWrap = document.getElementById('chat-input-state');
    if(stateWrap) {
        stateWrap.classList.remove('active');
    }
    const input = document.getElementById('chat-input');
    if(input && editingMessageId) {
        input.value = '';
        input.style.height = '44px';
    }
}
