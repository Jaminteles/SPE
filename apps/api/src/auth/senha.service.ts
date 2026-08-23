import { Injectable } from '@nestjs/common';
import { ScryptOptions, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify<string, Buffer, number, ScryptOptions, Buffer>(scrypt);

/**
 * Hash de senha com scrypt (memory-hard), da biblioteca padrão do Node.
 * Formato armazenado: scrypt$N$r$p$salt_base64$hash_base64.
 *
 * A senha em claro nunca é registrada em log nem devolvida em resposta.
 */
@Injectable()
export class SenhaService {
  private static readonly N = 16384; // 2^14
  private static readonly R = 8;
  private static readonly P = 1;
  private static readonly TAMANHO_CHAVE = 64;
  private static readonly TAMANHO_SALT = 16;
  private static readonly ALGORITMO = 'scrypt';

  /** Comprimento mínimo aceito. Vale para login, criação e troca de senha. */
  static readonly TAMANHO_MINIMO = 12;

  async gerarHash(senha: string): Promise<string> {
    const salt = randomBytes(SenhaService.TAMANHO_SALT);
    const derivada = await this.derivar(senha, salt);
    return [
      SenhaService.ALGORITMO,
      SenhaService.N,
      SenhaService.R,
      SenhaService.P,
      salt.toString('base64'),
      derivada.toString('base64'),
    ].join('$');
  }

  /**
   * Comparação em tempo constante. Hash malformado devolve false em vez de
   * estourar: um registro corrompido não deve virar 500 nem pista para quem tenta entrar.
   */
  async conferir(senha: string, hashArmazenado: string): Promise<boolean> {
    const partes = hashArmazenado.split('$');
    if (partes.length !== 6 || partes[0] !== SenhaService.ALGORITMO) {
      return false;
    }

    const [, n, r, p, saltBase64, hashBase64] = partes;
    const salt = Buffer.from(saltBase64, 'base64');
    const esperado = Buffer.from(hashBase64, 'base64');

    let derivada: Buffer;
    try {
      derivada = (await scryptAsync(senha.normalize('NFKC'), salt, esperado.length, {
        N: Number(n),
        r: Number(r),
        p: Number(p),
        maxmem: 256 * 1024 * 1024,
      })) as Buffer;
    } catch {
      return false;
    }

    return derivada.length === esperado.length && timingSafeEqual(derivada, esperado);
  }

  /**
   * Política mínima de senha. Devolve a lista de problemas encontrados;
   * lista vazia significa senha aceita.
   */
  static validarForca(senha: string): string[] {
    const problemas: string[] = [];
    if (senha.length < SenhaService.TAMANHO_MINIMO) {
      problemas.push(`A senha precisa de ao menos ${SenhaService.TAMANHO_MINIMO} caracteres.`);
    }
    if (!/[a-zà-ÿ]/.test(senha)) {
      problemas.push('A senha precisa de ao menos uma letra minúscula.');
    }
    if (!/[A-ZÀ-Ý]/.test(senha)) {
      problemas.push('A senha precisa de ao menos uma letra maiúscula.');
    }
    if (!/\d/.test(senha)) {
      problemas.push('A senha precisa de ao menos um número.');
    }
    return problemas;
  }

  private derivar(senha: string, salt: Buffer): Promise<Buffer> {
    return scryptAsync(senha.normalize('NFKC'), salt, SenhaService.TAMANHO_CHAVE, {
      N: SenhaService.N,
      r: SenhaService.R,
      p: SenhaService.P,
      maxmem: 256 * 1024 * 1024,
    }) as Promise<Buffer>;
  }
}
