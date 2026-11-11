try {
  const {runAutostartHook}=await import('../dist/autostart.js');
  await runAutostartHook();
} catch {
  process.stderr.write('Codex HUD autostart is unavailable; run the installed HUD doctor or reinstall from its configured marketplace.\n');
}
