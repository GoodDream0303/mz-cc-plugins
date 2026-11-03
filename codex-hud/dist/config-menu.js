import { createInterface } from 'node:readline/promises';
import { stdin } from 'node:process';
import { definitions, get, loadConfig, preset, saveConfig, set } from './config.js';
import { menuLanguage, menuText, menuOptionAvailable, optionHelp } from './menu-help.js';
function valueText(value, language) {
    const copy = menuText(language);
    return typeof value === 'boolean' ? (value ? copy.on : copy.off) : JSON.stringify(value);
}
function valueError(error, definition, language) {
    if (language === 'en')
        return error.message;
    const copy = menuText(language), detail = optionHelp(definition, language);
    if (error.message.startsWith('Out of range:'))
        return copy.outOfRange + ' (' + definition.min + '–' + definition.max + '): ' + detail.label;
    if (definition.choices)
        return copy.invalidChoice + ': ' + detail.choices.map(c => JSON.stringify(c.value)).join(', ');
    if (definition.kind === 'number')
        return copy.invalidNumber + ' (' + definition.min + '–' + definition.max + '): ' + detail.label;
    if (definition.kind === 'array')
        return copy.invalidArray + ': ' + JSON.stringify(detail.example);
    return copy.invalidValue + ': ' + detail.label + '; ' + copy.inputExample + ': ' + JSON.stringify(detail.example);
}
export async function configure(file, preview = () => []) {
    if (!stdin.isTTY)
        throw new Error('Interactive configuration requires a terminal; use config set instead');
    const rl = createInterface({ input: stdin, output: process.stdout });
    let config = loadConfig(file);
    try {
        for (;;) {
            let language = menuLanguage(get(config, 'language')), copy = menuText(language);
            console.log('\n' + copy.title);
            const answer = (await rl.question('> ')).trim().toLowerCase();
            if (answer === 'q') {
                console.log(copy.cancelled);
                return false;
            }
            if (answer === 's') {
                saveConfig(file, config);
                console.log(copy.saved);
                return true;
            }
            if (answer === 'v') {
                console.log(preview(config).join('\n'));
                continue;
            }
            if (answer === 'p' || answer === 'n') {
                console.log(copy.pageOnly);
                continue;
            }
            if (answer === '6') {
                console.log(copy.presetHelp);
                const choice = (await rl.question(copy.preset)).trim();
                if (!choice)
                    console.log(copy.kept);
                else
                    try {
                        config = preset(choice, config);
                        console.log(copy.changed);
                    }
                    catch {
                        console.error(copy.invalidPreset);
                    }
                continue;
            }
            const section = { '1': 'layout', '2': 'display', '3': 'git', '4': 'colors', '5': 'terminal', '7': 'startup' }[answer];
            if (!section) {
                console.error(copy.invalidSelection);
                continue;
            }
            const options = definitions.filter(d => d.section === section && menuOptionAvailable(d)), pageSize = 8, pages = Math.max(1, Math.ceil(options.length / pageSize));
            let page = 0;
            for (;;) {
                language = menuLanguage(get(config, 'language'));
                copy = menuText(language);
                console.log('[' + (page + 1) + '/' + pages + ']');
                options.slice(page * pageSize, (page + 1) * pageSize).forEach((d, index) => {
                    const detail = optionHelp(d, language);
                    console.log((page * pageSize + index + 1) + '. ' + detail.label + ' = ' + valueText(get(config, d.key), language) + ' (' + d.key + ')');
                    console.log('   ' + copy.example + ': ' + JSON.stringify(detail.example) + ' → ' + detail.effect);
                });
                const rawChoice = (await rl.question(copy.select)).trim().toLowerCase();
                if (!rawChoice)
                    break;
                if (rawChoice === 's') {
                    saveConfig(file, config);
                    console.log(copy.saved);
                    return true;
                }
                if (rawChoice === 'q') {
                    console.log(copy.cancelled);
                    return false;
                }
                if (rawChoice === 'v') {
                    console.log(preview(config).join('\n'));
                    continue;
                }
                if (rawChoice === 'n') {
                    if (page === pages - 1)
                        console.log(copy.lastPage);
                    else
                        page++;
                    continue;
                }
                if (rawChoice === 'p') {
                    if (page === 0)
                        console.log(copy.firstPage);
                    else
                        page--;
                    continue;
                }
                const choice = /^[1-9]\d*$/.test(rawChoice) ? Number(rawChoice) : NaN, d = options[choice - 1];
                if (!d || choice <= page * pageSize || choice > (page + 1) * pageSize) {
                    console.error(copy.invalidSelection);
                    continue;
                }
                const detail = optionHelp(d, language);
                console.log('\n' + detail.label + ' (' + d.key + ')');
                console.log(copy.current + ': ' + valueText(get(config, d.key), language));
                console.log(copy.inputExample + ': ' + JSON.stringify(detail.example));
                console.log(copy.effect + ': ' + detail.effect);
                if (detail.choices.length)
                    console.log(copy.choices + ': ' + detail.choices.map(c => JSON.stringify(c.value) + ' = ' + c.label).join('; '));
                if (d.min !== undefined || d.max !== undefined)
                    console.log(copy.range + ': ' + (d.min ?? '−∞') + '–' + (d.max ?? '∞'));
                try {
                    if (d.kind === 'boolean')
                        config = set(config, d.key, !get(config, d.key));
                    else {
                        const raw = await rl.question(d.key + ' ' + copy.newValue + ': ');
                        if (!raw.trim()) {
                            console.log(copy.kept);
                            continue;
                        }
                        let value = raw;
                        try {
                            value = JSON.parse(raw);
                        }
                        catch { }
                        config = set(config, d.key, value);
                    }
                    console.log(menuText(menuLanguage(get(config, 'language'))).changed);
                    console.log(preview(config).join('\n'));
                }
                catch (error) {
                    console.error(valueError(error, d, language));
                }
            }
        }
    }
    finally {
        rl.close();
    }
}
