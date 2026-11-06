import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
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

function colorKey(color: THREE.Color): string {
  return color.getHexString(THREE.SRGBColorSpace);
}

function getMeshMaterials(mesh: THREE.Mesh): THREE.Material[] {
  const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  return list.length > 0 ? list : [undefined as unknown as THREE.Material];
}

function addPaletteColor(color: THREE.Color, palette: PaletteEntry[], indexByColor: Map<string, number>): number {
  const key = colorKey(color);
  const existing = indexByColor.get(key);
  if (existing !== undefined) return existing;
  const index = palette.length;
  palette.push({ key, color });
  indexByColor.set(key, index);
  return index;
}

/**
 * Membuat geometri non-indexed yang sudah di-bake dengan `matrix`,
 * lengkap dengan UV yang menunjuk ke piksel warna di tekstur palet.
 */
function prepareMeshGeometry(
  mesh: THREE.Mesh,
  matrix: THREE.Matrix4,
  paletteSize: number,
  indexByColor: Map<string, number>,
): THREE.BufferGeometry | null {
  const source = mesh.geometry;
  if (!source?.getAttribute('position')) return null;

  let geometry = source.clone();
  if (geometry.index) {
    const indexedGeometry = geometry;
    geometry = indexedGeometry.toNonIndexed(); // group ikut terbawa
    indexedGeometry.dispose();
  }
  const positions = geometry.getAttribute('position');
  if (!positions || positions.count < 3) {
    geometry.dispose();
    return null;
  }
  const count = positions.count;

  const position = positions.clone();
  position.applyMatrix4(matrix);

  const normal = geometry.getAttribute('normal')?.clone();
  if (normal) {
    normal.applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(matrix));
  }

  // --- UV: tiap vertex menunjuk ke tengah piksel warna materialnya ---
  const materials = getMeshMaterials(mesh);
  const uv = new Float32Array(count * 2);

  const paint = (start: number, end: number, material: THREE.Material | undefined) => {
    const index = indexByColor.get(colorKey(getMaterialColor(material))) ?? 0;
    const u = (index + 0.5) / paletteSize;
    for (let i = start; i < end; i++) {
      uv[i * 2] = u;
      uv[i * 2 + 1] = 0.5;
    }
  };

  paint(0, count, materials[0]); // default untuk vertex yang tidak tercakup group
  if (Array.isArray(mesh.material) && geometry.groups.length > 0) {
    for (const group of geometry.groups) {
      const end = Math.min(group.start + group.count, count);
      paint(group.start, end, materials[group.materialIndex ?? 0] ?? materials[0]);
    }
  }

  const clean = new THREE.BufferGeometry();
  clean.setAttribute('position', position);
  if (normal) clean.setAttribute('normal', normal);
  else clean.computeVertexNormals();
  clean.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  clean.computeBoundingBox();
  clean.computeBoundingSphere();

  geometry.dispose();
  return clean;
}

function createPaletteTexture(palette: PaletteEntry[]): THREE.Texture {
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

function isStaticMesh(child: THREE.Object3D): child is THREE.Mesh {
  const mesh = child as THREE.Mesh;
  if (!mesh.isMesh) return false;
  if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) return false;
  if ((mesh as THREE.InstancedMesh).isInstancedMesh) return false;
  return true;
}

export async function exportCombinedGLB(nodes: ModelNode[]): Promise<{ blob: Blob; meshCount: number; paletteSize: number }> {
  if (nodes.length === 0) throw new Error('Tambahkan model terlebih dahulu.');

  // Terapkan transform semua node lebih dulu.
  for (const node of nodes) {
    node.object.position.set(...node.position);
    node.object.rotation.set(
      THREE.MathUtils.degToRad(node.rotation[0]),
      THREE.MathUtils.degToRad(node.rotation[1]),
      THREE.MathUtils.degToRad(node.rotation[2]),
    );
    node.object.scale.setScalar(node.scale);
    node.object.updateMatrixWorld(true);
  }

  // Pass 1: kumpulkan palet dari SEMUA material di tiap mesh.
  const palette: PaletteEntry[] = [];
  const indexByColor = new Map<string, number>();

  for (const node of nodes) {
    node.object.traverse((child) => {
      if (!isStaticMesh(child)) return;
      for (const material of getMeshMaterials(child)) {
        addPaletteColor(getMaterialColor(material), palette, indexByColor);
      }
    });
  }

  const paletteTexture = createPaletteTexture(palette);
  const sharedMaterial = new THREE.MeshStandardMaterial({
    map: paletteTexture,
    color: 0xffffff,
    roughness: 0.9,
    metalness: 0,
    side: THREE.DoubleSide,
  });

  // Pass 2: satu mesh gabungan per node.
  const exportedMeshes: THREE.Mesh[] = [];

  for (const node of nodes) {
    // Bake hanya transform RELATIF terhadap node; transform node dipasang di mesh hasil.
    const nodeInverse = node.object.matrixWorld.clone().invert();
    const geometries: THREE.BufferGeometry[] = [];

    node.object.traverse((child) => {
      if (!isStaticMesh(child)) return;
      const relative = nodeInverse.clone().multiply(child.matrixWorld);
      const geometry = prepareMeshGeometry(child, relative, palette.length, indexByColor);
      if (geometry) geometries.push(geometry);
    });

    if (geometries.length === 0) continue;

    const merged = mergeGeometries(geometries, false);
    geometries.forEach((g) => g.dispose());
    if (!merged) throw new Error(`Gagal menggabungkan geometri untuk "${node.name || 'model'}".`);

    const exportedMesh = new THREE.Mesh(merged, sharedMaterial);
    exportedMesh.name = node.name || 'model';
    exportedMesh.position.copy(node.object.position);
    exportedMesh.rotation.copy(node.object.rotation);
    exportedMesh.scale.copy(node.object.scale);
    exportedMeshes.push(exportedMesh);
  }

  if (exportedMeshes.length === 0) {
    sharedMaterial.dispose();
    paletteTexture.dispose();
    throw new Error('Tidak ada mesh statis yang dapat diekspor.');
  }

  const scene = new THREE.Scene();
  scene.name = 'Scene';
  for (const m of exportedMeshes) scene.add(m);

  const exporter = new GLTFExporter();
  const data = await new Promise<ArrayBuffer>((resolve, reject) => {
    exporter.parse(
      scene,
      (result) => {
        if (result instanceof ArrayBuffer) resolve(result);
        else reject(new Error('Exporter tidak menghasilkan GLB biner.'));
      },
      reject,
      { binary: true, onlyVisible: true, trs: true, maxTextureSize: 16384 },
    );
  });

  exportedMeshes.forEach((m) => m.geometry.dispose());
  sharedMaterial.dispose();
  paletteTexture.dispose();

  return { blob: new Blob([data], { type: 'model/gltf-binary' }), meshCount: exportedMeshes.length, paletteSize: palette.length };
}