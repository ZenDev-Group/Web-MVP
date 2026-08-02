// Menu Hamburguesa
const menuToggle = document.getElementById('menuToggle');
const mobileMenu = document.getElementById('mobileMenu');
const mobileOverlay = document.getElementById('mobileOverlay');
const mobileLinks = document.querySelectorAll('.mobile-link');

menuToggle.addEventListener('click', () => {
    mobileMenu.classList.toggle('active');
    mobileOverlay.classList.toggle('active');
    menuToggle.textContent = mobileMenu.classList.contains('active') ? '✕' : '☰';
});

mobileOverlay.addEventListener('click', () => {
    mobileMenu.classList.remove('active');
    mobileOverlay.classList.remove('active');
    menuToggle.textContent = '☰';
});

mobileLinks.forEach(link => {
    link.addEventListener('click', () => {
        mobileMenu.classList.remove('active');
        mobileOverlay.classList.remove('active');
        menuToggle.textContent = '☰';
    });
});

// Smooth scroll
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    });
});

// FAQ Accordion
const faqItems = document.querySelectorAll('.faq-item');

faqItems.forEach(item => {
    const question = item.querySelector('.faq-question');

    question.addEventListener('click', () => {
        const isActive = item.classList.contains('active');

        // Cerrar todos los items
        faqItems.forEach(i => {
            i.classList.remove('active');
            i.querySelector('.faq-icon').textContent = '+';
        });

        // Si no estaba activo, abrirlo
        if (!isActive) {
            item.classList.add('active');
            item.querySelector('.faq-icon').textContent = '−';
        }
    });
});
