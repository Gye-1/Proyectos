(function() {
    // -------------------- CONFIGURACIÓN --------------------
    const scriptURL = 'https://script.google.com/macros/s/AKfycbwRO82Kw8sBrYAyxJPuvhAl3BU-pvkwkWF4MzH2DpPyzl3i1ACIo1dzyVp3EU2zJq1fTQ/exec'; // Tu URL actualizada
    
    // -------------------- VARIABLES GLOBALES --------------------
    let mapUbicacion, mapComunidades;
    let markerUbicacion = null;
    let agasData = [];
    let agasSeleccionados = new Set();
    
    // -------------------- INICIALIZACIÓN DE MAPAS --------------------
    function initMapas() {
        console.log('Inicializando mapas...');
        
        // Asegurar que los contenedores existen
        const mapaUbicacionDiv = document.getElementById('mapaUbicacion');
        const mapaComunidadesDiv = document.getElementById('mapaComunidades');
        
        if (!mapaUbicacionDiv || !mapaComunidadesDiv) {
            console.error('No se encontraron los contenedores de mapas');
            return;
        }
        
        // Limpiar contenedores por si acaso
        mapaUbicacionDiv.innerHTML = '';
        mapaComunidadesDiv.innerHTML = '';
        
        // Mapa de ubicación
        mapUbicacion = L.map('mapaUbicacion').setView([-2.1894, -79.8891], 12);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { 
            attribution: '© OpenStreetMap',
            opacity: 0.8
        }).addTo(mapUbicacion);
        
        // Marcador arrastrable - guardar en variable global
        markerUbicacion = L.marker([-2.1894, -79.8891], { draggable: true }).addTo(mapUbicacion);
        
        // Asignar eventos al marcador inmediatamente
        markerUbicacion.on('dragend', function(e) {
            console.log('Marcador movido:', e.target.getLatLng());
            actualizarAgaDesdeCoords(e.target.getLatLng());
        });
        
        // Evento de clic en el mapa
        mapUbicacion.on('click', function(e) {
            console.log('Clic en mapa:', e.latlng);
            if (markerUbicacion) {
                markerUbicacion.setLatLng(e.latlng);
                actualizarAgaDesdeCoords(e.latlng);
            }
        });
        
        // Mapa de comunidades
        mapComunidades = L.map('mapaComunidades').setView([-2.1894, -79.8891], 12);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { 
            attribution: '© OpenStreetMap',
            opacity: 0.8
        }).addTo(mapComunidades);
        
        console.log('Mapas inicializados correctamente');
    }
    
    // -------------------- PARSER DE KML --------------------
    function parseKML(kmlText) {
        const parser = new DOMParser();
        const kml = parser.parseFromString(kmlText, 'text/xml');
        const placemarks = kml.getElementsByTagName('Placemark');
        const agas = [];
        
        for (let pm of placemarks) {
            // Obtener nombre
            let nameElem = pm.getElementsByTagName('name')[0];
            let nombre = nameElem ? nameElem.textContent.trim() : 'AGA sin nombre';
            
            // Buscar en ExtendedData
            const extendedData = pm.getElementsByTagName('ExtendedData')[0];
            if (extendedData) {
                const dataValues = extendedData.getElementsByTagName('Data');
                for (let data of dataValues) {
                    const nameAttr = data.getAttribute('name');
                    if (nameAttr === 'AGA' || nameAttr === 'nombre') {
                        const value = data.getElementsByTagName('value')[0];
                        if (value) nombre = value.textContent.trim();
                    }
                }
            }
            
            // Obtener coordenadas del polígono
            const polygon = pm.getElementsByTagName('Polygon')[0];
            if (polygon) {
                const outerBoundary = polygon.getElementsByTagName('outerBoundaryIs')[0];
                if (outerBoundary) {
                    const linearRing = outerBoundary.getElementsByTagName('LinearRing')[0];
                    if (linearRing) {
                        const coordinates = linearRing.getElementsByTagName('coordinates')[0];
                        if (coordinates) {
                            const coordsText = coordinates.textContent.trim();
                            // Dividir por espacios y filtrar líneas vacías
                            const coordPairs = coordsText.split(/\s+/)
                                .filter(pair => pair.trim() !== '')
                                .map(pair => {
                                    const parts = pair.split(',').map(Number);
                                    // KML viene como lon,lat,alt - Leaflet usa [lat, lon]
                                    return [parts[1], parts[0]];
                                })
                                .filter(coord => !isNaN(coord[0]) && !isNaN(coord[1]));
                            
                            if (coordPairs.length > 0) {
                                agas.push({
                                    nombre: nombre,
                                    coordenadas: coordPairs
                                });
                                console.log('AGA encontrado:', nombre, 'con', coordPairs.length, 'puntos');
                            }
                        }
                    }
                }
            }
        }
        return agas;
    }
    
    // -------------------- PUNTO EN POLÍGONO --------------------
    function puntoEnPoligono(point, vs) {
        const x = point[1], y = point[0];
        let inside = false;
        for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
            const xi = vs[i][1], yi = vs[i][0];
            const xj = vs[j][1], yj = vs[j][0];
            
            const intersect = ((yi > y) !== (yj > y)) &&
                (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }
    
    // -------------------- CARGA DE KML --------------------
    function cargarKML() {
        console.log('Cargando KML...');
        
        fetch('AGA.kml')
            .then(res => res.text())
            .then(kmlText => {
                const agas = parseKML(kmlText);
                console.log('AGAs cargados:', agas.length);
                
                if (agas.length === 0) {
                    console.warn('No se encontraron polígonos, usando datos de ejemplo');
                    usarDatosEjemplo();
                    return;
                }
                
                agasData = [];
                
                agas.forEach(aga => {
                    // Validar que las coordenadas sean válidas
                    if (!aga.coordenadas || aga.coordenadas.length < 3) {
                        console.warn('AGA con coordenadas inválidas:', aga.nombre);
                        return;
                    }
                    
                    try {
                        // Polígono en mapa de ubicación (sin interacción)
                        const polyUbicacion = L.polygon(aga.coordenadas, {
                            color: '#2b7a4b',
                            weight: 1.5,
                            opacity: 0.7,
                            fillOpacity: 0,
                            interactive: false
                        }).addTo(mapUbicacion);
                        
                        // Polígono en mapa de comunidades (interactivo)
                        const polyComunidad = L.polygon(aga.coordenadas, {
                            color: '#2b7a4b',
                            weight: 1.5,
                            opacity: 0.7,
                            fillOpacity: 0,
                            interactive: true
                        }).addTo(mapComunidades);
                        
                        // Evento de clic para seleccionar
                        polyComunidad.on('click', function(e) {
                            L.DomEvent.stopPropagation(e);
                            const nombre = aga.nombre;
                            
                            if (agasSeleccionados.has(nombre)) {
                                agasSeleccionados.delete(nombre);
                                this.setStyle({
                                    color: '#2b7a4b',
                                    weight: 1.5,
                                    opacity: 0.7,
                                    fillOpacity: 0
                                });
                            } else {
                                agasSeleccionados.add(nombre);
                                this.setStyle({
                                    color: '#2b7a4b',
                                    weight: 2,
                                    opacity: 1,
                                    fillOpacity: 0.3,
                                    fillColor: '#ffd700'
                                });
                            }
                            actualizarTagsComunidades();
                        });
                        
                        agasData.push({
                            nombre: aga.nombre,
                            coordenadas: aga.coordenadas,
                            polyUbicacion: polyUbicacion,
                            polyComunidad: polyComunidad
                        });
                    } catch (error) {
                        console.error('Error creando polígono para:', aga.nombre, error);
                    }
                });
                
                console.log('AGAs procesados:', agasData.length);
                
                // Ajustar vista
                if (agasData.length > 0) {
                    try {
                        const bounds = agasData[0].polyUbicacion.getBounds();
                        mapUbicacion.fitBounds(bounds);
                        mapComunidades.fitBounds(bounds);
                    } catch (error) {
                        console.error('Error ajustando vista:', error);
                    }
                }
                
                // Actualizar con la posición actual del marcador
                if (markerUbicacion) {
                    actualizarAgaDesdeCoords(markerUbicacion.getLatLng());
                }
            })
            .catch(err => {
                console.error('Error cargando KML:', err);
                usarDatosEjemplo();
            });
    }
    
    // -------------------- DATOS DE EJEMPLO --------------------
    function usarDatosEjemplo() {
        console.log('Usando datos de ejemplo');
        
        const agasDemo = [
            { 
                nombre: 'AGA Centro', 
                coords: [
                    [-2.1894, -79.8891], 
                    [-2.19, -79.88], 
                    [-2.2, -79.885], 
                    [-2.195, -79.895],
                    [-2.1894, -79.8891] // Cerrar el polígono
                ] 
            },
            { 
                nombre: 'AGA Sur', 
                coords: [
                    [-2.22, -79.91], 
                    [-2.23, -79.90], 
                    [-2.24, -79.92], 
                    [-2.225, -79.925],
                    [-2.22, -79.91] // Cerrar el polígono
                ] 
            }
        ];
        
        agasData = [];
        
        agasDemo.forEach(aga => {
            try {
                const polyUbicacion = L.polygon(aga.coords, {
                    color: '#2b7a4b',
                    weight: 1.5,
                    opacity: 0.7,
                    fillOpacity: 0,
                    interactive: false
                }).addTo(mapUbicacion);
                
                const polyComunidad = L.polygon(aga.coords, {
                    color: '#2b7a4b',
                    weight: 1.5,
                    opacity: 0.7,
                    fillOpacity: 0,
                    interactive: true
                }).addTo(mapComunidades);
                
                polyComunidad.on('click', function(e) {
                    L.DomEvent.stopPropagation(e);
                    const nombre = aga.nombre;
                    
                    if (agasSeleccionados.has(nombre)) {
                        agasSeleccionados.delete(nombre);
                        this.setStyle({
                            color: '#2b7a4b',
                            weight: 1.5,
                            opacity: 0.7,
                            fillOpacity: 0
                        });
                    } else {
                        agasSeleccionados.add(nombre);
                        this.setStyle({
                            color: '#2b7a4b',
                            weight: 2,
                            opacity: 1,
                            fillOpacity: 0.3,
                            fillColor: '#ffd700'
                        });
                    }
                    actualizarTagsComunidades();
                });
                
                agasData.push({
                    nombre: aga.nombre,
                    coordenadas: aga.coords,
                    polyUbicacion: polyUbicacion,
                    polyComunidad: polyComunidad
                });
            } catch (error) {
                console.error('Error creando polígono de ejemplo:', error);
            }
        });
        
        if (agasData.length > 0) {
            try {
                const bounds = agasData[0].polyUbicacion.getBounds();
                mapUbicacion.fitBounds(bounds);
                mapComunidades.fitBounds(bounds);
            } catch (error) {
                console.error('Error ajustando vista de ejemplo:', error);
            }
        }
        
        if (markerUbicacion) {
            actualizarAgaDesdeCoords(markerUbicacion.getLatLng());
        }
    }
    
    // -------------------- ACTUALIZAR AGA SEGÚN MARCADOR --------------------
    function actualizarAgaDesdeCoords(latlng) {
        console.log('Actualizando desde coordenadas:', latlng);
        
        const latInput = document.getElementById('latitud');
        const lngInput = document.getElementById('longitud');
        const agaNombreInput = document.getElementById('agaNombre');
        
        if (!latInput || !lngInput || !agaNombreInput) {
            console.error('No se encontraron los inputs de coordenadas');
            return;
        }
        
        latInput.value = latlng.lat.toFixed(6);
        lngInput.value = latlng.lng.toFixed(6);
        
        let encontrado = null;
        const punto = [latlng.lat, latlng.lng];
        
        console.log('Buscando AGA para punto:', punto);
        console.log('AGAs disponibles:', agasData.length);
        
        for (let aga of agasData) {
            if (puntoEnPoligono(punto, aga.coordenadas)) {
                encontrado = aga.nombre;
                console.log('¡AGA encontrado!', encontrado);
                break;
            }
        }
        
        agaNombreInput.value = encontrado ? encontrado : 'Fuera de AGA';
        console.log('Valor actualizado:', agaNombreInput.value);
    }
    
    // -------------------- ACTUALIZAR TAGS DE COMUNIDADES --------------------
    function actualizarTagsComunidades() {
        const container = document.getElementById('comunidadesSeleccionadas');
        const hiddenInput = document.getElementById('comunidadesAGA');
        
        if (!container) return;
        
        container.innerHTML = '';
        const seleccionados = Array.from(agasSeleccionados).sort();
        
        seleccionados.forEach(nombre => {
            const tag = document.createElement('span');
            tag.className = 'aga-tag';
            tag.innerHTML = `${nombre} <button type="button" class="remove-aga" data-aga="${nombre}"><i class="fas fa-times"></i></button>`;
            container.appendChild(tag);
        });
        
        hiddenInput.value = JSON.stringify(seleccionados);
        
        document.querySelectorAll('.remove-aga').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.preventDefault();
                const nombre = this.dataset.aga;
                deseleccionarAGA(nombre);
            });
        });
    }
    
    // -------------------- DESELECCIONAR AGA --------------------
    function deseleccionarAGA(nombre) {
        agasSeleccionados.delete(nombre);
        
        const aga = agasData.find(a => a.nombre === nombre);
        if (aga && aga.polyComunidad) {
            aga.polyComunidad.setStyle({
                color: '#2b7a4b',
                weight: 1.5,
                opacity: 0.7,
                fillOpacity: 0
            });
        }
        
        actualizarTagsComunidades();
    }
    
    // -------------------- REDES SOCIALES --------------------
    const urlFacebook = document.getElementById('urlFacebook');
    const urlX = document.getElementById('urlX');
    const urlTiktok = document.getElementById('urlTiktok');
    const urlInstagram = document.getElementById('urlInstagram');
    const otrasRedesContainer = document.getElementById('otrasRedesContainer');
    const btnAgregarOtraRed = document.getElementById('agregarOtraRed');
    
    let contadorOtrasRedes = 0;
    
    function agregarOtraRed() {
        contadorOtrasRedes++;
        const id = `otra-red-${contadorOtrasRedes}`;
        
        const div = document.createElement('div');
        div.className = 'otra-red-item';
        div.id = id;
        div.innerHTML = `
            <input type="text" class="otra-red-nombre" placeholder="Nombre de la red (ej: LinkedIn)" id="${id}-nombre">
            <input type="url" class="otra-red-url" placeholder="https://..." id="${id}-url">
            <button type="button" class="btn-eliminar-red" onclick="eliminarOtraRed('${id}')">
                <i class="fas fa-times-circle"></i>
            </button>
        `;
        otrasRedesContainer.appendChild(div);
    }
    
    window.eliminarOtraRed = function(id) {
        const elemento = document.getElementById(id);
        if (elemento) {
            elemento.remove();
        }
    };
    
    if (btnAgregarOtraRed) {
        btnAgregarOtraRed.addEventListener('click', agregarOtraRed);
    }
    
    function esUrlValida(url) {
        if (!url || url.trim() === '') return true;
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    }
    
    function validarRedesSociales() {
        const urls = [
            urlFacebook?.value || '',
            urlX?.value || '',
            urlTiktok?.value || '',
            urlInstagram?.value || ''
        ];
        
        for (let url of urls) {
            if (url && url.trim() !== '') {
                if (!esUrlValida(url)) {
                    alert('Una de las URLs ingresadas no es válida');
                    return false;
                }
                return true;
            }
        }
        
        const otrasRedes = document.querySelectorAll('.otra-red-item');
        for (let red of otrasRedes) {
            const nombre = red.querySelector('.otra-red-nombre')?.value || '';
            const url = red.querySelector('.otra-red-url')?.value || '';
            if (nombre && nombre.trim() !== '' && url && url.trim() !== '') {
                if (!esUrlValida(url)) {
                    alert(`La URL de ${nombre} no es válida`);
                    return false;
                }
                return true;
            }
        }
        
        alert('Debe completar al menos una URL de red social');
        return false;
    }
    
    function obtenerRedesFormateadas() {
        const redes = [];
        
        if (urlFacebook?.value?.trim()) {
            redes.push(`Facebook: ${urlFacebook.value.trim()}`);
        }
        if (urlX?.value?.trim()) {
            redes.push(`X: ${urlX.value.trim()}`);
        }
        if (urlTiktok?.value?.trim()) {
            redes.push(`TikTok: ${urlTiktok.value.trim()}`);
        }
        if (urlInstagram?.value?.trim()) {
            redes.push(`Instagram: ${urlInstagram.value.trim()}`);
        }
        
        const otrasRedes = document.querySelectorAll('.otra-red-item');
        otrasRedes.forEach(red => {
            const nombre = red.querySelector('.otra-red-nombre')?.value || '';
            const url = red.querySelector('.otra-red-url')?.value || '';
            if (nombre && nombre.trim() !== '' && url && url.trim() !== '') {
                redes.push(`${nombre.trim()}: ${url.trim()}`);
            }
        });
        
        return redes.join(' | ');
    }
    
    // -------------------- CONDICIONAL DE POTENCIACIÓN --------------------
    const potSelect = document.getElementById('potenciacionTipo');
    const condDiv = document.getElementById('condicionalPotenciacion');
    
    function actualizarCondicional() {
        const val = potSelect?.value;
        if (!condDiv) return;
        
        condDiv.style.display = val ? 'block' : 'none';
        condDiv.innerHTML = '';
        
        if (val === 'Aumento del número de beneficiarios') {
            condDiv.innerHTML = `
                <div class="campo"><label><i class="fas fa-user-plus"></i> Cuántos beneficiarios nuevos alcanzaría *</label>
                <input type="number" id="nuevosBeneficiarios" min="0" required class="obligatorio"></div>
            `;
        } else if (val === 'Mejora de los servicios') {
            condDiv.innerHTML = `
                <div class="campo"><label><i class="fas fa-star"></i> En qué consiste la mejora * (máx 500 caracteres)</label>
                <textarea id="descripcionMejora" rows="2" maxlength="500" required class="obligatorio"></textarea>
                <div class="nota">máx 500 caracteres.</div></div>
            `;
        }
    }
    
    if (potSelect) {
        potSelect.addEventListener('change', actualizarCondicional);
    }
    
    // -------------------- INICIALIZACIÓN --------------------
    function init() {
        console.log('Inicializando aplicación...');
        initMapas();
        
        // Pequeño retraso para asegurar que los mapas estén listos
        setTimeout(() => {
            cargarKML();
        }, 500);
        
        actualizarCondicional();
    }
    
    // Iniciar cuando el DOM esté listo
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
    
    // -------------------- ENVÍO DEL FORMULARIO --------------------
    const form = document.getElementById('proyectoForm');
    const respuestaDiv = document.getElementById('respuesta');
    
    if (form) {
        form.addEventListener('submit', function(e) {
            e.preventDefault();
            
            // Validaciones
            if (document.getElementById('domicilioCanton').value !== 'Guayaquil') {
                alert('El domicilio de la organización debe ser Guayaquil');
                return;
            }
            
            if (!validarRedesSociales()) return;
            
            const agaNombreInput = document.getElementById('agaNombre');
            if (agaNombreInput.value === 'Fuera de AGA') {
                alert('El marcador debe estar ubicado dentro de un polígono AGA válido');
                return;
            }
            
            if (agasSeleccionados.size === 0) {
                alert('Debe seleccionar al menos una comunidad (AGA) en el mapa interactivo');
                return;
            }
            
            if (!document.getElementById('direccionInstitucion').value.trim()) {
                alert('Debe ingresar la dirección de la institución');
                return;
            }
            
            // Recolectar datos básicos (sin el PDF aún)
            const formData = new FormData();
            
            // Datos de la organización
            formData.append('orgNombre', document.getElementById('orgNombre').value);
            formData.append('ruc', document.getElementById('ruc').value);
            formData.append('repLegal', document.getElementById('repLegal').value);
            formData.append('cedulaRep', document.getElementById('cedulaRep').value);
            formData.append('telefono', document.getElementById('telefono').value);
            formData.append('email', document.getElementById('email').value);
            formData.append('fechaInauguracion', document.getElementById('fechaInauguracion').value);
            formData.append('redesSociales', obtenerRedesFormateadas());
            formData.append('sitioWeb', document.getElementById('sitioWeb').value);
            formData.append('domicilioCanton', document.getElementById('domicilioCanton').value);
            formData.append('direccionInstitucion', document.getElementById('direccionInstitucion').value);
            formData.append('latitud', document.getElementById('latitud').value);
            formData.append('longitud', document.getElementById('longitud').value);
            formData.append('agaUbicacion', document.getElementById('agaNombre').value);
            
            // Datos del proyecto
            formData.append('nombreProyecto', document.getElementById('nombreProyecto').value);
            formData.append('tipoProyecto', document.getElementById('tipoProyecto').value);
            formData.append('objetoProyecto', document.getElementById('objetoProyecto').value);
            formData.append('comunidadesAGA', document.getElementById('comunidadesAGA').value);
            formData.append('tiempoDesarrollo', document.getElementById('tiempoDesarrollo').value);
            formData.append('beneficiariosDirectos', document.getElementById('beneficiariosDirectos').value);
            formData.append('potenciacionTipo', potSelect?.value || '');
            
            if (potSelect?.value === 'Aumento del número de beneficiarios') {
                const nuevos = document.getElementById('nuevosBeneficiarios');
                if (!nuevos || !nuevos.value) { 
                    alert('Complete el campo de nuevos beneficiarios'); 
                    return; 
                }
                formData.append('nuevosBeneficiarios', nuevos.value);
                formData.append('descripcionMejora', '');
            } else if (potSelect?.value === 'Mejora de los servicios') {
                const mejora = document.getElementById('descripcionMejora');
                if (!mejora || !mejora.value) { 
                    alert('Complete la descripción de mejora'); 
                    return; 
                }
                formData.append('descripcionMejora', mejora.value);
                formData.append('nuevosBeneficiarios', '');
            } else {
                formData.append('nuevosBeneficiarios', '');
                formData.append('descripcionMejora', '');
            }
            
            formData.append('monto51', document.getElementById('monto51').value);
            
            // Procesar el archivo PDF
            const fileInput = document.getElementById('pdfFile');
            if (fileInput.files.length === 0) { 
                alert('Seleccione un archivo PDF'); 
                return; 
            }
            
            const pdfFile = fileInput.files[0];
            if (pdfFile.type !== 'application/pdf') { 
                alert('Solo se permiten archivos PDF'); 
                return; 
            }
            if (pdfFile.size > 10 * 1024 * 1024) { 
                alert('El PDF no puede exceder 10 MB'); 
                return; 
            }
            
            // Mostrar indicador de carga
            respuestaDiv.innerHTML = '<span style="background:#f39c12; color:white; padding:8px 25px; border-radius:40px;">⏳ Enviando datos y PDF...</span>';
            
            // Leer el archivo como Base64 y luego enviar
            const reader = new FileReader();
            reader.onload = function(e) {
                // Extraer solo la parte Base64 (sin el prefijo data:application/pdf;base64,)
                const base64Data = e.target.result.split(',')[1];
                
                // Agregar los datos del PDF al FormData
                formData.append('pdfFile', base64Data);
                formData.append('pdfFileName', pdfFile.name);
                
                // Enviar todos los datos
                enviarFormulario(formData);
            };
            reader.onerror = function() {
                respuestaDiv.innerHTML = '<span style="background:#a53f3f; color:white; padding:8px 25px; border-radius:40px;">❌ Error al leer el archivo PDF</span>';
            };
            reader.readAsDataURL(pdfFile); // Lee el archivo como Data URL (base64)
        });
    }
    
    // Función separada para enviar el formulario (para mejor organización)
    function enviarFormulario(formData) {
        fetch(scriptURL, { 
            method: 'POST', 
            body: formData 
        })
        .then(res => {
            if (!res.ok) {
                throw new Error(`HTTP error! status: ${res.status}`);
            }
            return res.text();
        })
        .then(data => {
            console.log('Respuesta del servidor:', data);
            
            // Intentar parsear como JSON si es posible
            let respuestaJson;
            try {
                respuestaJson = JSON.parse(data);
            } catch (e) {
                // No es JSON, mostrar como texto
                respuestaDiv.innerHTML = `<span style="background:#2b7a4b; color:white; padding:8px 25px; border-radius:40px;">✅ Registro guardado exitosamente</span>`;
                resetearFormulario();
                return;
            }
            
            // Si es JSON y tiene mensaje de éxito
            if (respuestaJson.result === 'success') {
                respuestaDiv.innerHTML = '<span style="background:#2b7a4b; color:white; padding:8px 25px; border-radius:40px;">✅ Registro guardado exitosamente</span>';
                resetearFormulario();
            } else {
                respuestaDiv.innerHTML = `<span style="background:#a53f3f; color:white; padding:8px 25px; border-radius:40px;">❌ Error: ${respuestaJson.message || 'Error desconocido'}</span>`;
            }
        })
        .catch(err => {
            console.error('Error en fetch:', err);
            respuestaDiv.innerHTML = '<span style="background:#a53f3f; color:white; padding:8px 25px; border-radius:40px;">❌ Error al guardar. Revise conexión o URL Apps Script.</span>';
        });
    }
    
    // Función para resetear el formulario después de un envío exitoso
    function resetearFormulario() {
        const form = document.getElementById('proyectoForm');
        if (form) {
            form.reset();
            actualizarCondicional();
            
            agasSeleccionados.clear();
            agasData.forEach(aga => {
                if (aga.polyComunidad) {
                    aga.polyComunidad.setStyle({
                        color: '#2b7a4b',
                        weight: 1.5,
                        opacity: 0.7,
                        fillOpacity: 0
                    });
                }
            });
            actualizarTagsComunidades();
            
            // Resetear marcador a posición inicial
            if (markerUbicacion) {
                markerUbicacion.setLatLng([-2.1894, -79.8891]);
                actualizarAgaDesdeCoords(markerUbicacion.getLatLng());
            }
        }
    }
})();