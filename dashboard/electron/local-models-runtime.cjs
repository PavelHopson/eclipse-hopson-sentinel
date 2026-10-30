const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes, randomUUID } = require('node:crypto');

const ROOT = 'E:/AI';
const MODEL_ROOT = ROOT + '/Models/Ultron-Qwen';
const COMFY_ROOT = ROOT + '/Tools/ComfyUI-Ultron/ComfyUI-0.37.0';
const TEXT_URL = 'http://127.0.0.1:8087';
const IMAGE_URL = 'http://127.0.0.1:8187';
const REQUIRED={text:['RVN-Q3_K_S-multilingual-mtp.gguf','mmproj-Qwen3.8-27B-Q8_0.gguf'],images:['diffusion_models/qwen_image_2.1_int8_convrot.safetensors','diffusion_models/Qwen-Image-2.1-viggle-turbo-v0.3-6step-int8_convrot.safetensors','text_encoders/qwen3vl_8b_int8_convrot.safetensors','vae/qwen_image_2.1_vae_bf16.safetensors']};
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const fail = code => Object.assign(new Error(code), { code });
function validRaster(dataUrl) {
  const match=dataUrl.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/);
  if(!match)return false;
  const data=Buffer.from(match[2],'base64');let width=0,height=0;
  try{
    if(match[1]==='png'&&data.length>=33&&data.subarray(0,8).toString('hex')==='89504e470d0a1a0a'&&data.toString('ascii',12,16)==='IHDR'){
      width=data.readUInt32BE(16);height=data.readUInt32BE(20);
      // ComfyUI's LoadImage stacks every animation frame. Admit static rasters only.
      for(let offset=8;offset+12<=data.length;){
        const length=data.readUInt32BE(offset),type=data.toString('ascii',offset+4,offset+8);
        if(offset+length+12>data.length||['acTL','fcTL','fdAT'].includes(type))return false;
        offset+=length+12;if(type==='IEND')break;
      }
    }
    else if(match[1]==='jpeg'&&data[0]===255&&data[1]===216){
      let offset=2;
      while(offset+4<data.length){
        if(data[offset++]!==255)return false;while(data[offset]===255)offset++;
        const marker=data[offset++];if(marker===217||marker===218)break;
        const length=data.readUInt16BE(offset);if(length<2||offset+length>data.length)return false;
        if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)){if(length<8)return false;height=data.readUInt16BE(offset+3);width=data.readUInt16BE(offset+5);break;}
        offset+=length;
      }
    }else if(match[1]==='webp'&&data.toString('ascii',0,4)==='RIFF'&&data.toString('ascii',8,12)==='WEBP'){
      let offset=12;
      while(offset+8<=data.length){
        const tag=data.toString('ascii',offset,offset+4),length=data.readUInt32LE(offset+4),start=offset+8;
        if(start+length>data.length)return false;
        if(tag==='VP8X'&&length>=10){if(data[start]&2)return false;width=data.readUIntLE(start+4,3)+1;height=data.readUIntLE(start+7,3)+1;break;}
        if(tag==='VP8L'&&length>=5&&data[start]===47){const packed=data.readUInt32LE(start+1);width=(packed&16383)+1;height=((packed>>>14)&16383)+1;break;}
        if(tag==='VP8 '&&length>=10&&data.subarray(start+3,start+6).toString('hex')==='9d012a'){width=data.readUInt16LE(start+6)&16383;height=data.readUInt16LE(start+8)&16383;break;}
        offset=start+length+(length%2);
      }
    }
  }catch{return false;}
  return width>0&&height>0&&width<=4096&&height<=4096&&width*height<=16000000;
}
async function boundedBody(response, limit) {
  if(Number(response.headers.get('content-length'))>limit){await response.body?.cancel();throw fail('RESPONSE_TOO_LARGE');}
  const chunks=[];let size=0;
  for await(const chunk of response.body){size+=chunk.length;if(size>limit){throw fail('RESPONSE_TOO_LARGE');}chunks.push(Buffer.from(chunk));}
  return Buffer.concat(chunks,size);
}

