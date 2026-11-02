import { randomUUID } from 'node:crypto';
import { TestContext, TestUser } from './helpers/test-context';

describe('Transferências concorrentes (integração)', () => {
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
    });

    it('aceita só uma de duas transferências simultâneas que, juntas, excedem o saldo', async () => {
        await ctx.fund(alice.walletId, 100_000);

        const responses = await Promise.all([
            ctx.transfer(alice, bob.walletId, 80_000),
            ctx.transfer(alice, bob.walletId, 80_000),
        ]);

        const statuses = responses.map((r) => r.status).sort();
        expect(statuses).toEqual([201, 422]);
        expect(await ctx.balanceOf(alice.walletId)).toBe(20_000);
        expect(await ctx.balanceOf(bob.walletId)).toBe(80_000);
        expect(await ctx.count('transfers')).toBe(1);
    });

    it('não gera deadlock nem 500 com transferências A→B e B→A simultâneas e preserva a soma dos saldos', async () => {
        await ctx.fund(alice.walletId, 100_000);
        await ctx.fund(bob.walletId, 100_000);

        const requests = Array.from({ length: 20 }, (_, i) =>
            i % 2 === 0 ? ctx.transfer(alice, bob.walletId, 1_000) : ctx.transfer(bob, alice.walletId, 1_000),
        );
        const responses = await Promise.all(requests);

        expect(responses.every((r) => r.status === 201)).toBe(true);
        const total = (await ctx.balanceOf(alice.walletId)) + (await ctx.balanceOf(bob.walletId));
        expect(total).toBe(200_000);
        expect(await ctx.count('transfers')).toBe(20);
    });

    it('com a mesma Idempotency-Key em paralelo devolve o mesmo id e cria uma única transferência', async () => {
        await ctx.fund(alice.walletId, 100_000);
        const key = randomUUID();

        const [first, second] = await Promise.all([
            ctx.transfer(alice, bob.walletId, 10_000, key),
            ctx.transfer(alice, bob.walletId, 10_000, key),
        ]);

        expect(first.status).toBe(201);
        expect(second.status).toBe(201);
        expect(second.body.id).toBe(first.body.id);
        expect(await ctx.count('transfers')).toBe(1);
        expect(await ctx.count('idempotency_keys')).toBe(1);
        expect(await ctx.balanceOf(alice.walletId)).toBe(90_000);
    });

    it('debita o valor exato com dez transferências pequenas em paralelo da mesma conta', async () => {
        await ctx.fund(alice.walletId, 100_000);

        const responses = await Promise.all(
            Array.from({ length: 10 }, () => ctx.transfer(alice, bob.walletId, 1_234)),
        );

        expect(responses.every((r) => r.status === 201)).toBe(true);
        expect(await ctx.balanceOf(alice.walletId)).toBe(100_000 - 10 * 1_234);
        expect(await ctx.balanceOf(bob.walletId)).toBe(10 * 1_234);
    });
});
