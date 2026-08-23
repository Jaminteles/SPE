import { BadRequestException, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { AuditoriaAcao, FormularioStatus, PerguntaTipo } from '@prisma/client';

import { AuditoriaService } from '../auditoria/auditoria.service';
import { FormulariosRepository } from './formularios.repository';
import { FormulariosService } from './formularios.service';
import { ProvedorQrCode } from './qrcode.provider';

/** Lógica condicional, link de acesso e duplicação — Sprint 3. */
describe('FormulariosService (condição, acesso e duplicação)', () => {
  let servico: FormulariosService;

  const repositorio = {
    listar: jest.fn(),
    buscarCompleto: jest.fn(),
    buscarResumo: jest.fn(),
    buscarSituacao: jest.fn(),
    criar: jest.fn(),
    atualizar: jest.fn(),
    trocarStatus: jest.fn(),
    excluirRascunho: jest.fn(),
    buscarPergunta: jest.fn(),
    criarPergunta: jest.fn(),
    atualizarPergunta: jest.fn(),
    excluirPergunta: jest.fn(),
    listarIdsDePerguntas: jest.fn(),
    reordenarPerguntas: jest.fn(),
    buscarAlternativa: jest.fn(),
    criarAlternativa: jest.fn(),
    atualizarAlternativa: jest.fn(),
    excluirAlternativa: jest.fn(),
    listarIdsDeAlternativas: jest.fn(),
    reordenarAlternativas: jest.fn(),
    listarDependentesDePergunta: jest.fn(),
    listarDependentesDeAlternativa: jest.fn(),
    duplicar: jest.fn(),
  };
  const auditoria = { registrar: jest.fn() };
  const qrCode = { gerarSvg: jest.fn() };
  const config = { get: jest.fn() };

  const rascunho = { id: 'form-1', status: FormularioStatus.RASCUNHO, titulo: 'Pesquisa' };

  const pergunta = (ajustes: Partial<Record<string, unknown>> = {}) => ({
    id: 'p1',
    enunciado: 'Em quem você votaria?',
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
      { id: 'alt-1', texto: 'Candidato A', ordem: 1 },
      { id: 'alt-2', texto: 'Candidato B', ordem: 2 },
    ],
    ...ajustes,
  });

  const formulario = (
    perguntas: unknown[],
    status: FormularioStatus = FormularioStatus.RASCUNHO,
  ) => ({
    id: 'form-1',
    titulo: 'Pesquisa',
    descricao: null,
    status,
    versao: 1,
    vigenciaInicio: null,
    vigenciaFim: null,
    publicadoEm: null,
    encerradoEm: null,
    criadoEm: new Date(),
    tokenPublico: status === FormularioStatus.RASCUNHO ? null : 'token-publico-de-teste',
    totalPerguntas: perguntas.length,
    perguntas,
  });

  const dependente = pergunta({
    id: 'p2',
    ordem: 2,
    tipo: PerguntaTipo.TEXTO_LIVRE,
    alternativas: [],
    condicaoAlternativaId: 'alt-1',
    condicaoPerguntaId: 'p1',
  });

  beforeEach(async () => {
    jest.resetAllMocks();
    repositorio.buscarSituacao.mockResolvedValue(rascunho);
    repositorio.listarDependentesDePergunta.mockResolvedValue([]);
    repositorio.listarDependentesDeAlternativa.mockResolvedValue([]);
    config.get.mockImplementation((_chave: string, padrao: string) => padrao);

    const modulo = await Test.createTestingModule({
      providers: [
        FormulariosService,
        { provide: FormulariosRepository, useValue: repositorio },
        { provide: AuditoriaService, useValue: auditoria },
        { provide: ProvedorQrCode, useValue: qrCode },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();
    servico = modulo.get(FormulariosService);
  });

  describe('condição de exibição', () => {
    beforeEach(() => {
      repositorio.buscarCompleto.mockResolvedValue(formulario([pergunta(), dependente]));
    });

    it('aceita condição apontando para alternativa de pergunta anterior', async () => {
      repositorio.criarPergunta.mockResolvedValue(dependente);

      await servico.criarPergunta(
        'form-1',
        { enunciado: 'Por quê?', tipo: PerguntaTipo.TEXTO_LIVRE, condicaoAlternativaId: 'alt-1' },
        'admin',
      );

      expect(repositorio.criarPergunta).toHaveBeenCalledWith(
        'form-1',
        expect.objectContaining({ condicaoAlternativaId: 'alt-1' }),
      );
    });

    it('recusa condição com alternativa que não é do formulário', async () => {
      await expect(
        servico.criarPergunta(
          'form-1',
          {
            enunciado: 'Por quê?',
            tipo: PerguntaTipo.TEXTO_LIVRE,
            condicaoAlternativaId: 'alternativa-de-fora',
          },
          'admin',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repositorio.criarPergunta).not.toHaveBeenCalled();
    });

    it('recusa condição dependente de pergunta de múltipla escolha', async () => {
      repositorio.buscarCompleto.mockResolvedValue(
        formulario([pergunta({ tipo: PerguntaTipo.MULTIPLA_ESCOLHA })]),
      );

      await expect(
        servico.criarPergunta(
          'form-1',
          { enunciado: 'Por quê?', tipo: PerguntaTipo.TEXTO_LIVRE, condicaoAlternativaId: 'alt-1' },
          'admin',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('recusa condição apontando para pergunta posterior', async () => {
      const primeira = pergunta({ id: 'p0', ordem: 1, alternativas: [] });
      const segunda = pergunta({ id: 'p1', ordem: 2 });
      repositorio.buscarPergunta.mockResolvedValue(primeira);
      repositorio.buscarCompleto.mockResolvedValue(formulario([primeira, segunda]));

      await expect(
        servico.atualizarPergunta('form-1', 'p0', { condicaoAlternativaId: 'alt-1' }, 'admin'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('recusa reordenação que jogaria a origem para depois da dependente', async () => {
      repositorio.listarIdsDePerguntas.mockResolvedValue(['p1', 'p2']);

      await expect(
        servico.reordenarPerguntas('form-1', ['p2', 'p1'], 'admin'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repositorio.reordenarPerguntas).not.toHaveBeenCalled();
    });

    it('aceita reordenação que preserva a ordem da condição', async () => {
      repositorio.listarIdsDePerguntas.mockResolvedValue(['p1', 'p2']);

      await servico.reordenarPerguntas('form-1', ['p1', 'p2'], 'admin');

      expect(repositorio.reordenarPerguntas).toHaveBeenCalledWith('form-1', ['p1', 'p2']);
    });

    it('recusa excluir pergunta da qual outra depende', async () => {
      repositorio.buscarPergunta.mockResolvedValue(pergunta());
      repositorio.listarDependentesDePergunta.mockResolvedValue([
        { id: 'p2', ordem: 2, enunciado: 'Por quê?' },
      ]);

      await expect(servico.excluirPergunta('form-1', 'p1', 'admin')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(repositorio.excluirPergunta).not.toHaveBeenCalled();
    });

    it('recusa excluir alternativa que habilita outra pergunta', async () => {
      repositorio.buscarPergunta.mockResolvedValue(pergunta());
      repositorio.buscarAlternativa.mockResolvedValue({ id: 'alt-1', texto: 'A', ordem: 1 });
      repositorio.listarDependentesDeAlternativa.mockResolvedValue([
        { id: 'p2', ordem: 2, enunciado: 'Por quê?' },
      ]);

      await expect(
        servico.excluirAlternativa('form-1', 'p1', 'alt-1', 'admin'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(repositorio.excluirAlternativa).not.toHaveBeenCalled();
    });

    it('impede publicar com condição apontando para pergunta posterior', async () => {
      repositorio.buscarCompleto.mockResolvedValue(
        formulario([
          pergunta({
            id: 'p1',
            ordem: 1,
            tipo: PerguntaTipo.TEXTO_LIVRE,
            alternativas: [],
            condicaoAlternativaId: 'alt-9',
            condicaoPerguntaId: 'p2',
          }),
          pergunta({ id: 'p2', ordem: 2 }),
        ]),
      );

      await expect(servico.publicar('form-1', 'admin')).rejects.toBeInstanceOf(BadRequestException);
      expect(repositorio.trocarStatus).not.toHaveBeenCalled();
    });
  });

  describe('link de acesso', () => {
    it('recusa gerar link de formulário em rascunho', async () => {
      repositorio.buscarResumo.mockResolvedValue(formulario([]));

      await expect(servico.acesso('form-1')).rejects.toBeInstanceOf(ConflictException);
      expect(qrCode.gerarSvg).not.toHaveBeenCalled();
    });

    it('monta o link com o token público, nunca com o uuid interno', async () => {
      repositorio.buscarResumo.mockResolvedValue(formulario([], FormularioStatus.EM_COLETA));
      qrCode.gerarSvg.mockResolvedValue('<svg></svg>');
      config.get.mockReturnValue('https://pesquisa.exemplo.br');

      const acesso = await servico.acesso('form-1');

      expect(acesso.url).toBe('https://pesquisa.exemplo.br/r/token-publico-de-teste');
      expect(acesso.url).not.toContain('form-1');
      expect(acesso.qrCodeSvg).toBe('<svg></svg>');
      expect(qrCode.gerarSvg).toHaveBeenCalledWith(acesso.url);
    });

    it('gera link também para pesquisa encerrada, para conferência posterior', async () => {
      repositorio.buscarResumo.mockResolvedValue(formulario([], FormularioStatus.ENCERRADO));
      qrCode.gerarSvg.mockResolvedValue('<svg></svg>');
      config.get.mockReturnValue('https://pesquisa.exemplo.br');

      await expect(servico.acesso('form-1')).resolves.toMatchObject({
        token: 'token-publico-de-teste',
      });
    });
  });

  describe('duplicação', () => {
    it('duplica com título padrão e versão seguinte', async () => {
      repositorio.buscarResumo.mockResolvedValue(formulario([], FormularioStatus.EM_COLETA));
      repositorio.duplicar.mockResolvedValue(formulario([]));

      await servico.duplicar('form-1', undefined, 'admin');

      expect(repositorio.duplicar).toHaveBeenCalledWith('form-1', {
        titulo: 'Pesquisa (cópia)',
        versao: 2,
        criadoPorId: 'admin',
      });
      expect(auditoria.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          acao: AuditoriaAcao.FORMULARIO_CRIADO,
          detalhe: expect.objectContaining({ duplicadoDe: 'form-1' }),
        }),
      );
    });

    it('usa o título informado quando vem no corpo', async () => {
      repositorio.buscarResumo.mockResolvedValue(formulario([]));
      repositorio.duplicar.mockResolvedValue(formulario([]));

      await servico.duplicar('form-1', '  Segunda rodada  ', 'admin');

      expect(repositorio.duplicar).toHaveBeenCalledWith(
        'form-1',
        expect.objectContaining({ titulo: 'Segunda rodada' }),
      );
    });
  });
});
