import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class RenovarDto {
  @ApiProperty({ description: 'Refresh token recebido no login.' })
  @IsString()
  @Length(20, 200)
  refreshToken!: string;
}
