import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  FormularioStatus,
  PerguntaTipo,
  Prisma,
  RespostaOrigem,
  RespostaStatus,
} from '@prisma/client';

import {
  ColetaRepository,
  FormularioEmColeta,
  ItemParaGravar,
  PerguntaDoFormulario,
  RespostaGravada,
} from './coleta.repository';
import { DispositivoService } from './dispositivo.service';
import { EnviarRespostaDto, FormularioPublicoResponse, ItemDeRespostaDto } from './dto/coleta.dto';

const UF_DA_PESQUISA = 'BA';

@Injectable()
export class ColetaService {
  constructor(
    private readonly repositorio: ColetaRepository,
    private readonly dispositivos: DispositivoService,
  ) {}

  /**
   * Formulário aberto pelo link público. Devolve só o que a tela de coleta
   * precisa — nenhum dado administrativo atravessa.
   */
  async abrir(token: string): Promise<FormularioPublicoResponse> {
    const formulario = await this.exigirEmColeta(token);

    return {
      titulo: formulario.titulo,
      descricao: formulario.descricao,
      token,
      perguntas: formulario.perguntas,
    };
  }

  async enviar(token: string, dto: EnviarRespostaDto): Promise<RespostaGravada> {
    const formulario = await this.exigirEmColeta(token);

    // Reenvio do mesmo pacote: devolve o que já foi gravado, sem duplicar.
    const jaGravada = await this.repositorio.buscarResposta(dto.respostaId);
    if (jaGravada) {
      return jaGravada;
    }

    const municipio = await this.repositorio.municipioExiste(dto.municipioCodigoIbge);
    if (!municipio) {
      throw new BadRequestException('Município não encontrado na base do IBGE.');
    }

    const itens = this.validarItens(formulario, dto.itens);
    this.conferirMomentos(dto);

    // Município fora da Bahia não é descartado: entra para conferência manual.
    const foraDaBahia = municipio.uf !== UF_DA_PESQUISA;

    try {
      return await this.repositorio.gravar({
        id: dto.respostaId,
        formularioId: formulario.id,
        municipioCodigoIbge: municipio.codigoIbge,
        status: foraDaBahia ? RespostaStatus.EM_CONFERENCIA : RespostaStatus.VALIDA,
        origem: dto.origem ?? RespostaOrigem.APLICATIVO,
        dispositivoHash: this.dispositivos.gerarHash(dto.dispositivoId),
        consentimentoEm: dto.consentimentoEm,
        coletadoEm: dto.coletadoEm,
        latitude: dto.latitude ?? null,
        longitude: dto.longitude ?? null,
        motivoConferencia: foraDaBahia ? `Município fora da ${UF_DA_PESQUISA}.` : null,
        itens,
      });
    } catch (erro) {
      return this.traduzirFalhaDeGravacao(erro, dto.respostaId);
    }
  }

  // -------------------------------------------------------------------------
  // Regras
  // -------------------------------------------------------------------------

  private async exigirEmColeta(token: string): Promise<FormularioEmColeta> {
    const formulario = await this.repositorio.buscarPorToken(token);

    // Token desconhecido e pesquisa fora do ar respondem igual: nada a enumerar.
    if (!formulario || formulario.status === FormularioStatus.RASCUNHO) {
      throw new NotFoundException('Pesquisa não encontrada.');
    }
    if (formulario.status === FormularioStatus.ENCERRADO) {
      throw new ConflictException('Esta pesquisa foi encerrada e não aceita mais respostas.');
    }

    const agora = new Date();
    if (formulario.vigenciaInicio && formulario.vigenciaInicio > agora) {
      throw new ConflictException('Esta pesquisa ainda não começou.');
    }
    if (formulario.vigenciaFim && formulario.vigenciaFim < agora) {
      throw new ConflictException('O período desta pesquisa terminou.');
    }

    return formulario;
  }

  /**
   * Confere o pacote inteiro contra a estrutura do formulário: tipo, alternativa,
   * obrigatoriedade e lógica condicional. O que o app decide na tela é conferido
   * de novo aqui — cliente não é fonte de verdade.
   */
  private validarItens(
    formulario: FormularioEmColeta,
    itens: ItemDeRespostaDto[],
  ): ItemParaGravar[] {
    const perguntas = new Map(formulario.perguntas.map((pergunta) => [pergunta.id, pergunta]));
    const porPergunta = new Map<string, ItemDeRespostaDto[]>();

    for (const item of itens) {
      if (!perguntas.has(item.perguntaId)) {
        throw new BadRequestException('A resposta cita pergunta que não é desta pesquisa.');
      }
      const lista = porPergunta.get(item.perguntaId) ?? [];
      lista.push(item);
      porPergunta.set(item.perguntaId, lista);
    }

    const aplicaveis = this.perguntasAplicaveis(formulario, porPergunta);
    const gravaveis: ItemParaGravar[] = [];

    for (const pergunta of formulario.perguntas) {
      const respondida = porPergunta.get(pergunta.id) ?? [];

      if (!aplicaveis.has(pergunta.id)) {
        if (respondida.length > 0) {
          throw new BadRequestException(
            `A pergunta ${pergunta.ordem} não deveria aparecer com as respostas enviadas.`,
          );
        }
        continue;
      }

      if (respondida.length === 0) {
        if (pergunta.obrigatoria) {
          throw new BadRequestException(`A pergunta ${pergunta.ordem} é obrigatória.`);
        }
        continue;
      }

      gravaveis.push(...this.validarPergunta(pergunta, respondida));
    }

    return gravaveis;
  }

