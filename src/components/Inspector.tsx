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
  return step === 1 ? 0 : 1;
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

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown' || event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      const currentOffset = parseFloat(event.currentTarget.value) || 0;
      const isIncrease = event.key === 'ArrowUp' || event.key === 'ArrowRight';
      const nextOffset = roundValue(currentOffset + (isIncrease ? step : -step), dec);
      onChange(index, roundValue(defaults[index] + nextOffset, dec));
    }
  };

  return <div className="vector-field">
    <label>{label}</label>
    <div className="axis-inputs">
      {(['X', 'Y', 'Z'] as const).map((axis, index) => <div className="axis-input" key={axis}>
        <span className={`axis axis-${axis.toLowerCase()}`}>{axis}</span>
        <input type="text" value={String(values[index] - defaults[index])}
          onChange={(event) => {
            const next: Vec3 = [...values] as Vec3;
            next[index] = roundValue(defaults[index] + parseInput(event.target.value), dec);
            onChange(index, next[index]);
          }}
          onBlur={(event) => {
            const next: Vec3 = [...values] as Vec3;
            next[index] = roundValue(defaults[index] + parseInput(event.target.value), dec);
            onChange(index, next[index]);
          }}
          onKeyDown={(event) => handleKeyDown(event, index)}
          aria-label={`${label} ${axis}`} />
        {suffix && <small>{suffix}</small>}
      </div>)}
    </div>
  </div>;
}

export default function Inspector({ nodes, selected, onSelect, onUpdate, onNormalize, onRemove, onToggleVisibility }: InspectorProps) {
  return <aside className="inspector">
    <section className="panel-section node-section">
      <div className="section-heading">
        <div><span className="eyebrow">SCENE HIERARCHY</span><h2>Nodes <span className="count-pill">{nodes.length}</span></h2></div>
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
          <div className="scale-input-wrap"><span className="scale-icon">↗</span><input type="text" value={String(selected.scale)}
            onChange={(event) => {
              const val = event.target.value;
              if (val.trim() === '') {
                onUpdate(selected.id, { scale: selected.defaultScale });
              } else {
                const next = roundValue(parseInput(val), 1);
                onUpdate(selected.id, { scale: Math.max(0.001, next) });
              }
            }}
            onBlur={(event) => {
              const val = event.target.value;
              if (val.trim() === '') {
                onUpdate(selected.id, { scale: selected.defaultScale });
              } else {
                const next = roundValue(parseInput(val), 1);
                onUpdate(selected.id, { scale: Math.max(0.001, next) });
              }
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowUp' || event.key === 'ArrowDown' || event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                event.preventDefault();
                const current = parseFloat(event.currentTarget.value) || selected.scale;
                const isIncrease = event.key === 'ArrowUp' || event.key === 'ArrowRight';
                const next = roundValue(current + (isIncrease ? 0.1 : -0.1), 1);
                onUpdate(selected.id, { scale: Math.max(0.001, next) });
              }
            }} /></div>
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
