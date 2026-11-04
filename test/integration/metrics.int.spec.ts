import { randomUUID } from 'node:crypto';
import { TestContext, TestUser } from './helpers/test-context';

const METRICS_TOKEN = 'token-de-metricas-do-teste';

describe('Métricas (integração)', () => {
  let ctx: TestContext;
  let alice: TestUser;
  let bob: TestUser;

  beforeAll(async () => {
    process.env.METRICS_TOKEN = METRICS_TOKEN;
    ctx = await TestContext.create();
  });
  afterAll(async () => {
    delete process.env.METRICS_TOKEN;
    await ctx.close();
  });
  beforeEach(async () => {
    await ctx.truncateAll();
    alice = await ctx.createUser('alice@test.com');
    bob = await ctx.createUser('bob@test.com');
    await ctx.fund(alice.walletId, 100_000);
  });

  async function scrape(): Promise<string> {
    const res = await ctx
      .http()
      .get('/metrics')
      .set('Authorization', `Bearer ${METRICS_TOKEN}`)
      .expect(200);
    return res.text;
  }

  it('expõe métricas sem dados sensíveis e agrupa rotas por padrão', async () => {
    await ctx.transfer(alice, bob.walletId, 1_000).expect(201);
    await ctx.reverse(alice, randomUUID()).expect(404);
    await ctx.reverse(alice, randomUUID()).expect(404);
    await ctx.http().get('/api/v1/nao-existe').expect(404);

    const text = await scrape();

    expect(text).toContain('wallet_http_request_duration_seconds');
    expect(text).toContain('wallet_nodejs_eventloop_lag_seconds');
    expect(text).toMatch(
      /wallet_http_request_duration_seconds_count\{method="POST",route="\/api\/v1\/transfers\/:id\/reversal",status_code="404"\} 2/,
    );
    expect(text).toContain('route="unmatched"');
    expect(text).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    );
    expect(text).not.toContain(alice.email);
    expect(text).not.toContain('eyJ');
  });

  it('exige o token quando METRICS_TOKEN está definido', async () => {
    await ctx.http().get('/metrics').expect(401);
    await ctx
      .http()
      .get('/metrics')
      .set('Authorization', 'Bearer token-errado')
      .expect(401);
  });

  it('conta transferências por resultado e erros de domínio por código', async () => {
    const key = randomUUID();
    const first = await ctx
      .transfer(alice, bob.walletId, 1_000, key)
      .expect(201);
    await ctx.transfer(alice, bob.walletId, 1_000, key).expect(201);
    await ctx.reverse(alice, first.body.id as string).expect(201);
    await ctx.transfer(bob, alice.walletId, 999_999).expect(422);

    const text = await scrape();

    expect(text).toMatch(
      /wallet_transfers_total\{type="TRANSFER",result="replayed"\} 1\n/,
    );
    expect(text).toMatch(
      /wallet_transfers_total\{type="REVERSAL",result="completed"\} 1\n/,
    );
    expect(text).toMatch(
      /wallet_domain_errors_total\{code="INSUFFICIENT_BALANCE"\} 1\n/,
    );
  });
});
