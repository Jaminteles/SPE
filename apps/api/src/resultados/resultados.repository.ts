import { Injectable } from '@nestjs/common';
import { FormularioStatus, PerguntaTipo, Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

export interface Recorte {
  formularioId: string;
  perguntaId?: string;
  municipioCodigoIbge?: number;
  de?: Date;
  ate?: Date;
}

export interface LinhaDeResultado {
  perguntaId: string;
  alternativaId: string;
  total: number;
}

export interface LinhaDeCruzamento {
  alternativaAId: string;
  alternativaBId: string;
  total: number;
}

export interface PerguntaDoResultado {
  id: string;
  enunciado: string;
  tipo: PerguntaTipo;
  ordem: number;
  alternativas: { id: string; texto: string; ordem: number }[];
}

/**
 * Leitura de resultado.
 *
 * **Todas** as consultas daqui saem de view materializada. Nenhuma toca
 * `resposta` ou `resposta_item` — é o que garante que o painel abra rápido
 * independentemente do volume coletado.
 *
 * Os filtros entram sempre parametrizados; nada é concatenado no SQL.
 */
@Injectable()
export class ResultadosRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Recorte comum às consultas sobre `mv_resultado_detalhado`. */
  private condicoes(recorte: Recorte): Prisma.Sql {
    const partes: Prisma.Sql[] = [Prisma.sql`d."formulario_id" = ${recorte.formularioId}::uuid`];

    if (recorte.perguntaId) {
      partes.push(Prisma.sql`d."pergunta_id" = ${recorte.perguntaId}::uuid`);
    }
    if (recorte.municipioCodigoIbge) {
      partes.push(Prisma.sql`d."municipio_codigo_ibge" = ${recorte.municipioCodigoIbge}`);
    }
    if (recorte.de) {
      partes.push(Prisma.sql`d."dia" >= ${recorte.de}::date`);
    }
    if (recorte.ate) {
      partes.push(Prisma.sql`d."dia" <= ${recorte.ate}::date`);
    }

    return Prisma.join(partes, ' AND ');
  }

  /** Totais por alternativa, já somados no banco sobre a view. */
  async totaisPorAlternativa(recorte: Recorte): Promise<LinhaDeResultado[]> {
    const linhas = await this.prisma.$queryRaw<
      { pergunta_id: string; alternativa_id: string; total: bigint }[]
    >(Prisma.sql`
      SELECT d."pergunta_id", d."alternativa_id", SUM(d."total") AS total
        FROM "mv_resultado_detalhado" d
       WHERE ${this.condicoes(recorte)}
       GROUP BY d."pergunta_id", d."alternativa_id"
    `);

    return linhas.map((linha) => ({
      perguntaId: linha.pergunta_id,
      alternativaId: linha.alternativa_id,
      total: Number(linha.total),
    }));
  }

  /**
   * Condições da série diária. Município e período são independentes: a view
   * tem as duas dimensões, então qualquer combinação vira uma soma sobre ela.
   */
  private condicoesDaSerie(recorte: Recorte): Prisma.Sql {
    const partes: Prisma.Sql[] = [Prisma.sql`e."formulario_id" = ${recorte.formularioId}::uuid`];

    if (recorte.municipioCodigoIbge) {
      partes.push(Prisma.sql`e."municipio_codigo_ibge" = ${recorte.municipioCodigoIbge}`);
    }
    if (recorte.de) {
      partes.push(Prisma.sql`e."dia" >= ${recorte.de}::date`);
    }
    if (recorte.ate) {
      partes.push(Prisma.sql`e."dia" <= ${recorte.ate}::date`);
    }

    return Prisma.join(partes, ' AND ');
  }

  /**
   * Respostas válidas no recorte. Conta respostas, não itens: somar itens
   * contaria a mesma resposta uma vez por pergunta.
   */
  async respostasValidasNoRecorte(recorte: Recorte): Promise<number> {
    const linhas = await this.prisma.$queryRaw<{ total: bigint }[]>(Prisma.sql`
      SELECT COALESCE(SUM(e."respostas_validas"), 0) AS total
        FROM "mv_evolucao_coleta" e
       WHERE ${this.condicoesDaSerie(recorte)}
    `);

    return Number(linhas[0]?.total ?? 0);
  }

  async resumo(formularioId: string): Promise<{
    respostasValidas: number;
    respostasEmConferencia: number;
    respostasInvalidadas: number;
    municipiosAlcancados: number;
    primeiraRespostaEm: Date | null;
    ultimaRespostaEm: Date | null;
  } | null> {
    const linhas = await this.prisma.$queryRaw<
      {
        respostas_validas: bigint;
        respostas_em_conferencia: bigint;
        respostas_invalidadas: bigint;
        municipios_alcancados: bigint;
        primeira_resposta_em: Date | null;
        ultima_resposta_em: Date | null;
      }[]
    >(Prisma.sql`
      SELECT respostas_validas, respostas_em_conferencia, respostas_invalidadas,
             municipios_alcancados, primeira_resposta_em, ultima_resposta_em
        FROM "mv_resumo_formulario"
       WHERE formulario_id = ${formularioId}::uuid
    `);

    const linha = linhas[0];
    if (!linha) {
      return null;
    }

    return {
      respostasValidas: Number(linha.respostas_validas),
      respostasEmConferencia: Number(linha.respostas_em_conferencia),
      respostasInvalidadas: Number(linha.respostas_invalidadas),
      municipiosAlcancados: Number(linha.municipios_alcancados),
      primeiraRespostaEm: linha.primeira_resposta_em,
      ultimaRespostaEm: linha.ultima_resposta_em,
    };
  }

  async evolucao(recorte: Recorte): Promise<{ dia: string; respostasValidas: number }[]> {
    const linhas = await this.prisma.$queryRaw<{ dia: Date; total: bigint }[]>(Prisma.sql`
      SELECT e."dia", SUM(e."respostas_validas") AS total
        FROM "mv_evolucao_coleta" e
       WHERE ${this.condicoesDaSerie(recorte)}
       GROUP BY e."dia"
       ORDER BY e."dia"
    `);

    return linhas.map((linha) => ({
      dia: linha.dia.toISOString().slice(0, 10),
      respostasValidas: Number(linha.total),
    }));
  }

  async alcancePorMunicipio(
    formularioId: string,
  ): Promise<{ codigoIbge: number; nome: string; respostasValidas: number }[]> {
    const linhas = await this.prisma.$queryRaw<
      { codigo_ibge: number; nome: string; respostas_validas: bigint }[]
    >(Prisma.sql`
      SELECT a."municipio_codigo_ibge" AS codigo_ibge, m."nome", a."respostas_validas"
        FROM "mv_alcance_municipio" a
        JOIN "municipio" m ON m."codigo_ibge" = a."municipio_codigo_ibge"
       WHERE a."formulario_id" = ${formularioId}::uuid
       ORDER BY a."respostas_validas" DESC, m."nome" ASC
    `);

    return linhas.map((linha) => ({
      codigoIbge: linha.codigo_ibge,
      nome: linha.nome,
      respostasValidas: Number(linha.respostas_validas),
    }));
  }

  /**
   * Ranking por município **dentro do recorte**. Sai da mesma view da evolução,
   * que é a fonte do indicador de respostas válidas — é o que garante que a
   * soma da tabela feche com o total mostrado no painel e no arquivo exportado.
   */
  async rankingPorMunicipio(
    recorte: Recorte,
  ): Promise<{ codigoIbge: number; nome: string; respostasValidas: number }[]> {
    const linhas = await this.prisma.$queryRaw<
      { codigo_ibge: number; nome: string; total: bigint }[]
    >(Prisma.sql`
      SELECT e."municipio_codigo_ibge" AS codigo_ibge, m."nome", SUM(e."respostas_validas") AS total
        FROM "mv_evolucao_coleta" e
        JOIN "municipio" m ON m."codigo_ibge" = e."municipio_codigo_ibge"
       WHERE ${this.condicoesDaSerie(recorte)}
       GROUP BY e."municipio_codigo_ibge", m."nome"
      HAVING SUM(e."respostas_validas") > 0
       ORDER BY total DESC, m."nome" ASC
    `);

    return linhas.map((linha) => ({
      codigoIbge: linha.codigo_ibge,
      nome: linha.nome,
      respostasValidas: Number(linha.total),
    }));
  }

  /**
   * Cobertura da Bahia: os 417 municípios, com zero para quem não foi
   * alcançado. Sai da view de alcance com LEFT JOIN — nenhum município some da
   * lista por não ter resposta, que é justamente o que a tela precisa mostrar.
   */
  async cobertura(
    formularioId: string,
  ): Promise<{ codigoIbge: number; nome: string; respostasValidas: number }[]> {
    const linhas = await this.prisma.$queryRaw<
      { codigo_ibge: number; nome: string; respostas_validas: bigint }[]
    >(Prisma.sql`
      SELECT m."codigo_ibge", m."nome", COALESCE(a."respostas_validas", 0) AS respostas_validas
        FROM "municipio" m
        LEFT JOIN "mv_alcance_municipio" a
               ON a."municipio_codigo_ibge" = m."codigo_ibge"
              AND a."formulario_id" = ${formularioId}::uuid
       WHERE m."uf" = 'BA'
       ORDER BY respostas_validas DESC, m."nome" ASC
    `);

    return linhas.map((linha) => ({
      codigoIbge: linha.codigo_ibge,
      nome: linha.nome,
      respostasValidas: Number(linha.respostas_validas),
    }));
  }

  /**
   * Cruzamento de duas perguntas, somado sobre `mv_cruzamento_pergunta`.
   *
   * A view guarda o par uma única vez, na ordem das perguntas do formulário.
   * Aqui as duas orientações são aceitas e o resultado sai sempre orientado
   * como o chamador pediu: linha = pergunta A, coluna = pergunta B.
   */
  async cruzamento(
    formularioId: string,
    perguntaAId: string,
    perguntaBId: string,
    municipioCodigoIbge?: number,
  ): Promise<LinhaDeCruzamento[]> {
    const filtroDeMunicipio = municipioCodigoIbge
      ? Prisma.sql`AND c."municipio_codigo_ibge" = ${municipioCodigoIbge}`
      : Prisma.empty;

    const linhas = await this.prisma.$queryRaw<
      {
        pergunta_a_id: string;
        alternativa_a_id: string;
        alternativa_b_id: string;
        total: bigint;
      }[]
    >(Prisma.sql`
      SELECT c."pergunta_a_id", c."alternativa_a_id", c."alternativa_b_id", SUM(c."total") AS total
        FROM "mv_cruzamento_pergunta" c
       WHERE c."formulario_id" = ${formularioId}::uuid
         AND (
              (c."pergunta_a_id" = ${perguntaAId}::uuid AND c."pergunta_b_id" = ${perguntaBId}::uuid)
           OR (c."pergunta_a_id" = ${perguntaBId}::uuid AND c."pergunta_b_id" = ${perguntaAId}::uuid)
         )
         ${filtroDeMunicipio}
       GROUP BY c."pergunta_a_id", c."alternativa_a_id", c."alternativa_b_id"
    `);

    return linhas.map((linha) => {
      const naOrdemPedida = linha.pergunta_a_id === perguntaAId;
      return {
        alternativaAId: naOrdemPedida ? linha.alternativa_a_id : linha.alternativa_b_id,
        alternativaBId: naOrdemPedida ? linha.alternativa_b_id : linha.alternativa_a_id,
        total: Number(linha.total),
      };
    });
  }

  /** Estrutura do formulário: enunciados e alternativas, para rotular o gráfico. */
  async estrutura(formularioId: string): Promise<PerguntaDoResultado[]> {
    return this.prisma.pergunta.findMany({
      where: { formularioId },
      select: {
        id: true,
        enunciado: true,
        tipo: true,
        ordem: true,
        alternativas: {
          select: { id: true, texto: true, ordem: true },
          orderBy: { ordem: 'asc' },
        },
      },
      orderBy: { ordem: 'asc' },
    });
  }

  /**
   * Formulários que já saíram do rascunho, com o total de válidas.
   *
   * Pesquisas com resultado. `donoId` restringe ao dono; `undefined` lista todas.
   *
   * O filtro entra como parametro do `Prisma.sql`, nunca interpolado no texto da
   * consulta: id vindo de token continua sendo dado, nunca codigo.
   */
  async formulariosComResultado(filtro: { donoId?: string; id?: string } = {}): Promise<
    {
      id: string;
      titulo: string;
      status: FormularioStatus;
      versao: number;
      publicadoEm: Date | null;
      encerradoEm: Date | null;
      respostasValidas: number;
    }[]
  > {
    // `undefined` viraria `undefined` no driver; a consulta precisa de um NULL
    // de verdade para o ramo "sem restricao" valer.
    const dono = filtro.donoId ?? null;
    const id = filtro.id ?? null;

    const linhas = await this.prisma.$queryRaw<
      {
        id: string;
        titulo: string;
        status: FormularioStatus;
        versao: number;
        publicado_em: Date | null;
        encerrado_em: Date | null;
        respostas_validas: bigint;
      }[]
    >(Prisma.sql`
      SELECT f."id", f."titulo", f."status", f."versao", f."publicado_em", f."encerrado_em",
             COALESCE(v."respostas_validas", 0) AS respostas_validas
        FROM "formulario" f
        LEFT JOIN "mv_resumo_formulario" v ON v."formulario_id" = f."id"
       WHERE f."status" <> 'RASCUNHO'
         AND (${dono}::uuid IS NULL OR f."criado_por_id" = ${dono}::uuid)
         AND (${id}::uuid IS NULL OR f."id" = ${id}::uuid)
       ORDER BY f."publicado_em" DESC NULLS LAST
    `);

    return linhas.map((linha) => ({
      id: linha.id,
      titulo: linha.titulo,
      status: linha.status,
      versao: linha.versao,
      publicadoEm: linha.publicado_em,
      encerradoEm: linha.encerrado_em,
      respostasValidas: Number(linha.respostas_validas),
    }));
  }

  async totalDeMunicipiosDaBahia(): Promise<number> {
    return this.prisma.municipio.count({ where: { uf: 'BA' } });
  }

  async formularioExiste(id: string): Promise<boolean> {
    const total = await this.prisma.formulario.count({
      where: { id, status: { not: FormularioStatus.RASCUNHO } },
    });
    return total > 0;
  }
}
