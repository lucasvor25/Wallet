import { TestContext, TestUser } from './helpers/test-context';

describe('Estornos (integração)', () => {
  let ctx: TestContext;
  let alice: TestUser;
  let bob: TestUser;
  let transferId: string;

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
    const res = await ctx.transfer(alice, bob.walletId, 30_000).expect(201);
    transferId = res.body.id as string;
  });

  it('restaura os saldos e marca a original como REVERSED quando o remetente estorna', async () => {
    const res = await ctx.reverse(alice, transferId).expect(201);

    expect(res.body.type).toBe('REVERSAL');
    expect(res.body.senderWalletId).toBe(bob.walletId);
    expect(res.body.receiverWalletId).toBe(alice.walletId);
    expect(res.body.amountInCents).toBe(30_000);
    expect(await ctx.balanceOf(alice.walletId)).toBe(100_000);
    expect(await ctx.balanceOf(bob.walletId)).toBe(0);
    expect(await ctx.statusOf(transferId)).toBe('REVERSED');
    expect(await ctx.count('transfer_reversals')).toBe(1);
  });

  it('não altera o valor nem as partes da transferência original', async () => {
    await ctx.reverse(alice, transferId).expect(201);

    const original = await ctx.getTransfer(alice, transferId).expect(200);
    expect(original.body.amountInCents).toBe(30_000);
    expect(original.body.senderWalletId).toBe(alice.walletId);
    expect(original.body.receiverWalletId).toBe(bob.walletId);
  });

  it('aceita só um de dois estornos simultâneos (um 201 e um 409)', async () => {
    const responses = await Promise.all([
      ctx.reverse(alice, transferId),
      ctx.reverse(alice, transferId),
    ]);

    const statuses = responses.map((r) => r.status).sort();
    expect(statuses).toEqual([201, 409]);
    expect(await ctx.balanceOf(alice.walletId)).toBe(100_000);
    expect(await ctx.balanceOf(bob.walletId)).toBe(0);
    expect(await ctx.count('transfer_reversals')).toBe(1);
  });

  it('retorna 409 ao estornar uma transferência já estornada', async () => {
    await ctx.reverse(alice, transferId).expect(201);

    const res = await ctx.reverse(alice, transferId).expect(409);

    expect(res.body.error).toBe('TRANSFER_ALREADY_REVERSED');
  });

  it('retorna 403 quando o destinatário tenta estornar', async () => {
    const res = await ctx.reverse(bob, transferId).expect(403);

    expect(res.body.error).toBe('REVERSAL_NOT_ALLOWED');
    expect(await ctx.statusOf(transferId)).toBe('COMPLETED');
  });

  it('retorna 404 quando um terceiro tenta estornar', async () => {
    const carol = await ctx.createUser('carol@test.com');

    const res = await ctx.reverse(carol, transferId).expect(404);

    expect(res.body.error).toBe('TRANSFER_NOT_FOUND');
    expect(await ctx.statusOf(transferId)).toBe('COMPLETED');
  });

  it('retorna 422 ao tentar estornar um estorno', async () => {
    const reversal = await ctx.reverse(alice, transferId).expect(201);

    // Bob é o remetente do estorno, então passa pela checagem de autoria e cai na regra de tipo.
    const res = await ctx.reverse(bob, reversal.body.id).expect(422);

    expect(res.body.error).toBe('TRANSFER_NOT_REVERSIBLE');
  });

  it('retorna 422 quando o destinatário não tem mais saldo para devolver', async () => {
    const carol = await ctx.createUser('carol@test.com');
    await ctx.transfer(bob, carol.walletId, 30_000).expect(201);

    const res = await ctx.reverse(alice, transferId).expect(422);

    expect(res.body.error).toBe('REVERSAL_FUNDS_UNAVAILABLE');
    expect(await ctx.statusOf(transferId)).toBe('COMPLETED');
    expect(await ctx.balanceOf(alice.walletId)).toBe(70_000);
  });

  it('retorna 422 quando a janela de estorno expirou', async () => {
    await ctx.db.query(
      `UPDATE transfers SET created_at = now() - interval '73 hours' WHERE id = $1`,
      [transferId],
    );

    const res = await ctx.reverse(alice, transferId).expect(422);

    expect(res.body.error).toBe('REVERSAL_WINDOW_EXPIRED');
    expect(await ctx.statusOf(transferId)).toBe('COMPLETED');
  });
});
