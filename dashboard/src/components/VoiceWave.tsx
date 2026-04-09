import { motion } from 'framer-motion';

interface VoiceWaveProps {
  active: boolean;
  mode: 'listening' | 'speaking' | 'idle';
}

export function VoiceWave({ active, mode }: VoiceWaveProps) {
  if (!active) return null;

  const bars = 5;
  const color = mode === 'listening' ? '#6BA3FF' : mode === 'speaking' ? '#4AE6A0' : '#3A4550';

  return (
    <div className="flex items-center gap-1 h-6">
      {Array.from({ length: bars }).map((_, i) => (
        <motion.div
          key={i}
          className="w-1 rounded-full"
          style={{ backgroundColor: color }}
          animate={{
            height: active ? [8, 20 + Math.random() * 8, 8] : [4, 4, 4],
            opacity: active ? [0.5, 1, 0.5] : 0.2,
          }}
          transition={{
            duration: mode === 'speaking' ? 0.4 : 0.6,
            repeat: Infinity,
            delay: i * 0.08,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  );
}
