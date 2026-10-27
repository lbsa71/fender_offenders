import { MusicPlayer } from '../src/music.ts';
const wav = name => new URL(`../../content/audio/patrol/${name}.wav`, import.meta.url).href;
const supplied = new URLSearchParams(location.search).get('tracks') === 'public';
if (supplied) document.querySelector('#source').textContent = 'SUPPLIED MP3 SOUNDTRACK: public title, slow and fast tracks.';
const music = new MusicPlayer(supplied ? { titles: ['/titles.mp3'], slow: '/slow.mp3', fast: '/fast.mp3' } : { titles: [wav('idle')], slow: wav('drive'), fast: wav('road') }, { root: document.body });
const settings = { masterVolume: .8, musicVolume: .5, muted: false };
let state = { screen: 'title', speed: 0, topSpeed: 28 }, previous = performance.now();
music.setSettings(settings);
document.querySelector('#activate').onclick = () => music.unlock();
function frame(now) { music.update(state, (now - previous) / 1000); previous = now; requestAnimationFrame(frame); }
requestAnimationFrame(frame);
window.musicFixture = { music, set(next) { state = { ...state, ...next }; }, mute(muted) { music.setSettings({ ...settings, muted }); } };
