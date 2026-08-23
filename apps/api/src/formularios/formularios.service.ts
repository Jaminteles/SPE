import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditoriaAcao, FormularioStatus, PerguntaTipo } from '@prisma/client';
import { randomBytes } from 'node:crypto';

import { AuditoriaService } from '../auditoria/auditoria.service';
import {
  AtualizarAlternativaDto,
  AtualizarFormularioDto,
  AtualizarPerguntaDto,
  CriarAlternativaDto,
  CriarFormularioDto,
  CriarPerguntaDto,
  ListarFormulariosDto,
} from './dto/formularios.dto';
import {
  AlternativaRegistro,
  FormularioCompleto,
  FormularioResumo,
  FormulariosRepository,
  PerguntaRegistro,
} from './formularios.repository';
import { ProvedorQrCode } from './qrcode.provider';

const LIMITE_PADRAO = 50;
const MINIMO_DE_ALTERNATIVAS = 2;

/** Tipos que se respondem escolhendo alternativa cadastrada. */
const TIPOS_COM_ALTERNATIVA: PerguntaTipo[] = [
  PerguntaTipo.UNICA_ESCOLHA,
  PerguntaTipo.MULTIPLA_ESCOLHA,
];

@Injectable()
export class FormulariosService {
  constructor(
    private readonly repositorio: FormulariosRepository,
    private readonly auditoria: AuditoriaService,
    private readonly qrCode: ProvedorQrCode,
    private readonly config: ConfigService,
  ) {}

  // -------------------------------------------------------------------------
  // Formulário
  // -------------------------------------------------------------------------

  async listar(filtro: ListarFormulariosDto) {
    return this.repositorio.listar({
      status: filtro.status,
      limite: filtro.limite ?? LIMITE_PADRAO,
      deslocamento: filtro.deslocamento ?? 0,
    });
  }

  async buscar(id: string): Promise<FormularioCompleto> {
    const formulario = await this.repositorio.buscarCompleto(id);
    if (!formulario) {
      throw new NotFoundException('Formulário não encontrado.');
    }
    return formulario;
  }

  async criar(dto: CriarFormularioDto, autorId: string): Promise<FormularioResumo> {
    this.conferirVigencia(dto.vigenciaInicio, dto.vigenciaFim);

    const criado = await this.repositorio.criar({ ...dto, criadoPorId: autorId });

    await this.auditoria.registrar({
      acao: AuditoriaAcao.FORMULARIO_CRIADO,
      entidade: 'formulario',
      entidadeId: criado.id,
      usuarioId: autorId,
      detalhe: { titulo: criado.titulo },
    });

    return criado;
  }

  async atualizar(
    id: string,
    dto: AtualizarFormularioDto,
    autorId: string,
  ): Promise<FormularioResumo> {
    const atual = await this.exigirRascunho(id);
    this.conferirVigencia(dto.vigenciaInicio, dto.vigenciaFim);

    const atualizado = await this.repositorio.atualizar(id, dto);

    await this.auditoria.registrar({
      acao: AuditoriaAcao.FORMULARIO_ALTERADO,
      entidade: 'formulario',
      entidadeId: id,
      usuarioId: autorId,
      detalhe: { tituloAnterior: atual.titulo },
    });

    return atualizado;
  }

  async excluir(id: string, autorId: string): Promise<void> {
    await this.exigirRascunho(id);

    const removidos = await this.repositorio.excluirRascunho(id);
    if (removidos === 0) {
      // Só chega aqui se surgiu resposta ou publicação entre a leitura e a exclusão.
      throw new ConflictException('Formulário não pode mais ser excluído.');
    }

    await this.auditoria.registrar({
      acao: AuditoriaAcao.FORMULARIO_EXCLUIDO,
      entidade: 'formulario',
      entidadeId: id,
      usuarioId: autorId,
    });
  }

  /**
   * Publicação: a partir daqui perguntas e alternativas ficam imutáveis.
   * Não existe caminho de volta para rascunho.
   */
  async publicar(id: string, autorId: string): Promise<FormularioResumo> {
    const formulario = await this.buscar(id);

    if (formulario.status !== FormularioStatus.RASCUNHO) {
      throw new ConflictException('Só um formulário em rascunho pode ser publicado.');
    }

    const problemas = this.problemasParaPublicar(formulario);
    if (problemas.length > 0) {
      throw new BadRequestException(problemas);
    }

    const trocados = await this.repositorio.trocarStatus(
      id,
      FormularioStatus.RASCUNHO,
      FormularioStatus.EM_COLETA,
      new Date(),
      FormulariosService.gerarTokenPublico(),
    );
    if (trocados === 0) {
      throw new ConflictException('O formulário mudou de status. Recarregue e tente de novo.');
    }

    await this.auditoria.registrar({
      acao: AuditoriaAcao.FORMULARIO_PUBLICADO,
      entidade: 'formulario',
      entidadeId: id,
      usuarioId: autorId,
      detalhe: { titulo: formulario.titulo, perguntas: formulario.perguntas.length },
    });

    return this.exigirResumo(id);
  }

