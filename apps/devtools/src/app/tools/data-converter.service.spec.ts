import { DataConverter } from './data-converter.service';

describe('DataConverter', () => {
  const converter = new DataConverter();

  it('converts a JSON array to CSV with a header row', () => {
    const { csv, error } = converter.jsonToCsv(
      JSON.stringify([
        { name: 'Ada', year: 1815 },
        { name: 'Grace', year: 1906 },
      ]),
    );

    expect(error).toBeUndefined();
    expect(csv).toBe('name,year\nAda,1815\nGrace,1906');
  });

  it('reports invalid JSON instead of throwing', () => {
    const { csv, error } = converter.jsonToCsv('{not json');
    expect(csv).toBe('');
    expect(error).toMatch(/^Invalid JSON:/);
  });

  it('converts CSV to typed JSON', () => {
    const { json, error } = converter.csvToJson('name,year\nAda,1815\n');

    expect(error).toBeUndefined();
    expect(JSON.parse(json)).toEqual([{ name: 'Ada', year: 1815 }]);
  });

  it('round-trips JSON through CSV', () => {
    const rows = [
      { a: 1, b: 'x' },
      { a: 2, b: 'y' },
    ];
    const { csv } = converter.jsonToCsv(JSON.stringify(rows));
    expect(JSON.parse(converter.csvToJson(csv).json)).toEqual(rows);
  });

  it('prettifies JSON and rejects invalid input', () => {
    expect(converter.prettifyJson('{"a":1}').pretty).toBe('{\n  "a": 1\n}');
    expect(converter.prettifyJson('nope').error).toMatch(/^Invalid JSON:/);
  });
});
