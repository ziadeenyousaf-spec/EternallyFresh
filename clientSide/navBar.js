document.addEventListener('DOMContentLoaded', () => {
    const toggle = document.querySelector('.nav-toggle');
    const navigation = document.getElementById('site-navigation');
    const backdrop = document.querySelector('[data-nav-close]');

    if (!toggle || !navigation || !backdrop) {
        return;
    }

    const setNavigationOpen = (isOpen) => {
        navigation.classList.toggle('is-open', isOpen);
        navigation.setAttribute('aria-hidden', String(!isOpen));
        toggle.setAttribute('aria-expanded', String(isOpen));
        toggle.setAttribute('aria-label', isOpen ? 'Close navigation' : 'Open navigation');
        backdrop.hidden = !isOpen;
    };

    toggle.addEventListener('click', () => {
        setNavigationOpen(toggle.getAttribute('aria-expanded') !== 'true');
    });
    backdrop.addEventListener('click', () => setNavigationOpen(false));
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            setNavigationOpen(false);
        }
    });
});
