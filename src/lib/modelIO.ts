import JSZip from 'jszip';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import type { LoadedModel } from './types';

const VIRTUAL_ORIGIN = 'https://model-workbench.invalid/';

type VirtualFile = { path: string; file: File };

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\//, '').split('/').filter((p) => p && p !== '.').join('/').toLowerCase();
}

function dirname(path: string): string {
  const clean = path.replace(/\\/g, '/');
  const index = clean.lastIndexOf('/');
  return index < 0 ? '' : clean.slice(0, index + 1);
}

function basename(path: string): string {
  return path.replace(/\\/g, '/').split('/').pop()?.toLowerCase() ?? path.toLowerCase();
}

function extension(path: string): string {
  return path.split('.').pop()?.toLowerCase() ?? '';
}

function countMeshes(root: THREE.Object3D): number {
  let count = 0;
  root.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) count += 1;
  });
  return count;
}

async function flattenInputs(files: File[]): Promise<VirtualFile[]> {
  const result: VirtualFile[] = [];
  for (const file of files) {
    if (extension(file.name) !== 'zip') {
      const path = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
      result.push({ path, file });
      continue;
    }

    const zip = await JSZip.loadAsync(file);
    const extracted: Promise<void>[] = [];
    zip.forEach((relativePath, entry) => {
      if (entry.dir || relativePath.startsWith('__MACOSX/')) return;
      extracted.push(entry.async('blob').then((blob) => {
        const safeName = relativePath.split('/').pop() || relativePath;
        result.push({ path: relativePath, file: new File([blob], safeName) });
      }));
    });
    await Promise.all(extracted);
  }
  return result;
}

function makeResourceManager(files: VirtualFile[]) {
  const exact = new Map<string, string>();
  const byName = new Map<string, string>();
  const urls: string[] = [];
  for (const item of files) {
    const key = normalizePath(item.path);
    const url = URL.createObjectURL(item.file);
    exact.set(key, url);
    if (!byName.has(basename(item.path))) byName.set(basename(item.path), url);
    urls.push(url);
  }

  const manager = new THREE.LoadingManager();
  manager.setURLModifier((requestedUrl) => {
    let path = requestedUrl;
    try {
      path = new URL(requestedUrl, VIRTUAL_ORIGIN).pathname;
    } catch {
      // Keep the original relative path as a fallback.
    }
    const clean = normalizePath(decodeURIComponent(path));
    return exact.get(clean) ?? byName.get(basename(clean)) ?? requestedUrl;
  });

  return { manager, urls, files, exact };
}

function findSibling(files: VirtualFile[], modelPath: string, reference: string, exact: Map<string, string>): VirtualFile | undefined {
  const candidate = normalizePath(`${dirname(modelPath)}${reference.trim()}`);
  const direct = files.find((item) => normalizePath(item.path) === candidate);
  if (direct) return direct;
  const byBase = files.find((item) => basename(item.path) === basename(reference.trim()));
  if (byBase) return byBase;
  // The exact map is also used by the URL manager; this check avoids relying on basename alone.
  return exact.has(candidate) ? files.find((item) => normalizePath(item.path) === candidate) : undefined;
}

function parseGLTF(data: ArrayBuffer | string, resourcePath: string, manager: THREE.LoadingManager): Promise<THREE.Group> {
  const loader = new GLTFLoader(manager);
  return new Promise((resolve, reject) => {
    loader.parse(data, resourcePath, (gltf) => {
      const scene = gltf.scene ?? gltf.scenes[0];
      if (!scene) reject(new Error('File glTF tidak memiliki scene yang dapat dibaca.'));
      else resolve(scene);
    }, reject);
  });
}

async function parseOBJ(item: VirtualFile, files: VirtualFile[], manager: THREE.LoadingManager, exact: Map<string, string>): Promise<THREE.Group> {
  const text = await item.file.text();
  const mtllibs = [...text.matchAll(/^\s*mtllib\s+(.+)$/gim)].flatMap((match) => match[1].trim().split(/\s+/));
  let materials: ReturnType<MTLLoader['parse']> | undefined;

  for (const mtlName of mtllibs) {
    const mtlFile = findSibling(files, item.path, mtlName, exact);
    if (!mtlFile) continue;
    const mtlText = await mtlFile.file.text();
    const loader = new MTLLoader(manager);
    const mtlResourcePath = `${VIRTUAL_ORIGIN}${dirname(mtlFile.path)}`;
    materials = loader.parse(mtlText, mtlResourcePath);
    materials.preload();
    break;
  }

  const loader = new OBJLoader(manager);
  if (materials) loader.setMaterials(materials);
  return loader.parse(text);
}

export async function loadModelFiles(inputFiles: File[]): Promise<LoadedModel[]> {
  if (inputFiles.length === 0) return [];
  const files = await flattenInputs(inputFiles);
  const modelFiles = files.filter((item) => ['obj', 'glb', 'gltf'].includes(extension(item.path)));
  if (modelFiles.length === 0) {
    throw new Error('Tidak menemukan model .glb, .gltf, atau .obj. ZIP perlu berisi salah satu format tersebut.');
  }

  const { manager, urls, exact } = makeResourceManager(files);
  const results: LoadedModel[] = [];
  const errors: string[] = [];

  for (const item of modelFiles) {
    try {
      let object: THREE.Group;
      const ext = extension(item.path);
      const resourcePath = `${VIRTUAL_ORIGIN}${dirname(item.path)}`;
      if (ext === 'obj') {
        object = await parseOBJ(item, files, manager, exact);
      } else if (ext === 'glb') {
        object = await parseGLTF(await item.file.arrayBuffer(), resourcePath, manager);
      } else {
        object = await parseGLTF(await item.file.text(), resourcePath, manager);
      }
      const root = new THREE.Group();
      root.name = item.path.split('/').pop() || item.file.name;
      root.add(object);
      root.updateMatrixWorld(true);
      const meshCount = countMeshes(root);
      if (meshCount === 0) throw new Error('Tidak ditemukan mesh di dalam file.');
      results.push({ name: root.name.replace(/\.[^.]+$/, ''), source: item.path, object: root, meshCount });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${item.path}: ${message}`);
    }
  }

  // Keep blob URLs alive while the loaded scene can still be previewed. They are reclaimed on page close.
  (window as Window & { __modelWorkbenchUrls?: string[] }).__modelWorkbenchUrls = [
    ...((window as Window & { __modelWorkbenchUrls?: string[] }).__modelWorkbenchUrls ?? []),
    ...urls,
  ];

  if (results.length === 0) {
    throw new Error(errors.length ? errors.join('\n') : 'Tidak ada model yang berhasil dibaca.');
  }
  if (errors.length) console.warn('Sebagian model tidak berhasil dimuat:', errors);
  return results;
}
