import { useMemo, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import Viewport from './components/Viewport';
import Inspector from './components/Inspector';
import { loadModelFiles } from './lib/modelIO';
import { exportCombinedGLB } from './lib/exportGLB';
import type { ModelNode } from './lib/types';

function makeId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `node-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function App() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [nodes, setNodes] = useState<ModelNode[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [message, setMessage] = useState('Siap menerima model 3D.');
  const [messageKind, setMessageKind] = useState<'normal' | 'success' | 'error'>('normal');

  const selected = useMemo(() => nodes.find((node) => node.id === selectedId), [nodes, selectedId]);
  const sourceMeshes = useMemo(() => nodes.reduce((total, node) => total + node.meshCount, 0), [nodes]);

  const importFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (!fileArray.length) return;
    setBusy(true);
    setMessage(`Membaca ${fileArray.length} file dan dependensinya…`);
    setMessageKind('normal');
    try {
      const loaded = await loadModelFiles(fileArray);
      const additions: ModelNode[] = loaded.map((asset) => ({
        id: makeId(),
        name: asset.name,
        source: asset.source,
        object: asset.object,
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: 1,
        meshCount: asset.meshCount,
        visible: true,
        defaultPosition: [0, 0, 0],
        defaultRotation: [0, 0, 0],
        defaultScale: 1,
      }));
      setNodes((current) => [...current, ...additions]);
      setSelectedId(additions[0]?.id ?? null);
      const totalSourceMeshes = additions.reduce((sum, node) => sum + node.meshCount, 0);
      setMessage(`${additions.length} model berhasil dimuat · ${totalSourceMeshes} mesh sumber.`);
      setMessageKind('success');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
      setMessageKind('error');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const updateNode = (id: string, changes: Partial<Pick<ModelNode, 'position' | 'rotation' | 'scale' | 'defaultPosition' | 'defaultRotation' | 'defaultScale'>>) => {
    setNodes((current) => current.map((node) => node.id === id ? { ...node, ...changes } : node));
  };

  const normalizeNode = (id: string) => {
    updateNode(id, {
      defaultRotation: selected?.rotation ?? [0, 0, 0],
      defaultScale: selected?.scale ?? 1,
    });
    setMessage('Nilai transform saat ini telah dijadikan default baru.');
    setMessageKind('success');
  };

  const removeNode = (id: string) => {
    const next = nodes.filter((node) => node.id !== id);
    setNodes(next);
    if (selectedId === id) setSelectedId(next[0]?.id ?? null);
    setMessage('Node dihapus dari scene kerja.');
    setMessageKind('normal');
  };

  const toggleNodeVisibility = (id: string) => {
    setNodes((current) =>
      current.map((node) =>
        node.id === id ? { ...node, visible: !node.visible } : node
      )
    );
  };

  const exportGLB = async () => {
    if (!nodes.length || busy) return;
    setBusy(true);
    setMessage('Mengekspor setiap node sebagai mesh terpisah…');
    setMessageKind('normal');
    try {
      const result = await exportCombinedGLB(nodes);
      const url = URL.createObjectURL(result.blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'scene-per-node.glb';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setMessage(`GLB berhasil dibuat · ${result.meshCount} mesh (satu per node) · ${result.paletteSize} warna palet.`);
      setMessageKind('success');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
      setMessageKind('error');
    } finally {
      setBusy(false);
    }
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    void importFiles(event.dataTransfer.files);
  };

  return <div className="app-shell" onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
    onDragLeave={(event) => { if (event.currentTarget === event.target) setDragging(false); }} onDrop={onDrop}>
    <header className="topbar">
      <div className="brand-lockup">
        <div className="brand-mark"><span>◈</span></div>
        <div className="brand-text"><strong>MODEL<span>WORKBENCH</span></strong><small>3D SCENE ASSEMBLER</small></div>
      </div>
      <div className="topbar-center"><span className="workspace-dot" /> Untitled Scene <span className="unsaved-label">LOCAL WORKSPACE</span></div>
      <div className="topbar-actions">
        <button className="button-import" onClick={() => inputRef.current?.click()} disabled={busy}>＋ <span>Import model</span></button>
        <button className="button-export" onClick={() => void exportGLB()} disabled={!nodes.length || busy}>{busy ? <span className="spinner" /> : '↥'} <span>Export GLB</span></button>
      </div>
      <input ref={inputRef} className="hidden-input" type="file" multiple
        accept=".glb,.gltf,.obj,.mtl,.zip,.bin,.png,.jpg,.jpeg,.webp,.bmp"
        onChange={(event) => void importFiles(event.target.files ?? [])} />
    </header>

    <main className="workspace">
      <section className="viewport-section">
        <div className="viewport-toolbar">
            <div className="viewport-stats"><span>{nodes.length} NODE</span><i /> <span>{sourceMeshes} SOURCE MESH</span></div>
        </div>
        <Viewport nodes={nodes} selectedId={selectedId} onSelect={setSelectedId} />
        <div className="bottom-status">
          <div className={`status-message ${messageKind}`}><span className="status-indicator" />{message}</div>
          <div className="axis-legend"><span className="axis-x-text">X</span><span className="axis-y-text">Y</span><span className="axis-z-text">Z</span></div>
        </div>
      </section>
      <Inspector nodes={nodes} selected={selected} onSelect={setSelectedId} onUpdate={updateNode} onNormalize={normalizeNode} onRemove={removeNode} onToggleVisibility={toggleNodeVisibility} />
    </main>

    {dragging && <div className="drop-overlay"><div className="drop-card"><span className="drop-icon">⇩</span><strong>Lepaskan file untuk mengimpor</strong><small>GLB · GLTF · OBJ · ZIP</small></div></div>}
    {busy && <div className="busy-corner"><span className="spinner" /> Memproses model</div>}
  </div>;
}
