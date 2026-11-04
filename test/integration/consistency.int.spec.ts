import { LedgerRepository } from '../../src/modules/ledger/ledger.repository';
import { TestContext, TestUser } from './helpers/test-context';

describe('Consistência (integração)', () => {
  let ctx: TestContext;
  let alice: TestUser;
  let bob: TestUser;

  beforeAll(async () => {
    ctx = await TestContext.create();
  });
  afterAll(async () => {
    await ctx.close();
  });
  beforeEach(async () => {
    await ctx.truncateAll();
    alice = await ctx.createUser('alice@test.com');
    bob = await ctx.createUser('bob@test.com');
    await ctx.fund(alice.walletId, 100_000);
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  function failNextLedgerWrite(): void {
    jest
      .spyOn(ctx.app.get(LedgerRepository), 'insertMany')
      .mockRejectedValueOnce(new Error('falha simulada no ledger'));
  }

  it('desfaz tudo (saldos, transfers e idempotency_keys) quando o ledger falha no meio da transferência', async () => {
    const before = await ctx.snapshot();
    failNextLedgerWrite();

    await ctx.transfer(alice, bob.walletId, 30_000).expect(500);

    expect(await ctx.snapshot()).toEqual(before);
  });

  it('mantém a original COMPLETED quando o ledger falha no meio do estorno', async () => {
    const { body } = await ctx
      .transfer(alice, bob.walletId, 30_000)
      .expect(201);
    const before = await ctx.snapshot();
    failNextLedgerWrite();

    await ctx.reverse(alice, body.id).expect(500);

    expect(await ctx.statusOf(body.id)).toBe('COMPLETED');
    expect(await ctx.snapshot()).toEqual(before);
  });

  it('mantém o saldo de cada carteira igual à soma do ledger depois de várias operações', async () => {
    const carol = await ctx.createUser('carol@test.com');
    const t1 = await ctx.transfer(alice, bob.walletId, 30_000).expect(201);
    await ctx.transfer(bob, carol.walletId, 10_000).expect(201);
    await ctx.transfer(alice, carol.walletId, 5_000).expect(201);
    await ctx.transfer(carol, alice.walletId, 2_500).expect(201);
    await ctx.transfer(alice, bob.walletId, 999_999).expect(422);
    await ctx.reverse(alice, t1.body.id).expect(422); // bob só tem 20_000
    const t2 = await ctx.transfer(alice, bob.walletId, 1_000).expect(201);
    await ctx.reverse(alice, t2.body.id).expect(201);

    const rows = await ctx.reconcile();

    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.balance).toBe(row.ledgerSum);
    }
    const total = rows.reduce((sum, r) => sum + r.balance, 0);
    expect(total).toBe(100_000);
  });

  it('rejeita UPDATE e DELETE no ledger (append-only garantido pelo banco)', async () => {
    await ctx.transfer(alice, bob.walletId, 1_000).expect(201);
    const before = await ctx.count('ledger_entries');

    await expect(
      ctx.db.query(`UPDATE ledger_entries SET amount_in_cents = 1`),
    ).rejects.toThrow(/append-only/);
    await expect(ctx.db.query(`DELETE FROM ledger_entries`)).rejects.toThrow(
      /append-only/,
    );
    expect(await ctx.count('ledger_entries')).toBe(before);
  });
});
