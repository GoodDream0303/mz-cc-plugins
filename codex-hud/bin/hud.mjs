#!/usr/bin/env node
try {
  const {main}=await import('../dist/cli.js');
  await main();
} catch(error) {
  console.error(error?.code==='ERR_MODULE_NOT_FOUND'
    ? 'HUD runtime is incomplete; reinstall codex-hud from its configured marketplace.'
    : 'Codex HUD: '+error.message);
  process.exitCode=1;
}
