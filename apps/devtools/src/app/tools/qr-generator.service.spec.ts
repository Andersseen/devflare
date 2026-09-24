import { QrGenerator } from './qr-generator.service';

describe('QrGenerator', () => {
  const qr = new QrGenerator();

  it('builds the standard Wi-Fi payload', () => {
    expect(qr.buildWifiContent('Home', 'secret', 'WPA', false)).toBe(
      'WIFI:T:WPA;S:Home;P:secret;H:false;;',
    );
  });

  it('escapes the characters the Wi-Fi format reserves', () => {
    expect(qr.buildWifiContent('a;b,c', 'p:w\\d', 'WEP', true)).toBe(
      'WIFI:T:WEP;S:a\\;b\\,c;P:p\\:w\\\\d;H:true;;',
    );
  });

  it('allows open networks', () => {
    expect(qr.buildWifiContent('Cafe', '', 'nopass', false)).toBe(
      'WIFI:T:nopass;S:Cafe;P:;H:false;;',
    );
  });
});
