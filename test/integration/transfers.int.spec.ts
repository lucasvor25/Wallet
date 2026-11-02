import { randomUUID } from 'node:crypto';
import { TestContext, TestUser } from './helpers/test-context';

describe('Transferências (integração)', () => {
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

    describe('fluxo feliz', () => {
        it('transfere e atualiza saldos, transfers e ledger', async () => {
            const res = await ctx.transfer(alice, bob.walletId, 30_000).expect(201);

            expect(res.body.amountInCents).toBe(30_000);
            expect(res.body.senderWalletId).toBe(alice.walletId);
            expect(res.body.status).toBe('COMPLETED');
            expect(await ctx.balanceOf(alice.walletId)).toBe(70_000);
            expect(await ctx.balanceOf(bob.walletId)).toBe(30_000);
            expect(await ctx.count('transfers')).toBe(1);
            expect(await ctx.count('ledger_entries')).toBe(3); // 1 crédito do fund + débito + crédito
        });
    });

    describe('regras de negócio', () => {
        it('retorna 422 com saldo insuficiente e não altera nada', async () => {
            const before = await ctx.snapshot();

            const res = await ctx.transfer(alice, bob.walletId, 100_001).expect(422);

            expect(res.body.error).toBe('INSUFFICIENT_BALANCE');
            expect(await ctx.snapshot()).toEqual(before);
        });

        it('retorna 422 ao transferir para a própria carteira', async () => {
            const res = await ctx.transfer(alice, alice.walletId, 1_000).expect(422);

            expect(res.body.error).toBe('SELF_TRANSFER');
            expect(await ctx.balanceOf(alice.walletId)).toBe(100_000);
        });

        it('retorna 422 ao transferir para a própria carteira com UUID em maiúsculas', async () => {
            const res = await ctx.transfer(alice, alice.walletId.toUpperCase(), 1_000).expect(422);

            expect(res.body.error).toBe('SELF_TRANSFER');
            expect(await ctx.balanceOf(alice.walletId)).toBe(100_000);
            expect(await ctx.count('transfers')).toBe(0);
        });

        it('retorna 404 quando a carteira de destino não existe', async () => {
            const res = await ctx.transfer(alice, randomUUID(), 1_000).expect(404);

            expect(res.body.error).toBe('WALLET_NOT_FOUND');
            expect(await ctx.balanceOf(alice.walletId)).toBe(100_000);
        });
    });

    describe('idempotência', () => {
        it('retorna a mesma resposta quando a mesma chave é repetida com o mesmo corpo', async () => {
            const key = randomUUID();

            const first = await ctx.transfer(alice, bob.walletId, 10_000, key).expect(201);
            const second = await ctx.transfer(alice, bob.walletId, 10_000, key).expect(201);

            expect(second.body.id).toBe(first.body.id);
            expect(await ctx.count('transfers')).toBe(1);
            expect(await ctx.balanceOf(alice.walletId)).toBe(90_000);
        });

        it('retorna 409 quando a mesma chave chega com valor diferente', async () => {
            const key = randomUUID();
            await ctx.transfer(alice, bob.walletId, 10_000, key).expect(201);

            const res = await ctx.transfer(alice, bob.walletId, 20_000, key).expect(409);

            expect(res.body.error).toBe('IDEMPOTENCY_KEY_CONFLICT');
            expect(await ctx.count('transfers')).toBe(1);
            expect(await ctx.balanceOf(alice.walletId)).toBe(90_000);
        });

        it('retorna 400 quando o header Idempotency-Key está ausente', async () => {
            await ctx
                .http()
                .post('/api/v1/transfers')
                .set('Authorization', `Bearer ${alice.token}`)
                .send({ receiverWalletId: bob.walletId, amountInCents: 1_000 })
                .expect(400);

            expect(await ctx.count('transfers')).toBe(0);
        });
    });

    describe('validação de entrada', () => {
        it.each([
            ['zero', 0],
            ['negativo', -100],
            ['decimal', 10.5],
            ['texto', 'abc'],
        ])('retorna 400 com valor %s', async (_label, amount) => {
            await ctx.transfer(alice, bob.walletId, amount).expect(400);

            expect(await ctx.count('transfers')).toBe(0);
        });

        it('retorna 400 quando o corpo tem campos extras (ex.: senderWalletId)', async () => {
            await ctx
                .http()
                .post('/api/v1/transfers')
                .set('Authorization', `Bearer ${alice.token}`)
                .set('Idempotency-Key', randomUUID())
                .send({ receiverWalletId: alice.walletId, senderWalletId: bob.walletId, amountInCents: 1_000 })
                .expect(400);
        });
    });

    describe('autorização', () => {
        it('retorna 401 sem token', async () => {
            await ctx
                .http()
                .post('/api/v1/transfers')
                .set('Idempotency-Key', randomUUID())
                .send({ receiverWalletId: bob.walletId, amountInCents: 1_000 })
                .expect(401);

            expect(await ctx.count('transfers')).toBe(0);
        });

        it('permite que remetente e destinatário consultem a transferência', async () => {
            const { body } = await ctx.transfer(alice, bob.walletId, 1_000).expect(201);

            await ctx.getTransfer(alice, body.id).expect(200);
            await ctx.getTransfer(bob, body.id).expect(200);
        });

        it('retorna 404 quando um terceiro consulta a transferência', async () => {
            const carol = await ctx.createUser('carol@test.com');
            const { body } = await ctx.transfer(alice, bob.walletId, 1_000).expect(201);

            const res = await ctx.getTransfer(carol, body.id).expect(404);

            expect(res.body.error).toBe('TRANSFER_NOT_FOUND');
        });
    });
});
