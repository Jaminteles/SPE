import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  FormularioStatus,
  PerguntaTipo,
  Prisma,
  RespostaOrigem,
  RespostaStatus,
} from '@prisma/client';
import { ForbiddenException } from '@nestjs/common';

import {
  ColetaRepository,
  FormularioEmColeta,
  ItemParaGravar,
  PerguntaDoFormulario,
  RespostaGravada,
} from './coleta.repository';
import { AnaliseDeSuspeitaService } from './analise-de-suspeita.service';
import { DispositivoService } from './dispositivo.service';
import { SessaoColetaService } from './sessao-coleta.service';
import { ProvedorAntiRobo } from './turnstile.provider';
import { EnviarRespostaDto, FormularioPublicoResponse, ItemDeRespostaDto } from './dto/coleta.dto';

const UF_DA_PESQUISA = 'BA';

@Injectable()
export class ColetaService {
  /** Dez por hora: teto de uso, não de qualidade. Configurável por instalação. */
  private static readonly LIMITE_POR_APARELHO_HORA_PADRAO = 10;

  constructor(
    private readonly repositorio: ColetaRepository,
    private readonly dispositivos: DispositivoService,
    private readonly sessoes: SessaoColetaService,
    private readonly antiRobo: ProvedorAntiRobo,
    private readonly analise: AnaliseDeSuspeitaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Formulário aberto pelo link público. Devolve só o que a tela de coleta
   * precisa — nenhum dado administrativo atravessa.
   */
  async abrir(token: string, ip: string | undefined): Promise<FormularioPublicoResponse> {
    const formulario = await this.exigirEmColeta(token);
    const sessao = await this.sessoes.abrir(formulario.id, ip);

    return {
      titulo: formulario.titulo,
      descricao: formulario.descricao,
      token,
      sessao: sessao.token,
      sessaoExpiraEm: sessao.expiraEm,
      exigeDesafioAntiRobo: this.antiRobo.configurado,
      perguntas: formulario.perguntas,
    };
  }

  async enviar(
    token: string,
    ip: string | undefined,
    dto: EnviarRespostaDto,
  ): Promise<RespostaGravada> {
    const formulario = await this.exigirEmColeta(token);

    // Reenvio do mesmo pacote: devolve o que já foi gravado, sem duplicar.
    // Vem antes de consumir a sessão, senão o reenvio legítimo seria barrado.
    const jaGravada = await this.repositorio.buscarResposta(dto.respostaId);
    if (jaGravada) {
      return jaGravada;
    }

    // O hash do aparelho é o mesmo que vai gravado na resposta: contar por ele
    // é contar exatamente o que já aconteceu, sem depender do IP — que muda a
    // cada troca de rede e é compartilhado por todo mundo atrás do mesmo NAT.
    const dispositivoHash = this.dispositivos.gerarHash(dto.dispositivoId);
    await this.exigirDentroDoTetoDoAparelho(dispositivoHash);

    await this.exigirDesafioAntiRobo(dto, ip);

    // Sessão de uso único: fecha replay e dá o início real do preenchimento.
    const sessao = await this.sessoes.consumir(dto.sessao, formulario.id);
    if (!sessao) {
      throw new ConflictException(
        'Sessão de preenchimento inválida ou já usada. Abra a pesquisa novamente.',
      );
    }

    const municipio = await this.repositorio.municipioExiste(dto.municipioCodigoIbge);
    if (!municipio) {
      throw new BadRequestException('Município não encontrado na base do IBGE.');
    }

    const itens = this.validarItens(formulario, dto.itens);
    this.conferirMomentos(dto);

    // Município fora da Bahia não é descartado: entra para conferência manual.
    const foraDaBahia = municipio.uf !== UF_DA_PESQUISA;

    // A duração é medida pelo servidor: o relógio do aparelho não é confiável.
    const recebidoEm = Date.now();
    const duracaoSegundos = Math.max(
      0,
      Math.round((recebidoEm - sessao.iniciadaEm.getTime()) / 1000),
    );

    const usosDaOrigem = await this.sessoes.contarUsosDaOrigem(
      sessao.origemHash,
      formulario.id,
      this.analise.janelaDaOrigemEmMinutos,
    );

    const suspeita = this.analise.analisar({
      duracaoSegundos,
      perguntas: formulario.perguntas,
      itens,
      usosDaOrigemNaJanela: usosDaOrigem,
      municipioForaDaBahia: foraDaBahia,
    });

    try {
      return await this.repositorio.gravar({
        id: dto.respostaId,
        formularioId: formulario.id,
        municipioCodigoIbge: municipio.codigoIbge,
        // Marcado não é descartado: vai para conferência humana.
        status:
          suspeita.marcacoes.length > 0 ? RespostaStatus.EM_CONFERENCIA : RespostaStatus.VALIDA,
        origem: dto.origem ?? RespostaOrigem.APLICATIVO,
        dispositivoHash,
        consentimentoEm: dto.consentimentoEm,
        iniciadoEm: sessao.iniciadaEm,
        coletadoEm: dto.coletadoEm,
        duracaoSegundos,
        marcacoes: suspeita.marcacoes,
        latitude: dto.latitude ?? null,
        longitude: dto.longitude ?? null,
        motivoConferencia: suspeita.motivo,
        itens,
      });
    } catch (erro) {
      return this.traduzirFalhaDeGravacao(erro, dto.respostaId);
    }
  }

  /**
   * Teto de respostas por aparelho numa janela de tempo.
   *
   * Diferente das marcações automáticas, que mandam para conferência humana
   * sem barrar nada, este teto **recusa** o envio. São coisas de natureza
   * diferente: marcação é suspeita sobre uma resposta, e quem julga é o
   * Administrador; teto é limite de uso da instalação, e julgar cada caso
   * seria tarde demais — o custo do abuso já teria sido pago.
   *
   * O respondente legítimo não encosta nisso: são dez pesquisas respondidas
   * na mesma hora, no mesmo aparelho.
   */
  private async exigirDentroDoTetoDoAparelho(dispositivoHash: string): Promise<void> {
    const teto = this.config.get<number>(
      'COLETA_LIMITE_POR_APARELHO_HORA',
      ColetaService.LIMITE_POR_APARELHO_HORA_PADRAO,
    );

    const desde = new Date(Date.now() - 60 * 60 * 1000);
    const jaEnviadas = await this.repositorio.contarRespostasDoDispositivo(dispositivoHash, desde);

    if (jaEnviadas >= teto) {
      // 429 e não 403: não é falta de permissão, é excesso de uso, e a
      // diferença importa para quem lê o erro do outro lado.
      throw new HttpException(
        'Este aparelho já enviou o máximo de respostas por hora. Tente mais tarde.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /**
   * O desafio anti-robô protege a origem web. No aplicativo ele é opcional por
   * configuração: lá o controle é o par sessão + dispositivo, e o widget do
   * Turnstile exigiria um navegador embutido.
   */
  private async exigirDesafioAntiRobo(
    dto: EnviarRespostaDto,
    ip: string | undefined,
  ): Promise<void> {
    const origem = dto.origem ?? RespostaOrigem.APLICATIVO;
    const dispensado = origem === RespostaOrigem.APLICATIVO && !this.antiRobo.exigirNoAplicativo;

    if (dispensado && !dto.desafioAntiRobo) {
      return;
    }

    const resultado = await this.antiRobo.verificar(dto.desafioAntiRobo, ip);
    if (!resultado.aprovado) {
      throw new ForbiddenException(resultado.motivo);
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
