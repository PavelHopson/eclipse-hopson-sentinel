// Web Speech API — STT + TTS

export function isSpeechSupported(): boolean {
  return 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
}

export function isTTSSupported(): boolean {
  return 'speechSynthesis' in window;
}

export function createRecognition(
  onResult: (text: string) => void,
  onEnd: () => void,
  lang: string = 'ru-RU',
): any | null {
  const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!SR) return null;

  const recognition = new SR();
  recognition.lang = lang;
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onresult = (event: any) => {
    const text = event.results[0][0].transcript;
    onResult(text);
  };

  recognition.onend = onEnd;
  recognition.onerror = () => onEnd();

  return recognition;
}

export function speak(text: string, lang: string = 'ru-RU'): Promise<void> {
  return new Promise((resolve) => {
    if (!isTTSSupported()) { resolve(); return; }

    // Clean markdown from text
    const clean = text
      .replace(/```[\s\S]*?```/g, 'блок кода')
      .replace(/`[^`]+`/g, '')
      .replace(/[#*_~>\[\]()]/g, '')
      .replace(/\n{2,}/g, '. ')
      .replace(/\n/g, ' ')
      .trim();

    if (!clean) { resolve(); return; }

    // Take first 500 chars for TTS
    const short = clean.length > 500 ? clean.slice(0, 500) + '...' : clean;

    const utterance = new SpeechSynthesisUtterance(short);
    utterance.lang = lang;
    utterance.rate = 1.05;
    utterance.pitch = 0.95;
    utterance.volume = 0.9;

    // Try to find a good Russian voice
    const voices = speechSynthesis.getVoices();
    const ruVoice = voices.find(v => v.lang.startsWith('ru') && v.name.includes('Google'))
      || voices.find(v => v.lang.startsWith('ru'))
      || voices.find(v => v.lang.startsWith('en') && v.name.includes('Google'));
    if (ruVoice) utterance.voice = ruVoice;

    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    speechSynthesis.speak(utterance);
  });
}

export function stopSpeaking() {
  if (isTTSSupported()) speechSynthesis.cancel();
}
