import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length, MaxLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin@exemplo.br' })
  @IsEmail({}, { message: 'e-mail invalido.' })
  @MaxLength(180)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email!: string;

  @ApiProperty({ minLength: 12, maxLength: 200 })
  @IsString()
  @Length(12, 200)
  senha!: string;
}
