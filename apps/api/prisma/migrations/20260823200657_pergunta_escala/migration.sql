-- AlterEnum
ALTER TYPE "pergunta_tipo" ADD VALUE 'ESCALA';

-- AlterTable
ALTER TABLE "pergunta" ADD COLUMN     "escala_maximo" INTEGER,
ADD COLUMN     "escala_minimo" INTEGER,
ADD COLUMN     "escala_rotulo_maximo" VARCHAR(60),
ADD COLUMN     "escala_rotulo_minimo" VARCHAR(60);