  /**
   * Conjunto de perguntas que devem aparecer, dadas as respostas enviadas.
   * Percorre na ordem: a origem de uma condição é sempre anterior, então quando
   * a dependente é avaliada a origem já foi resolvida.
   */
  private perguntasAplicaveis(
    formulario: FormularioEmColeta,
    porPergunta: Map<string, ItemDeRespostaDto[]>,
  ): Set<string> {
    const aplicaveis = new Set<string>();

    for (const pergunta of formulario.perguntas) {
      if (!pergunta.condicaoAlternativaId || !pergunta.condicaoPerguntaId) {
        aplicaveis.add(pergunta.id);
        continue;
      }

      if (!aplicaveis.has(pergunta.condicaoPerguntaId)) {
        continue;
      }

      const respostaDaOrigem = porPergunta.get(pergunta.condicaoPerguntaId) ?? [];
      const habilitou = respostaDaOrigem.some(
        (item) => item.alternativaId === pergunta.condicaoAlternativaId,
      );
      if (habilitou) {
        aplicaveis.add(pergunta.id);
      }
    }

    return aplicaveis;
  }

  private validarPergunta(
    pergunta: PerguntaDoFormulario,
    itens: ItemDeRespostaDto[],
  ): ItemParaGravar[] {
    const alternativas = new Set(pergunta.alternativas.map((alternativa) => alternativa.id));
    const unico = (): ItemDeRespostaDto => {
      if (itens.length !== 1) {
        throw new BadRequestException(`A pergunta ${pergunta.ordem} aceita uma resposta só.`);
      }
      return itens[0];
    };

    switch (pergunta.tipo) {
      case PerguntaTipo.UNICA_ESCOLHA: {
        const item = unico();
        if (!item.alternativaId || !alternativas.has(item.alternativaId)) {
          throw new BadRequestException(
            `A pergunta ${pergunta.ordem} exige uma alternativa desta pergunta.`,
          );
        }
        return [this.montarItem(pergunta.id, { alternativaId: item.alternativaId })];
      }

      case PerguntaTipo.MULTIPLA_ESCOLHA: {
        const escolhidas = new Set<string>();
        for (const item of itens) {
          if (!item.alternativaId || !alternativas.has(item.alternativaId)) {
            throw new BadRequestException(
              `A pergunta ${pergunta.ordem} exige alternativas desta pergunta.`,
            );
          }
          if (escolhidas.has(item.alternativaId)) {
            throw new BadRequestException(
              `A pergunta ${pergunta.ordem} tem alternativa marcada duas vezes.`,
            );
          }
          escolhidas.add(item.alternativaId);
        }
        return [...escolhidas].map((alternativaId) =>
          this.montarItem(pergunta.id, { alternativaId }),
        );
      }

      case PerguntaTipo.ESCALA: {
        const item = unico();
        const minimo = pergunta.escalaMinimo ?? 0;
        const maximo = pergunta.escalaMaximo ?? 10;
        if (
          item.valorNumero === undefined ||
          !Number.isInteger(item.valorNumero) ||
          item.valorNumero < minimo ||
          item.valorNumero > maximo
        ) {
          throw new BadRequestException(
            `A pergunta ${pergunta.ordem} espera um número inteiro entre ${minimo} e ${maximo}.`,
          );
        }
        return [this.montarItem(pergunta.id, { valorNumero: item.valorNumero })];
      }

      case PerguntaTipo.NUMERO: {
        const item = unico();
        if (item.valorNumero === undefined) {
          throw new BadRequestException(`A pergunta ${pergunta.ordem} espera um número.`);
        }
        return [this.montarItem(pergunta.id, { valorNumero: item.valorNumero })];
      }

      case PerguntaTipo.TEXTO_LIVRE: {
        const item = unico();
        if (!item.valorTexto) {
          throw new BadRequestException(`A pergunta ${pergunta.ordem} espera um texto.`);
        }
        return [this.montarItem(pergunta.id, { valorTexto: item.valorTexto })];
      }

      default:
        throw new BadRequestException(`Tipo de pergunta não suportado na coleta.`);
    }
  }

  /** Um item guarda alternativa OU texto OU número — o banco também exige isso. */
  private montarItem(
    perguntaId: string,
    valor: { alternativaId?: string; valorTexto?: string; valorNumero?: number },
  ): ItemParaGravar {
    return {
      perguntaId,
      alternativaId: valor.alternativaId ?? null,
      valorTexto: valor.valorTexto ?? null,
      valorNumero: valor.valorNumero ?? null,
    };
  }

  /** Datas do aparelho não são confiáveis, mas absurdo declarado é recusado. */
  private conferirMomentos(dto: EnviarRespostaDto): void {
    const agora = Date.now();
    const tolerancia = 24 * 60 * 60 * 1000;

    if (dto.consentimentoEm.getTime() > agora + tolerancia) {
      throw new BadRequestException('Data de consentimento no futuro.');
    }
    if (dto.coletadoEm.getTime() > agora + tolerancia) {
      throw new BadRequestException('Data de coleta no futuro.');
    }
    if (dto.coletadoEm.getTime() < dto.consentimentoEm.getTime() - tolerancia) {
      throw new BadRequestException('A coleta não pode ser anterior ao consentimento.');
    }
  }

  /**
   * Erro de gravação vira resposta compreensível:
   * - id repetido significa reenvio que passou por cima de uma corrida;
   * - dispositivo repetido significa que este aparelho já respondeu.
   */
  private async traduzirFalhaDeGravacao(
    erro: unknown,
    respostaId: string,
  ): Promise<RespostaGravada> {
    if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002') {
      // Corrida entre dois envios do mesmo pacote: o primeiro venceu e vale.
      const gravada = await this.repositorio.buscarResposta(respostaId);
      if (gravada) {
        return gravada;
      }

      throw new ConflictException('Este aparelho já respondeu esta pesquisa.');
    }

    throw erro;
  }
}
