import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { FormularioStatus, PerguntaTipo, RespostaOrigem, RespostaStatus } from '@prisma/client';

import { ColetaRepository } from './coleta.repository';
import { ColetaService } from './coleta.service';
import { DispositivoService } from './dispositivo.service';
import { EnviarRespostaDto } from './dto/coleta.dto';

describe('ColetaService', () => {
  let servico: ColetaService;

  const repositorio = {
    buscarPorToken: jest.fn(),
    municipioExiste: jest.fn(),
    buscarResposta: jest.fn(),
    gravar: jest.fn(),
  };
  const dispositivos = { gerarHash: jest.fn() };

  const PERGUNTA_UNICA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const PERGUNTA_CONDICIONADA = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const PERGUNTA_ESCALA = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const PERGUNTA_TEXTO = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const ALT_SIM = '11111111-1111-4111-8111-111111111111';
  const ALT_NAO = '22222222-2222-4222-8222-222222222222';
  const ALT_A = '33333333-3333-4333-8333-333333333333';

  const pergunta = (ajustes: Record<string, unknown>) => ({
    id: PERGUNTA_UNICA,
    enunciado: 'Você pretende votar?',
    tipo: PerguntaTipo.UNICA_ESCOLHA,
    obrigatoria: true,
    ordem: 1,
    escalaMinimo: null,
    escalaMaximo: null,
    escalaRotuloMinimo: null,
    escalaRotuloMaximo: null,
    condicaoAlternativaId: null,
    condicaoPerguntaId: null,
    alternativas: [
      { id: ALT_SIM, texto: 'Sim', ordem: 1 },
      { id: ALT_NAO, texto: 'Não', ordem: 2 },
    ],
    ...ajustes,
  });

  const formulario = (ajustes: Record<string, unknown> = {}) => ({
    id: 'form-1',
    titulo: 'Pesquisa',
    descricao: null,
    status: FormularioStatus.EM_COLETA,
    vigenciaInicio: null,
    vigenciaFim: null,
    perguntas: [
      pergunta({}),
      pergunta({
        id: PERGUNTA_CONDICIONADA,
        enunciado: 'Em quem você votaria?',
        ordem: 2,
        condicaoAlternativaId: ALT_SIM,
        condicaoPerguntaId: PERGUNTA_UNICA,
        alternativas: [{ id: ALT_A, texto: 'Candidato A', ordem: 1 }],
      }),
      pergunta({
        id: PERGUNTA_ESCALA,
        enunciado: 'Nota da gestão',
        tipo: PerguntaTipo.ESCALA,
        ordem: 3,
        escalaMinimo: 0,
        escalaMaximo: 10,
        alternativas: [],
      }),
      pergunta({
        id: PERGUNTA_TEXTO,
        enunciado: 'Comentário',
        tipo: PerguntaTipo.TEXTO_LIVRE,
        obrigatoria: false,
        ordem: 4,
        alternativas: [],
      }),
    ],
    ...ajustes,
  });

  const envio = (itens: unknown[], ajustes: Record<string, unknown> = {}): EnviarRespostaDto =>
    ({
      respostaId: '99999999-9999-4999-8999-999999999999',
      consentimento: true,
      consentimentoEm: new Date('2026-08-23T12:00:00.000Z'),
      municipioCodigoIbge: 2927408,
      dispositivoId: 'dispositivo-de-teste-1234',
      coletadoEm: new Date('2026-08-23T12:05:00.000Z'),
      itens,
      ...ajustes,
    }) as EnviarRespostaDto;

  const respostaValida = [
    { perguntaId: PERGUNTA_UNICA, alternativaId: ALT_SIM },
    { perguntaId: PERGUNTA_CONDICIONADA, alternativaId: ALT_A },
    { perguntaId: PERGUNTA_ESCALA, valorNumero: 7 },
  ];

  beforeEach(async () => {
    jest.resetAllMocks();
    repositorio.buscarPorToken.mockResolvedValue(formulario());
    repositorio.municipioExiste.mockResolvedValue({ codigoIbge: 2927408, uf: 'BA' });
    repositorio.buscarResposta.mockResolvedValue(null);
    repositorio.gravar.mockImplementation(async () => ({
      id: '99999999-9999-4999-8999-999999999999',
      status: RespostaStatus.VALIDA,
      origem: RespostaOrigem.APLICATIVO,
      recebidoEm: new Date(),
    }));
    dispositivos.gerarHash.mockReturnValue('a'.repeat(64));

    const modulo = await Test.createTestingModule({
      providers: [
        ColetaService,
        { provide: ColetaRepository, useValue: repositorio },
        { provide: DispositivoService, useValue: dispositivos },
      ],
    }).compile();
    servico = modulo.get(ColetaService);
  });

  describe('abrir', () => {
    it('devolve só o conteúdo público do formulário', async () => {
      const publico = await servico.abrir('token-de-teste');

      expect(publico.titulo).toBe('Pesquisa');
      expect(publico.perguntas).toHaveLength(4);
      expect(JSON.stringify(publico)).not.toContain('form-1');
      expect(publico).not.toHaveProperty('status');
      expect(publico).not.toHaveProperty('id');
    });

    it('trata token desconhecido e rascunho da mesma forma', async () => {
      repositorio.buscarPorToken.mockResolvedValue(null);
      await expect(servico.abrir('token-de-teste')).rejects.toBeInstanceOf(NotFoundException);

      repositorio.buscarPorToken.mockResolvedValue(
        formulario({ status: FormularioStatus.RASCUNHO }),
      );
      await expect(servico.abrir('token-de-teste')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('recusa pesquisa encerrada', async () => {
      repositorio.buscarPorToken.mockResolvedValue(
        formulario({ status: FormularioStatus.ENCERRADO }),
      );
      await expect(servico.abrir('token-de-teste')).rejects.toBeInstanceOf(ConflictException);
    });

    it('recusa pesquisa fora do período de vigência', async () => {
      repositorio.buscarPorToken.mockResolvedValue(
        formulario({ vigenciaFim: new Date('2020-01-01T00:00:00.000Z') }),
      );
      await expect(servico.abrir('token-de-teste')).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('envio', () => {
    it('grava resposta completa com município e data/hora', async () => {
      await servico.enviar('token-de-teste', envio(respostaValida));

      const gravado = repositorio.gravar.mock.calls[0][0];
      expect(gravado.municipioCodigoIbge).toBe(2927408);
      expect(gravado.coletadoEm).toEqual(new Date('2026-08-23T12:05:00.000Z'));
      expect(gravado.consentimentoEm).toEqual(new Date('2026-08-23T12:00:00.000Z'));
      expect(gravado.status).toBe(RespostaStatus.VALIDA);
      expect(gravado.itens).toHaveLength(3);
    });

    it('guarda apenas o hash do dispositivo, nunca o identificador em claro', async () => {
      await servico.enviar('token-de-teste', envio(respostaValida));

      const gravado = repositorio.gravar.mock.calls[0][0];
      expect(dispositivos.gerarHash).toHaveBeenCalledWith('dispositivo-de-teste-1234');
      expect(gravado.dispositivoHash).toBe('a'.repeat(64));
      expect(JSON.stringify(gravado)).not.toContain('dispositivo-de-teste-1234');
    });

    it('marca para conferência quando o município é de fora da Bahia', async () => {
      repositorio.municipioExiste.mockResolvedValue({ codigoIbge: 3550308, uf: 'SP' });

      await servico.enviar(
        'token-de-teste',
        envio(respostaValida, { municipioCodigoIbge: 3550308 }),
      );

      const gravado = repositorio.gravar.mock.calls[0][0];
      expect(gravado.status).toBe(RespostaStatus.EM_CONFERENCIA);
      expect(gravado.motivoConferencia).toContain('fora da BA');
    });

    it('recusa município inexistente na base do IBGE', async () => {
      repositorio.municipioExiste.mockResolvedValue(null);

      await expect(
        servico.enviar('token-de-teste', envio(respostaValida, { municipioCodigoIbge: 9999999 })),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repositorio.gravar).not.toHaveBeenCalled();
    });

    it('é idempotente: o mesmo pacote reenviado não grava de novo', async () => {
      const jaGravada = {
        id: '99999999-9999-4999-8999-999999999999',
        status: RespostaStatus.VALIDA,
        origem: RespostaOrigem.APLICATIVO,
        recebidoEm: new Date(),
      };
      repositorio.buscarResposta.mockResolvedValue(jaGravada);

      await expect(servico.enviar('token-de-teste', envio(respostaValida))).resolves.toEqual(
        jaGravada,
      );
      expect(repositorio.gravar).not.toHaveBeenCalled();
    });
  });

  describe('validação do pacote', () => {
    it('recusa pergunta obrigatória sem resposta', async () => {
      await expect(
        servico.enviar(
          'token-de-teste',
          envio([{ perguntaId: PERGUNTA_UNICA, alternativaId: ALT_SIM }]),
        ),
      ).rejects.toThrow('obrigatória');
    });

    it('aceita pergunta opcional em branco', async () => {
      await servico.enviar('token-de-teste', envio(respostaValida));
      expect(repositorio.gravar).toHaveBeenCalled();
    });

    it('recusa alternativa que não é da pergunta', async () => {
      await expect(
        servico.enviar(
          'token-de-teste',
          envio([
            { perguntaId: PERGUNTA_UNICA, alternativaId: ALT_A },
            { perguntaId: PERGUNTA_ESCALA, valorNumero: 5 },
          ]),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('recusa pergunta de outra pesquisa', async () => {
      await expect(
        servico.enviar(
          'token-de-teste',
          envio([{ perguntaId: '77777777-7777-4777-8777-777777777777', valorTexto: 'oi' }]),
        ),
      ).rejects.toThrow('não é desta pesquisa');
    });

    it('recusa valor de escala fora da faixa', async () => {
      await expect(
        servico.enviar(
          'token-de-teste',
          envio([
            { perguntaId: PERGUNTA_UNICA, alternativaId: ALT_SIM },
            { perguntaId: PERGUNTA_CONDICIONADA, alternativaId: ALT_A },
            { perguntaId: PERGUNTA_ESCALA, valorNumero: 42 },
          ]),
        ),
      ).rejects.toThrow('entre 0 e 10');
    });

    it('recusa duas respostas em pergunta de escolha única', async () => {
      await expect(
        servico.enviar(
          'token-de-teste',
          envio([
            { perguntaId: PERGUNTA_UNICA, alternativaId: ALT_SIM },
            { perguntaId: PERGUNTA_UNICA, alternativaId: ALT_NAO },
            { perguntaId: PERGUNTA_ESCALA, valorNumero: 5 },
          ]),
        ),
      ).rejects.toThrow('uma resposta só');
    });

    it('recusa data de coleta no futuro', async () => {
      await expect(
        servico.enviar(
          'token-de-teste',
          envio(respostaValida, { coletadoEm: new Date(Date.now() + 5 * 24 * 3600 * 1000) }),
        ),
      ).rejects.toThrow('futuro');
    });
  });

  describe('lógica condicional no servidor', () => {
    it('recusa resposta em pergunta que não deveria aparecer', async () => {
      await expect(
        servico.enviar(
          'token-de-teste',
          envio([
            { perguntaId: PERGUNTA_UNICA, alternativaId: ALT_NAO },
            { perguntaId: PERGUNTA_CONDICIONADA, alternativaId: ALT_A },
            { perguntaId: PERGUNTA_ESCALA, valorNumero: 5 },
          ]),
        ),
      ).rejects.toThrow('não deveria aparecer');
    });

    it('não exige a pergunta condicionada quando a condição não foi atendida', async () => {
      await servico.enviar(
        'token-de-teste',
        envio([
          { perguntaId: PERGUNTA_UNICA, alternativaId: ALT_NAO },
          { perguntaId: PERGUNTA_ESCALA, valorNumero: 5 },
        ]),
      );

      const gravado = repositorio.gravar.mock.calls[0][0];
      expect(gravado.itens).toHaveLength(2);
    });

    it('exige a pergunta condicionada quando a condição foi atendida', async () => {
      await expect(
        servico.enviar(
          'token-de-teste',
          envio([
            { perguntaId: PERGUNTA_UNICA, alternativaId: ALT_SIM },
            { perguntaId: PERGUNTA_ESCALA, valorNumero: 5 },
          ]),
        ),
      ).rejects.toThrow('obrigatória');
    });
  });
});
