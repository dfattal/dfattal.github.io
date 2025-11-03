/**
 * Globe View
 * 3D Earth globe visualization with site markers
 * Uses Three.js for rendering and CSS2DRenderer for labels
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

export class GlobeView {
    constructor(container, onSiteSelected) {
        this.container = container;
        this.onSiteSelected = onSiteSelected;

        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.labelRenderer = null;
        this.controls = null;
        this.earth = null;
        this.atmosphere = null;
        this.markers = [];
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.hoveredMarker = null;
        this.animationId = null;

        this.isInitialized = false;
    }

    /**
     * Convert latitude/longitude to 3D position on sphere
     * @param {number} lat - Latitude in degrees (-90 to 90)
     * @param {number} lon - Longitude in degrees (-180 to 180)
     * @param {number} radius - Sphere radius
     * @returns {THREE.Vector3} 3D position on sphere surface
     */
    latLongToVector3(lat, lon, radius) {
        const phi = (90 - lat) * (Math.PI / 180);
        const theta = (lon + 180) * (Math.PI / 180);

        return new THREE.Vector3(
            -radius * Math.sin(phi) * Math.cos(theta),
            radius * Math.cos(phi),
            radius * Math.sin(phi) * Math.sin(theta)
        );
    }

    /**
     * Initialize the globe scene
     * @param {Array} sites - Array of site objects with id, name, latitude, longitude, thumbnail
     */
    async init(sites) {
        if (this.isInitialized) return;

        // Create scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x000510); // Dark space background

        // Create camera
        const aspect = window.innerWidth / window.innerHeight;
        this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);

        // Position camera to face Europe (view from southwest)
        // Europe is around 50°N, 10°E, so position camera at 20°N, -30°W for good view
        const cameraDistance = 12;
        const cameraLat = 45; // Latitude for camera view angle
        const cameraLon = 10; // Longitude for camera view angle
        const cameraPos = this.latLongToVector3(cameraLat, cameraLon, cameraDistance);
        this.camera.position.copy(cameraPos);
        this.camera.lookAt(0, 0, 0); // Look at globe center

        // Create WebGL renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.container.appendChild(this.renderer.domElement);

        // Create CSS2D label renderer
        this.labelRenderer = new CSS2DRenderer();
        this.labelRenderer.setSize(window.innerWidth, window.innerHeight);
        this.labelRenderer.domElement.style.position = 'absolute';
        this.labelRenderer.domElement.style.top = '0';
        this.labelRenderer.domElement.style.pointerEvents = 'none'; // Allow clicks to pass through
        this.container.appendChild(this.labelRenderer.domElement);

        // Add lights
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(5, 3, 5);
        this.scene.add(directionalLight);

        // Create Earth sphere
        await this.createEarth();

        // Create atmosphere glow
        this.createAtmosphere();

        // Add site markers
        this.createSiteMarkers(sites);

        // Add orbit controls
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.enableZoom = true;
        this.controls.minDistance = 7;
        this.controls.maxDistance = 20;
        this.controls.autoRotate = true;
        this.controls.autoRotateSpeed = 0.5;

        // Add event listeners
        this.addEventListeners();

        this.isInitialized = true;

        // Start animation loop
        this.animate();
    }

    /**
     * Create Earth sphere with texture
     */
    async createEarth() {
        const geometry = new THREE.SphereGeometry(5, 64, 64);

        // Load Earth texture
        const textureLoader = new THREE.TextureLoader();
        const earthTexture = await new Promise((resolve, reject) => {
            textureLoader.load(
                'models/textures/earth_day.jpg',
                resolve,
                undefined,
                reject
            );
        });

        const material = new THREE.MeshStandardMaterial({
            map: earthTexture,
            roughness: 0.9,
            metalness: 0.1
        });

        this.earth = new THREE.Mesh(geometry, material);
        this.scene.add(this.earth);
    }

    /**
     * Create atmosphere glow effect around Earth
     */
    createAtmosphere() {
        const geometry = new THREE.SphereGeometry(5.2, 64, 64);
        const material = new THREE.ShaderMaterial({
            vertexShader: `
                varying vec3 vNormal;
                void main() {
                    vNormal = normalize(normalMatrix * normal);
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                varying vec3 vNormal;
                void main() {
                    float intensity = pow(0.6 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.0);
                    gl_FragColor = vec4(0.3, 0.6, 1.0, 1.0) * intensity;
                }
            `,
            blending: THREE.AdditiveBlending,
            side: THREE.BackSide,
            transparent: true
        });

        this.atmosphere = new THREE.Mesh(geometry, material);
        this.scene.add(this.atmosphere);
    }

    /**
     * Position labels with collision detection to avoid overlap
     * @param {Array} sites - Array of site objects
     * @param {number} floatingRadius - Distance from globe center for labels
     * @param {number} minLabelDistance - Minimum distance between label centers
     * @returns {Array} Array of Vector3 positions for labels
     */
    positionLabelsWithCollisionAvoidance(sites, floatingRadius = 8.0, minLabelDistance = 1.5) {
        // Calculate initial radial positions
        const positions = sites.map(site =>
            this.latLongToVector3(site.latitude, site.longitude, floatingRadius)
        );

        // Iterative collision resolution
        const maxIterations = 50;
        const pushStrength = 0.5;

        for (let iter = 0; iter < maxIterations; iter++) {
            let hasCollision = false;

            // Check all pairs for collisions
            for (let i = 0; i < positions.length; i++) {
                for (let j = i + 1; j < positions.length; j++) {
                    const distance = positions[i].distanceTo(positions[j]);

                    if (distance < minLabelDistance) {
                        // Calculate repulsion direction
                        const repulsion = new THREE.Vector3()
                            .subVectors(positions[i], positions[j])
                            .normalize();

                        const pushAmount = (minLabelDistance - distance) * pushStrength;

                        // Apply repulsion to both labels
                        positions[i].add(repulsion.clone().multiplyScalar(pushAmount));
                        positions[j].sub(repulsion.clone().multiplyScalar(pushAmount));

                        hasCollision = true;
                    }
                }
            }

            // Normalize positions back to sphere surface at floatingRadius
            positions.forEach(pos => {
                pos.normalize().multiplyScalar(floatingRadius);
            });

            // If no collisions detected, we're done
            if (!hasCollision) {
                console.log(`Label positioning converged in ${iter + 1} iterations`);
                break;
            }
        }

        return positions;
    }

    /**
     * Create a connecting line from site to label
     * @param {THREE.Vector3} sitePosition - Position on globe surface
     * @param {THREE.Vector3} labelPosition - Floating label position
     * @returns {THREE.Line} Line object
     */
    createConnectingLine(sitePosition, labelPosition) {
        const points = [sitePosition, labelPosition];
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({
            color: 0xffffff,
            opacity: 0.5,
            transparent: true,
            linewidth: 1
        });

        return new THREE.Line(geometry, material);
    }

    /**
     * Create site markers at lat/long positions
     * @param {Array} sites - Array of site objects
     */
    createSiteMarkers(sites) {
        const markerRadius = 5.05; // Slightly above Earth surface
        const floatingRadius = 6.5; // Distance for floating labels (shorter lines)

        // Calculate optimized label positions with collision avoidance
        const labelPositions = this.positionLabelsWithCollisionAvoidance(sites, floatingRadius);

        sites.forEach((site, index) => {
            // Site position on globe surface
            const sitePosition = this.latLongToVector3(
                site.latitude,
                site.longitude,
                markerRadius
            );

            // Get optimized label position
            const labelPosition = labelPositions[index];

            // Create marker container (for raycasting) at site position
            const markerGeometry = new THREE.SphereGeometry(0.15, 16, 16);
            const markerMaterial = new THREE.MeshBasicMaterial({
                color: 0xff6600,
                transparent: true,
                opacity: 0 // Invisible but clickable
            });
            const markerMesh = new THREE.Mesh(markerGeometry, markerMaterial);
            markerMesh.position.copy(sitePosition);
            markerMesh.userData = { siteId: site.id, siteName: site.name };
            this.scene.add(markerMesh);

            // Create CSS2D label at floating position
            const labelDiv = this.createLabelElement(site);
            const label = new CSS2DObject(labelDiv);
            label.position.copy(labelPosition);
            label.userData = { siteId: site.id };
            this.scene.add(label);

            // Create connecting line from site to label
            const connectingLine = this.createConnectingLine(sitePosition, labelPosition);
            this.scene.add(connectingLine);

            // Store marker data
            this.markers.push({
                mesh: markerMesh,
                label: label,
                line: connectingLine,
                site: site,
                sitePosition: sitePosition.clone(),
                labelPosition: labelPosition.clone()
            });
        });
    }

    /**
     * Create HTML label element for site
     * @param {Object} site - Site object
     * @returns {HTMLElement} Label div element
     */
    createLabelElement(site) {
        const div = document.createElement('div');
        div.className = 'globe-site-marker';
        div.style.pointerEvents = 'auto'; // Enable clicks on label

        // Thumbnail container (circular clip mask)
        const imgContainer = document.createElement('div');
        imgContainer.className = 'globe-thumbnail-container';
        imgContainer.style.width = '80px';
        imgContainer.style.height = '80px';
        imgContainer.style.borderRadius = '50%';
        imgContainer.style.border = '3px solid #ff6600';
        imgContainer.style.marginBottom = '8px';
        imgContainer.style.overflow = 'hidden';
        imgContainer.style.display = 'flex';
        imgContainer.style.alignItems = 'center';
        imgContainer.style.justifyContent = 'center';
        imgContainer.style.boxShadow = '0 0 20px rgba(255, 102, 0, 0.6)';
        imgContainer.style.transition = 'border-color 0.2s ease, box-shadow 0.2s ease';

        // Thumbnail image (zoomed 1.5x)
        const img = document.createElement('img');
        img.src = site.thumbnail || 'models/thumbnails/placeholder.jpg';
        img.alt = site.name;
        img.style.width = '120px'; // 80px * 1.5
        img.style.height = '120px'; // 80px * 1.5
        img.style.objectFit = 'cover';
        img.style.display = 'block';

        imgContainer.appendChild(img);

        // Site name
        const nameSpan = document.createElement('span');
        nameSpan.textContent = site.name;
        nameSpan.style.color = '#ffffff';
        nameSpan.style.fontSize = '14px';
        nameSpan.style.fontWeight = 'bold';
        nameSpan.style.textShadow = '0 0 10px rgba(0, 0, 0, 0.8)';
        nameSpan.style.display = 'block';
        nameSpan.style.textAlign = 'center';

        div.appendChild(imgContainer);
        div.appendChild(nameSpan);

        // Cursor and transition
        div.style.cursor = 'pointer';
        div.style.transition = 'transform 0.2s ease';
        div.dataset.siteId = site.id;

        return div;
    }

    /**
     * Add event listeners for interaction
     */
    addEventListeners() {
        // Mouse move for hover effects
        window.addEventListener('mousemove', this.onMouseMove.bind(this));

        // Click for site selection (desktop)
        window.addEventListener('click', this.onClick.bind(this));

        // Touch for site selection (mobile)
        window.addEventListener('touchend', this.onTouch.bind(this));

        // Window resize
        window.addEventListener('resize', this.onWindowResize.bind(this));
    }

    /**
     * Handle mouse move for hover effects
     */
    onMouseMove(event) {
        // Update mouse position
        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

        // Raycast to find hovered marker
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const markerMeshes = this.markers.map(m => m.mesh);
        const intersects = this.raycaster.intersectObjects(markerMeshes);

        // Reset previous hover
        if (this.hoveredMarker) {
            const label = this.markers.find(m => m.mesh === this.hoveredMarker)?.label;
            if (label) {
                label.element.style.transform = 'scale(1)';
            }
            this.hoveredMarker = null;
        }

        // Apply new hover
        if (intersects.length > 0) {
            this.hoveredMarker = intersects[0].object;
            const label = this.markers.find(m => m.mesh === this.hoveredMarker)?.label;
            if (label) {
                label.element.style.transform = 'scale(1.2)';
            }
            this.renderer.domElement.style.cursor = 'pointer';
        } else {
            this.renderer.domElement.style.cursor = 'default';
        }
    }

    /**
     * Handle touch for site selection (mobile)
     */
    onTouch(event) {
        // Check if touch ended on a label (CSS2D element)
        const touch = event.changedTouches[0];
        const target = document.elementFromPoint(touch.clientX, touch.clientY);

        if (target && target.closest('.globe-site-marker')) {
            const markerElement = target.closest('.globe-site-marker');
            const siteId = markerElement.dataset.siteId;
            if (siteId && this.onSiteSelected) {
                console.log('Touch site selected:', siteId);
                this.onSiteSelected(siteId);
                event.preventDefault(); // Prevent click event from also firing
            }
        }
    }

    /**
     * Handle click for site selection
     */
    onClick(event) {
        // Check if click is on a label (CSS2D element)
        if (event.target.closest('.globe-site-marker')) {
            const markerElement = event.target.closest('.globe-site-marker');
            const siteId = markerElement.dataset.siteId;
            if (siteId && this.onSiteSelected) {
                this.onSiteSelected(siteId);
            }
            return;
        }

        // Raycast for 3D marker meshes
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const markerMeshes = this.markers.map(m => m.mesh);
        const intersects = this.raycaster.intersectObjects(markerMeshes);

        if (intersects.length > 0) {
            const siteId = intersects[0].object.userData.siteId;
            if (siteId && this.onSiteSelected) {
                this.onSiteSelected(siteId);
            }
        }
    }

    /**
     * Handle window resize
     */
    onWindowResize() {
        const width = window.innerWidth;
        const height = window.innerHeight;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();

        this.renderer.setSize(width, height);
        this.labelRenderer.setSize(width, height);
    }

    /**
     * Animation loop
     */
    animate() {
        this.animationId = requestAnimationFrame(this.animate.bind(this));

        // Update controls
        if (this.controls) {
            this.controls.update();
        }

        // Update connecting lines to follow labels
        this.updateConnectingLines();

        // Render scene
        if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
            this.labelRenderer.render(this.scene, this.camera);
        }
    }

    /**
     * Update connecting lines each frame to keep them linked to labels
     */
    updateConnectingLines() {
        if (!this.markers) return;

        this.markers.forEach(marker => {
            if (marker.line && marker.mesh && marker.label) {
                // Get current positions
                const siteWorldPos = new THREE.Vector3();
                marker.mesh.getWorldPosition(siteWorldPos); // Site on globe (rotates with globe)
                const labelWorldPos = marker.label.position; // Label in world space (appears to drift)

                // Update line geometry
                const positions = marker.line.geometry.attributes.position.array;
                // First point: site position on globe
                positions[0] = siteWorldPos.x;
                positions[1] = siteWorldPos.y;
                positions[2] = siteWorldPos.z;
                // Second point: label position
                positions[3] = labelWorldPos.x;
                positions[4] = labelWorldPos.y;
                positions[5] = labelWorldPos.z;

                // Mark geometry as needing update
                marker.line.geometry.attributes.position.needsUpdate = true;
            }
        });
    }

    /**
     * Clean up and dispose of resources
     */
    dispose() {
        // Cancel animation
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }

        // Remove event listeners
        window.removeEventListener('mousemove', this.onMouseMove.bind(this));
        window.removeEventListener('click', this.onClick.bind(this));
        window.removeEventListener('touchend', this.onTouch.bind(this));
        window.removeEventListener('resize', this.onWindowResize.bind(this));

        // Dispose controls
        if (this.controls) {
            this.controls.dispose();
        }

        // Dispose markers and their components explicitly
        if (this.markers) {
            this.markers.forEach(marker => {
                // Dispose line geometry and material
                if (marker.line) {
                    if (marker.line.geometry) marker.line.geometry.dispose();
                    if (marker.line.material) marker.line.material.dispose();
                }
                // Dispose marker mesh geometry and material
                if (marker.mesh) {
                    if (marker.mesh.geometry) marker.mesh.geometry.dispose();
                    if (marker.mesh.material) marker.mesh.material.dispose();
                }
            });
            this.markers = [];
        }

        // Dispose geometries and materials (catch any remaining)
        this.scene.traverse(object => {
            if (object.geometry) {
                object.geometry.dispose();
            }
            if (object.material) {
                if (Array.isArray(object.material)) {
                    object.material.forEach(material => material.dispose());
                } else {
                    object.material.dispose();
                }
            }
        });

        // Remove DOM elements
        if (this.renderer) {
            this.container.removeChild(this.renderer.domElement);
        }
        if (this.labelRenderer) {
            this.container.removeChild(this.labelRenderer.domElement);
        }

        this.isInitialized = false;
    }

    /**
     * Show globe (fade in)
     */
    show() {
        this.container.style.display = 'block';
        setTimeout(() => {
            this.container.classList.add('visible');
        }, 50);
    }

    /**
     * Hide globe (fade out)
     */
    hide() {
        this.container.classList.remove('visible');
        setTimeout(() => {
            this.container.style.display = 'none';
        }, 500);
    }
}
