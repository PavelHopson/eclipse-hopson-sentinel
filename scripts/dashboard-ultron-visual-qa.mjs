// Fresh, headless local browser only. Never attaches to user tabs or profiles.
// All voice/LLM calls are mocked; no microphone, cloud or Ollama requests.
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const require = createRequire(process.env.QA_PLAYWRIGHT_PACKAGE || import.meta.url);
const { chromium } = require('playwright');
const root = path.resolve(fileURLToPath(new URL('../dashboard/dist/', import.meta.url)));
const version = JSON.parse(await readFile(new URL('../dashboard/package.json', import.meta.url))).version;
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Invalid local version');
const report = fileURLToPath(new URL('../reports/ultron-' + version + '/visual/', import.meta.url));
await mkdir(report, { recursive: true });
const sample = await readFile(new URL('../reports/voice-reference-2026-08-28/06-angry.mp3', import.meta.url));
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    if (pathname === '/qa-sample.mp3') {res.setHeader('Content-Type', 'audio/mpeg'); res.end(sample); return;}
    const filename = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!filename.startsWith(root + path.sep) && filename !== path.join(root, 'index.html')) throw new Error('path');
    const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2'};
    res.setHeader('Content-Type', mime[path.extname(filename)] || 'application/octet-stream');
    res.end(await readFile(filename));
  } catch {res.writeHead(404); res.end();}
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({headless: true, executablePath: process.env.QA_CHROMIUM, args:['--mute-audio']});
const results = [];
try {
  for (const [name, viewport, reducedMotion] of [['desktop',{width:1280,height:860},'no-preference'],['mobile',{width:390,height:844},'reduce']]) {
    const context = await browser.newContext({viewport, reducedMotion});
    const errors = [], blocked = [];
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin === base) return route.continue();
      if (url.origin === 'http://127.0.0.1:11434') return route.fulfill({
        contentType:'text/event-stream', body:'data: {"choices":[{"delta":{"content":"Я на связи."}}]}\n\ndata: [DONE]\n\n',
        headers:{'access-control-allow-origin':'*'},
      });
      blocked.push(url.origin); return route.abort();
    });
    await context.addInitScript(() => {
      localStorage.setItem('ultron-usage-guide-seen-v1','1');
      const qa = window.__voiceQA = {previewFail:false,ttsMode:'pending',stops:0,calls:0,listenCalls:0,pending:null};
      const sample = async () => ({ok:true,engine:'ultron-angry',mimeType:'audio/mpeg',audio:new Uint8Array(await (await fetch('/qa-sample.mp3')).arrayBuffer())});
      window.ultronVoice = {
        ensureModel:async()=>({ok:true,model:'qwen3:8b'}),
        listenOnce:async()=>{qa.listenCalls++;return {ok:true,text:'Скажи привет.',confidence:1};},
        synthesize:async()=>{
          qa.calls++;
          if(qa.ttsMode==='fail')return {ok:false,error:{message:'Не удалось подготовить голос Альтрона. Текст ответа сохранён.'}};
          if(qa.ttsMode==='play')return sample();
          return new Promise(resolve=>{qa.pending=resolve;});
        },
        stopSpeech:async()=>{qa.stops++;qa.pending?.({ok:false});qa.pending=null;return true;},
        previewSpeech:async()=>qa.previewFail?{ok:false}:sample(),
        startLive:async()=>({ok:true,active:true,state:'listening'}),
        stopLive:async()=>({ok:true,active:false,state:'idle'}),
        pauseLive:async()=>({ok:true,active:true,state:'paused'}),
        resumeLive:async()=>({ok:true,active:true,state:'listening'}),
        onLiveState:()=>1,onLiveTranscript:()=>2,removeLiveListener:()=>true,
      };
      const workspace={id:'qa-workspace',name:'eclipse-demo',files:12,truncated:false,openedAt:new Date(0).toISOString()};
      const proposal={schemaVersion:'eclipse.ultron.developer-proposal.v1',requestId:'qa-proposal',workspaceId:workspace.id,workspaceName:workspace.name,
        summary:'Добавляет явное пустое состояние без изменения архитектуры.',assumptions:['Компонент уже используется в основном маршруте.'],risks:['Нужна focused regression-проверка.'],
        changes:[{path:'src/App.tsx',expectedSha256:'before',afterSha256:'after',diff:'--- a/src/App.tsx\n+++ b/src/App.tsx\n@@ -1,1 +1,1 @@\n-old state\n+clear empty state'}],
        createdAt:new Date(0).toISOString(),expiresAt:new Date(Date.now()+600000).toISOString()};
      window.ultronDeveloper={
        selectWorkspace:async()=>({ok:true,workspace}),
        propose:async()=>({ok:true,model:'Qwen3.8-27B-Q4',proposal}),
        cancel:async()=>true,
        apply:async()=>({ok:true,receipt:{schemaVersion:'eclipse.ultron.developer-receipt.v1',receiptId:'qa-receipt',requestId:'qa-proposal',workspaceId:workspace.id,workspaceName:workspace.name,status:'applied',files:[{path:'src/App.tsx',beforeSha256:'before',afterSha256:'after'}],appliedAt:new Date().toISOString(),rollbackAvailable:true}}),
        previewRollback:async()=>({ok:true,preview:{schemaVersion:'eclipse.ultron.developer-rollback.v1',requestId:'qa-rollback',receiptId:'qa-receipt',workspaceId:workspace.id,files:[{path:'src/App.tsx',restoreSha256:'before',currentSha256:'after'}],expiresAt:new Date(Date.now()+600000).toISOString()}}),
        rollback:async()=>({ok:true,receipt:{schemaVersion:'eclipse.ultron.developer-receipt.v1',receiptId:'qa-receipt',workspaceId:workspace.id,workspaceName:workspace.name,status:'rolled-back',files:['src/App.tsx'],rolledBackAt:new Date().toISOString()}}),
      };
      window.ultronDiagnostics={collect:async()=>({ok:true,diagnostics:{
        schemaVersion:'eclipse.ultron.diagnostics.v1',overall:'ready',checkedAt:new Date().toISOString(),
        checks:[
          {id:'storage',label:'E-first хранилище',state:'ready',detail:'173.5 ГиБ свободно на диске E:.'},
          {id:'microphone',label:'Распознавание речи',state:'ready',detail:'Whisper и русская модель готовы. Сам микрофон проверяется только после вашего нажатия.'},
          {id:'tts',label:'Голос Альтрона',state:'ready',detail:'Pinned Piper и Ultron DSP готовы; сеть и GPU не используются.'},
          {id:'voice-model',label:'Быстрый диалог · Qwen 3 8B',state:'idle',detail:'Модель установлена; сервис спит до голосовой команды.'},
          {id:'developer-model',label:'Разработка · Qwen3.8 27B',state:'ready',detail:'Тяжёлая модель доступна только по запросу и не занимает GPU медиаплеера.'},
          {id:'media-guard',label:'Защита видео и музыки',state:'ready',detail:'27B выгружена; голосовой и Developer-контуры не запускаются одновременно.'},
        ],
        resources:{diskFreeGiB:173.5,memoryFreeGiB:47.9,memoryTotalGiB:63.8,labModelsLoaded:0,voiceActive:false,developerActive:false},
      }})};
    });
    const page = await context.newPage(); page.on('pageerror', error=>errors.push(error.message));
    await page.goto(base); await page.getByRole('button',{name:'Сказать одну фразу',exact:true}).waitFor();
    const diagnosticsButton = page.getByRole('button',{name:'Открыть диагностику',exact:true});
    await diagnosticsButton.click();
    const diagnosticsDialog = page.getByRole('dialog',{name:'Диагностика Альтрона'});
    await diagnosticsDialog.waitFor();
    await diagnosticsDialog.getByText('Контур готов',{exact:true}).waitFor();
    if (reducedMotion === 'no-preference') await page.waitForTimeout(240);
    await page.screenshot({path:path.join(report,`${name}-diagnostics-${reducedMotion}.png`),fullPage:true});
    const diagnosticsBounds=await diagnosticsDialog.boundingBox();
    assert.ok(diagnosticsBounds.x>=0 && diagnosticsBounds.x+diagnosticsBounds.width<=viewport.width+1);
    assert.ok(diagnosticsBounds.y>=0 && diagnosticsBounds.y+diagnosticsBounds.height<=viewport.height+1);
    await page.keyboard.press('Escape'); await diagnosticsDialog.waitFor({state:'hidden'});
    assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('aria-label')),'Открыть диагностику');
    await page.getByRole('button',{name:'Разработка',exact:true}).click();
    await page.getByRole('heading',{name:'Developer Mode',exact:true}).waitFor();
    await page.getByRole('button',{name:/Выбрать Git-репозиторий/}).click();
    await page.getByLabel('Что нужно изменить').fill('Добавь понятное пустое состояние и focused test.');
    await page.getByRole('button',{name:'Сформировать безопасный diff',exact:true}).click();
    await page.getByText('Preview · 1 файл(а)',{exact:true}).waitFor();
    await page.screenshot({path:path.join(report,`${name}-developer-preview.png`),fullPage:true});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.getByText('Я проверил diff и разрешаю применить именно его',{exact:true}).click();
    await page.getByRole('button',{name:'Применить подтверждённый diff',exact:true}).click();
    await page.getByRole('heading',{name:'Изменения применены',exact:true}).waitFor();
    await page.getByRole('button',{name:'Подготовить откат',exact:true}).click();
    await page.getByText('Я проверил preview отката',{exact:true}).click();
    await page.getByRole('button',{name:'Выполнить откат',exact:true}).click();
    await page.getByRole('heading',{name:'Изменения отменены',exact:true}).waitFor();
    await page.getByRole('button',{name:'Альтрон',exact:true}).click();
    await page.getByRole('button',{name:'Сказать одну фразу',exact:true}).waitFor();
    const open = page.getByRole('button',{name:'Открыть настройки',exact:true});
    await open.click();
    const dialog = page.getByRole('dialog',{name:'Настройки Eclipse Ultron'});
    await dialog.waitFor();
    assert.equal(await dialog.getByRole('combobox').count(),0);
    assert.equal(await dialog.getByText(/Лилит|Lilith|Serena|Vivian/).count(),0);
    await page.evaluate(()=>document.fonts.ready);
    await page.screenshot({path:path.join(report,`${name}-settings.png`),fullPage:true});
    const bounds=await dialog.boundingBox();
    assert.ok(bounds.x>=0 && bounds.x+bounds.width<=viewport.width+1);
    assert.ok(bounds.y>=0 && bounds.y+bounds.height<=viewport.height+1);
    await dialog.getByRole('button',{name:'Послушать голос',exact:true}).click();
    await dialog.getByRole('button',{name:'Остановить',exact:true}).waitFor();
    await dialog.getByRole('button',{name:'Остановить',exact:true}).click();
    await dialog.getByRole('button',{name:'Послушать голос',exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>window.__voiceQA.calls),0);
    await page.evaluate(()=>{window.__voiceQA.previewFail=true;});
    await dialog.getByRole('button',{name:'Послушать голос',exact:true}).click();
    await dialog.getByRole('alert').waitFor();
    await page.screenshot({path:path.join(report,`${name}-preview-error.png`),fullPage:true});
    await dialog.getByRole('button',{name:'Готово',exact:true}).focus();
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('aria-label')),'Закрыть настройки');
    await page.keyboard.press('Escape'); await dialog.waitFor({state:'hidden'});
    assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('aria-label')),'Открыть настройки');
    await page.getByRole('button',{name:'Сказать одну фразу',exact:true}).click();
    await page.getByText('Готовлю голос Альтрона',{exact:true}).waitFor();
    await page.screenshot({path:path.join(report,`${name}-preparing.png`),fullPage:true});
    assert.equal(await page.locator('.ultron-voice').getAttribute('data-state'),'thinking');
    const beforeSettings=await page.evaluate(()=>window.__voiceQA.stops);
    await open.click();
    assert.equal(await dialog.getByRole('button',{name:'Послушать голос',exact:true}).isDisabled(),true);
    await page.keyboard.press('Escape'); await dialog.waitFor({state:'hidden'});
    assert.equal(await page.evaluate(()=>window.__voiceQA.stops),beforeSettings);
    await page.getByText('Готовлю голос Альтрона',{exact:true}).waitFor();
    await page.getByRole('button',{name:/Остановить ответ/}).click();
    await page.getByRole('button',{name:'Повторить ответ',exact:true}).waitFor();
    await page.evaluate(()=>{window.__voiceQA.ttsMode='fail';});
    await page.getByRole('button',{name:'Повторить ответ',exact:true}).click();
    await page.getByRole('alert').waitFor();
    assert.ok((await page.locator('[data-speaker="ultron"]').innerText()).includes('Я на связи.'));
    await page.screenshot({path:path.join(report,`${name}-speech-error.png`),fullPage:true});
    await page.evaluate(()=>{window.__voiceQA.ttsMode='play';});
    await page.getByRole('button',{name:'Повторить озвучку',exact:true}).click();
    await page.locator('.ultron-voice[data-state="speaking"]').waitFor();
    await page.getByRole('button',{name:/Остановить ответ/}).click();
    await page.getByRole('button',{name:'Повторить ответ',exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>window.__voiceQA.listenCalls),1);
    assert.deepEqual(errors,[]); assert.deepEqual(blocked,[]);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    results.push({name,passed:true,viewport,reducedMotion,consoleErrors:errors,externalRequests:blocked});
    await context.close();
  }
  await writeFile(path.join(report,'result.json'),JSON.stringify({passed:true,microphone:false,realModels:false,results},null,2));
  console.log(JSON.stringify({passed:true,results}));
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
