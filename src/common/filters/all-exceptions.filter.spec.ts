import { ArgumentsHost, Logger } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { AllExceptionsFilter } from './all-exceptions.filter';

function pgError(code: string, constraint?: string): QueryFailedError {
  const driverError = Object.assign(new Error(`pg ${code}`), {
    code,
    constraint,
  });
  return new QueryFailedError('SELECT 1', [], driverError);
}

function mockHost() {
  const response = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
    setHeader: jest.fn(),
  };
  const request = { id: 'req-1', originalUrl: '/api/v1/transfers' };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;
  return { host, response };
}

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it.each(['40P01', '40001', '55P03'])(
    'responde 503 SERVICE_BUSY com Retry-After para o erro transitório %s',
    (code) => {
      const { host, response } = mockHost();

      filter.catch(pgError(code), host);

      expect(response.status).toHaveBeenCalledWith(503);
      expect(response.setHeader).toHaveBeenCalledWith('Retry-After', '1');
      expect(response.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 503,
          error: 'SERVICE_BUSY',
          message: 'Sistema ocupado, tente novamente',
          requestId: 'req-1',
          path: '/api/v1/transfers',
        }),
      );
    },
  );

  it('responde 500 genérico para violação de CHECK (23514) sem expor detalhes do banco', () => {
    const { host, response } = mockHost();

    filter.catch(pgError('23514', 'ck_wallets_balance_non_negative'), host);

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.setHeader).not.toHaveBeenCalled();
    const body = (response.json.mock.calls[0] as [Record<string, unknown>])[0];
    expect(body).toMatchObject({ statusCode: 500, message: 'Erro interno' });
    expect(JSON.stringify(body)).not.toContain(
      'ck_wallets_balance_non_negative',
    );
  });
});
