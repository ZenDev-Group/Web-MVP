document.addEventListener('DOMContentLoaded', () => {
    // Plan Selection
    const planCards = document.querySelectorAll('.plan-card');
    const selectedPlanSpan = document.getElementById('selectedPlan');
    const totalPriceSpan = document.getElementById('totalPrice');
    const submitBtn = document.getElementById('submitBtn');
    let selectedPlan = null;
    let selectedPrice = 0;

    planCards.forEach(card => {
        card.addEventListener('click', () => {
            // Remove selection class from all cards
            planCards.forEach(c => c.classList.remove('selected'));
            
            // Add selection class to clicked card
            card.classList.add('selected');
            
            // Extract dataset
            selectedPlan = card.dataset.plan;
            selectedPrice = parseInt(card.dataset.price);
            
            // Get Plan Name Text
            const planName = card.querySelector('.plan-name').textContent;
            selectedPlanSpan.textContent = planName;
            
            // Format Price Display
            if (selectedPlan === 'freemium') {
                totalPriceSpan.textContent = '$' + selectedPrice.toLocaleString('es-AR') + ' (Pago de alta)';
            } else if (selectedPlan === 'premium-mensual') {
                totalPriceSpan.textContent = '$' + selectedPrice.toLocaleString('es-AR') + ' / mes';
            } else {
                totalPriceSpan.textContent = '$' + selectedPrice.toLocaleString('es-AR') + ' / año';
            }
            
            // Enable Submit Button
            submitBtn.disabled = false;
        });
    });

    // Form Submission
    const form = document.getElementById('subscriptionForm');
    const modal = document.getElementById('successModal');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        if (!selectedPlan) {
            alert('Por favor seleccioná un plan de la lista de la izquierda.');
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

        // Determine dynamic API URL based on host (local vs production)
        const host = window.location.hostname;
        const apiBase = (host === 'localhost' || host === '127.0.0.1' || host === '') 
            ? 'http://localhost:3000' 
            : ''; // Relative URL for production

        const apiUrl = `${apiBase}/api/subscriptions`;

        console.log('Enviando datos de suscripción VENDEMAX:', apiUrl, data);
        
        // Disable submit button to avoid double submissions
        submitBtn.disabled = true;
        submitBtn.textContent = 'PROCESANDO REGISTRO...';

        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });

            const resData = await response.json();

            if (!response.ok) {
                throw new Error(resData.error || 'Error al procesar la suscripción en el servidor.');
            }

            console.log('Registro VENDEMAX exitoso:', resData);
            
            if (resData.initPoint) {
                // Redirigir a Mercado Pago para realizar el pago
                window.location.href = resData.initPoint;
            } else {
                // Mostrar Modal de Éxito estándar si no hay pasarela activa
                modal.classList.add('active');
            }

        } catch (error) {
            console.error('Error al enviar suscripción VENDEMAX:', error);
            alert(`Hubo un problema al registrar la suscripción: ${error.message}\nPor favor, intentá nuevamente.`);
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Confirmar Suscripción';
        }
    });

    // Modal control
    window.closeModal = function() {
        modal.classList.remove('active');
        form.reset();
        
        // Clean selected states
        planCards.forEach(c => c.classList.remove('selected'));
        selectedPlanSpan.textContent = 'Ninguno';
        totalPriceSpan.textContent = '$0';
        submitBtn.disabled = true;
        selectedPlan = null;
        selectedPrice = 0;
        
        // Scroll back to top
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };
});
