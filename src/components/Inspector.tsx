import { useState, useEffect } from 'react';
import type { ModelNode, Vec3 } from '../lib/types';

interface InspectorProps {
  nodes: ModelNode[];
  selected: ModelNode | undefined;
  onSelect: (id: string) => void;
  onUpdate: (id: string, changes: Partial<Pick<ModelNode, 'position' | 'rotation' | 'scale' | 'defaultPosition' | 'defaultRotation' | 'defaultScale'>>) => void;
  onNormalize: (id: string) => void;
  onRemove: (id: string) => void;
  onToggleVisibility: (id: string) => void;
}

function parseInput(value: string): number {
  const trimmed = value.trim();
  if (trimmed === '') return 0;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundValue(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

function decimalsForStep(step: number): number {
  return 3;
}

interface AxisInputProps {
  label: string;
  axis: 'X' | 'Y' | 'Z';
  index: number;
  value: number;
  defaultValue: number;
  dec: number;
  step: number;
  suffix?: string;
  onChange: (axis: number, value: number) => void;
}

function AxisInput({ label, axis, index, value, defaultValue, dec, step, suffix, onChange }: AxisInputProps) {
  const [draft, setDraft] = useState(String(value - defaultValue));

  useEffect(() => {
    setDraft(String(value - defaultValue));
  }, [value, defaultValue]);

  const commit = (raw: string) => {
    const nextValue = roundValue(defaultValue + parseInput(raw), dec);
    onChange(index, nextValue);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      commit(event.currentTarget.value);
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      const currentOffset = parseFloat(event.currentTarget.value) || 0;
      const isIncrease = event.key === 'ArrowUp';
      const nextOffset = roundValue(currentOffset + (isIncrease ? step : -step), dec);
      onChange(index, roundValue(defaultValue + nextOffset, dec));
    }
  };

  return (
    <div className="axis-input" key={axis}>
      <span className={`axis axis-${axis.toLowerCase()}`}>{axis}</span>
      <input
        type="text"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={(event) => commit(event.currentTarget.value)}
        onKeyDown={handleKeyDown}
        aria-label={`${label} ${axis}`}
      />
      {suffix && <small>{suffix}</small>}
    </div>
  );
}

function VectorField({ label, values, defaults, suffix, onChange, step = 1 }: {
  label: string;
  values: Vec3;
  defaults: Vec3;
  suffix?: string;
  onChange: (axis: number, value: number) => void;
  step?: number;
}) {
  const dec = decimalsForStep(step);

  return (
    <div className="vector-field">
      <label>{label}</label>
      <div className="axis-inputs">
        {(['X', 'Y', 'Z'] as const).map((axis, index) => (
          <AxisInput
            key={axis}
            label={label}
            axis={axis}
            index={index}
            value={values[index]}
            defaultValue={defaults[index]}
            dec={dec}
            step={step}
            suffix={suffix}
            onChange={onChange}
          />
        ))}
      </div>
    </div>
  );
}

function ScaleInput({ value, defaultScale, scale, id, onUpdate }: {
  value: number;
  defaultScale: number;
  scale: number;
  id: string;
  onUpdate: (id: string, changes: { scale: number }) => void;
}) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commit = (raw: string) => {
    if (raw.trim() === '') {
      onUpdate(id, { scale: defaultScale });
      return;
    }
    const nextRelative = roundValue(parseInput(raw), 3);
    onUpdate(id, { scale: Math.max(0.001, roundValue(nextRelative * defaultScale, 3)) });
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      commit(event.currentTarget.value);
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      const currentRelative = parseFloat(event.currentTarget.value) || scale / defaultScale;
      const isIncrease = event.key === 'ArrowUp';
      const nextRelative = roundValue(currentRelative + (isIncrease ? 0.1 : -0.1), 3);
      onUpdate(id, { scale: Math.max(0.001, roundValue(nextRelative * defaultScale, 3)) });
    }
  };

  return (
    <input
      type="text"
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={(event) => commit(event.currentTarget.value)}
      onKeyDown={handleKeyDown}
    />
  );
}

export default function Inspector({ nodes, selected, onSelect, onUpdate, onNormalize, onRemove, onToggleVisibility }: InspectorProps) {
  return <aside className="inspector">
    <section className="panel-section node-section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, paddingBottom: 8, borderBottom: '1px solid #303947' }}>
        <span style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '.08em', color: '#aeb9c9' }}>Nodes</span>
        <span className="count-pill" style={{ fontSize: '10px', padding: '2px 6px' }}>{nodes.length}</span>
      </div>
      {nodes.length === 0 ? <div className="tree-empty">Belum ada node. Impor model untuk mengisi scene.</div> :
        <div className="node-list">
          {nodes.map((node) => <button key={node.id} className={`node-row ${selected?.id === node.id ? 'active' : ''}`} onClick={() => onSelect(node.id)}>
            <span className="node-glyph">◈</span>
            <span className="node-copy"><strong>{node.name}</strong><small>{node.meshCount} mesh sumber · {node.source.split('/').pop()}</small></span>
            <span className="node-visibility" onClick={(event) => { event.stopPropagation(); onToggleVisibility(node.id); }}>{node.visible ? '●' : '○'}</span>
            <span className="node-chevron">›</span>
          </button>)}
        </div>}
    </section>

    <section className="panel-section transform-section">
      {!selected ? <div className="tree-empty">Pilih sebuah node untuk mengubah transformasinya.</div> : <>
        <VectorField label="Lokasi" values={selected.position} defaults={selected.defaultPosition} step={0.1} onChange={(axis, value) => {
          const next: Vec3 = [...selected.position] as Vec3;
          next[axis] = value;
          onUpdate(selected.id, { position: next });
        }} />
        <div className="vector-field scale-field">
          <label>Skala seragam</label>
          <div className="scale-input-wrap"><span className="scale-icon">↗</span><ScaleInput
            value={roundValue(selected.scale / selected.defaultScale, 3)}
            defaultScale={selected.defaultScale}
            scale={selected.scale}
            id={selected.id}
            onUpdate={(id, changes) => onUpdate(id, changes)}
          /></div>
        </div>
        <VectorField label="Rotasi" values={selected.rotation} defaults={selected.defaultRotation} suffix="°" onChange={(axis, value) => {
          const next: Vec3 = [...selected.rotation] as Vec3;
          next[axis] = value;
          onUpdate(selected.id, { rotation: next });
        }} />
        <div className="transform-actions">
          <button className="button-soft" onClick={() => onNormalize(selected.id)}>↺ Normalisasi</button>
          <button className="button-danger" onClick={() => onRemove(selected.id)} title="Hapus node">Hapus node</button>
        </div>
        <p style={{ margin: 0, fontSize: '9px', color: '#8290a4', marginTop: '10px' }}>Normalisasi hanya memengaruhi rotasi dan skala. Posisi tidak berubah.</p>
      </>}
    </section>

    <section className="panel-footer-note">
      <span className="info-mark">i</span>
      <p>Normalisasi menyimpan nilai transform saat ini sebagai default baru. Objek tidak bergerak secara visual.</p>
    </section>
  </aside>;
}
