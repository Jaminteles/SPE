import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { Publico } from '../auth/decorators/publico.decorator';
import { PrismaService } from '../prisma/prisma.service';

@Publico()
@ApiTags('infra')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOkResponse({ description: 'API e banco de dados disponiveis.' })
  async verificar(): Promise<{ status: string; banco: string }> {
    try {
      await this.prisma.verificarConexao();
    } catch {
      throw new ServiceUnavailableException('Banco de dados indisponivel.');
    }
    return { status: 'ok', banco: 'ok' };
  }
}
