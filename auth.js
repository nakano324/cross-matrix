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
        loginLinks.forEach(el => el.style.display = 'none');
        logoutLinks.forEach(el => {
            el.style.display = 'inline-flex'; // or 'block' depending on CSS, but inline-flex is safe for nav
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
        loginLinks.forEach(el => el.style.display = 'inline-flex'); // or 'block'
        logoutLinks.forEach(el => el.style.display = 'none');
    }
});
