export function showToast(message) {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'toastIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) reverse forwards';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

export function openModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.classList.add('active');
    }
}

export function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.classList.remove('active');
    }
}

// Close modals when clicking outside
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.classList.remove('active');
            }
        });
    });

    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.target.closest('.modal-overlay').classList.remove('active');
        });
    });
});
