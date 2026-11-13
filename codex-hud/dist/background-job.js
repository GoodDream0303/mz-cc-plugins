/** Latest owned work; cancellation invalidates results even if the OS call completes. */
export class BackgroundJob {
    wake;
    generation = 0;
    key;
    controller;
    completion;
    constructor(wake) {
        this.wake = wake;
    }
    get busy() { return this.controller !== undefined; }
    start(key, operation) {
        if (this.busy && this.key === key)
            return false;
        this.cancel();
        const generation = this.generation, controller = new AbortController();
        this.controller = controller;
        this.key = key;
        const finish = (result) => {
            if (generation !== this.generation)
                return;
            this.controller = undefined;
            this.completion = { key, result };
            this.wake();
        };
        Promise.resolve().then(() => {
            if (controller.signal.aborted)
                throw Object.assign(new Error('Background work cancelled'), { name: 'AbortError' });
            return operation(controller.signal);
        }).then(value => finish({ value }), error => finish({ error }));
        return true;
    }
    take(key) {
        if (this.completion?.key !== key)
            return;
        const result = this.completion.result;
        this.completion = undefined;
        return result;
    }
    cancel() {
        this.generation++;
        this.controller?.abort();
        this.controller = undefined;
        this.key = undefined;
        this.completion = undefined;
    }
}
