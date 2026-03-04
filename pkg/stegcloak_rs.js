/* @ts-self-types="./stegcloak_rs.d.ts" */

import * as wasm from "./stegcloak_rs_bg.wasm";
import { __wbg_set_wasm } from "./stegcloak_rs_bg.js";
__wbg_set_wasm(wasm);

export {
    StegCloak
} from "./stegcloak_rs_bg.js";
