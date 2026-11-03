import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const environment={...process.env};
// Tests supply their own configurations and synthetic physical origins. Never
// inherit a live profile's selected file or permission to attach its real HUD.
delete environment.MZ_HUD_CONFIG_FILE;
delete environment.MZ_HUD_ORIGIN;
const files=fs.readdirSync(path.join(root,'test')).filter(file=>file.endsWith('.test.mjs')).map(file=>path.join('test',file));
const result=spawnSync(process.execPath,['--test',...process.argv.slice(2),...files],{cwd:root,env:environment,stdio:'inherit'});
if(result.error)throw result.error;
process.exitCode=result.status??1;
