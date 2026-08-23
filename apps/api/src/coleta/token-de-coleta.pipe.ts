import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

/**
 * O token publico e base64url de 22 caracteres. Validar o formato antes de
 * consultar o banco corta ruido e tentativa de injecao logo na porta.
 */
@Injectable()
export class TokenDeColetaPipe implements PipeTransform<string, string> {
  private static readonly FORMATO = /^[A-Za-z0-9_-]{22}$/;

  transform(valor: string): string {
    if (typeof valor !== 'string' || !TokenDeColetaPipe.FORMATO.test(valor)) {
      throw new BadRequestException('Link de pesquisa invalido.');
    }
    return valor;
  }
}
