/**
 * auth.js
 * Handles Login/Logout state in the navigation menu.
 * Assumes the existence of #login-link and #logout-link in the DOM.
 */
document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('token');
    const loginLink = document.getElementById('login-link');
    const logoutLink = document.getElementById('logout-link');

    if (token) {
        // Logged in
        if (loginLink) loginLink.style.display = 'none';
        if (logoutLink) {
            logoutLink.style.display = 'inline-flex';
            // Remove previous event listeners to be safe (though cloning is better, simple add is fine for now)
            logoutLink.onclick = (e) => {
                e.preventDefault();
                if (confirm('ログアウトしますか？')) {
                    localStorage.removeItem('token');
                    window.location.reload();
                }
            };
        }
    } else {
        // Not logged in
        if (loginLink) loginLink.style.display = 'inline-flex';
        if (logoutLink) logoutLink.style.display = 'none';
    }
});
