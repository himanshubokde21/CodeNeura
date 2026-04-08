// CodeNeura — Landing Page JS
// Three.js AI Orb + Scroll Animations + Typed Text

(function () {
    'use strict';

    // ── Typed headline ────────────────────────────────────────────
    const words = ['codebases', 'projects', 'repositories', 'modules'];
    const el = document.getElementById('typed-word');
    if (el) {
        let wi = 0, ci = 0, deleting = false;
        function type() {
            const word = words[wi % words.length];
            if (deleting) {
                el.textContent = word.substring(0, --ci);
                if (ci === 0) { deleting = false; wi++; setTimeout(type, 500); return; }
                setTimeout(type, 55);
            } else {
                el.textContent = word.substring(0, ++ci);
                if (ci === word.length) { deleting = true; setTimeout(type, 2200); return; }
                setTimeout(type, 90);
            }
        }
        type();
    }

    // ── Scroll-reveal ─────────────────────────────────────────────
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.12 });
    document.querySelectorAll('[data-animate]').forEach(el => observer.observe(el));

    // ── Three.js Orb ──────────────────────────────────────────────
    const canvas = document.getElementById('orb-canvas');
    if (!canvas || typeof THREE === 'undefined') return;

    const container = canvas.parentElement;
    let W = container.clientWidth || 480;
    let H = container.clientHeight || 480;

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, W / H, 0.1, 100);
    camera.position.z = 5;

    // ── Orb layers ────────────────────────────────────────────────
    // Outer wireframe icosahedron — purple
    const outerGeo = new THREE.IcosahedronGeometry(2.1, 1);
    const outerMat = new THREE.MeshBasicMaterial({ color: 0x7c3aed, wireframe: true, opacity: 0.22, transparent: true });
    const outer = new THREE.Mesh(outerGeo, outerMat);
    scene.add(outer);

    // Mid wireframe icosahedron — blue, counter-rotates
    const midGeo = new THREE.IcosahedronGeometry(1.65, 1);
    const midMat = new THREE.MeshBasicMaterial({ color: 0x4f46e5, wireframe: true, opacity: 0.18, transparent: true });
    const mid = new THREE.Mesh(midGeo, midMat);
    scene.add(mid);

    // Inner soft sphere — glow shell
    const innerGeo = new THREE.SphereGeometry(1.15, 32, 32);
    const innerMat = new THREE.MeshBasicMaterial({ color: 0x22d3ee, opacity: 0.06, transparent: true });
    const inner = new THREE.Mesh(innerGeo, innerMat);
    scene.add(inner);

    // Core bright ball — pulsing cyan
    const coreGeo = new THREE.SphereGeometry(0.28, 32, 32);
    const coreMat = new THREE.MeshBasicMaterial({ color: 0x22d3ee, opacity: 0.95, transparent: true });
    const core = new THREE.Mesh(coreGeo, coreMat);
    scene.add(core);

    // Ring 1 — tilted purple
    const r1Geo = new THREE.TorusGeometry(1.6, 0.018, 16, 120);
    const r1Mat = new THREE.MeshBasicMaterial({ color: 0xa855f7, opacity: 0.45, transparent: true });
    const ring1 = new THREE.Mesh(r1Geo, r1Mat);
    ring1.rotation.x = Math.PI / 2.6;
    scene.add(ring1);

    // Ring 2 — thinner blue, different tilt
    const r2Geo = new THREE.TorusGeometry(1.9, 0.01, 16, 120);
    const r2Mat = new THREE.MeshBasicMaterial({ color: 0x4f46e5, opacity: 0.28, transparent: true });
    const ring2 = new THREE.Mesh(r2Geo, r2Mat);
    ring2.rotation.x = Math.PI / 1.7;
    ring2.rotation.z = Math.PI / 5;
    scene.add(ring2);

    // Outer ambient glow halo — large, very faint
    const haloGeo = new THREE.SphereGeometry(2.5, 32, 32);
    const haloMat = new THREE.MeshBasicMaterial({ color: 0x7c3aed, opacity: 0.035, transparent: true });
    scene.add(new THREE.Mesh(haloGeo, haloMat));

    // ── Mouse parallax ────────────────────────────────────────────
    let targetRX = 0, targetRY = 0;
    let currentRX = 0, currentRY = 0;

    document.addEventListener('mousemove', (e) => {
        targetRY = (e.clientX / window.innerWidth - 0.5) * 1.2;
        targetRX = -(e.clientY / window.innerHeight - 0.5) * 0.7;
    });

    // Touch support
    document.addEventListener('touchmove', (e) => {
        const t = e.touches[0];
        targetRY = (t.clientX / window.innerWidth - 0.5) * 0.8;
        targetRX = -(t.clientY / window.innerHeight - 0.5) * 0.4;
    }, { passive: true });

    // ── Animate ───────────────────────────────────────────────────
    let t = 0;
    function animate() {
        requestAnimationFrame(animate);
        t += 0.01;

        // Smooth camera-follow parallax
        currentRX += (targetRX - currentRX) * 0.04;
        currentRY += (targetRY - currentRY) * 0.04;
        scene.rotation.x = currentRX;
        scene.rotation.y = currentRY;

        // Layer rotations
        outer.rotation.x += 0.0025;
        outer.rotation.y += 0.004;
        mid.rotation.x  -= 0.003;
        mid.rotation.y  -= 0.005;
        inner.rotation.y += 0.006;
        ring1.rotation.z += 0.004;
        ring2.rotation.z -= 0.003;

        // Core pulse
        const p = 1 + Math.sin(t * 1.8) * 0.22;
        core.scale.setScalar(p);
        coreMat.opacity = 0.7 + Math.sin(t * 1.3) * 0.25;

        // Outer wireframe breathe
        const breathe = 1 + Math.sin(t * 0.9) * 0.025;
        outer.scale.setScalar(breathe);

        renderer.render(scene, camera);
    }
    animate();

    // ── Resize ────────────────────────────────────────────────────
    const onResize = () => {
        W = container.clientWidth || 480;
        H = container.clientHeight || 480;
        renderer.setSize(W, H);
        camera.aspect = W / H;
        camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', onResize);
    onResize();

    // ── Navbar scroll effect ──────────────────────────────────────
    const nav = document.querySelector('nav.landing-nav');
    window.addEventListener('scroll', () => {
        if (nav) nav.style.background = window.scrollY > 40
            ? 'rgba(5,8,22,0.92)'
            : 'rgba(5,8,22,0.7)';
    }, { passive: true });

    // ── Smooth anchor scroll ──────────────────────────────────────
    document.querySelectorAll('a[href^="#"]').forEach(a => {
        a.addEventListener('click', e => {
            const id = a.getAttribute('href').slice(1);
            const target = document.getElementById(id);
            if (target) { e.preventDefault(); target.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
        });
    });

})();
