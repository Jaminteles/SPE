import { Module } from '@nestjs/common';

import { AuditoriaModule } from '../auditoria/auditoria.module';
import { ResultadosModule } from '../resultados/resultados.module';
import { UsuariosModule } from '../usuarios/usuarios.module';
import { CsvProvider } from './csv.provider';
import { ExportacaoController } from './exportacao.controller';
import { ExportacaoService } from './exportacao.service';
import { PdfProvider } from './pdf.provider';
import { PlanilhaProvider } from './planilha.provider';

@Module({
  imports: [ResultadosModule, AuditoriaModule, UsuariosModule],
  controllers: [ExportacaoController],
  providers: [ExportacaoService, CsvProvider, PlanilhaProvider, PdfProvider],
  exports: [ExportacaoService],
})
export class ExportacaoModule {}
