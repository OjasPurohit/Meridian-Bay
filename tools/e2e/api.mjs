// API-level checks on the scratch clone (:4001): cafe order lifecycle (flow I), server-side member price, menu identity.
const API = process.env.E2E_API || 'http://localhost:4001/api/v1';
let failures = 0;
const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  -> ' + x : ''}`); if (!ok) failures++; };
const call = async (method, p, body, token) => (await fetch(API + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined })).json();
const login = async (email) => (await call('POST', '/auth/login', { email, password: 'Password@123' })).data.token;

const member = await login('aarav.kapoor@example.com');
const kitchen = await login('kitchen@championsclub.example');
const menu = (await call('GET', '/bar/menu')).data;
const coffee = menu.find((m) => m.name === 'Filter Coffee');
const asKitchen = (await call('GET', '/bar/menu?include_unavailable=true', null, kitchen)).data;
check('public menu == the available subset of the kitchen menu (same ids, same prices)', menu.every((m) => asKitchen.find((k) => k.id === m.id && k.price === m.price)), `${menu.length}/${asKitchen.length}`);

const o = await call('POST', '/bar/orders', { items: [{ bar_menu_item_id: coffee.id, quantity: 1 }] }, member);
check('member orders Filter Coffee: order row created', o.success && o.data.order_number, JSON.stringify(o.error ?? ''));
check('server applies the Gold discount to the same item (base 80.00)', o.success && coffee.price === '80.00' && parseFloat(o.data.total_amount) < 80 && parseFloat(o.data.discount_amount) > 0, `${o.data?.discount_amount} off -> total ${o.data?.total_amount}`);
const seen = (await call('GET', '/kitchen/orders', null, kitchen)).data.find((x) => x.id === o.data.id);
check('kitchen board sees the new order as NEW', seen && seen.status === 'NEW');
for (const next of ['PREPARING', 'READY', 'SERVED']) {
  const r = await call('PATCH', `/kitchen/orders/${o.data.id}/status`, { status: next }, kitchen);
  check(`kitchen moves the order to ${next}`, r.success && r.data.status === next, JSON.stringify(r.error ?? ''));
}
console.log(failures ? `\n${failures} FAILED` : '\nAPI CHECKS PASSED');
process.exit(failures ? 1 : 0);
