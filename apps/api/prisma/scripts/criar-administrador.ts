/**
 * Cria o Administrador inicial na implantação.
 *
 * Sem ele ninguém consegue montar o primeiro formulário. O script é idempotente:
 * se já existir administrador ativo, não faz nada e não sobrescreve senha.
 *
 * Credenciais vêm só do ambiente — nunca de argumento de linha de comando
 * (que fica no histórico do shell) e nunca com valor padrão no código:
 *
 *   ADMIN_NOME="Nome Sobrenome" ADMIN_EMAIL=admin@exemplo.br ADMIN_SENHA='...' \
 *     npm run criar-admin
 */
import { AuditoriaAcao, PerfilCodigo, PrismaClient } from '@prisma/client';
import { ScryptOptions, randomBytes, scrypt } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify<string, Buffer, number, ScryptOptions, Buffer>(scrypt);
const prisma = new PrismaClient();

const TAMANHO_MINIMO_SENHA = 12;

/** Mesmo formato do SenhaService da API: scrypt$N$r$p$salt$hash. */
async function gerarHash(senha: string): Promise<string> {
  const salt = randomBytes(16);
  const derivada = (await scryptAsync(senha.normalize('NFKC'), salt, 64, {
    N: 16384,
    r: 8,
    p: 1,
    maxmem: 256 * 1024 * 1024,
  })) as Buffer;
  return ['scrypt', 16384, 8, 1, salt.toString('base64'), derivada.toString('base64')].join('$');
}

function exigir(nome: string): string {
  const valor = process.env[nome];
  if (!valor || valor.trim() === '') {
    throw new Error(`Variável de ambiente ${nome} não informada.`);
  }
  return valor.trim();
}

function validarSenha(senha: string): void {
  const problemas: string[] = [];
  if (senha.length < TAMANHO_MINIMO_SENHA) {
    problemas.push(`mínimo de ${TAMANHO_MINIMO_SENHA} caracteres`);
  }
  if (!/[a-zà-ÿ]/.test(senha)) problemas.push('ao menos uma letra minúscula');
  if (!/[A-ZÀ-Ý]/.test(senha)) problemas.push('ao menos uma letra maiúscula');
  if (!/\d/.test(senha)) problemas.push('ao menos um número');
  if (problemas.length > 0) {
    throw new Error(`ADMIN_SENHA fraca: ${problemas.join(', ')}.`);
  }
}

async function main() {
  const jaExiste = await prisma.usuario.count({
    where: { ativo: true, perfil: { codigo: PerfilCodigo.ADMINISTRADOR } },
  });

  if (jaExiste > 0) {
    console.log('Já existe administrador ativo. Nada a fazer.');
    return;
  }

  const nome = exigir('ADMIN_NOME');
  const email = exigir('ADMIN_EMAIL').toLowerCase();
  const senha = exigir('ADMIN_SENHA');
  validarSenha(senha);

  const perfil = await prisma.perfil.findUnique({ where: { codigo: PerfilCodigo.ADMINISTRADOR } });
  if (!perfil) {
    throw new Error('Perfil ADMINISTRADOR não encontrado. Rode o seed antes (npm run seed).');
  }

  const criado = await prisma.usuario.create({
    data: { nome, email, senhaHash: await gerarHash(senha), perfilId: perfil.id },
    select: { id: true, email: true },
  });

  await prisma.logAuditoria.create({
    data: {
      acao: AuditoriaAcao.USUARIO_CRIADO,
      entidade: 'usuario',
      entidadeId: criado.id,
      usuarioId: criado.id,
      detalhe: { perfil: PerfilCodigo.ADMINISTRADOR, origem: 'script_de_implantacao' },
    },
  });

  // Nunca imprime a senha, nem parte dela.
  console.log(`Administrador inicial criado: ${criado.email}`);
  console.log('Troque a senha no primeiro acesso (PATCH /api/v1/usuarios/eu/senha).');
}

main()
  .catch((erro) => {
    console.error('Falha ao criar administrador:', erro instanceof Error ? erro.message : erro);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
