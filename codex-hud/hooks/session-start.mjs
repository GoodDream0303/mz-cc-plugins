// Normal Codex sessions do not incur startup work or require a built HUD.
if (process.env.MZ_CODEX_HUD_LAUNCH) {
  try {
    const {handleHook}=await import('../dist/hook.js');
    await handleHook();
  } catch(error) {
    console.error('Codex HUD binding: '+error.message);
    process.exitCode=1;
  }
}

