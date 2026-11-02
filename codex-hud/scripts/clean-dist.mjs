import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.resolve(root,'dist');
if(path.dirname(output)!==root||path.basename(output)!=='dist')throw new Error('Unexpected build output path');
if(fs.existsSync(output)){
 if(fs.lstatSync(output).isSymbolicLink())throw new Error('Build output must not be a symlink');
 for(const entry of fs.readdirSync(output,{withFileTypes:true}))if(entry.isFile()&&/\.(js|js\.map|d\.ts)$/.test(entry.name))fs.unlinkSync(path.join(output,entry.name));
}
