try {
  const {runAutostartHook}=await import('../dist/autostart.js');
  await runAutostartHook();
} catch {
  process.stderr.write('Codex HUD autostart is not built; run npm ci --ignore-scripts and npm run build in the plugin directory.\n');
}
