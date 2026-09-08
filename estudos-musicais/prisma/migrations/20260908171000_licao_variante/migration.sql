-- DropIndex
DROP INDEX "licoes_topicoId_numeroOriginal_key";

-- AlterTable
ALTER TABLE "licoes" ADD COLUMN     "variante" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "licoes_topicoId_numeroOriginal_variante_key" ON "licoes"("topicoId", "numeroOriginal", "variante");
