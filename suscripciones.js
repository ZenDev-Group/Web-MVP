        // Plan Selection
        const planOptions = document.querySelectorAll('.plan-option');
        const selectedPlanSpan = document.getElementById('selectedPlan');
        const totalPriceSpan = document.getElementById('totalPrice');
        const submitBtn = document.getElementById('submitBtn');
        let selectedPlan = null;
        let selectedPrice = 0;

        planOptions.forEach(option => {
            option.addEventListener('click', () => {
                planOptions.forEach(opt => opt.classList.remove('selected'));
                option.classList.add('selected');
                
                selectedPlan = option.dataset.plan;
                selectedPrice = parseInt(option.dataset.price);
                
                const planName = option.querySelector('.plan-name').textContent;
                selectedPlanSpan.textContent = planName;
                totalPriceSpan.textContent = '$' + selectedPrice.toLocaleString('es-AR');
                
                submitBtn.disabled = false;
            });
        });

        // Form Submission
        const form = document.getElementById('subscriptionForm');
        const modal = document.getElementById('successModal');

        form.addEventListener('submit', (e) => {
            e.preventDefault();
            
            if (!selectedPlan) {
                alert('Por favor seleccioná un plan');
                return;
            }

            const formData = new FormData(form);
            const data = {
                plan: selectedPlan,
                price: selectedPrice,
                businessName: formData.get('businessName'),
                category: formData.get('category'),
                phone: formData.get('phone'),
                address: formData.get('address'),
                description: formData.get('description'),
                ownerName: formData.get('ownerName'),
                email: formData.get('email'),
                dni: formData.get('dni'),
                whatsapp: formData.get('whatsapp'),
                instagram: formData.get('instagram'),
                newsletter: formData.get('newsletter') === 'on'
            };

            console.log('Datos de suscripción:', data);
            
            // Aquí se enviarían los datos al backend
            // Por ahora solo mostramos el modal de éxito
            
            modal.classList.add('active');
        });

        function closeModal() {
            modal.classList.remove('active');
            form.reset();
            planOptions.forEach(opt => opt.classList.remove('selected'));
            selectedPlanSpan.textContent = 'Ninguno';
            totalPriceSpan.textContent = '$0';
            submitBtn.disabled = true;
            selectedPlan = null;
            selectedPrice = 0;
}

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
