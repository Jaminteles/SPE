import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuditoriaAcao, FormularioStatus, PerguntaTipo } from '@prisma/client';

import { AuditoriaService } from '../auditoria/auditoria.service';
import { FormulariosRepository } from './formularios.repository';
import { FormulariosService } from './formularios.service';

describe('FormulariosService', () => {
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
  };
  const auditoria = { registrar: jest.fn() };

  const rascunho = { id: 'form-1', status: FormularioStatus.RASCUNHO, titulo: 'Pesquisa' };
  const publicado = { id: 'form-1', status: FormularioStatus.EM_COLETA, titulo: 'Pesquisa' };

  const pergunta = (ajustes: Partial<Record<string, unknown>> = {}) => ({
    id: 'pergunta-1',
    enunciado: 'Em quem você votaria?',
    tipo: PerguntaTipo.UNICA_ESCOLHA,
    obrigatoria: true,
    ordem: 1,
    escalaMinimo: null,
    escalaMaximo: null,
    escalaRotuloMinimo: null,
    escalaRotuloMaximo: null,
    alternativas: [
      { id: 'alt-1', texto: 'A', ordem: 1 },
      { id: 'alt-2', texto: 'B', ordem: 2 },
    ],
    ...ajustes,
  });

  const formularioCompleto = (
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
    totalPerguntas: perguntas.length,
    perguntas,
  });

  beforeEach(async () => {
    jest.resetAllMocks();
    repositorio.buscarResumo.mockImplementation(async () => formularioCompleto([]));
    const modulo = await Test.createTestingModule({
      providers: [
        FormulariosService,
        { provide: FormulariosRepository, useValue: repositorio },
        { provide: AuditoriaService, useValue: auditoria },
      ],
    }).compile();
    servico = modulo.get(FormulariosService);
  });

  describe('imutabilidade após a publicação', () => {
    it.each([
      [
        'acrescentar pergunta',
        () =>
          servico.criarPergunta(
            'form-1',
            { enunciado: 'Nova pergunta', tipo: PerguntaTipo.TEXTO_LIVRE },
            'admin',
          ),
      ],
      [
        'alterar pergunta',
        () => servico.atualizarPergunta('form-1', 'pergunta-1', { enunciado: 'Outro' }, 'admin'),
      ],
      ['excluir pergunta', () => servico.excluirPergunta('form-1', 'pergunta-1', 'admin')],
      ['reordenar perguntas', () => servico.reordenarPerguntas('form-1', ['pergunta-1'], 'admin')],
      [
        'criar alternativa',
        () => servico.criarAlternativa('form-1', 'pergunta-1', { texto: 'C' }, 'admin'),
      ],
      [
        'excluir alternativa',
        () => servico.excluirAlternativa('form-1', 'pergunta-1', 'alt-1', 'admin'),
      ],
      [
        'alterar o formulário',
        () => servico.atualizar('form-1', { titulo: 'Outro título' }, 'admin'),
      ],
      ['excluir o formulário', () => servico.excluir('form-1', 'admin')],
    ])('recusa %s em formulário já em coleta', async (_rotulo, acao) => {
      repositorio.buscarSituacao.mockResolvedValue(publicado);

      await expect(acao()).rejects.toBeInstanceOf(ConflictException);
      expect(repositorio.criarPergunta).not.toHaveBeenCalled();
      expect(repositorio.atualizarPergunta).not.toHaveBeenCalled();
      expect(repositorio.excluirPergunta).not.toHaveBeenCalled();
    });
  });

  describe('publicação', () => {
    it('recusa formulário sem pergunta', async () => {
      repositorio.buscarCompleto.mockResolvedValue(formularioCompleto([]));

      await expect(servico.publicar('form-1', 'admin')).rejects.toBeInstanceOf(BadRequestException);
      expect(repositorio.trocarStatus).not.toHaveBeenCalled();
    });

    it('recusa pergunta de escolha com menos de duas alternativas', async () => {
      repositorio.buscarCompleto.mockResolvedValue(
        formularioCompleto([pergunta({ alternativas: [{ id: 'alt-1', texto: 'A', ordem: 1 }] })]),
      );

      await expect(servico.publicar('form-1', 'admin')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('publica e audita quando o conteúdo está completo', async () => {
      repositorio.buscarCompleto.mockResolvedValue(formularioCompleto([pergunta()]));
      repositorio.trocarStatus.mockResolvedValue(1);

      await servico.publicar('form-1', 'admin');

      expect(repositorio.trocarStatus).toHaveBeenCalledWith(
        'form-1',
        FormularioStatus.RASCUNHO,
        FormularioStatus.EM_COLETA,
        expect.any(Date),
      );
      expect(auditoria.registrar).toHaveBeenCalledWith(
        expect.objectContaining({ acao: AuditoriaAcao.FORMULARIO_PUBLICADO, usuarioId: 'admin' }),
      );
    });

    it('recusa publicar o que já está em coleta', async () => {
      repositorio.buscarCompleto.mockResolvedValue(
        formularioCompleto([pergunta()], FormularioStatus.EM_COLETA),
      );

      await expect(servico.publicar('form-1', 'admin')).rejects.toBeInstanceOf(ConflictException);
    });

    it('detecta corrida de status entre a leitura e a gravação', async () => {
      repositorio.buscarCompleto.mockResolvedValue(formularioCompleto([pergunta()]));
      repositorio.trocarStatus.mockResolvedValue(0);

      await expect(servico.publicar('form-1', 'admin')).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('encerramento', () => {
    it('só encerra o que está em coleta', async () => {
      repositorio.buscarSituacao.mockResolvedValue(rascunho);

      await expect(servico.encerrar('form-1', 'admin')).rejects.toBeInstanceOf(ConflictException);
    });

    it('encerra e audita', async () => {
      repositorio.buscarSituacao.mockResolvedValue(publicado);
      repositorio.trocarStatus.mockResolvedValue(1);
      repositorio.buscarCompleto.mockResolvedValue(
        formularioCompleto([pergunta()], FormularioStatus.ENCERRADO),
      );

      await servico.encerrar('form-1', 'admin');

      expect(auditoria.registrar).toHaveBeenCalledWith(
        expect.objectContaining({ acao: AuditoriaAcao.COLETA_ENCERRADA }),
      );
    });
  });

  describe('perguntas', () => {
    beforeEach(() => {
      repositorio.buscarSituacao.mockResolvedValue(rascunho);
    });

    it('exige faixa na pergunta de escala', async () => {
      await expect(
        servico.criarPergunta(
          'form-1',
          { enunciado: 'Nota do governo', tipo: PerguntaTipo.ESCALA },
          'admin',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('recusa escala com máximo menor ou igual ao mínimo', async () => {
      await expect(
        servico.criarPergunta(
          'form-1',
          { enunciado: 'Nota', tipo: PerguntaTipo.ESCALA, escalaMinimo: 5, escalaMaximo: 5 },
          'admin',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('limpa a configuração de escala em pergunta que não é escala', async () => {
      repositorio.criarPergunta.mockResolvedValue(pergunta({ tipo: PerguntaTipo.TEXTO_LIVRE }));

      await servico.criarPergunta(
        'form-1',
        {
          enunciado: 'Comentário livre',
          tipo: PerguntaTipo.TEXTO_LIVRE,
          escalaMinimo: 1,
          escalaMaximo: 5,
        },
        'admin',
      );

      expect(repositorio.criarPergunta).toHaveBeenCalledWith(
        'form-1',
        expect.objectContaining({ escalaMinimo: null, escalaMaximo: null }),
      );
    });

    it('cria pergunta obrigatória por padrão', async () => {
      repositorio.criarPergunta.mockResolvedValue(pergunta());

      await servico.criarPergunta(
        'form-1',
        { enunciado: 'Em quem você votaria?', tipo: PerguntaTipo.UNICA_ESCOLHA },
        'admin',
      );

      expect(repositorio.criarPergunta).toHaveBeenCalledWith(
        'form-1',
        expect.objectContaining({ obrigatoria: true }),
      );
    });

    it('respeita pergunta marcada como opcional', async () => {
      repositorio.criarPergunta.mockResolvedValue(pergunta({ obrigatoria: false }));

      await servico.criarPergunta(
        'form-1',
        { enunciado: 'Comentário', tipo: PerguntaTipo.TEXTO_LIVRE, obrigatoria: false },
        'admin',
      );

      expect(repositorio.criarPergunta).toHaveBeenCalledWith(
        'form-1',
        expect.objectContaining({ obrigatoria: false }),
      );
    });

    it('responde 404 para pergunta de outro formulário', async () => {
      repositorio.buscarPergunta.mockResolvedValue(null);

      await expect(
        servico.atualizarPergunta('form-1', 'pergunta-de-outro', { enunciado: 'x' }, 'admin'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('recusa configuração de escala em pergunta de outro tipo', async () => {
      repositorio.buscarPergunta.mockResolvedValue(pergunta({ tipo: PerguntaTipo.NUMERO }));

      await expect(
        servico.atualizarPergunta('form-1', 'pergunta-1', { escalaMinimo: 1 }, 'admin'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('alternativas', () => {
    beforeEach(() => {
      repositorio.buscarSituacao.mockResolvedValue(rascunho);
    });

    it.each([PerguntaTipo.TEXTO_LIVRE, PerguntaTipo.NUMERO, PerguntaTipo.ESCALA])(
      'recusa alternativa em pergunta do tipo %s',
      async (tipo) => {
        repositorio.buscarPergunta.mockResolvedValue(pergunta({ tipo }));

        await expect(
          servico.criarAlternativa('form-1', 'pergunta-1', { texto: 'A' }, 'admin'),
        ).rejects.toBeInstanceOf(BadRequestException);
      },
    );

    it('aceita alternativa em pergunta de múltipla escolha', async () => {
      repositorio.buscarPergunta.mockResolvedValue(
        pergunta({ tipo: PerguntaTipo.MULTIPLA_ESCOLHA }),
      );
      repositorio.criarAlternativa.mockResolvedValue({ id: 'alt-3', texto: 'C', ordem: 3 });

      await expect(
        servico.criarAlternativa('form-1', 'pergunta-1', { texto: 'C' }, 'admin'),
      ).resolves.toEqual({ id: 'alt-3', texto: 'C', ordem: 3 });
    });
  });

  describe('reordenação', () => {
    beforeEach(() => {
      repositorio.buscarSituacao.mockResolvedValue(rascunho);
    });

    it('recusa lista incompleta', async () => {
      repositorio.listarIdsDePerguntas.mockResolvedValue(['p1', 'p2', 'p3']);

      await expect(
        servico.reordenarPerguntas('form-1', ['p1', 'p2'], 'admin'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repositorio.reordenarPerguntas).not.toHaveBeenCalled();
    });

    it('recusa id que não pertence ao formulário', async () => {
      repositorio.listarIdsDePerguntas.mockResolvedValue(['p1', 'p2']);

      await expect(
        servico.reordenarPerguntas('form-1', ['p1', 'intruso'], 'admin'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repositorio.reordenarPerguntas).not.toHaveBeenCalled();
    });

    it('aplica a ordem informada', async () => {
      repositorio.listarIdsDePerguntas.mockResolvedValue(['p1', 'p2']);
      repositorio.buscarCompleto.mockResolvedValue(formularioCompleto([pergunta()]));

      await servico.reordenarPerguntas('form-1', ['p2', 'p1'], 'admin');

      expect(repositorio.reordenarPerguntas).toHaveBeenCalledWith('form-1', ['p2', 'p1']);
    });
  });

  describe('vigência', () => {
    it('recusa fim antes do início', async () => {
      await expect(
        servico.criar(
          {
            titulo: 'Pesquisa',
            vigenciaInicio: new Date('2026-09-10'),
            vigenciaFim: new Date('2026-09-01'),
          },
          'admin',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repositorio.criar).not.toHaveBeenCalled();
    });
  });
});
