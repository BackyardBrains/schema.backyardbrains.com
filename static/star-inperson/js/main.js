// main.js — entry point: resolve parameters, install test hooks (?test=1 only), run StarInPersonExperiment.
import { resolveParams } from './params.js';
import { installTestHooks } from './testHooks.js';
import { StarInPersonExperiment } from './experiment.js';
import { showError } from './screens.js';

const params = resolveParams(window.location.search);
const hooks = params.test ? installTestHooks({ logDots: params.logDots }) : null;
if (hooks) hooks.G.config = params.config;

if (params.errors.length) {
  const msg = 'Invalid URL parameters (nothing will run):\n' + params.errors.map((e) => '  - ' + e).join('\n');
  showError(msg);
  if (hooks) { hooks.G.error = msg; hooks.G.ready = true; }
} else {
  new StarInPersonExperiment(params, hooks).run();
}
