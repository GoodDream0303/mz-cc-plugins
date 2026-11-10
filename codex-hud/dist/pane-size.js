import { get } from './config.js';
import { render } from './render.js';
function validViewport(view) {
    return !!view && Number.isInteger(view.columns) && Number.isInteger(view.rows) && view.columns >= 10 && view.columns <= 2000 && view.rows >= 10 && view.rows <= 1000;
}
export function planInitialPaneSize(config, snapshot, viewport) {
    const fallback = { mode: 'ratio', fraction: get(config, 'terminal.paneSize') };
    if (!validViewport(viewport))
        return fallback;
    if (!get(config, 'terminal.autoHeight')) {
        const requested = get(config, 'terminal.initialRows');
        if (!requested)
            return fallback;
        const rows = Math.max(2, Math.min(requested, viewport.rows - 11));
        return { mode: 'rows', fraction: (rows + 1) / (viewport.rows + 1), rows, columns: viewport.columns, parentRows: viewport.rows };
    }
    const contentRows = render(snapshot, config, { width: viewport.columns, height: 10000, color: false }).totalLines;
    const cap = Math.min(fallback.fraction, (viewport.rows - Math.min(10, Math.floor(viewport.rows / 2)) - 1) / (viewport.rows + 1));
    // Account for the new pane's padding, splitter and character-cell rounding.
    const fraction = Math.min(cap, (contentRows + 2) / (viewport.rows + 1));
    return { mode: 'content', fraction, contentRows, columns: viewport.columns, parentRows: viewport.rows };
}
