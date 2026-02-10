/**
 * auth.js
 * Handles Login/Logout state in the navigation menu.
 * Uses classes .auth-login-link and .auth-logout-link to support multiple instances (desktop/mobile).
 */
document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('token');
    const loginLinks = document.querySelectorAll('.auth-login-link');
    const logoutLinks = document.querySelectorAll('.auth-logout-link');

    if (token) {
        // Logged in
        loginLinks.forEach(el => el.classList.add('hidden'));
        logoutLinks.forEach(el => {
            el.classList.remove('hidden');
            el.style.display = ''; // Clear inline display:none if present
            el.onclick = (e) => {
                e.preventDefault();
                if (confirm('ログアウトしますか？')) {
                    localStorage.removeItem('token');
                    window.location.reload();
                }
            };
        });
    } else {
        // Not logged in
        loginLinks.forEach(el => {
            el.classList.remove('hidden');
            el.style.display = ''; // Clear inline display:none if present
        });
        logoutLinks.forEach(el => el.classList.add('hidden'));
    }
});

// Mobile Menu Logic
document.addEventListener('DOMContentLoaded', () => {
    const navToggle = document.getElementById('navToggle');
    const navClose = document.getElementById('navClose');
    const mobileMenu = document.getElementById('mobileMenu');

    if (navToggle && mobileMenu) {
        navToggle.addEventListener('click', () => {
            const isExpanded = navToggle.getAttribute('aria-expanded') === 'true';
            navToggle.setAttribute('aria-expanded', !isExpanded);
            mobileMenu.classList.toggle('is-open');
            mobileMenu.setAttribute('aria-hidden', isExpanded);
            document.documentElement.classList.toggle('body-lock'); // Lock/Unlock scroll on html
        });
    }

    if (navClose && mobileMenu) {
        navClose.addEventListener('click', () => {
            navToggle.setAttribute('aria-expanded', 'false');
            mobileMenu.classList.remove('is-open');
            mobileMenu.setAttribute('aria-hidden', 'true');
            // document.documentElement.classList.remove('body-lock'); // Unlock scroll on html - wait, body-lock is on body in other files?
            document.body.classList.remove('body-lock'); // Ensure consistency with index.html
        });
    }

    // Initialize cart count
    updateGlobalCartCount();
});

// Global Cart Count Update
function updateGlobalCartCount() {
    const cart = JSON.parse(localStorage.getItem('cm_cart') || "[]");
    const count = cart.length;
    const countText = `カート(${count})`;

    // Desktop
    const deskLink = document.getElementById('cart-link');
    if (deskLink) deskLink.innerText = countText;

    // Mobile
    const mobLink = document.getElementById('mobile-cart-link');
    if (mobLink) mobLink.innerText = countText;
}

// Make it available globally if needed (e.g. for shop.html to call)
window.updateGlobalCartCount = updateGlobalCartCount;
