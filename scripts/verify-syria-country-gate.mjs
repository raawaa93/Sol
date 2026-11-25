const endpoint = 'https://oyoyozdugicmnkfhjovo.supabase.co/functions/v1/volterra-binance-market-data?endpoint=__country_gate_probe__';
const response = await fetch(endpoint, {
  method: 'GET',
  headers: { Accept: 'application/json', 'CF-IPCountry': 'SY' },
  signal: AbortSignal.timeout(10_000),
});
let payload;
try { payload = await response.json(); } catch { throw new Error(`Country-gate probe returned non-JSON HTTP ${response.status}.`); }
if (response.status === 403 && payload?.code === 'SOURCE_COUNTRY_NOT_ALLOWED') {
  console.log('PASS: non-Syrian CI egress cannot spoof CF-IPCountry=SY; request was denied before Binance upstream access.');
} else if (response.status === 503 && payload?.code === 'SOURCE_COUNTRY_UNVERIFIED') {
  throw new Error('FAIL CLOSED: Supabase did not provide trusted CF-IPCountry metadata. Syrian requests will also be denied until the ingress country signal is available.');
} else {
  throw new Error(`FAIL: country metadata is missing or spoofable; got HTTP ${response.status} with code ${payload?.code ?? 'none'}. The probe uses an invalid endpoint and must never reach Binance.`);
}
