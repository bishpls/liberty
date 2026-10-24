// liberty/src/show/demo.js: the demo show, until the film has its song. A 128 BPM song's structure (136 bars, 4:15), with every
// effect kind on the beats a show designer would put it on, so each builder has cues to drive and the sandbox has a
// show to watch. The film's song replaces it: tools/audio_analyze.py's cues.json gives the beats and downbeats, and
// the events are re-laid on its sections (the kinds and their params stay).
//
// Event kinds (BRIEF.md): gun5 (the 5"/38 aft), gun3 (the 3"/50 forward), gun20 (an Oerlikon burst: { guns: [i...],
// rounds }), mortar ({ at: 'port'|'stbd'|'bow'|'stern', n }), flame ({ n, dur }), gerb ({ dur, line }), comet, co2 ({ dur }),
// spark ({ dur }), confetti, look ({ name }: the rig's state for a section), hit (a lighting accent: blinders, strobes).
// Levels (dB SPL at 1 m) for the soundscape, from show.md §1.4 (peak, scaled by 20 log10 from the rated distance).
export const BPM = 128;
const S = (name, bar, bars, energy, look) => ({ name, bar, bars, energy, look });
export const SECTIONS = [
  S('intro', 0, 16, 0.25, 'dawn'), S('verse1', 16, 16, 0.45, 'verse'), S('pre1', 32, 8, 0.65, 'build'),
  S('drop1', 40, 16, 1.0, 'drop'), S('break', 56, 8, 0.35, 'break'), S('verse2', 64, 16, 0.5, 'verse'),
  S('pre2', 80, 8, 0.7, 'build'), S('drop2', 88, 16, 1.0, 'drop'), S('bridge', 104, 8, 0.4, 'bridge'),
  S('final', 112, 16, 1.0, 'final'), S('outro', 128, 8, 0.3, 'outro'),
];
const E = [];
const ev = (kind, bar, beat = 0, p = {}) => E.push(Object.assign({ kind, bar, beat }, p));
for (const s of SECTIONS) ev('look', s.bar, 0, { name: s.look, section: s.name });
// the drops: the 5-inch on the first downbeat, flames across the rail, CO2, gerbs for the first bars, mortars on the
// accents, the 3-inch answering the 5-inch, the Oerlikons rattling through the fills
for (const d of [40, 88, 112]) {
  ev('gun5', d, 0); ev('co2', d, 0, { dur: 1.5 }); ev('flame', d, 0, { n: 8, dur: 0.6 }); ev('gerb', d, 0, { dur: 8, line: 'rail' });
  ev('mortar', d, 0, { at: 'stbd', n: 4 });
  for (let b = 0; b < 16; b += 4) { ev('flame', d + b, 2, { n: 4, dur: 0.3 }); ev('hit', d + b, 0, { name: 'blinders' }); }
  ev('gun3', d + 4, 0); ev('gun5', d + 8, 0); ev('gun3', d + 8, 2);
  ev('gun20', d + 7, 2, { guns: [0, 1, 2, 3], rounds: 6 }); ev('gun20', d + 15, 2, { guns: [4, 5, 6, 7], rounds: 8 });
  ev('mortar', d + 15, 3, { at: 'port', n: 2 }); ev('mortar', d + 15, 3.5, { at: 'port', n: 2 });
  ev('comet', d + 12, 0, { n: 6 });
}
// the builds: snare-roll sparks, a CO2 burst on the last beat, the guns' crews standing to
for (const p of [32, 80]) { ev('spark', p + 4, 0, { dur: 15 }); ev('co2', p + 7, 3, { dur: 0.8 }); ev('gun20', p + 6, 0, { guns: [0, 7], rounds: 4 }); }
// the final: everything, and the 5-inch on the last chord
ev('confetti', 112, 0); ev('gun5', 127, 0); ev('gun3', 127, 0); ev('mortar', 127, 0, { at: 'bow', n: 3 }); ev('mortar', 127, 0, { at: 'stern', n: 3 });
ev('gerb', 120, 0, { dur: 15, line: 'mast' }); ev('flame', 127, 0, { n: 8, dur: 1.2 });
// the outro's last hit
ev('gun5', 135, 0); ev('hit', 135, 0, { name: 'blackout' });
export const EVENTS = E;
export const LEVELS = { gun5: 184.5, gun3: 178.5, gun20: 168.5, mortar: 174, flame: 120, gerb: 110, comet: 125, co2: 115, spark: 95, confetti: 118 };
