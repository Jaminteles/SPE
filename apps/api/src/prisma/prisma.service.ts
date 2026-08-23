import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    // Nenhum log de query em produção: parâmetro de query pode carregar dado da resposta.
    super({ log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'] });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Conexão com o PostgreSQL estabelecida.');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /** Verificação de disponibilidade usada pelo health check. */
  async verificarConexao(): Promise<boolean> {
    await this.$queryRaw`SELECT 1`;
    return true;
  }
}
