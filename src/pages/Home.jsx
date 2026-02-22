import { useEffect, useRef } from 'react';
import ServiceSelector from '../components/ServiceSelector';

function StarField() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animId;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const stars = Array.from({ length: 200 }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      r: Math.random() * 1.5 + 0.2,
      speed: Math.random() * 0.3 + 0.05,
      opacity: Math.random(),
    }));

    let t = 0;
    const draw = () => {
      t += 0.01;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      stars.forEach(s => {
        const flicker = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * s.speed * 5 + s.x));
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${flicker * s.opacity})`;
        ctx.fill();
      });
      animId = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none z-0" />;
}

export default function Home() {
  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Background */}
      <div
        className="fixed inset-0 z-0"
        style={{
          background: 'radial-gradient(ellipse at 20% 50%, #1a0030 0%, #0a001a 40%, #000000 100%)',
        }}
      />
      <StarField />

      {/* Floating orbs */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full opacity-20 blur-3xl animate-float"
          style={{ background: 'radial-gradient(circle, #a855f7, transparent)' }} />
        <div className="absolute bottom-1/3 right-1/4 w-80 h-80 rounded-full opacity-15 blur-3xl animate-float"
          style={{ background: 'radial-gradient(circle, #ec4899, transparent)', animationDelay: '1.5s' }} />
        <div className="absolute top-2/3 left-1/2 w-64 h-64 rounded-full opacity-10 blur-3xl animate-float"
          style={{ background: 'radial-gradient(circle, #f97316, transparent)', animationDelay: '3s' }} />
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center min-h-screen px-6 py-16">
        {/* Hero */}
        <div className="text-center mb-16 animate-float">
          <div className="inline-block mb-4">
            <div className="w-20 h-20 mx-auto rounded-full animate-pulse-glow flex items-center justify-center text-4xl"
              style={{ background: 'linear-gradient(135deg, #a855f7, #ec4899)' }}>
              🍋
            </div>
          </div>
          <h1 className="text-6xl sm:text-8xl font-black mb-4 tracking-tight">
            <span className="gradient-text">LEMON</span>
          </h1>
          <p className="text-white/50 text-lg sm:text-xl max-w-md mx-auto leading-relaxed font-light">
            AI‑powered trippy visuals that breathe with your music
          </p>
          <div className="flex items-center justify-center gap-3 mt-5">
            {['Spotify', 'SoundCloud', 'Apple Music', 'Mic'].map((tag, i) => (
              <span key={i} className="text-xs text-white/30 bg-white/5 border border-white/10 px-2.5 py-1 rounded-full">
                {tag}
              </span>
            ))}
          </div>
        </div>

        {/* Service selector */}
        <div className="w-full">
          <p className="text-center text-white/40 text-xs tracking-widest uppercase mb-6">
            Choose your music source
          </p>
          <ServiceSelector />
        </div>

        {/* Footer */}
        <div className="mt-auto pt-16 text-center">
          <p className="text-white/20 text-xs">
            Connect a service above to start your visual journey
          </p>
        </div>
      </div>
    </div>
  );
}
