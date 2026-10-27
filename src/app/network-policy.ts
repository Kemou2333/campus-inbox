/** API allowlist and production CSP share one source. API relocation needs a new
 * compatible build when its origin is not already in this reviewed list. */
export const API_ORIGINS=['https://123.57.30.129','https://kemou.top:88','https://kemou.top:8443'];
export const CONFIG_ORIGIN='https://kemou2333.github.io';
export const CONNECT_SOURCES=["'self'",...API_ORIGINS,CONFIG_ORIGIN,'http://localhost:*','http://127.0.0.1:*','ws://localhost:*','ws://127.0.0.1:*'].join(' ');
