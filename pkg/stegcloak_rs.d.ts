/* tslint:disable */
/* eslint-disable */

export class StegCloak {
    free(): void;
    [Symbol.dispose](): void;
    hide(message: string, password: string, salt: string, cover: string): string;
    static isCloaked(text: string): boolean;
    constructor();
    reveal(secret: string, password: string, salt: string): string;
    static zwc(): Array<any>;
}
