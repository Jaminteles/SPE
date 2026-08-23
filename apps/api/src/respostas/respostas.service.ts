import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditoriaAcao, RespostaStatus } from '@prisma/client';

import { AuditoriaService } from '../auditoria/auditoria.service';
import { ListarRespostasDto } from './dto/respostas.dto';
import { RespostaParaConferencia, RespostasRepository } from './respostas.repository';

const LIMITE_PADRAO = 50;

@Injectable()
export class RespostasService {
  constructor(
    private readonly repositorio: RespostasRepository,
    private readonly auditoria: AuditoriaService,
  ) {}

  async listar(formularioId: string, filtro: ListarRespostasDto) {
    return this.repositorio.listar({
      formularioId,
      status: filtro.status,
      marcacao: filtro.marcacao,
      municipioCodigoIbge: filtro.municipioCodigoIbge,
      limite: filtro.limite ?? LIMITE_PADRAO,
      deslocamento: filtro.deslocamento ?? 0,
    });
  }

  async resumo(formularioId: string) {
    return this.repositorio.resumo(formularioId);
  }

  async buscar(formularioId: string, id: string): Promise<RespostaParaConferencia> {
    const resposta = await this.repositorio.buscar(formularioId, id);
    if (!resposta) {
      throw new NotFoundException('Resposta não encontrada nesta pesquisa.');
    }
    return resposta;
  }

  /**
   * Invalidação manual: a resposta sai da contagem, mas o registro permanece.
   * Não existe exclusão física de resposta em nenhum caminho do sistema.
   */
  async invalidar(
    formularioId: string,
    id: string,
    motivo: string,
    autorId: string,
  ): Promise<RespostaParaConferencia> {
    const atual = await this.buscar(formularioId, id);

    if (atual.status === RespostaStatus.INVALIDADA) {
      throw new ConflictException('Esta resposta já está invalidada.');
    }

    const alteradas = await this.repositorio.invalidar(id, autorId, motivo);
    if (alteradas === 0) {
      throw new ConflictException('A resposta mudou de status. Recarregue e tente de novo.');
    }

    await this.auditoria.registrar({
      acao: AuditoriaAcao.RESPOSTA_INVALIDADA,
      entidade: 'resposta',
      entidadeId: id,
      usuarioId: autorId,
      // Motivo e status entram; conteúdo da resposta e hash de dispositivo, nunca.
      detalhe: { formularioId, statusAnterior: atual.status, motivo },
    });

    return this.buscar(formularioId, id);
  }

  /** Volta atrás de uma invalidação. Também é ação auditada. */
  async revalidar(
    formularioId: string,
    id: string,
    motivo: string,
    autorId: string,
  ): Promise<RespostaParaConferencia> {
    const atual = await this.buscar(formularioId, id);

    if (atual.status !== RespostaStatus.INVALIDADA) {
      throw new ConflictException('Só uma resposta invalidada pode voltar para a contagem.');
    }

    const alteradas = await this.repositorio.revalidar(id, motivo);
    if (alteradas === 0) {
      throw new ConflictException('A resposta mudou de status. Recarregue e tente de novo.');
    }

    await this.auditoria.registrar({
      acao: AuditoriaAcao.RESPOSTA_REVALIDADA,
      entidade: 'resposta',
      entidadeId: id,
      usuarioId: autorId,
      detalhe: { formularioId, motivo },
    });

    return this.buscar(formularioId, id);
  }
}
