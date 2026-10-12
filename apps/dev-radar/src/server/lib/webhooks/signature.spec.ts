import { createHmac } from 'node:crypto';
import { signWebhookBody, verifyWebhookSignature } from './signature';

const SECRET = 'It’s a Secret to Everybody';
const BODY = '{"zen":"Keep it logically awesome."}';
const nodeSign = (secret: string, body: string) =>
  `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;

describe('webhook signature (X-Hub-Signature-256)', () => {
  it('accepts the signature GitHub would compute (independent HMAC)', async () => {
    await expect(
      verifyWebhookSignature(SECRET, BODY, nodeSign(SECRET, BODY)),
    ).resolves.toBe(true);
  });

  it('agrees with the helper used to sign test deliveries', async () => {
    expect(await signWebhookBody(SECRET, BODY)).toBe(nodeSign(SECRET, BODY));
  });

  it('rejects a body altered after signing, even by one byte', async () => {
    const header = nodeSign(SECRET, BODY);
    await expect(
      verifyWebhookSignature(SECRET, `${BODY} `, header),
    ).resolves.toBe(false);
  });

  it('verifies raw bytes, not a re-serialization', async () => {
    const pretty = '{ "a": 1 }';
    const header = nodeSign(SECRET, pretty);
    await expect(
      verifyWebhookSignature(
        SECRET,
        JSON.stringify(JSON.parse(pretty)),
        header,
      ),
    ).resolves.toBe(false);
    await expect(verifyWebhookSignature(SECRET, pretty, header)).resolves.toBe(
      true,
    );
  });

  it('rejects the wrong secret', async () => {
    await expect(
      verifyWebhookSignature('other', BODY, nodeSign(SECRET, BODY)),
    ).resolves.toBe(false);
  });

  it.each([
    ['missing header', undefined],
    ['empty header', ''],
    ['wrong scheme', `sha1=${'a'.repeat(40)}`],
    ['no prefix', 'a'.repeat(64)],
    ['short hex', 'sha256=abcd'],
    ['non-hex', `sha256=${'z'.repeat(64)}`],
  ])('rejects %s', async (_name, header) => {
    await expect(verifyWebhookSignature(SECRET, BODY, header)).resolves.toBe(
      false,
    );
  });

  it('never accepts when no secret is configured', async () => {
    await expect(
      verifyWebhookSignature('', BODY, nodeSign('', BODY)),
    ).resolves.toBe(false);
  });
});
