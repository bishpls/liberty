// engine/scene3d/show.js: a show's one schedule. Every effect a performance drives (the lights, lasers, pyro, a gun's
// shot, the smoke it leaves, the sound at the camera) reads its events from here, so the picture, the light, the smoke
// and the sound of a cue can't disagree (docs/ENVIRONMENT.md §2c.8: one schedule per event).
//
//   const show = makeShow({ bpm: 128, offset: 0.0, beatsPerBar: 4, duration: 180,
//     beats: [...], downbeats: [...],               (optional: a song's own grid, tools/audio_analyze.py cues.json; else from bpm)
//     sections: [{ name: 'drop', bar: 32, bars: 16, energy: 1, palette: 'magenta' }, ...],
//     events: [{ kind: 'gun5', bar: 48, beat: 0, ...params }, { kind: 'mortar', t: 61.5 }, ...] });
//   show.time(bar, beat)        the time of a bar's beat (fractional beats too)
//   show.at(t)                  { beat, bar, inBar, phase (0..1 within the beat), barPhase, section, energy }
//   show.events(kind)           every event of a kind, in time order, each with its time t
//   show.recent(kind, t, win)   the events of a kind fired in (t - win, t] (newest last): what is still burning or drifting
//   show.next(kind, t)          the next event of a kind after t (null when none)
//   show.pulse(t, { attack, decay, every })   0..1 envelope on each beat (or every N beats): a flash, a bump
//   show.sound()                every event with a sound, for a soundscape: [{ t, kind, pos, level }] (level: dB SPL at
//                               1 m, from the event or its kind's default in opts.levels)
// Times are seconds of the show's clock (the film maps its own clock onto it); no clocks, no randomness: a pure function.
export function makeShow(opts) {
  const bpm = opts.bpm || 120, spb = 60 / bpm, offset = opts.offset || 0, bpb = opts.beatsPerBar || 4;
  const beats = opts.beats && opts.beats.length > 4 ? opts.beats.slice() : null;
  const downs = opts.downbeats && opts.downbeats.length ? opts.downbeats.slice() : null;
  // beat index -> time (the song's grid where it has one, extended by the tempo past its ends)
  const beatTime = b => {
    if (!beats) return offset + b * spb;
    if (b <= 0) return beats[0] + b * spb;
    if (b >= beats.length - 1) return beats[beats.length - 1] + (b - beats.length + 1) * spb;
    const i = Math.floor(b), f = b - i;
    return beats[i] + (beats[i + 1] - beats[i]) * f;
  };
  // time -> fractional beat index
  const beatAt = t => {
    if (!beats) return (t - offset) / spb;
    if (t <= beats[0]) return (t - beats[0]) / spb;
    if (t >= beats[beats.length - 1]) return beats.length - 1 + (t - beats[beats.length - 1]) / spb;
    let lo = 0, hi = beats.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (beats[m] <= t) lo = m; else hi = m; }
    return lo + (t - beats[lo]) / (beats[hi] - beats[lo]);
  };
  // the bar's first beat: from the downbeats when given (the first downbeat's beat index sets the phase)
  const bar0 = downs ? Math.round(beatAt(downs[0])) : 0;
  const time = (bar, beat = 0) => beatTime(bar0 + bar * bpb + beat);
  const sections = (opts.sections || []).map(s => Object.assign({}, s, { t0: s.t0 ?? time(s.bar), t1: s.t1 ?? time(s.bar + s.bars) }));
  const evs = (opts.events || []).map((e, i) => Object.assign({ i }, e, { t: e.t ?? time(e.bar || 0, e.beat || 0) })).sort((a, b) => a.t - b.t || a.i - b.i);
  const byKind = {};
  for (const e of evs) (byKind[e.kind] || (byKind[e.kind] = [])).push(e);
  const firstAfter = (list, t) => { let lo = 0, hi = list.length; while (lo < hi) { const m = (lo + hi) >> 1; if (list[m].t <= t) lo = m + 1; else hi = m; } return lo; };
  const show = {
    bpm, spb, beatsPerBar: bpb, duration: opts.duration || (evs.length ? evs[evs.length - 1].t + 10 : 60), sections, levels: opts.levels || {},
    time, beatTime, beatAt,
    at(t) {
      const b = beatAt(t), rel = b - bar0, bar = Math.floor(rel / bpb), inBar = rel - bar * bpb;
      const sec = sections.find(s => t >= s.t0 && t < s.t1) || null;
      return { beat: b, bar, inBar, phase: b - Math.floor(b), barPhase: inBar / bpb, section: sec, energy: sec ? (sec.energy ?? 0.5) : 0 };
    },
    events: kind => (kind ? byKind[kind] || [] : evs),
    recent(kind, t, win) { const L = byKind[kind] || []; const j = firstAfter(L, t); const out = []; for (let i = j - 1; i >= 0 && L[i].t > t - win; i--) out.unshift(L[i]); return out; },
    next(kind, t) { const L = byKind[kind] || []; return L[firstAfter(L, t)] || null; },
    pulse(t, { attack = 0.01, decay = 0.25, every = 1, offsetBeats = 0 } = {}) {
      const b = beatAt(t) - bar0 - offsetBeats, k = Math.floor(b / every) * every, tb = beatTime(bar0 + k + offsetBeats), dt = t - tb;
      if (dt < 0) return 0;
      return dt < attack ? dt / attack : Math.exp(-(dt - attack) / Math.max(decay, 1e-3));
    },
    sound() {
      return evs.filter(e => e.sound !== false && (e.level !== undefined || show.levels[e.kind] !== undefined))
        .map(e => ({ t: e.t, kind: e.kind, pos: e.pos || null, level: e.level ?? show.levels[e.kind], dur: e.dur || 0 }));
    },
  };
  return show;
}