function validateRequest(request) {
  if (!request || Object.getPrototypeOf(request) !== Object.prototype || !['text', 'image-base', 'image-turbo'].includes(request.mode) || !text(request.prompt, 8000)) throw fail('INVALID_REQUEST');
  if (Object.keys(request).some(key => !['mode', 'prompt', 'image', 'seed', 'messages'].includes(key))) throw fail('INVALID_REQUEST');
  if (request.seed !== undefined && (!Number.isSafeInteger(request.seed) || request.seed < 0 || request.seed > 2147483647)) throw fail('INVALID_SEED');
  if (request.image !== undefined && (typeof request.image !== 'string' || request.image.length > 12_000_000 || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(request.image))) throw fail('INVALID_IMAGE');
  if(request.image!==undefined&&!validRaster(request.image))throw fail('INVALID_IMAGE');
  if (request.messages !== undefined && (!Array.isArray(request.messages) || request.messages.length > 12 || request.messages.some(m => !m || !['user', 'assistant'].includes(m.role) || !text(m.content, 8000) || Object.keys(m).some(k => !['role', 'content'].includes(k))))) throw fail('INVALID_HISTORY');
  return request;
}

function imageWorkflow(mode, prompt, seed, imageName) {
  const node = (class_type, inputs) => ({ class_type, inputs });
  const graph = {
    '1': node('UNETLoader', {unet_name: mode === 'image-turbo' ? 'Qwen-Image-2.1-viggle-turbo-v0.3-6step-int8_convrot.safetensors' : 'qwen_image_2.1_int8_convrot.safetensors', weight_dtype:'default'}),
    '2': node('CLIPLoader', {clip_name:'qwen3vl_8b_int8_convrot.safetensors',type:'qwen_image',device:'default'}),
    '3': node('VAELoader', {vae_name:'qwen_image_2.1_vae_bf16.safetensors'}),
    '4': node('TextEncodeQwenImage21', {clip:['2',0],vae:['3',0],prompt,negative_prompt:'',resolution:1024}),
    '6': node('BasicGuider', {model:['1',0],conditioning:['4',0]}),
    '7': node('RandomNoise', {noise_seed:seed}),
    '8': node('KSamplerSelect', {sampler_name:'euler'}),
    '9': mode === 'image-turbo' ? node('ViggleTurboSigmas', {latent:['4',2],nodes:'1.0, 0.9375, 0.875, 0.75, 0.5, 0.25'}) : node('BasicScheduler', {model:['1',0],scheduler:'simple',steps:25,denoise:1}),
    '10': node('SamplerCustomAdvanced', {noise:['7',0],guider:['6',0],sampler:['8',0],sigmas:['9',0],latent_image:['4',2]}),
    '11': node('VAEDecode', {samples:['10',0],vae:['3',0]}),
    '12': node('SaveImage', {images:['11',0],filename_prefix:'ultron-qwen'}),
  };
  if (imageName) {
    graph['13'] = node('LoadImage', {image:imageName});
    graph['4'].inputs['images.image_1'] = ['13',0];
    graph['10'].inputs.latent_image = ['4',2];
    if (mode === 'image-turbo') graph['9'].inputs.latent = ['4',2];
  }
  return graph;
}