  async encerrar(id: string, autorId: string): Promise<FormularioResumo> {
    const formulario = await this.exigirExistente(id);

    if (formulario.status !== FormularioStatus.EM_COLETA) {
      throw new ConflictException('Só um formulário em coleta pode ser encerrado.');
    }

    const trocados = await this.repositorio.trocarStatus(
      id,
      FormularioStatus.EM_COLETA,
      FormularioStatus.ENCERRADO,
      new Date(),
    );
    if (trocados === 0) {
      throw new ConflictException('O formulário mudou de status. Recarregue e tente de novo.');
    }

    await this.auditoria.registrar({
      acao: AuditoriaAcao.COLETA_ENCERRADA,
      entidade: 'formulario',
      entidadeId: id,
      usuarioId: autorId,
      detalhe: { titulo: formulario.titulo },
    });

    return this.exigirResumo(id);
  }

  private async exigirResumo(id: string): Promise<FormularioResumo> {
    const resumo = await this.repositorio.buscarResumo(id);
    if (!resumo) {
      throw new NotFoundException('Formulário não encontrado.');
    }
    return resumo;
  }

  /**
   * Link público e QR Code do formulário em coleta.
   * O link usa o token aleatório, nunca o uuid interno: nada de enumerar pesquisa
   * trocando um número na URL.
   */
  async acesso(id: string): Promise<{ url: string; qrCodeSvg: string; token: string }> {
    const formulario = await this.exigirResumo(id);

    if (formulario.status === FormularioStatus.RASCUNHO || !formulario.tokenPublico) {
      throw new ConflictException('O link de acesso só existe depois da publicação.');
    }

    const url = this.montarUrlDeColeta(formulario.tokenPublico);
    return {
      url,
      qrCodeSvg: await this.qrCode.gerarSvg(url),
      token: formulario.tokenPublico,
    };
  }

  /**
   * Duplica o formulário como base para uma nova rodada. A cópia nasce em
   * rascunho, sem link público e sem nenhuma resposta — é o caminho previsto
   * para "editar" o que já está em coleta.
   */
  async duplicar(
    id: string,
    titulo: string | undefined,
    autorId: string,
  ): Promise<FormularioResumo> {
    const origem = await this.exigirResumo(id);

    const copia = await this.repositorio.duplicar(id, {
      titulo: titulo?.trim() || `${origem.titulo} (cópia)`,
      versao: origem.versao + 1,
      criadoPorId: autorId,
    });

    await this.auditoria.registrar({
      acao: AuditoriaAcao.FORMULARIO_CRIADO,
      entidade: 'formulario',
      entidadeId: copia.id,
      usuarioId: autorId,
      detalhe: { duplicadoDe: id, versao: copia.versao },
    });

    return copia;
  }

  private montarUrlDeColeta(token: string): string {
    const base = this.config.get<string>('COLETA_BASE_URL', 'http://localhost:5173');
    return `${base}/r/${token}`;
  }

  /** 22 caracteres aleatórios: curto para caber num QR pequeno, largo para não ser adivinhado. */
  private static gerarTokenPublico(): string {
    return randomBytes(16).toString('base64url');
  }

  /** Lista o que impede a publicação. Vazia significa pronto para publicar. */
  private problemasParaPublicar(formulario: FormularioCompleto): string[] {
    const problemas: string[] = [];

    if (formulario.perguntas.length === 0) {
      problemas.push('O formulário precisa de ao menos uma pergunta.');
    }

    for (const pergunta of formulario.perguntas) {
      if (
        TIPOS_COM_ALTERNATIVA.includes(pergunta.tipo) &&
        pergunta.alternativas.length < MINIMO_DE_ALTERNATIVAS
      ) {
        problemas.push(
          `A pergunta ${pergunta.ordem} precisa de ao menos ${MINIMO_DE_ALTERNATIVAS} alternativas.`,
        );
      }
      if (
        pergunta.tipo === PerguntaTipo.ESCALA &&
        (pergunta.escalaMinimo === null || pergunta.escalaMaximo === null)
      ) {
        problemas.push(`A pergunta ${pergunta.ordem} precisa da faixa da escala.`);
      }
      if (pergunta.condicaoPerguntaId) {
        const origem = formulario.perguntas.find(
          (candidata) => candidata.id === pergunta.condicaoPerguntaId,
        );
        if (!origem || origem.ordem >= pergunta.ordem) {
          problemas.push(
            `A pergunta ${pergunta.ordem} depende de uma pergunta que não vem antes dela.`,
          );
        }
      }
    }

    return problemas;
  }

