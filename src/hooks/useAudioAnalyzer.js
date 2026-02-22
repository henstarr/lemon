import { useRef, useEffect, useCallback, useState } from 'react';

export function useAudioAnalyzer() {
  const audioContextRef = useRef(null);
  const analyzerRef = useRef(null);
  const sourceRef = useRef(null);
  const streamRef = useRef(null);
  const dataArrayRef = useRef(null);
  const animFrameRef = useRef(null);
  const [isActive, setIsActive] = useState(false);
  const [audioData, setAudioData] = useState({
    bass: 0, mid: 0, treble: 0, overall: 0, waveform: new Uint8Array(0),
  });

  const setupAnalyzer = useCallback((ctx) => {
    const analyzer = ctx.createAnalyser();
    analyzer.fftSize = 2048;
    analyzer.smoothingTimeConstant = 0.8;
    analyzerRef.current = analyzer;
    dataArrayRef.current = new Uint8Array(analyzer.frequencyBinCount);
    return analyzer;
  }, []);

  const startMicrophoneInput = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = stream;
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      audioContextRef.current = ctx;
      const analyzer = setupAnalyzer(ctx);
      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyzer);
      sourceRef.current = source;
      setIsActive(true);
      return true;
    } catch (err) {
      console.error('Microphone access denied:', err);
      return false;
    }
  }, [setupAnalyzer]);

  const startDemoMode = useCallback(() => {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    audioContextRef.current = ctx;
    const analyzer = setupAnalyzer(ctx);

    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    const lfoOsc = ctx.createOscillator();
    const lfoGain = ctx.createGain();

    lfoOsc.frequency.value = 0.5;
    lfoGain.gain.value = 200;
    lfoOsc.connect(lfoGain);
    lfoGain.connect(oscillator.frequency);

    oscillator.type = 'sawtooth';
    oscillator.frequency.value = 440;
    gainNode.gain.value = 0.3;
    oscillator.connect(gainNode);
    gainNode.connect(analyzer);
    gainNode.connect(ctx.destination);

    const bassOsc = ctx.createOscillator();
    const bassGain = ctx.createGain();
    bassOsc.type = 'sine';
    bassOsc.frequency.value = 80;
    bassGain.gain.value = 0.15;
    bassOsc.connect(bassGain);
    bassGain.connect(analyzer);

    oscillator.start();
    bassOsc.start();
    lfoOsc.start();

    sourceRef.current = { oscillator, bassOsc, lfoOsc, gainNode, bassGain, lfoGain };
    setIsActive(true);
  }, [setupAnalyzer]);

  const stop = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (sourceRef.current) {
      try {
        if (sourceRef.current.oscillator) {
          sourceRef.current.oscillator.stop();
          sourceRef.current.bassOsc?.stop();
          sourceRef.current.lfoOsc?.stop();
        } else {
          sourceRef.current.disconnect?.();
        }
      } catch { /* ignore stop errors */ }
      sourceRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    setIsActive(false);
    setAudioData({ bass: 0, mid: 0, treble: 0, overall: 0, waveform: new Uint8Array(0) });
  }, []);

  const getFrequencyBand = useCallback((dataArray, startHz, endHz, sampleRate, binCount) => {
    const startBin = Math.floor(startHz / (sampleRate / 2) * binCount);
    const endBin = Math.floor(endHz / (sampleRate / 2) * binCount);
    let sum = 0;
    for (let i = startBin; i <= endBin && i < dataArray.length; i++) {
      sum += dataArray[i];
    }
    return sum / ((endBin - startBin) || 1) / 255;
  }, []);

  useEffect(() => {
    if (!isActive) return;

    const tick = () => {
      if (!analyzerRef.current || !audioContextRef.current) return;
      const analyzer = analyzerRef.current;
      const dataArray = dataArrayRef.current;
      const sampleRate = audioContextRef.current.sampleRate;
      const binCount = analyzer.frequencyBinCount;

      analyzer.getByteFrequencyData(dataArray);

      const bass = getFrequencyBand(dataArray, 20, 250, sampleRate, binCount);
      const mid = getFrequencyBand(dataArray, 250, 4000, sampleRate, binCount);
      const treble = getFrequencyBand(dataArray, 4000, 20000, sampleRate, binCount);
      const overall = (bass + mid + treble) / 3;

      const waveformData = new Uint8Array(analyzer.fftSize);
      analyzer.getByteTimeDomainData(waveformData);

      setAudioData({ bass, mid, treble, overall, waveform: waveformData });
      animFrameRef.current = requestAnimationFrame(tick);
    };

    animFrameRef.current = requestAnimationFrame(tick);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isActive, getFrequencyBand]);

  useEffect(() => {
    return () => stop();
  }, [stop]);

  return { audioData, isActive, startMicrophoneInput, startDemoMode, stop };
}