function createLocalModelsRuntime({ terminate, fetchImpl = fetch } = {}) {
  const children = new Map();
  let active = null;
  let stopping = null;
  let key = randomBytes(32).toString('hex');
  let lastStartup = '';
  async function stopKind(kind) {
    const child = children.get(kind);
    if (!child) return;
    if (terminate) await terminate(child); else child.kill();
    if(children.get(kind)===child)children.delete(kind);
  }
  async function stopAll() {
    if(!stopping)stopping=Promise.all([...children.keys()].map(stopKind)).finally(()=>{stopping=null;});
    await stopping;
  }
  async function cancel() {
    active?.abort();
    await stopAll();
    return {ok:true};
  }
  function status() {
    const manifestPath = MODEL_ROOT + '/manifest.json';
    let models = [];
    try {models = JSON.parse(fs.readFileSync(manifestPath,'utf8'));} catch { /* Missing installation is a visible status. */ }
    const ready = prefix => Array.isArray(models) && REQUIRED[prefix].every(relative=>{
      const expected=MODEL_ROOT+'/'+prefix+'/'+relative;
      const model=models.find(m=>typeof m?.path==='string'&&m.path.replaceAll('\\','/')===expected);
      try{return model?.verified===true&&fs.statSync(expected).size===model.size;}catch{return false;}
    });
    return {ok:true,textInstalled:Boolean(ready('text')),imageInstalled:Boolean(ready('images')),running:[...children.keys()],busy:Boolean(active||stopping)};
  }
  async function requestJson(url, init = {}, signal) {
    const response = await fetchImpl(url,{...init,signal:signal || AbortSignal.timeout(5000),redirect:'error'});
    if (!response.ok) { await response.body?.cancel(); throw fail('SERVER_'+response.status); }
    return JSON.parse((await boundedBody(response,4_000_000)).toString('utf8'));
  }
  async function ensure(kind, signal) {
    await stopKind(kind === 'text' ? 'images' : 'text');
    if (children.has(kind)) return;
    const installed = status();
    if (!installed[kind === 'text' ? 'textInstalled' : 'imageInstalled']) throw fail('MODELS_NOT_INSTALLED');
    // An unrelated process on the dedicated port is never silently adopted.
    try { await fetchImpl((kind === 'text' ? TEXT_URL+'/health' : IMAGE_URL+'/system_stats'),{signal:AbortSignal.timeout(700),redirect:'error'}); throw fail('PORT_IN_USE'); } catch (error) { if (error.code === 'PORT_IN_USE') throw error; }
    let executable, args;
    const env = {HF_HOME:ROOT+'/Cache/huggingface',TORCH_HOME:ROOT+'/Cache/torch',TEMP:'E:/Temp',TMP:'E:/Temp'};
    for(const name of ['PATH','SYSTEMROOT','WINDIR','COMSPEC','LOCALAPPDATA','APPDATA','USERPROFILE','PROGRAMFILES','PROGRAMFILES(X86)'])if(process.env[name])env[name]=process.env[name];
    if (kind === 'text') {
      key=randomBytes(32).toString('hex');
      executable=ROOT+'/Runtimes/llama-b11146/llama-server.exe';
      args=['-m',MODEL_ROOT+'/text/RVN-Q3_K_S-multilingual-mtp.gguf','--mmproj',MODEL_ROOT+'/text/mmproj-Qwen3.8-27B-Q8_0.gguf','--no-mmproj-offload','-ngl','99','-c','8192','-np','1','-b','256','-ub','128','-fa','on','-ctk','q8_0','-ctv','q8_0','--spec-type','draft-mtp','--spec-draft-n-max','2','--no-warmup','--jinja','--host','127.0.0.1','--port','8087','--alias','ultron-qwen-rvn','--api-key',key];
    } else {
      executable=ROOT+'/Environments/ultron-images/Scripts/python.exe';
      args=[COMFY_ROOT+'/main.py','--listen','127.0.0.1','--port','8187','--disable-auto-launch','--lowvram','--extra-model-paths-config',ROOT+'/Work/ultron-models/model-paths.yaml','--input-directory',ROOT+'/Work/ultron-models/input','--output-directory',ROOT+'/Exports/ultron-qwen','--temp-directory','E:/Temp/ultron-comfy','--user-directory',ROOT+'/Work/ultron-models/user','--database-url','sqlite:///E:/AI/Work/ultron-models/comfyui.db','--disable-api-nodes','--disable-metadata','--disable-all-custom-nodes','--whitelist-custom-nodes','viggle_turbo.py'];
    }
    if (!fs.existsSync(executable)) throw fail('RUNTIME_NOT_INSTALLED');
    lastStartup='';
    const child=spawn(executable,args,{cwd:kind === 'images' ? COMFY_ROOT : path.dirname(executable),env,windowsHide:true,stdio:['ignore','pipe','pipe']});
    children.set(kind,child);
    let failed=null;let capturing=true;
    child.on('error',error=>{failed=error;children.delete(kind);});
    child.on('exit',()=>{if(children.get(kind)===child) children.delete(kind);});
    for (const stream of [child.stdout,child.stderr]) stream.on('data',chunk=>{if(capturing)lastStartup=(lastStartup+chunk.toString()).slice(-6000);});
    const deadline=Date.now()+600_000;
    while(Date.now()<deadline) {
      if(signal.aborted) throw fail('CANCELLED');
      if(failed || child.exitCode !== null) throw fail('RUNTIME_START_FAILED');
      try { await requestJson(kind==='text'?TEXT_URL+'/health':IMAGE_URL+'/system_stats',{},AbortSignal.timeout(1000)); capturing=false; return; } catch { /* Poll our owned child, bounded by startup deadline. */ }
      await sleep(700);
    }
    throw fail('START_TIMEOUT');
  }
  async function run(input) {
    let request;
    try { request=validateRequest(input); } catch(error) {return {ok:false,error:{code:error.code}};}
    if(active) return {ok:false,error:{code:'BUSY'}};
    const controller=new AbortController();active=controller;
    let timedOut=false;
    const timer=setTimeout(()=>{timedOut=true;controller.abort();},900_000);
    const started=Date.now();
    try {
      const kind=request.mode==='text'?'text':'images';
      await ensure(kind,controller.signal);
      if(kind==='text') {
        const content=request.image ? [{type:'text',text:request.prompt},{type:'image_url',image_url:{url:request.image}}] : request.prompt;
        const result=await requestJson(TEXT_URL+'/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+key},body:JSON.stringify({model:'ultron-qwen-rvn',messages:[{role:'system',content:'Ты локальный помощник Eclipse Ultron Lab. Отвечай на русском. У тебя нет инструментов и доступа к файлам. Не утверждай, что выполнил внешние действия.'},...(request.messages || []),{role:'user',content}],max_tokens:1024,stream:false,temperature:0.6,chat_template_kwargs:{enable_thinking:false}})},controller.signal);
        const answer=result.choices?.[0]?.message?.content;
        if(!text(answer,100_000)) throw fail('EMPTY_RESPONSE');
        return {ok:true,text:answer,elapsedMs:Date.now()-started,model:'Qwen3.8 27B RVN Q3_K_S',usage:result.usage};
      }
      let imageName;
      if(request.image) {
        const [,mime,encoded]=request.image.match(/^data:(image\/[^;]+);base64,(.+)$/);
        const body=new FormData();body.set('image',new Blob([Buffer.from(encoded,'base64')],{type:mime}),'ultron-'+randomUUID()+'.'+mime.split('/')[1]);body.set('overwrite','false');
        const upload=await requestJson(IMAGE_URL+'/upload/image',{method:'POST',body},controller.signal);
        if(typeof upload.name!=='string' || !/^[\w.-]+$/.test(upload.name)) throw fail('INVALID_UPLOAD_RESPONSE');
        imageName=upload.name;
      }
      const seed=request.seed ?? Math.floor(Math.random()*2147483647);
      const job=await requestJson(IMAGE_URL+'/prompt',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt:imageWorkflow(request.mode,request.prompt,seed,imageName),client_id:randomUUID()})},controller.signal);
      if(!/^[\w-]+$/.test(job.prompt_id || '')) throw fail('INVALID_JOB');
      while(!controller.signal.aborted) {
        const history=await requestJson(IMAGE_URL+'/history/'+job.prompt_id,{},controller.signal);
        const entry=history[job.prompt_id];
        if(entry?.status?.status_str==='error') throw fail('GENERATION_FAILED');
        const image=entry?.outputs?.['12']?.images?.[0];
        if(image) {
          if(image.type!=='output' || image.subfolder || !/^[\w.-]+\.png$/.test(image.filename)) throw fail('INVALID_OUTPUT');
          const response=await fetchImpl(IMAGE_URL+'/view?'+new URLSearchParams({filename:image.filename,type:'output'}),{signal:controller.signal,redirect:'error'});
          if(!response.ok) throw fail('OUTPUT_UNAVAILABLE');
          const data=await boundedBody(response,20_000_000);
          if(data.length>20_000_000 || data.subarray(0,8).toString('hex')!=='89504e470d0a1a0a') throw fail('INVALID_OUTPUT');
          return {ok:true,image:'data:image/png;base64,'+data.toString('base64'),filename:image.filename,path:ROOT+'/Exports/ultron-qwen/'+image.filename,seed,elapsedMs:Date.now()-started,model:request.mode==='image-turbo'?'Qwen-Image-2.1 Viggle Turbo v0.3':'Qwen-Image-2.1 INT8'};
        }
        await sleep(800);
      }
      throw fail('CANCELLED');
    } catch(error) {
      if(controller.signal.aborted || ['START_TIMEOUT','RUNTIME_START_FAILED'].includes(error.code)) await stopAll();
      return {ok:false,error:{code:controller.signal.aborted?(timedOut?'REQUEST_TIMEOUT':'CANCELLED'):error.code || 'LOCAL_MODEL_FAILED'}};
    } finally {clearTimeout(timer);if(active===controller) active=null;}
  }
  return {run,status,cancel,dispose:cancel,debugStartup:()=>lastStartup};
}
module.exports={createLocalModelsRuntime,validateRequest,imageWorkflow};