  // -------------------------------------------------------------------------
  // Pergunta
  // -------------------------------------------------------------------------

  async criarPergunta(
    formularioId: string,
    dto: CriarPerguntaDto,
    autorId: string,
  ): Promise<PerguntaRegistro> {
    await this.exigirRascunho(formularioId);
    this.conferirConfiguracaoDeEscala(dto.tipo, dto);

    // A pergunta nova entra no fim, então qualquer pergunta existente é anterior a ela.
    if (dto.condicaoAlternativaId) {
      await this.exigirCondicaoValida(
        formularioId,
        dto.condicaoAlternativaId,
        Number.MAX_SAFE_INTEGER,
      );
    }

    const criada = await this.repositorio.criarPergunta(formularioId, {
      enunciado: dto.enunciado,
      tipo: dto.tipo,
      obrigatoria: dto.obrigatoria ?? true,
      escalaMinimo: dto.tipo === PerguntaTipo.ESCALA ? dto.escalaMinimo : null,
      escalaMaximo: dto.tipo === PerguntaTipo.ESCALA ? dto.escalaMaximo : null,
      escalaRotuloMinimo: dto.tipo === PerguntaTipo.ESCALA ? dto.escalaRotuloMinimo : null,
      escalaRotuloMaximo: dto.tipo === PerguntaTipo.ESCALA ? dto.escalaRotuloMaximo : null,
      condicaoAlternativaId: dto.condicaoAlternativaId ?? null,
    });

    await this.registrarAlteracaoDeConteudo(formularioId, autorId, {
      operacao: 'pergunta_criada',
      perguntaId: criada.id,
      tipo: criada.tipo,
    });

    return criada;
  }

  async atualizarPergunta(
    formularioId: string,
    perguntaId: string,
    dto: AtualizarPerguntaDto,
    autorId: string,
  ): Promise<PerguntaRegistro> {
    await this.exigirRascunho(formularioId);
    const pergunta = await this.exigirPergunta(formularioId, perguntaId);

    const mexeuEmEscala =
      dto.escalaMinimo !== undefined ||
      dto.escalaMaximo !== undefined ||
      dto.escalaRotuloMinimo !== undefined ||
      dto.escalaRotuloMaximo !== undefined;

    if (mexeuEmEscala) {
      if (pergunta.tipo !== PerguntaTipo.ESCALA) {
        throw new BadRequestException(
          'Configuração de escala só vale para pergunta do tipo ESCALA.',
        );
      }
      this.conferirConfiguracaoDeEscala(PerguntaTipo.ESCALA, {
        escalaMinimo: dto.escalaMinimo ?? pergunta.escalaMinimo ?? undefined,
        escalaMaximo: dto.escalaMaximo ?? pergunta.escalaMaximo ?? undefined,
      });
    }

    if (dto.condicaoAlternativaId !== undefined && dto.condicaoAlternativaId !== null) {
      await this.exigirCondicaoValida(formularioId, dto.condicaoAlternativaId, pergunta.ordem);
    }

    const atualizada = await this.repositorio.atualizarPergunta(perguntaId, dto);

    await this.registrarAlteracaoDeConteudo(formularioId, autorId, {
      operacao: 'pergunta_alterada',
      perguntaId,
      obrigatoria: atualizada.obrigatoria,
    });

    return atualizada;
  }

  async excluirPergunta(formularioId: string, perguntaId: string, autorId: string): Promise<void> {
    await this.exigirRascunho(formularioId);
    const pergunta = await this.exigirPergunta(formularioId, perguntaId);

    const dependentes = await this.repositorio.listarDependentesDePergunta(perguntaId);
    if (dependentes.length > 0) {
      throw new ConflictException(
        `Outra pergunta depende desta para aparecer (pergunta ${dependentes[0].ordem}). ` +
          'Remova a condição antes de excluir.',
      );
    }

    await this.repositorio.excluirPergunta(formularioId, perguntaId, pergunta.ordem);

    await this.registrarAlteracaoDeConteudo(formularioId, autorId, {
      operacao: 'pergunta_excluida',
      perguntaId,
    });
  }

