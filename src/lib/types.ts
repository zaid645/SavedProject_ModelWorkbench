import type * as THREE from 'three';

export type Vec3 = [number, number, number];

export interface ModelNode {
  id: string;
  name: string;
  source: string;
  object: THREE.Group;
  position: Vec3;
  rotation: Vec3; // degrees
  scale: number; // uniform scale
  meshCount: number;
  visible: boolean;
  defaultPosition: Vec3;
  defaultRotation: Vec3;
  defaultScale: number;
}

export interface LoadedModel {
  name: string;
  source: string;
  object: THREE.Group;
  meshCount: number;
}
