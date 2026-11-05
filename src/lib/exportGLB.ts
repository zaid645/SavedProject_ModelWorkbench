import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import type { ModelNode } from './types';

interface PaletteEntry {
  key: string;
  color: THREE.Color;
}

function averageTextureColor(texture: THREE.Texture | null | undefined): THREE.Color | null {
  const image = texture?.image as CanvasImageSource | undefined;
  if (!image) return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(image, 0, 0, 1, 1);
    const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
    return new THREE.Color().setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
  } catch {
    return null;
  }
}

function getMaterialColor(material: THREE.Material | undefined): THREE.Color {
  const candidate = material as (THREE.Material & { color?: THREE.Color; map?: THREE.Texture | null }) | undefined;
  const color = candidate?.color?.clone() ?? new THREE.Color(0xaaaaaa);
  const imageAverage = averageTextureColor(candidate?.map);
  if (imageAverage) color.multiply(imageAverage);
  return color;
}

function addPaletteColor(color: THREE.Color, palette: PaletteEntry[], indexByColor: Map<string, number>): number {
  const key = color.getHexString(THREE.SRGBColorSpace);
  const existing = indexByColor.get(key);
  if (existing !== undefined) return existing;
  const index = palette.length;
  palette.push({ key, color });
  indexByColor.set(key, index);
  return index;
}

function prepareMeshGeometry(mesh: THREE.Mesh, palette: PaletteEntry[], indexByColor: Map<string, number>): { geometry: THREE.BufferGeometry; paletteIndex: number } | null {
  const source = mesh.geometry;
  if (!source?.getAttribute('position')) return null;

  let geometry = source.clone();
  if (geometry.index) {
    const indexedGeometry = geometry;
    geometry = indexedGeometry.toNonIndexed();
    indexedGeometry.dispose();
  }
  const positions = geometry.getAttribute('position');
  if (!positions || positions.count < 3) {
    geometry.dispose();
    return null;
  }

  const position = positions.clone();
  const normal = geometry.getAttribute('normal')?.clone();

  const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  const color = getMaterialColor(material);
  const paletteIndex = addPaletteColor(color, palette, indexByColor);

  const uvCount = position.count;
  const uv = new Float32Array(uvCount * 2);
  for (let i = 0; i < uvCount; i += 1) {
    uv[i * 2] = (paletteIndex + 0.5) / palette.length;
    uv[i * 2 + 1] = 0.5;
  }

  const clean = new THREE.BufferGeometry();
  clean.setAttribute('position', position);
  if (normal) clean.setAttribute('normal', normal);
  clean.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  clean.computeBoundingBox();
  clean.computeBoundingSphere();

  return { geometry: clean, paletteIndex };
}

function createPaletteTexture(palette: PaletteEntry[]): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, palette.length);
  canvas.height = 1;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Tidak dapat membuat tekstur palet.');
  palette.forEach((entry, index) => {
    context.fillStyle = `#${entry.key}`;
    context.fillRect(index, 0, 1, 1);
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

export async function exportCombinedGLB(nodes: ModelNode[]): Promise<{ blob: Blob; meshCount: number; paletteSize: number }> {
  if (nodes.length === 0) throw new Error('Tambahkan model terlebih dahulu.');

  const palette: PaletteEntry[] = [];
  const indexByColor = new Map<string, number>();
  const meshes: THREE.Mesh[] = [];

  for (const node of nodes) {
    node.object.position.set(...node.position);
    node.object.rotation.set(
      THREE.MathUtils.degToRad(node.rotation[0]),
      THREE.MathUtils.degToRad(node.rotation[1]),
      THREE.MathUtils.degToRad(node.rotation[2]),
    );
    node.object.scale.setScalar(node.scale);
    node.object.updateMatrixWorld(true);

    node.object.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh || (mesh as THREE.SkinnedMesh).isSkinnedMesh) return;
      if ((mesh as THREE.InstancedMesh).isInstancedMesh) return;

      const prepared = prepareMeshGeometry(mesh, palette, indexByColor);
      if (!prepared) return;

      const texture = createPaletteTexture(palette);
      const meshMaterial = new THREE.MeshStandardMaterial({
        map: texture,
        color: 0xffffff,
        roughness: 0.9,
        metalness: 0,
        side: THREE.DoubleSide,
      });

      const exportedMesh = new THREE.Mesh(prepared.geometry, meshMaterial);
      exportedMesh.name = `${node.name || 'node'}-mesh-${meshes.length}`;
      exportedMesh.position.copy(node.object.position);
      exportedMesh.rotation.copy(node.object.rotation);
      exportedMesh.scale.copy(node.object.scale);
      meshes.push(exportedMesh);
    });
  }

  if (meshes.length === 0) throw new Error('Tidak ada mesh statis yang dapat diekspor.');

  const scene = new THREE.Scene();
  scene.name = 'Scene';
  for (const m of meshes) scene.add(m);

  const exporter = new GLTFExporter();
  const data = await new Promise<ArrayBuffer>((resolve, reject) => {
    exporter.parse(scene, (result) => {
      if (result instanceof ArrayBuffer) resolve(result);
      else reject(new Error('Exporter tidak menghasilkan GLB biner.'));
    }, reject, { binary: true, onlyVisible: true, trs: true, maxTextureSize: 16384 });
  });

  meshes.forEach((m) => {
    m.geometry.dispose();
    const mat = m.material;
    if (Array.isArray(mat)) {
      mat.forEach((material) => material.dispose());
    } else if (mat) {
      mat.dispose();
    }
  });

  return { blob: new Blob([data], { type: 'model/gltf-binary' }), meshCount: meshes.length, paletteSize: palette.length };
}
