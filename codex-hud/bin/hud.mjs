#!/usr/bin/env node
try {
  const {main}=await import('../dist/cli.js');
  await main();
} catch(error) {
  console.error(error?.code==='ERR_MODULE_NOT_FOUND'
    ? 'HUD is not built. Run npm ci --ignore-scripts, then npm run build in the plugin directory.'
    : 'Codex HUD: '+error.message);
  process.exitCode=1;
}

