import { useEffect, useRef } from 'react';
import * as THREE from 'three';

const COLOR_THEMES = {
  cosmic: { primary: [0.66, 0.33, 1.0], secondary: [0.93, 0.28, 0.6], accent: [0.6, 0.2, 0.8] },
  fire:   { primary: [1.0, 0.3, 0.05], secondary: [1.0, 0.7, 0.0],  accent: [0.8, 0.15, 0.0] },
  ocean:  { primary: [0.0, 0.6, 1.0],  secondary: [0.0, 0.9, 0.8],  accent: [0.0, 0.4, 0.7] },
  matrix: { primary: [0.0, 1.0, 0.3],  secondary: [0.0, 0.8, 0.6],  accent: [0.0, 0.5, 0.1] },
  aurora: { primary: [0.5, 0.0, 1.0],  secondary: [0.0, 0.9, 0.5],  accent: [0.8, 0.0, 0.6] },
};

function createNebulaGeometry(count = 12000) {
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const r = Math.random() * 4 + 0.5;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
    colors[i * 3]     = Math.random();
    colors[i * 3 + 1] = Math.random() * 0.5;
    colors[i * 3 + 2] = Math.random();
    sizes[i] = Math.random() * 3 + 0.5;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  return geo;
}

function createWaveGeometry(segments = 256) {
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(segments * 3);
  for (let i = 0; i < segments; i++) {
    positions[i * 3]     = (i / segments - 0.5) * 10;
    positions[i * 3 + 1] = 0;
    positions[i * 3 + 2] = 0;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return geo;
}

export default function VisualizerCanvas({ audioData, mode, colorTheme, sensitivity, bloom, speed }) {
  const mountRef = useRef(null);
  const stateRef = useRef({});

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    // Scene
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, el.clientWidth / el.clientHeight, 0.1, 1000);
    camera.position.z = 5;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(el.clientWidth, el.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setClearColor(0x000000, 1);
    el.appendChild(renderer.domElement);

    // Ambient stars background
    const starGeo = new THREE.BufferGeometry();
    const starCount = 3000;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount * 3; i++) starPos[i] = (Math.random() - 0.5) * 100;
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.08, transparent: true, opacity: 0.6 });
    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);

    // Nebula particles
    const nebulaGeo = createNebulaGeometry(12000);
    const nebulaMat = new THREE.ShaderMaterial({
      vertexShader: `
        attribute float size;
        attribute vec3 color;
        varying vec3 vColor;
        uniform float uScale;
        uniform float uTime;
        void main() {
          vColor = color;
          vec3 pos = position;
          pos.x += sin(uTime * 0.5 + position.z) * 0.2;
          pos.y += cos(uTime * 0.3 + position.x) * 0.2;
          vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
          gl_PointSize = size * uScale * (300.0 / -mvPos.z);
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        void main() {
          float dist = length(gl_PointCoord - vec2(0.5));
          if (dist > 0.5) discard;
          float alpha = 1.0 - (dist * 2.0);
          alpha = pow(alpha, 1.5);
          gl_FragColor = vec4(vColor, alpha * 0.85);
        }
      `,
      uniforms: {
        uScale: { value: 1.0 },
        uTime: { value: 0.0 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
    });
    const nebula = new THREE.Points(nebulaGeo, nebulaMat);
    scene.add(nebula);

    // Waveform line
    const waveGeo = createWaveGeometry(256);
    const waveMat = new THREE.LineBasicMaterial({
      color: 0xa855f7,
      linewidth: 2,
      transparent: true,
      opacity: 0.9,
    });
    const waveLine = new THREE.Line(waveGeo, waveMat);
    waveLine.position.z = 2;
    scene.add(waveLine);

    // Galaxy ring
    const ringGeo = new THREE.TorusGeometry(2.5, 0.02, 8, 200);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xec4899, transparent: true, opacity: 0.4 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    scene.add(ring);
    const ring2 = new THREE.Mesh(
      new THREE.TorusGeometry(3.2, 0.01, 8, 200),
      new THREE.MeshBasicMaterial({ color: 0xa855f7, transparent: true, opacity: 0.3 })
    );
    ring2.rotation.x = Math.PI / 3;
    scene.add(ring2);

    // Bar visualizer (frequency bars)
    const barCount = 64;
    const bars = [];
    const barGroup = new THREE.Group();
    for (let i = 0; i < barCount; i++) {
      const angle = (i / barCount) * Math.PI * 2;
      const barGeo = new THREE.BoxGeometry(0.06, 1, 0.06);
      const barMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color().setHSL(i / barCount, 1, 0.6),
        transparent: true,
        opacity: 0.85,
      });
      const bar = new THREE.Mesh(barGeo, barMat);
      const radius = 1.8;
      bar.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
      bar.rotation.y = -angle;
      bars.push(bar);
      barGroup.add(bar);
    }
    scene.add(barGroup);

    // Central sphere
    const sphereGeo = new THREE.SphereGeometry(0.4, 32, 32);
    const sphereMat = new THREE.MeshBasicMaterial({ color: 0xa855f7, transparent: true, opacity: 0.6, wireframe: true });
    const sphere = new THREE.Mesh(sphereGeo, sphereMat);
    scene.add(sphere);

    stateRef.current = { scene, camera, renderer, nebula, nebulaMat, waveLine, waveGeo, ring, ring2, bars, barGroup, sphere, sphereGeo, sphereMat, stars };

    const handleResize = () => {
      if (!el) return;
      camera.aspect = el.clientWidth / el.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(el.clientWidth, el.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
    };
  }, []);

  // Animation loop - updates based on audioData + settings
  useEffect(() => {
    const state = stateRef.current;
    if (!state.renderer) return;

    let frameId;
    let t = 0;
    const { scene, camera, renderer, nebula, nebulaMat, waveLine, waveGeo, ring, ring2, bars, barGroup, sphere, stars } = state;
    const theme = COLOR_THEMES[colorTheme] || COLOR_THEMES.cosmic;

    const animate = () => {
      frameId = requestAnimationFrame(animate);
      t += 0.016 * speed;

      const bass = (audioData?.bass || 0) * sensitivity;
      const mid = (audioData?.mid || 0) * sensitivity;
      const overall = (audioData?.overall || 0) * sensitivity;
      const waveform = audioData?.waveform;

      // Update nebula uniforms
      nebulaMat.uniforms.uTime.value = t;
      nebulaMat.uniforms.uScale.value = 1.0 + bass * 2.0;

      // Rotate nebula
      nebula.rotation.y = t * 0.05;
      nebula.rotation.x = Math.sin(t * 0.03) * 0.3;

      // Update waveform line
      if (waveform && waveform.length > 0) {
        const positions = waveGeo.attributes.position;
        const segments = positions.count;
        for (let i = 0; i < segments; i++) {
          const idx = Math.floor((i / segments) * waveform.length);
          const v = (waveform[idx] / 128.0 - 1.0) * 2.0 * sensitivity;
          positions.setY(i, v);
        }
        positions.needsUpdate = true;
      }
      waveLine.material.color.setHSL(t * 0.05 % 1, 1, 0.6);
      waveLine.material.opacity = 0.5 + overall * 0.5;
      waveLine.position.y = -2;

      // Rings
      ring.rotation.z = t * 0.2 * speed;
      ring.rotation.x = Math.sin(t * 0.1) * 0.5;
      ring.scale.setScalar(1.0 + bass * 0.5);
      ring.material.color.setHSL(theme.primary[0] + t * 0.02 % 1, 1, 0.6);
      ring.material.opacity = 0.3 + mid * 0.5;

      ring2.rotation.z = -t * 0.15 * speed;
      ring2.rotation.y = t * 0.1;
      ring2.scale.setScalar(1.0 + mid * 0.4);
      ring2.material.color.setHSL(theme.secondary[0] + t * 0.03 % 1, 1, 0.6);

      // Frequency bars
      barGroup.rotation.y = t * 0.3 * speed;
      bars.forEach((bar, i) => {
        const audioIntensity = overall * sensitivity * 3;
        const barHeight = 0.1 + audioIntensity * (0.5 + 0.5 * Math.sin(t * 2 + i * 0.3));
        bar.scale.y = barHeight * (1 + bass * 2);
        bar.position.y = (bar.scale.y * 0.5) - 0.5;
        bar.material.color.setHSL((i / bars.length + t * 0.1) % 1, 1, 0.6);
        bar.material.opacity = 0.5 + mid * 0.5;
      });

      // Central sphere pulses
      const sphereScale = 0.4 + bass * 0.8;
      sphere.scale.setScalar(sphereScale);
      sphere.rotation.x = t * 0.5;
      sphere.rotation.y = t * 0.3;
      sphere.material.color.setHSL(theme.primary[0] + bass * 0.3, 1, 0.7);
      sphere.material.opacity = 0.4 + overall * 0.6;

      // Stars drift
      stars.rotation.y = t * 0.005;
      stars.rotation.x = Math.sin(t * 0.003) * 0.1;

      // Camera gentle orbit
      if (mode !== 'bars') {
        camera.position.x = Math.sin(t * 0.05) * 0.5;
        camera.position.y = Math.cos(t * 0.07) * 0.3;
      }
      camera.lookAt(0, 0, 0);

      // Mode-specific visibility
      const showNebula = mode === 'nebula' || mode === 'galaxy';
      const showBars = mode === 'bars' || mode === 'galaxy';
      const showWave = mode === 'wave' || mode === 'galaxy';
      const showRings = mode === 'galaxy' || mode === 'nebula';

      nebula.visible = showNebula;
      barGroup.visible = showBars;
      waveLine.visible = showWave;
      ring.visible = showRings;
      ring2.visible = showRings;

      renderer.render(scene, camera);
    };

    animate();
    return () => cancelAnimationFrame(frameId);
  }, [audioData, mode, colorTheme, sensitivity, bloom, speed]);

  return (
    <div
      ref={mountRef}
      className="visualizer-canvas"
      style={{ background: 'radial-gradient(ellipse at center, #0a0010 0%, #000000 100%)' }}
    />
  );
}



