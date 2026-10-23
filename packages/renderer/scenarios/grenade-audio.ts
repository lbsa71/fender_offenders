/** Native OfflineAudioContext proof; requires the renderer scenario server on5184. */
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const output='C:/Users/StefanAndersson/Documents/Codex/2026-10-22/if/outputs/boss-combat';
const browser=await chromium.launch({headless:true,channel:'msedge',args:['--disable-gpu']});
try{
 const page=await browser.newPage(),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.addInitScript('window.__name=(fn)=>fn');await page.route('**/grenade-audio-qa',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Original grenade audio</title>'}));await page.goto('http://127.0.0.1:5184/grenade-audio-qa');
 const clips=await page.evaluate(async()=>{
  const modulePath='/@fs/C:/Source/lbsa71/fender_offenders/packages/renderer/src/audio.ts',{MotorAudio}=await import(modulePath),sampleRate=44100;
  async function render(label:string,duration:number,schedule:(audio:any)=>void,muted=false){
   const context=new OfflineAudioContext(1,Math.ceil(duration*sampleRate),sampleRate),adapter=new Proxy(context,{get(target,key){if(key==='resume'||key==='close')return()=>Promise.resolve();const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
   const audio=new MotorAudio(()=>adapter);audio.volume=1;audio.muted=muted;audio.unlock();schedule(audio);const buffer=await context.startRendering(),samples=Array.from(buffer.getChannelData(0));audio.dispose();let peak=0,sum=0;for(const n of samples){peak=Math.max(peak,Math.abs(n));sum+=n*n;}return{label,duration,sampleRate,peak,rms:Math.sqrt(sum/samples.length),samples};
  }
  return[
   await render('Cartoon descending lob',.85,a=>a.grenade('lob',1,'g')),
   await render('Rubbery landing plonk',.4,a=>a.grenade('land',1,'g')),
   await render('Fuse tick',.2,a=>a.grenade('fuse',1,'g')),
   await render('Five-layer grenade blast',1.2,a=>a.grenade('blast',1,'g')),
   await render('Distant grenade blast',1.2,a=>a.grenade('blast',.2,'g')),
   await render('Twelve-voice grenade and shot overlap',1.2,a=>{for(let i=0;i<20;i++){a.grenade('blast',1,'g'+i);a.effect('shot');}}),
   await render('Muted control',.4,a=>{a.grenade('lob');a.grenade('blast');},true),
   await render('Cancelled owner control',.8,a=>{a.grenade('lob',1,'g');a.grenade('blast',1,'g');a.stopGrenades('g');}),
  ];
 });
 assert.deepEqual(errors,[]);for(const clip of clips){assert.ok(Number.isFinite(clip.peak)&&clip.peak<.9,clip.label+' must not clip');assert.ok(clip.label.endsWith('control')?clip.peak===0:clip.peak>.001,clip.label+' audibility/mute/cancellation');}
 const loud=clips.find(c=>c.label==='Five-layer grenade blast')!,quiet=clips.find(c=>c.label==='Distant grenade blast')!;assert.ok(quiet.rms<loud.rms*.3&&quiet.rms>loud.rms*.1,'same blast is distance attenuated');
 const sampleRate=44100,gap=Math.round(.18*sampleRate),length=clips.reduce((n,c)=>n+c.samples.length+gap,0),wav=Buffer.alloc(44+length*2);wav.write('RIFF',0);wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(sampleRate,24);wav.writeUInt32LE(sampleRate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(length*2,40);
 let cursor=0;const report=[];for(const {samples,...clip}of clips){report.push({...clip,startSeconds:cursor/sampleRate});for(const n of samples)wav.writeInt16LE(Math.round(Math.max(-1,Math.min(1,n))*32767),44+cursor++*2);cursor+=gap;}
 await mkdir(output,{recursive:true});await writeFile(output+'/grenade-audio-demo.wav',wav);await writeFile(output+'/grenade-audio-report.json',JSON.stringify({renderer:'Native Edge OfflineAudioContext',sampleRate,duration:length/sampleRate,clips:report},null,2));console.log(JSON.stringify(report));
}finally{await browser.close();}
