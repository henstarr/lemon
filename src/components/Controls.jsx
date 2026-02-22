import { useApp } from '../context/useApp';

const MODES = [
  { id: 'nebula',  label: '✦ Nebula',  desc: 'Particle cloud' },
  { id: 'wave',    label: '〜 Wave',    desc: 'Waveform ripple' },
  { id: 'bars',    label: '▮ Bars',    desc: 'Frequency bars' },
  { id: 'galaxy',  label: '⊛ Galaxy',  desc: 'All effects' },
];

const THEMES = [
  { id: 'cosmic', label: 'Cosmic',  colors: ['#a855f7', '#ec4899'] },
  { id: 'fire',   label: 'Fire',    colors: ['#f97316', '#ef4444'] },
  { id: 'ocean',  label: 'Ocean',   colors: ['#06b6d4', '#3b82f6'] },
  { id: 'matrix', label: 'Matrix',  colors: ['#22c55e', '#10b981'] },
  { id: 'aurora', label: 'Aurora',  colors: ['#8b5cf6', '#10b981'] },
];

export default function Controls({ onClose }) {
  const { visualizerMode, setVisualizerMode, colorTheme, setColorTheme, sensitivity, setSensitivity, speed, setSpeed, bloom, setBloom } = useApp();

  return (
    <div className="glass-strong rounded-2xl p-5 w-72 space-y-5 select-none">
      <div className="flex items-center justify-between">
        <h3 className="text-white font-semibold text-sm tracking-widest uppercase">Controls</h3>
        {onClose && (
          <button onClick={onClose} className="text-white/40 hover:text-white/80 transition-colors text-lg leading-none">✕</button>
        )}
      </div>

      {/* Visualizer Mode */}
      <div>
        <p className="text-white/50 text-xs mb-2 tracking-wider uppercase">Mode</p>
        <div className="grid grid-cols-2 gap-2">
          {MODES.map(m => (
            <button
              key={m.id}
              onClick={() => setVisualizerMode(m.id)}
              className={`rounded-xl p-2.5 text-left transition-all duration-200 ${
                visualizerMode === m.id
                  ? 'bg-purple-600/40 border border-purple-500/70 text-white'
                  : 'bg-white/5 border border-white/10 text-white/60 hover:bg-white/10 hover:text-white/80'
              }`}
            >
              <div className="text-xs font-medium">{m.label}</div>
              <div className="text-[10px] text-white/40 mt-0.5">{m.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Color Theme */}
      <div>
        <p className="text-white/50 text-xs mb-2 tracking-wider uppercase">Color Theme</p>
        <div className="flex gap-2 flex-wrap">
          {THEMES.map(th => (
            <button
              key={th.id}
              onClick={() => setColorTheme(th.id)}
              title={th.label}
              className={`rounded-full w-8 h-8 flex-shrink-0 transition-all duration-200 ${
                colorTheme === th.id ? 'ring-2 ring-white/70 ring-offset-1 ring-offset-black scale-110' : 'opacity-60 hover:opacity-90'
              }`}
              style={{ background: `linear-gradient(135deg, ${th.colors[0]}, ${th.colors[1]})` }}
            />
          ))}
        </div>
      </div>

      {/* Sliders */}
      <div className="space-y-4">
        <Slider
          label="Sensitivity"
          value={sensitivity}
          onChange={setSensitivity}
          min={0.1} max={3.0} step={0.05}
          display={v => `${(v * 100).toFixed(0)}%`}
        />
        <Slider
          label="Speed"
          value={speed}
          onChange={setSpeed}
          min={0.1} max={3.0} step={0.05}
          display={v => `${v.toFixed(1)}x`}
        />
        <Slider
          label="Bloom"
          value={bloom}
          onChange={setBloom}
          min={0} max={1.0} step={0.01}
          display={v => `${(v * 100).toFixed(0)}%`}
        />
      </div>
    </div>
  );
}

function Slider({ label, value, onChange, min, max, step, display }) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1.5">
        <span className="text-white/50 tracking-wider uppercase">{label}</span>
        <span className="text-purple-400 font-mono">{display(value)}</span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-full"
        style={{
          background: `linear-gradient(to right, #a855f7 0%, #a855f7 ${((value - min) / (max - min)) * 100}%, rgba(255,255,255,0.1) ${((value - min) / (max - min)) * 100}%, rgba(255,255,255,0.1) 100%)`
        }}
      />
    </div>
  );
}
