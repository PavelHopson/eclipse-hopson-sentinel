import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Send, Square, X } from 'lucide-react';
import './local-models.css';

type Mode = 'text' | 'image-base' | 'image-turbo';
type Turn = {role: 'user' | 'assistant'; content: string};
type Result = {ok: boolean; text?: string; image?: string; path?: string; seed?: number; elapsedMs?: number; error?: {code: string}};
type Bridge = {status: () => Promise<{textInstalled: boolean; imageInstalled: boolean}>; run: (input: {mode: Mode; prompt: string; image?: string; messages?: Turn[]}) => Promise<Result>; cancel: () => Promise<unknown>};
const bridge = () => (window as unknown as {ultronLocalModels?: Bridge}).ultronLocalModels;
const errors: Record<string,string> = {
  REQUEST_TIMEOUT: 'Запрос превысил 15 минут и остановлен. Можно повторить его.',
  CANCELLED: 'Запрос отменён. Модель освобождает видеокарту.', BUSY: 'Модель уже выполняет запрос.',
  RESOURCE_BUSY: 'Завершите голосовой разговор или задачу разработки перед запуском модели.',
  MODELS_NOT_INSTALLED: 'Загрузка и проверка весов ещё не завершены.', RUNTIME_NOT_INSTALLED: 'Локальное окружение модели не установлено.',
  PORT_IN_USE: 'Порт занят другим процессом. Альтрон не будет подключаться к нему.',
  START_TIMEOUT: 'Модель не запустилась за десять минут. Повторите запрос.',
  RUNTIME_START_FAILED: 'Не удалось запустить модель. Проверьте локальную установку.',
  GENERATION_FAILED: 'Генерация завершилась ошибкой. Можно повторить запрос.',
  INVALID_IMAGE: 'Выберите статичный PNG, JPEG или WebP до 8 МБ и 4096 пикселей по стороне.',
};
export function LocalModels() {
  const [mode, setMode] = useState<Mode>('text');
  const [prompt, setPrompt] = useState('');
  const [image, setImage] = useState<string>();
  const [imageName, setImageName] = useState('');
  const [history, setHistory] = useState<Turn[]>([]);
  const [result, setResult] = useState<Result>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [installed, setInstalled] = useState({textInstalled:false,imageInstalled:false});
  const alive = useRef(true);
  const active = useRef(false);
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    alive.current=true;
    const refresh=()=>void bridge()?.status().then(value=>{if(alive.current)setInstalled(value);}).catch(()=>{if(alive.current)setError('Не удалось проверить локальные модели.');});
    refresh(); const timer=window.setInterval(refresh,10000);
    return ()=>{alive.current=false;window.clearInterval(timer);void bridge()?.cancel();};
  },[]);
  useEffect(()=>{if(!busy)return;setSeconds(0);const timer=window.setInterval(()=>setSeconds(value=>value+1),1000);return()=>window.clearInterval(timer);},[busy]);
  useEffect(()=>{if(!busy)return;const cancel=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();void bridge()?.cancel();}};window.addEventListener('keydown',cancel);return()=>window.removeEventListener('keydown',cancel);},[busy]);
  async function attach(file?: File) {
    if(!file)return;
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>8_000_000){setError(errors.INVALID_IMAGE);return;}
    const reader=new FileReader();
    reader.onload=()=>{if(alive.current){setImage(String(reader.result));setImageName(file.name);setError('');}};
    reader.onerror=()=>setError('Не удалось прочитать изображение.');reader.readAsDataURL(file);
  }
  async function run() {
    const api=bridge();if(!api){setError('Локальные модели доступны в настольном приложении Альтрон.');return;}
    if(active.current||!prompt.trim())return;
    const question=prompt.trim();active.current=true;setBusy(true);setError('');setResult(undefined);
    try {
      const value=await api.run({mode,prompt:question,...(image?{image}:{}),...(mode==='text'?{messages:history.slice(-10)}:{})});
      if(!alive.current)return;
      if(!value.ok){setError(errors[value.error?.code||'']||`Запрос не выполнен (${value.error?.code||'LOCAL_MODEL_FAILED'}).`);return;}
      setResult(value);if(mode==='text'&&value.text)setHistory(turns=>[...turns,{role:'user' as const,content:question},{role:'assistant' as const,content:value.text!}].slice(-10));
    } catch {if(alive.current)setError('Связь с локальной моделью прервалась. Повторите запрос.');}
    finally {active.current=false;if(alive.current){setBusy(false);input.current?.focus();}}
  }
  const ready=mode==='text'?installed.textInstalled:installed.imageInstalled;
  return <section className="local-models" aria-label="Локальные модели">
    <div className="local-models__heading"><h1>Локальные модели</h1><p>Текст, изображения и визуальные задачи на вашем компьютере.</p></div>
    <div className="local-models__controls">
      <label htmlFor="local-model-select">Модель</label>
      <select id="local-model-select" value={mode} disabled={busy} onChange={event=>{setMode(event.target.value as Mode);setResult(undefined);setError('');}}>
        <option value="text">Qwen3.8 27B RVN — текст и анализ изображений</option>
        <option value="image-turbo">Qwen-Image-2.1 Viggle Turbo — 6 шагов</option>
        <option value="image-base">Qwen-Image-2.1 — базовая модель</option>
      </select>
      <p className="local-models__note">{ready?'Веса установлены и проверены. Модель запустится при отправке.':'Ожидается завершение установки и проверки весов.'}</p>
      {mode!=='text'&&<p className="local-models__license">Исследовательский режим. Коммерческое использование требует отдельной проверки лицензии. Генерация: 1024 × 1024; редактирование сохраняет пропорции.</p>}
      {mode==='text'&&<p className="local-models__note">Отдельный Lab: модель не получает инструменты, права оператора и доступ к файлам. Контекст — 8192 токена.</p>}
      <label htmlFor="local-model-prompt">{mode==='text'?'Ваш запрос':image?'Что изменить на изображении':'Опишите изображение'}</label>
      <textarea ref={input} id="local-model-prompt" value={prompt} maxLength={8000} disabled={busy} rows={5} onChange={event=>setPrompt(event.target.value)} onKeyDown={event=>{if((event.ctrlKey||event.metaKey)&&event.key==='Enter'){event.preventDefault();void run();}if(event.key==='Escape'&&busy)void bridge()?.cancel();}} placeholder="Введите запрос. Ctrl+Enter — отправить" />
      {image&&<div className="local-models__attachment"><img src={image} alt="Прикреплённое изображение"/><span>{imageName}</span><button type="button" disabled={busy} aria-label="Убрать изображение" onClick={()=>{setImage(undefined);setImageName('');}}><X size={18}/></button></div>}
      <div className="local-models__actions">
        <label className="local-models__upload"><ImagePlus size={18}/> Изображение<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} aria-label="Прикрепить изображение" onChange={event=>{void attach(event.target.files?.[0]);event.target.value='';}}/></label>
        {mode==='text'&&history.length>0&&<button type="button" disabled={busy} onClick={()=>{setHistory([]);setResult(undefined);}}>Очистить контекст</button>}
        {busy?<button type="button" className="local-models__primary" onClick={()=>void bridge()?.cancel()}><Square size={16}/> Отменить</button>:<button type="button" className="local-models__primary" disabled={!prompt.trim()||!ready} onClick={()=>void run()}><Send size={16}/>{mode==='text'?'Отправить':'Сгенерировать'}</button>}
      </div>
    </div>
    <div aria-live="polite" className="local-models__status">{busy&&<p role="status">Модель загружается или выполняет запрос · {seconds} с. Первый запуск может занять несколько минут.</p>}{error&&<p role="alert" className="local-models__error">{error}</p>}</div>
    {result?.ok&&<div className="local-models__result">{result.text&&<p className="local-models__answer">{result.text}</p>}{result.image&&<><img className="local-models__output" src={result.image} alt="Результат генерации"/><p className="local-models__note">Сохранено: {result.path}<br/>Seed: {result.seed}</p></>}<p className="local-models__note">Выполнено за {Math.round((result.elapsedMs||0)/1000)} с, включая запуск модели.</p></div>}
  </section>;
}
