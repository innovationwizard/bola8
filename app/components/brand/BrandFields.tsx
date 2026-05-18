'use client';

import { useState } from 'react';
import { X, Plus } from 'lucide-react';
import type { BrandColor } from '@/lib/brand';

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] uppercase tracking-[0.2em] text-neutral-400 mb-4">
      {children}
    </p>
  );
}

export function Field({ label, value, onChange, placeholder, rows = 1 }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs text-neutral-500">{label}</label>
      {rows === 1 ? (
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full text-sm text-neutral-800 bg-transparent border-b border-neutral-200 focus:border-neutral-600 outline-none py-1.5 transition-colors placeholder-neutral-300"
        />
      ) : (
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          className="w-full text-sm text-neutral-800 bg-transparent border border-neutral-200 rounded-lg focus:border-neutral-400 outline-none px-3 py-2 resize-none transition-colors placeholder-neutral-300"
        />
      )}
    </div>
  );
}

export function ColorRow({ color, onChange, onRemove }: {
  color: BrandColor;
  onChange: (c: BrandColor) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="color"
        value={color.hex || '#000000'}
        onChange={e => onChange({ ...color, hex: e.target.value })}
        className="w-8 h-8 flex-shrink-0 rounded cursor-pointer border-0 p-0 bg-transparent"
        title="Seleccionar color"
      />
      <input
        type="text"
        value={color.hex}
        onChange={e => onChange({ ...color, hex: e.target.value })}
        placeholder="#000000"
        maxLength={7}
        className="w-20 text-xs font-mono text-neutral-600 border-b border-neutral-200 focus:border-neutral-500 outline-none py-1 bg-transparent uppercase"
      />
      <input
        type="text"
        value={color.name}
        onChange={e => onChange({ ...color, name: e.target.value })}
        placeholder="Nombre"
        className="flex-1 text-sm text-neutral-800 border-b border-neutral-200 focus:border-neutral-500 outline-none py-1 bg-transparent"
      />
      <input
        type="text"
        value={color.usage}
        onChange={e => onChange({ ...color, usage: e.target.value })}
        placeholder="Uso"
        className="flex-1 text-xs text-neutral-500 border-b border-neutral-200 focus:border-neutral-500 outline-none py-1 bg-transparent"
      />
      <button
        onClick={onRemove}
        className="flex-shrink-0 text-neutral-300 hover:text-neutral-600 transition-colors"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export function ColorGroup({ label, colors, onChange }: {
  label: string;
  colors: BrandColor[];
  onChange: (colors: BrandColor[]) => void;
}) {
  const add    = () => onChange([...colors, { name: '', hex: '#000000', usage: '' }]);
  const update = (i: number, c: BrandColor) => onChange(colors.map((x, j) => j === i ? c : x));
  const remove = (i: number) => onChange(colors.filter((_, j) => j !== i));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-neutral-500">{label}</span>
        <button
          onClick={add}
          className="inline-flex items-center gap-1 text-xs text-neutral-400 hover:text-neutral-700 transition-colors"
        >
          <Plus className="w-3 h-3" /> Agregar
        </button>
      </div>
      {colors.length === 0 && (
        <p className="text-xs text-neutral-300 italic">Sin colores definidos</p>
      )}
      <div className="space-y-2.5">
        {colors.map((c, i) => (
          <ColorRow key={i} color={c} onChange={v => update(i, v)} onRemove={() => remove(i)} />
        ))}
      </div>
    </div>
  );
}

export function TagList({ label, tags, onChange }: {
  label: string;
  tags: string[];
  onChange: (tags: string[]) => void;
}) {
  const [input, setInput] = useState('');

  const add = () => {
    const t = input.trim();
    if (t && !tags.includes(t)) { onChange([...tags, t]); setInput(''); }
  };

  return (
    <div className="space-y-2">
      <label className="block text-xs text-neutral-500">{label}</label>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {tags.map((t, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-1 px-2.5 py-1 bg-neutral-100 text-xs text-neutral-700 rounded-full"
          >
            {t}
            <button
              onClick={() => onChange(tags.filter((_, j) => j !== i))}
              className="text-neutral-400 hover:text-neutral-700 transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder="Escribir y Enter para agregar"
          className="flex-1 text-sm text-neutral-800 bg-transparent border-b border-neutral-200 focus:border-neutral-500 outline-none py-1 placeholder-neutral-300"
        />
        <button onClick={add} className="text-neutral-400 hover:text-neutral-800 transition-colors">
          <Plus className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