  async reordenarPerguntas(
    formularioId: string,
    ids: string[],
    autorId: string,
  ): Promise<PerguntaRegistro[]> {
    await this.exigirRascunho(formularioId);

    const existentes = await this.repositorio.listarIdsDePerguntas(formularioId);
    this.conferirListaDeReordenacao(existentes, ids, 'pergunta');

    const formulario = await this.buscar(formularioId);
    this.conferirCondicoesNaNovaOrdem(formulario.perguntas, ids);

    await this.repositorio.reordenarPerguntas(formularioId, ids);

    await this.registrarAlteracaoDeConteudo(formularioId, autorId, {
      operacao: 'perguntas_reordenadas',
      total: ids.length,
    });

    const reordenado = await this.buscar(formularioId);
    return reordenado.perguntas;
  }

  // -------------------------------------------------------------------------
  // Alternativa
  // -------------------------------------------------------------------------

  async criarAlternativa(
    formularioId: string,
    perguntaId: string,
    dto: CriarAlternativaDto,
    autorId: string,
  ): Promise<AlternativaRegistro> {
    await this.exigirRascunho(formularioId);
    const pergunta = await this.exigirPergunta(formularioId, perguntaId);
    this.exigirTipoComAlternativa(pergunta.tipo);

    const criada = await this.repositorio.criarAlternativa(perguntaId, dto.texto);

    await this.registrarAlteracaoDeConteudo(formularioId, autorId, {
      operacao: 'alternativa_criada',
      perguntaId,
      alternativaId: criada.id,
    });

    return criada;
  }

  async atualizarAlternativa(
    formularioId: string,
    perguntaId: string,
    alternativaId: string,
    dto: AtualizarAlternativaDto,
    autorId: string,
  ): Promise<AlternativaRegistro> {
    await this.exigirRascunho(formularioId);
    await this.exigirPergunta(formularioId, perguntaId);
    await this.exigirAlternativa(perguntaId, alternativaId);

    const atualizada = await this.repositorio.atualizarAlternativa(alternativaId, dto.texto);

    await this.registrarAlteracaoDeConteudo(formularioId, autorId, {
      operacao: 'alternativa_alterada',
      perguntaId,
      alternativaId,
    });

    return atualizada;
  }

  async excluirAlternativa(
    formularioId: string,
    perguntaId: string,
    alternativaId: string,
    autorId: string,
  ): Promise<void> {
    await this.exigirRascunho(formularioId);
    await this.exigirPergunta(formularioId, perguntaId);
    const alternativa = await this.exigirAlternativa(perguntaId, alternativaId);

    const dependentes = await this.repositorio.listarDependentesDeAlternativa(alternativaId);
    if (dependentes.length > 0) {
      throw new ConflictException(
        `A pergunta ${dependentes[0].ordem} só aparece quando esta alternativa é escolhida. ` +
          'Remova a condição antes de excluir.',
      );
    }

    await this.repositorio.excluirAlternativa(perguntaId, alternativaId, alternativa.ordem);

    await this.registrarAlteracaoDeConteudo(formularioId, autorId, {
      operacao: 'alternativa_excluida',
      perguntaId,
      alternativaId,
    });
  }

  async reordenarAlternativas(
    formularioId: string,
    perguntaId: string,
    ids: string[],
    autorId: string,
  ): Promise<AlternativaRegistro[]> {
    await this.exigirRascunho(formularioId);
    await this.exigirPergunta(formularioId, perguntaId);

    const existentes = await this.repositorio.listarIdsDeAlternativas(perguntaId);
    this.conferirListaDeReordenacao(existentes, ids, 'alternativa');

    await this.repositorio.reordenarAlternativas(perguntaId, ids);

    await this.registrarAlteracaoDeConteudo(formularioId, autorId, {
      operacao: 'alternativas_reordenadas',
      perguntaId,
      total: ids.length,
    });

    const pergunta = await this.exigirPergunta(formularioId, perguntaId);
    return pergunta.alternativas;
  }

  // -------------------------------------------------------------------------
  // Regras compartilhadas
  // -------------------------------------------------------------------------

  private async exigirExistente(id: string) {
    const formulario = await this.repositorio.buscarSituacao(id);
    if (!formulario) {
      throw new NotFoundException('Formulário não encontrado.');
    }
    return formulario;
  }

  /**
   * Porta única de escrita: depois que o formulário entra em coleta, o conteúdo
   * é imutável. Não existe outro caminho de edição.
   */
  private async exigirRascunho(id: string) {
    const formulario = await this.exigirExistente(id);
    if (formulario.status !== FormularioStatus.RASCUNHO) {
      throw new ConflictException(
        'Formulário já publicado: perguntas e alternativas são imutáveis. Crie uma nova versão.',
      );
    }
    return formulario;
  }

