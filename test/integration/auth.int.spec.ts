import { WalletsRepository } from '../../src/modules/wallets/wallets.repository';
import { TestContext } from './helpers/test-context';

describe('Autenticação (integração)', () => {
    let ctx: TestContext;

    beforeAll(async () => {
        ctx = await TestContext.create();
    });
    afterAll(async () => {
        await ctx.close();
    });
    beforeEach(async () => {
        await ctx.truncateAll();
    });
    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('cadastro', () => {
        it('cria usuário e carteira com saldo 0 e não devolve senha nem hash', async () => {
            const res = await ctx.register('alice@test.com').expect(201);

            expect(res.body).toEqual({
                id: expect.any(String),
                email: 'alice@test.com',
                walletId: expect.any(String),
            });
            expect(JSON.stringify(res.body)).not.toMatch(/password|hash|argon/i);
            expect(await ctx.balanceOf(res.body.walletId)).toBe(0);
            expect(await ctx.count('users')).toBe(1);
            expect(await ctx.count('wallets')).toBe(1);
        });

        it('retorna 409 com e-mail duplicado', async () => {
            await ctx.register('alice@test.com').expect(201);

            const res = await ctx.register('alice@test.com').expect(409);

            expect(res.body.error).toBe('EMAIL_ALREADY_REGISTERED');
            expect(await ctx.count('users')).toBe(1);
        });

        it('retorna 409 com e-mail duplicado em maiúsculas', async () => {
            await ctx.register('alice@test.com').expect(201);

            await ctx.register('ALICE@Test.com').expect(409);

            expect(await ctx.count('users')).toBe(1);
        });

        it('não deixa usuário órfão quando o insert da carteira falha', async () => {
            jest
                .spyOn(ctx.app.get(WalletsRepository), 'insert')
                .mockRejectedValueOnce(new Error('falha simulada na carteira'));

            await ctx.register('alice@test.com').expect(500);

            expect(await ctx.count('users')).toBe(0);
            expect(await ctx.count('wallets')).toBe(0);
        });
    });

    describe('login', () => {
        it('devolve token para credenciais válidas', async () => {
            await ctx.register('alice@test.com').expect(201);

            const res = await ctx.login('alice@test.com', 'Senha@123').expect(200);

            expect(res.body.accessToken).toEqual(expect.any(String));
            expect(res.body.tokenType).toBe('Bearer');
        });

        it('responde igual (401 e mesma mensagem) para senha errada e e-mail inexistente', async () => {
            await ctx.register('alice@test.com').expect(201);

            const wrongPassword = await ctx.login('alice@test.com', 'Errada@123').expect(401);
            const unknownEmail = await ctx.login('ninguem@test.com', 'Senha@123').expect(401);

            expect(wrongPassword.body.error).toBe(unknownEmail.body.error);
            expect(wrongPassword.body.message).toBe(unknownEmail.body.message);
        });
    });

    describe('/wallets/me', () => {
        it('devolve a carteira do usuário autenticado', async () => {
            const alice = await ctx.createUser('alice@test.com');

            const res = await ctx
                .http()
                .get('/api/v1/wallets/me')
                .set('Authorization', `Bearer ${alice.token}`)
                .expect(200);

            expect(res.body).toEqual({ id: alice.walletId, balanceInCents: 0, currency: 'BRL' });
        });

        it('retorna 401 sem token', async () => {
            await ctx.http().get('/api/v1/wallets/me').expect(401);
        });

        it('retorna 401 com token inválido', async () => {
            await ctx.http().get('/api/v1/wallets/me').set('Authorization', 'Bearer abc.def.ghi').expect(401);
        });
    });
});
