import importlib.util, json, os, sys, tempfile, unittest
from pathlib import Path
from unittest.mock import patch
spec = importlib.util.spec_from_file_location('render', Path(__file__).with_name('render-suspect-voices.py'))
render = importlib.util.module_from_spec(spec); spec.loader.exec_module(render)
class Response:
    def __enter__(self): return self
    def __exit__(self, *args): pass
    def read(self): return b'fake mp3 for deterministic adapter test'
class RendererTest(unittest.TestCase):
    def test_publishes_only_successfully_rendered_alternates_and_resumes(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            def write(name,value):
                p=root/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(value))
            write('packages/ui/src/suspect-voices.json',{'nico-nickel':{'voiceId':'test','lines':{'briefing':'Original'}}})
            write('tools/suspect-voice-alternates.json',{'nico-nickel':{'briefing':['Alternate']}})
            with patch.object(render,'ROOT',root), patch.dict(os.environ,{'ELEVENLABS_API_KEY':'test-secret'}), patch.object(sys,'argv',['render','--alternates','--limit','1']), patch.object(render.urllib.request,'urlopen',return_value=Response()) as request:
                render.main()
                self.assertTrue((root/'apps/client/public/voices/nico-nickel/briefing-2.mp3').exists())
                choices=json.loads((root/'packages/ui/src/suspect-voice-options.json').read_text())
                self.assertEqual(choices['nico-nickel']['briefing'],[{'text':'Alternate','url':'/voices/nico-nickel/briefing-2.mp3'}])
                render.main()
                self.assertEqual(request.call_count,1)
    def test_quota_exhaustion_keeps_completed_clips_and_does_not_publish_pending_lines(self):
        import io, urllib.error
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            for name,value in {
                'packages/ui/src/suspect-voices.json':{'nico-nickel':{'voiceId':'test','lines':{'briefing':'Original'}}},
                'tools/suspect-voice-alternates.json':{'nico-nickel':{'briefing':['Completed','Quota rejected','Never requested']}}
            }.items():
                path=root/name;path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(value))
            quota=urllib.error.HTTPError('https://api.elevenlabs.io',401,'quota',{},io.BytesIO(b'{"detail":{"status":"quota_exceeded"}}'))
            with patch.object(render,'ROOT',root), patch.dict(os.environ,{'ELEVENLABS_API_KEY':'test-secret'}), patch.object(sys,'argv',['render','--alternates']), patch.object(render.urllib.request,'urlopen',side_effect=[Response(),quota]) as request:
                with self.assertRaisesRegex(SystemExit,'quota_exceeded'): render.main()
                self.assertEqual(request.call_count,2)
                manifest=json.loads((root/'apps/client/public/voices/manifest.json').read_text())
                self.assertEqual(list(manifest),['nico-nickel/briefing-2.mp3'])
                options=json.loads((root/'packages/ui/src/suspect-voice-options.json').read_text())
                self.assertEqual([v['text'] for v in options['nico-nickel']['briefing']],['Completed'])
if __name__=='__main__': unittest.main()
