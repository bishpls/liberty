// liberty/src/show/index.js: the show's one schedule (engine/scene3d/show.js) for this world: every effect reads its
// events from ctx.show. The demo show (demo.js: 136 bars at 128 BPM) is laid on the demo song's own beat grid
// (music/demo_cues.json from tools/audio_analyze.py on music/demo_take1.mp3: 128.0 BPM, the first downbeat at 0.726 s,
// 92 % of beats within 30 ms of their attacks), so a gun fires on the downbeat you hear. ?show=grid ignores the song
// and uses the bare 128 BPM grid. The film's own song will replace the demo's (its cues, the events re-laid).
// The show starts at scene time SHOW_START (300 s): the five minutes before it are the pre-show at blue hour (the rig at
// standby, the reel's tour), and every simulation still runs forward from t = 0. Song time = scene time - SHOW_START;
// ?show=now starts it at 0 (quick looks).
import { makeShow } from 'scene3d/show.js';
import * as DEMO from './demo.js';

const q = new URLSearchParams(location.search);
export const SHOW_START = q.get('show') === 'now' ? 0 : 300;
export async function loadShow() {
  let cues = null;
  if (q.get('show') !== 'grid') {
    try { cues = await (await fetch(new URL('../../music/demo_cues.json', import.meta.url))).json(); }
    catch (e) { console.warn('[show] no demo cues: the bare grid ' + e); }
  }
  const sh = a => a ? a.map(x => x + SHOW_START) : null;
  const show = makeShow({ bpm: DEMO.BPM, offset: SHOW_START, beatsPerBar: 4, sections: DEMO.SECTIONS, events: DEMO.EVENTS, levels: DEMO.LEVELS,
    beats: cues ? sh(cues.beats) : null, downbeats: cues ? sh(cues.downbeats) : null,
    duration: SHOW_START + (cues ? cues.duration : 136 * 4 * 60 / DEMO.BPM) });
  show.audio = cues ? 'music/demo_take1.mp3' : null;
  show.start = SHOW_START;                                      // the song's t = 0 in scene time
  return show;
}
