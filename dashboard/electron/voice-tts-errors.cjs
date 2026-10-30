// Only fixed public categories cross IPC. Never forward native stderr, paths,
// provider payloads or raw exception messages to the renderer/logs.
const FAILURE = Object.freeze({
  cancelled: ['TTS_CANCELLED', 'Озвучка остановлена. Можно повторить ответ.'],
  busy: ['TTS_BUSY', 'Предыдущая озвучка ещё завершается. Повторите ответ через секунду.'],
  'invalid-text': ['TTS_INPUT_REJECTED', 'Не удалось озвучить формат ответа.'],
  'piper-integrity': ['TTS_PIPER_INTEGRITY', 'Файлы локального голоса не прошли проверку целостности. Нужна проверка runtime.'],
  'piper-unavailable': ['TTS_PIPER_START', 'Не удалось запустить локальный голос Piper.'],
  'piper-input-failed': ['TTS_PIPER_INPUT', 'Прервалась передача текста локальному голосу. Повторите озвучку.'],
  'piper-failed': ['TTS_PIPER_EXIT', 'Локальный голос Piper завершился с ошибкой.'],
  'piper-invalid-audio': ['TTS_PIPER_AUDIO', 'Локальный голос не создал корректное аудио.'],
  'piper-timeout': ['TTS_PIPER_TIMEOUT', 'Локальный голос не успел подготовить ответ. Повторите озвучку.'],
  'piper-output-limit': ['TTS_PIPER_LIMIT', 'Ответ голоса превысил безопасный размер.'],
  'piper-log-limit': ['TTS_PIPER_LIMIT', 'Локальный голос остановлен из-за чрезмерного вывода.'],
  'invalid-dsp-input': ['TTS_DSP_INPUT', 'Аудио не прошло проверку перед обработкой тембра.'],
  'dsp-unavailable': ['TTS_DSP_START', 'Не удалось запустить защищённую обработку тембра.'],
  'dsp-input-failed': ['TTS_DSP_INPUT', 'Прервалась передача аудио на обработку тембра.'],
  'dsp-invalid-audio': ['TTS_DSP_AUDIO', 'Обработка тембра не вернула корректный звук.'],
  'dsp-timeout': ['TTS_DSP_TIMEOUT', 'Обработка тембра не завершилась вовремя.'],
  'dsp-output-limit': ['TTS_DSP_LIMIT', 'Обработка тембра превысила безопасный размер аудио.'],
  'dsp-log-limit': ['TTS_DSP_LIMIT', 'Обработка тембра остановлена из-за чрезмерного вывода.'],
  'invalid-runtime-config': ['TTS_CONFIG', 'Конфигурация локального голоса некорректна.'],
  'unapproved-runtime': ['TTS_RUNTIME_INTEGRITY', 'Голосовой runtime не прошёл проверку файлов.'],
  'runtime-integrity': ['TTS_RUNTIME_INTEGRITY', 'Голосовой runtime не прошёл проверку целостности.'],
});
function publicTtsFailure(error) {
  const entry = typeof error?.message === 'string' && Object.hasOwn(FAILURE, error.message)
    ? FAILURE[error.message]
    : ['ENOENT', 'ERR_MODULE_NOT_FOUND'].includes(error?.code)
      ? ['TTS_RUNTIME_MISSING', 'Не найден компонент локального голосового runtime.']
      : ['TTS_UNAVAILABLE', 'Не удалось подготовить голос Альтрона.'];
  return { ok: false, error: { code: entry[0], message: `${entry[1]} Код: ${entry[0]}. Текст ответа сохранён на экране.` } };
}
module.exports = { publicTtsFailure };
