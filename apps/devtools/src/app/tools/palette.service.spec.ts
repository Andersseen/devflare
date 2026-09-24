import { Palette } from './palette.service';

describe('Palette', () => {
  const palette = new Palette();

  it('formats RGB as upper-case hex', () => {
    expect(palette.rgbToHex(0, 0, 0)).toBe('#000000');
    expect(palette.rgbToHex(255, 255, 255)).toBe('#FFFFFF');
    expect(palette.rgbToHex(13, 148, 136)).toBe('#0D9488');
  });
});
