import { proxy } from './_wu.js';
export default function handler(req, res) { return proxy(res, 'observations/all/1day'); }
