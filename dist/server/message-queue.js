export class MessageQueue {
    constructor() {
        this.messages = [];
        this.resolvers = [];
        this.closed = false;
    }
    push(message) {
        if (this.closed)
            return;
        if (this.resolvers.length > 0) {
            const resolve = this.resolvers.shift();
            resolve({ value: message, done: false });
        }
        else {
            this.messages.push(message);
        }
    }
    close() {
        this.closed = true;
        for (const resolve of this.resolvers) {
            resolve({ value: undefined, done: true });
        }
        this.resolvers = [];
    }
    [Symbol.asyncIterator]() {
        return {
            next: () => {
                if (this.messages.length > 0) {
                    return Promise.resolve({ value: this.messages.shift(), done: false });
                }
                if (this.closed) {
                    return Promise.resolve({ value: undefined, done: true });
                }
                return new Promise((resolve) => {
                    this.resolvers.push(resolve);
                });
            },
        };
    }
}
