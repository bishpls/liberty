// liberty/src/cameras.js: the bookmarks. pos and at in metres (the world frame: bow -z, starboard and the pier +x,
// water y = 0), lens in mm on a 36 mm sensor's width. Modules add their own (prefixed with the module's name).
import * as P from './plan.js';

export const CAMS = {
  hall: { pos: [-160, 5, -12], at: [2.0, P.STAGE.floor + 1.5, (P.STAGE.z0 + P.STAGE.z1) / 2], lens: 24, note: 'the landing view: the whole ship and her stage from the water off her port side (the reel\'s B1)' },
  pier_abeam: { pos: [P.PIER.x0 + 5.5, P.PIER.deck + 1.6, -27.7], at: [2.0, 12.0, -27.7], lens: 24, note: "the apron abeam the stage at a crowd's eye height: up past the bulwark" },
  pier_along: { pos: [P.PIER.x0 + 3.0, P.PIER.deck + 1.7, 40], at: [6.0, 8.0, -40], lens: 24, note: 'the apron aft of the gangway, looking forward along her starboard side' },
  gap: { pos: [P.PIER.x0 - 1.0, 1.3, -52], at: [9.5, 1.0, 20], lens: 24, note: 'low over the water in the 2 m gap between her hull and the pier' },
  water_port: { pos: [-95, 4.0, 40], at: [0, 9, -10], lens: 28, note: 'the whole ship from the water off her port side' },
  deck_stage: { pos: [-6.0, 11.6, -45.0], at: [3.0, 12.5, -27.7], lens: 24, note: 'the port walkway by the foremast at eye height, aft and across to the stage' },
  bow_platform: { pos: [1.8, 15.2, -58.0], at: [2.0, 11.5, -28.0], lens: 28, note: 'from the 3"/50 platform, aft over No. 1 and the foremast to the stage' },
  bridge_top: { pos: [0.0, 16.8, -6.0], at: [2.0, 11.0, -28.0], lens: 24, note: 'from the flying bridge over No. 3, forward onto the stage' },
  bow_out: { pos: [0, 16, -40], at: [0, 6, -400], lens: 24, note: 'from the foremast out over the bow: Alcatraz, Angel Island' },
  far_alcatraz: { pos: (([x, z]) => [x, 40, z])(P.atBearing(330, 1400)), at: [20, 12, 0], lens: 50, note: 'from the water toward Alcatraz, back at the waterfront and Telegraph Hill' },
  aerial: { pos: [-180, 120, -160], at: [10, 0, 0], lens: 28, note: 'the berth from the north-west, high' },
  top: { pos: [20, 320, -20], at: [20, 0, -19.9], lens: 35, note: 'plan view' },
};
// (look-dev: the sky toward the city and toward the open bay)
CAMS.look_city = { pos: [20, 6, 60], at: [40, 30, 400], lens: 20, note: 'look-dev: the sky over the city (south)' };
CAMS.look_bay = { pos: [0, 6, -60], at: [-60, 40, -500], lens: 20, note: 'look-dev: the sky over the bay (north-west)' };
