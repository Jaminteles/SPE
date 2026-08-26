import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length, MaxLength } from 'class-validator';

const paraTexto = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const paraEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class RegistrarDto {
  @ApiProperty({ maxLength: 120 })
  @IsString()
  @Transform(paraTexto)
  @Length(3, 120)
  nome!: string;

  @ApiProperty({ maxLength: 180 })
  @IsEmail({}, { message: 'e-mail inválido.' })
  @MaxLength(180)
  @Transform(paraEmail)
  email!: string;

  @ApiProperty({ minLength: 12, maxLength: 200 })
  @IsString()
  @Length(12, 200)
  senha!: string;
}

export class ReenviarConfirmacaoDto {
  @ApiProperty({ maxLength: 180 })
  @IsEmail({}, { message: 'e-mail inválido.' })
  @MaxLength(180)
  @Transform(paraEmail)
  email!: string;
}

export class ConfirmarEmailDto {
  @ApiProperty({ description: 'Token que veio no link do e-mail.' })
  @IsString()
  @Transform(paraTexto)
  @Length(20, 200)
  token!: string;
}

export class CadastroAceitoResponse {
  @ApiProperty({
    description:
      'Mensagem neutra: é a mesma para e-mail com e sem conta, para a rota não virar ' +
      'verificador de cadastro alheio.',
  })
  mensagem!: string;
}
