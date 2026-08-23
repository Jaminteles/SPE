import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';

/**
 * Identificacao tecnica do aparelho para controle de duplicidade.
 *
 * O identificador que chega do app e aleatorio, gerado na instalacao, e nao
 * corresponde a nenhum dado do respondente. Ainda assim ele nunca e persistido
 * nem registrado: o que vai para o banco e um HMAC-SHA256 com pepper de
 * ambiente, irreversivel sem o segredo.
 */
@Injectable()
export class DispositivoService {
  constructor(private readonly config: ConfigService) {}

  gerarHash(dispositivoId: string): string {
    const pepper = this.config.getOrThrow<string>('DEVICE_HASH_PEPPER');
    return createHmac('sha256', pepper).update(dispositivoId).digest('hex');
  }
}