  private async exigirPergunta(formularioId: string, perguntaId: string) {
    const pergunta = await this.repositorio.buscarPergunta(formularioId, perguntaId);
    if (!pergunta) {
      throw new NotFoundException('Pergunta não encontrada neste formulário.');
    }
    return pergunta;
  }

  private async exigirAlternativa(perguntaId: string, alternativaId: string) {
    const alternativa = await this.repositorio.buscarAlternativa(perguntaId, alternativaId);
    if (!alternativa) {
      throw new NotFoundException('Alternativa não encontrada nesta pergunta.');
    }
    return alternativa;
  }

  private exigirTipoComAlternativa(tipo: PerguntaTipo): void {
    if (!TIPOS_COM_ALTERNATIVA.includes(tipo)) {
      throw new BadRequestException(
        'Só perguntas de escolha única ou múltipla escolha têm alternativas.',
      );
    }
  }

  /**
   * Lógica condicional simples (mostrar/ocultar por resposta única):
   * a alternativa de origem precisa ser do mesmo formulário, de uma pergunta de
   * escolha única e de ordem anterior à pergunta condicionada.
   */
  private async exigirCondicaoValida(
    formularioId: string,
    condicaoAlternativaId: string,
    ordemDaPergunta: number,
  ): Promise<void> {
    const formulario = await this.buscar(formularioId);

    const origem = formulario.perguntas.find((pergunta) =>
      pergunta.alternativas.some((alternativa) => alternativa.id === condicaoAlternativaId),
    );

    if (!origem) {
      throw new BadRequestException('A alternativa da condição não é deste formulário.');
    }
    if (origem.tipo !== PerguntaTipo.UNICA_ESCOLHA) {
      throw new BadRequestException(
        'A condição só pode depender de uma pergunta de escolha única.',
      );
    }
    if (origem.ordem >= ordemDaPergunta) {
      throw new BadRequestException('A pergunta de origem da condição precisa vir antes.');
    }
  }

  /** Reordenar não pode deixar uma pergunta antes daquela que a habilita. */
  private conferirCondicoesNaNovaOrdem(perguntas: PerguntaRegistro[], ids: string[]): void {
    const posicao = new Map(ids.map((id, indice) => [id, indice]));

    for (const pergunta of perguntas) {
      if (!pergunta.condicaoPerguntaId) {
        continue;
      }
      const posicaoDela = posicao.get(pergunta.id);
      const posicaoDaOrigem = posicao.get(pergunta.condicaoPerguntaId);
      if (posicaoDela === undefined || posicaoDaOrigem === undefined) {
        continue;
      }
      if (posicaoDaOrigem >= posicaoDela) {
        throw new BadRequestException(
          'A nova ordem deixaria uma pergunta antes da pergunta que a habilita.',
        );
      }
    }
  }

  private conferirVigencia(inicio?: Date, fim?: Date): void {
    if (inicio && fim && fim < inicio) {
      throw new BadRequestException('O fim da vigência não pode ser antes do início.');
    }
  }

  private conferirConfiguracaoDeEscala(
    tipo: PerguntaTipo,
    dados: { escalaMinimo?: number; escalaMaximo?: number },
  ): void {
    if (tipo !== PerguntaTipo.ESCALA) {
      return;
    }
    if (dados.escalaMinimo === undefined || dados.escalaMaximo === undefined) {
      throw new BadRequestException('Pergunta de escala exige valor mínimo e máximo.');
    }
    if (dados.escalaMaximo <= dados.escalaMinimo) {
      throw new BadRequestException('O máximo da escala precisa ser maior que o mínimo.');
    }
  }

  /** A lista precisa ser exatamente o conjunto atual, sem faltar nem sobrar. */
  private conferirListaDeReordenacao(
    existentes: string[],
    informados: string[],
    entidade: string,
  ): void {
    if (existentes.length !== informados.length) {
      throw new BadRequestException(
        `A ordenação precisa conter todas as ${entidade}s, uma única vez.`,
      );
    }
    const conjunto = new Set(existentes);
    const forasteiro = informados.find((id) => !conjunto.has(id));
    if (forasteiro) {
      throw new BadRequestException(`Há ${entidade} que não pertence a este contexto.`);
    }
  }

  private async registrarAlteracaoDeConteudo(
    formularioId: string,
    autorId: string,
    detalhe: Record<string, string | number | boolean | null>,
  ): Promise<void> {
    await this.auditoria.registrar({
      acao: AuditoriaAcao.FORMULARIO_ALTERADO,
      entidade: 'formulario',
      entidadeId: formularioId,
      usuarioId: autorId,
      detalhe,
    });
  }
}
