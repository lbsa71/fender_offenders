"""Render original or alternate suspect speech; resume matching completed clips.
Usage: python3 tools/render-suspect-voices.py [--alternates] [--limit N] [--jobs 1..4]
Reads ELEVENLABS_API_KEY from the environment or ignored root .env.
"""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import argparse, hashlib, json, os, threading, time, urllib.request, urllib.error
ROOT = Path(__file__).resolve().parents[1]

def save_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary=path.with_suffix('.tmp'); temporary.write_text(json.dumps(data,indent=2,ensure_ascii=False)+'\n');temporary.replace(path)

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--limit',type=int)
    parser.add_argument('--alternates',action='store_true')
    parser.add_argument('--jobs',type=int,choices=range(1,5),default=1)
    args=parser.parse_args()
    key=os.environ.get('ELEVENLABS_API_KEY')
    if not key:
        for line in (ROOT/'.env').read_text().splitlines():
            if line.startswith('ELEVENLABS_API_KEY='): key=line.split('=',1)[1].strip().strip('\"\'')
    if not key: raise SystemExit('ELEVENLABS_API_KEY is required')
    catalog=json.loads((ROOT/'packages/ui/src/suspect-voices.json').read_text())
    manifest_path=ROOT/'apps/client/public/voices/manifest.json'
    manifest=json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    options_path=ROOT/'packages/ui/src/suspect-voice-options.json'
    plan=json.loads((ROOT/'tools/suspect-voice-alternates.json').read_text()) if args.alternates else {}
    tasks=[]
    # Round-first ordering gives the full roster another line before the next round.
    rounds=max((len(lines) for entry in plan.values() for lines in entry.values()),default=0) if args.alternates else 1
    for round_index in range(rounds):
        for target,entry in catalog.items():
            for outcome,original in entry['lines'].items():
                alternates=plan.get(target,{}).get(outcome,[])
                if args.alternates and round_index>=len(alternates): continue
                text=alternates[round_index] if args.alternates else original
                suffix=f'-{round_index+2}' if args.alternates else ''
                relative=f'{target}/{outcome}{suffix}.mp3'
                spec=dict(text=text,voice_id=entry['voiceId'],model_id='eleven_v3',voice_settings=dict(stability=0.5,similarity_boost=0.75))
                spec['text']=('[pained] ' if outcome=='wrecked' else '[defiant] ' if outcome=='arrested' else '[taunting] ')+text
                fingerprint=hashlib.sha256(json.dumps(spec,sort_keys=True).encode()).hexdigest()
                previous=manifest.get(relative,{})
                path=manifest_path.parent/relative
                if path.exists() and previous.get('requestSha256')==fingerprint and previous.get('sha256')==hashlib.sha256(path.read_bytes()).hexdigest(): continue
                tasks.append((relative,text,spec,fingerprint))
    if args.limit is not None: tasks=tasks[:max(0,args.limit)]
    stop=threading.Event()
    def render(task):
        if stop.is_set(): return None
        relative,text,spec,fingerprint=task
        request=urllib.request.Request(f'https://api.elevenlabs.io/v1/text-to-speech/{spec["voice_id"]}?output_format=mp3_44100_128',data=json.dumps(spec).encode(),headers={'xi-api-key':key,'Content-Type':'application/json'},method='POST')
        for attempt in range(3):
            try:
                with urllib.request.urlopen(request,timeout=90) as response: audio=response.read()
                return task,audio,None
            except urllib.error.HTTPError as error:
                try: reason=json.loads(error.read()).get('detail',{}).get('status','http-error')
                except (ValueError,AttributeError): reason='http-error'
                if reason=='quota_exceeded' or error.code==402:
                    stop.set();return task,None,'quota_exceeded'
                if error.code not in (429,500,502,503) or attempt==2:
                    stop.set();return task,None,f'HTTP {error.code}: {reason}'
                time.sleep(2**attempt)
            except (TimeoutError,urllib.error.URLError):
                stop.set();return task,None,'network-error'
    def publish_options():
        options={}
        for target in catalog:
            for outcome in catalog[target]['lines']:
                entries=[]
                for i,text in enumerate(plan.get(target,{}).get(outcome,[]),2):
                    relative=f'{target}/{outcome}-{i}.mp3'
                    if manifest.get(relative,{}).get('text')==text:
                        entries.append(dict(text=text,url='/voices/'+relative))
                if entries: options.setdefault(target,{})[outcome]=entries
        save_json(options_path,options)
    errors=[]
    with ThreadPoolExecutor(max_workers=args.jobs) as pool:
        for result in pool.map(render,tasks):
            if result is None: continue
            (relative,text,spec,fingerprint),audio,error=result
            if error:
                errors.append(error);print(f'Stopped {relative}: {error}',flush=True);continue
            path=manifest_path.parent/relative;path.parent.mkdir(parents=True,exist_ok=True)
            temporary=path.with_suffix('.tmp');temporary.write_bytes(audio);temporary.replace(path)
            manifest[relative]=dict(text=text,voiceId=spec['voice_id'],model='eleven_v3',requestSha256=fingerprint,sha256=hashlib.sha256(audio).hexdigest(),bytes=len(audio))
            save_json(manifest_path,manifest)
            print(f'{relative} ({len(audio)} bytes)',flush=True)
    if args.alternates: publish_options()
    if errors: raise SystemExit('Generation stopped: '+', '.join(sorted(set(errors))))
if __name__=='__main__': main()
