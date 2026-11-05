import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { ModelNode } from '../lib/types';

interface ViewportProps {
  nodes: ModelNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export default function Viewport({ nodes, selectedId, onSelect }: ViewportProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef(nodes);
  const selectedRef = useRef(selectedId);
  const onSelectRef = useRef(onSelect);
  nodesRef.current = nodes;
  selectedRef.current = selectedId;
  onSelectRef.current = onSelect;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x171c26);
    const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 10000);
    camera.position.set(5.5, 4.2, 7.5);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    host.appendChild(renderer.domElement);

    const content = new THREE.Group();
    content.name = 'ImportedModels';
    scene.add(content);
    scene.add(new THREE.GridHelper(20, 20, 0x586476, 0x303946));
    scene.add(new THREE.AxesHelper(1.5));
    scene.add(new THREE.HemisphereLight(0xffffff, 0x3a4352, 2.1));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
    keyLight.position.set(5, 9, 7);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0x9db9ff, 0.8);
    fillLight.position.set(-6, 3, -5);
    scene.add(fillLight);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.target.set(0, 0.8, 0);
    controls.minDistance = 0.05;
    controls.maxDistance = 10000;

    const resize = () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const handlePointerDown = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(content.children, true);
      if (!hits.length) return;
      let current: THREE.Object3D | null = hits[0].object;
      while (current && current.parent !== content) current = current.parent;
      const id = current?.userData.nodeId as string | undefined;
      if (id) onSelectRef.current(id);
    };
    renderer.domElement.addEventListener('pointerdown', handlePointerDown);

    let frame = 0;
    const render = () => {
      frame = requestAnimationFrame(render);
      const currentNodes = nodesRef.current;
      const activeObjects = new Set(currentNodes.map((node) => node.object));
      for (const child of [...content.children]) {
        if (!activeObjects.has(child as THREE.Group)) content.remove(child);
      }
      for (const node of currentNodes) {
        node.object.position.set(...node.position);
        node.object.rotation.set(
          THREE.MathUtils.degToRad(node.rotation[0]),
          THREE.MathUtils.degToRad(node.rotation[1]),
          THREE.MathUtils.degToRad(node.rotation[2]),
        );
        node.object.scale.setScalar(node.scale);
        node.object.visible = node.visible ?? true;
        node.object.userData.nodeId = node.id;
        if (node.object.parent !== content) content.add(node.object);
      }
      // Selected objects are highlighted by a subtle emissive tint on preview only.
      for (const node of currentNodes) {
        const isSelected = node.id === selectedRef.current;
        node.object.traverse((child) => {
          const mesh = child as THREE.Mesh;
          if (!mesh.isMesh) return;
          const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const material of materials) {
            const standard = material as THREE.MeshStandardMaterial;
            if ('emissive' in standard) {
              if (!standard.userData.__originalEmissive) {
                standard.userData.__originalEmissive = standard.emissive.clone();
              }
              standard.emissive.copy(standard.userData.__originalEmissive);
              if (isSelected) standard.emissive.lerp(new THREE.Color(0x345b90), 0.35);
            }
          }
        });
      }
      controls.update();
      renderer.render(scene, camera);
    };
    render();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      controls.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === host) host.removeChild(renderer.domElement);
    };
  }, []);

  return <div className="viewport-host" ref={hostRef}>
    {nodes.length === 0 && <div className="viewport-empty">
      <div className="empty-orbit">◇</div>
      <strong>Ruang kerja masih kosong</strong>
      <span>Masukkan GLB, GLTF, OBJ, atau ZIP untuk mulai menyusun scene.</span>
    </div>}
    <div className="viewport-hint"><span>DRAG</span> Orbit <i /> <span>SCROLL</span> Zoom <i /> <span>KLIK</span> Pilih node</div>
  </div>;
}
