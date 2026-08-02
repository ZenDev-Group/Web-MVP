        // Plan Selection - se carga desde el catálogo real de la guía (GET /api/planes),
        // en vez de tarjetas hardcodeadas con precios de otro producto.
        const selectedPlanSpan = document.getElementById('selectedPlan');
        const totalPriceSpan = document.getElementById('totalPrice');
        const submitBtn = document.getElementById('submitBtn');
        const planCardsContainer = document.getElementById('planCardsContainer');
        let selectedPlan = null;
        let selectedPrice = 0;

        function featuresDePlan(plan) {
            const items = ['Listado en el directorio', 'Ubicación en el mapa', 'Contacto por WhatsApp'];
            items.push(plan.fotos_max > 1 ? `Galería de hasta ${plan.fotos_max} fotos` : 'Foto de portada');
            if (plan.prioridad > 0) items.push('Prioridad en el listado y el mapa');
            if (plan.con_estadisticas) items.push('Estadísticas de vistas y contactos');
            return items;
        }

        function attachPlanCardHandlers() {
            const planOptions = planCardsContainer.querySelectorAll('.plan-option');
            planOptions.forEach(option => {
                option.addEventListener('click', () => {
                    planOptions.forEach(opt => opt.classList.remove('selected'));
                    option.classList.add('selected');

                    selectedPlan = option.dataset.plan;
                    selectedPrice = parseInt(option.dataset.price, 10);

                    const planName = option.querySelector('.plan-name').textContent;
                    selectedPlanSpan.textContent = planName;
                    totalPriceSpan.textContent = selectedPrice === 0 ? 'Gratis' : '$' + selectedPrice.toLocaleString('es-AR');

                    submitBtn.disabled = false;
                });
            });
        }

        async function cargarPlanes() {
            const host = window.location.hostname;
            const apiBase = (host === 'localhost' || host === '127.0.0.1' || host === '')
                ? 'http://localhost:3000'
                : 'https://backend-production-196c.up.railway.app';

            try {
                const response = await fetch(`${apiBase}/api/planes`);
                if (!response.ok) throw new Error('Error al cargar los planes');
                const planes = await response.json();

                const planesPorSlug = {};
                planes.forEach(p => { planesPorSlug[p.slug] = p; });

                planCardsContainer.innerHTML = planes.map(plan => {
                    const esAnual = plan.periodicidad === 'anual';
                    const periodo = plan.precio === 0 ? 'Sin costo' : (esAnual ? '/año' : '/mes');
                    const precioTexto = plan.precio === 0 ? 'Gratis' : `$${Number(plan.precio).toLocaleString('es-AR')}`;

                    let descuentoHTML = '';
                    if (esAnual) {
                        const mensual = planesPorSlug[plan.slug.replace('-anual', '-mensual')];
                        if (mensual && mensual.precio > 0) {
                            const ahorro = (mensual.precio * 12) - plan.precio;
                            if (ahorro > 0) {
                                descuentoHTML = `<span class="discount">Ahorrás $${ahorro.toLocaleString('es-AR')} al año</span>`;
                            }
                        }
                    }

                    const destacado = plan.slug === 'destacado-mensual' ? '<span class="plan-badge">RECOMENDADO</span>' : '';
                    const features = featuresDePlan(plan).map(f => `<li>${f}</li>`).join('');

                    return `
                        <div class="plan-option" data-plan="${plan.slug}" data-price="${plan.precio}">
                            <div class="plan-header">
                                <span class="plan-name">${plan.nombre}</span>
                                ${destacado}
                            </div>
                            <div class="plan-price">
                                ${precioTexto} <span class="period">${periodo}</span>
                                ${descuentoHTML}
                            </div>
                            <ul class="plan-features">${features}</ul>
                        </div>
                    `;
                }).join('');

                attachPlanCardHandlers();
            } catch (error) {
                console.error('Error al cargar los planes:', error);
                planCardsContainer.innerHTML = '<p style="color: #ef4444;">No se pudieron cargar los planes. Recargá la página.</p>';
            }
        }

        cargarPlanes();

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
            
            // Deshabilitar botón durante envío
            submitBtn.disabled = true;
            submitBtn.textContent = 'Enviando...';

            // Determine dynamic API URL based on host (local vs production)
            const host = window.location.hostname;
            const apiBase = (host === 'localhost' || host === '127.0.0.1' || host === '')
                ? 'http://localhost:3000'
                : 'https://backend-production-196c.up.railway.app';

            const apiUrl = `${apiBase}/api/subscriptions`;

            fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            })
            .then(response => {
                if (!response.ok) {
                    throw new Error('Error en el servidor al registrar la suscripción');
                }
                return response.json();
            })
            .then(res => {
                console.log('Suscripción registrada con éxito:', res);
                if (res.initPoint) {
                    window.location.href = res.initPoint;
                } else {
                    modal.classList.add('active');
                }
            })
            .catch(error => {
                console.error('Error al enviar suscripción:', error);
                alert('Hubo un problema al procesar tu suscripción. Por favor, intentá de nuevo.');
            })
            .finally(() => {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Confirmar Suscripción';
            });
        });

        function closeModal() {
            modal.classList.remove('active');
            form.reset();
            planCardsContainer.querySelectorAll('.plan-option').forEach(opt => opt.classList.remove('selected'));
            selectedPlanSpan.textContent = 'Ninguno';
            totalPriceSpan.textContent = '$0';
            submitBtn.disabled = true;
            selectedPlan = null;
            selectedPrice = 0;
        }

